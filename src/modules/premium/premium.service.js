'use strict';
const db = require('../../config/db');
const httpError = require('../../shared/http-error');
const { PREMIUM_UNLOCK_REPUTATION, PREMIUM_UNLOCK_MIN_DISTINCT_PARTNERS } = require('../../config/constants');
const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PUBLIC_BASE_URL } = require('../../config/env');
const repo = require('./premium.repo');

let stripe = null;
function getStripe() {
  if (!STRIPE_SECRET_KEY) return null;
  if (!stripe) {
    // Lazy init to keep dev setup simple.
    // eslint-disable-next-line global-require
    const Stripe = require('stripe');
    stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  }
  return stripe;
}

async function countDistinctPartnersDone(userId) {
  if (db.isPg) {
    const row = await db.one(
      `SELECT COUNT(DISTINCT other_id) AS n
       FROM (
         SELECT CASE WHEN provider_id = $1 THEN seeker_id ELSE provider_id END AS other_id
         FROM matches
         WHERE (provider_id = $1 OR seeker_id = $1)
           AND status = 'done'
       ) t`,
      [userId]
    );
    return Number((row && row.n) || 0);
  }

  const row = db.prepare(`
      SELECT COUNT(DISTINCT other_id) AS n FROM (
        SELECT CASE WHEN provider_id = ? THEN seeker_id ELSE provider_id END AS other_id
        FROM matches
        WHERE (provider_id = ? OR seeker_id = ?)
          AND status = 'done'
      )
    `).get(userId, userId, userId);
  return (row && row.n) || 0;
}

function plans() {
  return {
    currency: 'EUR',
    plans: [
      {
        id: 'premium_month',
        name: 'KingsHelp Premium',
        interval: 'month',
        amount_cents: 99,
        amount_eur: 0.99,
      },
      {
        id: 'premium_year',
        name: 'KingsHelp Premium',
        interval: 'year',
        amount_cents: 799,
        amount_eur: 7.99,
      },
    ],
  };
}

async function createCheckoutSession(user, { interval }) {
  const s = getStripe();
  if (!s) {
    return {
      implemented: false,
      provider: 'stripe',
      interval,
      message: 'Stripe no esta configurado (STRIPE_SECRET_KEY).',
      checkout_url: null,
      session_id: null,
    };
  }
  const p = plans();
  const plan = p.plans.find(x => x.interval === interval) || null;
  if (!plan) throw httpError(422, 'Interval invalido');

  const successUrl = `${PUBLIC_BASE_URL}/web/index.html#premium=success`;
  const cancelUrl = `${PUBLIC_BASE_URL}/web/index.html#premium=cancel`;

  const session = await s.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: String(user.id),
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: (p.currency || 'EUR').toLowerCase(),
          product_data: { name: plan.name },
          unit_amount: plan.amount_cents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      user_id: String(user.id),
      plan_id: plan.id,
      interval: plan.interval,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  await repo.createPayment({
    user_id: user.id,
    provider: 'stripe',
    provider_session_id: session.id,
    provider_event_id: null,
    plan_id: plan.id,
    interval: plan.interval,
    amount_cents: plan.amount_cents,
    currency: p.currency,
    status: 'created',
  });

  return {
    implemented: true,
    provider: 'stripe',
    interval: plan.interval,
    plan_id: plan.id,
    checkout_url: session.url,
    session_id: session.id,
  };
}

async function eligibility(userId) {
  const u = db.isPg
    ? await db.one('SELECT points_balance, premium_tier, premium_until FROM users WHERE id = $1', [userId])
    : db.prepare('SELECT points_balance, premium_tier, premium_until FROM users WHERE id = ?').get(userId);
  if (!u) throw httpError(404, 'User not found');
  const rep = u.points_balance || 0;
  const partners = await countDistinctPartnersDone(userId);
  const premiumActive = (u.premium_tier && u.premium_tier !== 'free')
    ? (!u.premium_until || new Date(u.premium_until).getTime() > Date.now())
    : false;
  const partnersMin = Number(PREMIUM_UNLOCK_MIN_DISTINCT_PARTNERS || 0);
  const eligibleRep = rep >= PREMIUM_UNLOCK_REPUTATION;
  const eligiblePartners = partners >= partnersMin;
  return {
    reputation: rep,
    threshold: PREMIUM_UNLOCK_REPUTATION,
    partners_done_distinct: partners,
    partners_required: partnersMin,
    eligible_reputation: eligibleRep,
    eligible_partners: eligiblePartners,
    eligible: eligibleRep && eligiblePartners,
    premium_active: premiumActive,
    premium_tier: u.premium_tier,
    premium_until: u.premium_until,
  };
}

async function unlockByReputation(userId) {
  const e = await eligibility(userId);
  if (e.premium_active) return { ok: true, already: true, ...e };
  if (!e.eligible_reputation) {
    const left = Math.max(0, (e.threshold || 0) - (e.reputation || 0));
    throw httpError(422, `No tienes reputacion suficiente. Te faltan ${left} rep.`);
  }
  if (!e.eligible_partners) {
    const left = Math.max(0, (e.partners_required || 0) - (e.partners_done_distinct || 0));
    throw httpError(422, `Te faltan ${left} vecinos distintos para desbloquear Premium.`);
  }

  // Earned premium: permanent (premium_until = NULL). Simple for all ages.
  await repo.setUserPremium({ userId, tier: 'premium', until: null });
  return { ok: true, unlocked: true, ...(await eligibility(userId)) };
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

async function handleWebhook(req) {
  const s = getStripe();
  if (!s) throw httpError(501, 'Stripe no esta configurado');
  if (!STRIPE_WEBHOOK_SECRET) throw httpError(501, 'Stripe webhook no esta configurado (STRIPE_WEBHOOK_SECRET)');

  const sig = req.headers['stripe-signature'];
  if (!sig) throw httpError(400, 'Missing Stripe signature');

  // Stripe requires raw body. We accept either raw buffer (preferred) or JSON fallback.
  const raw = req.rawBody;
  const payload = raw ? raw : JSON.stringify(req.body || {});

  let event;
  try {
    event = s.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    throw httpError(400, `Invalid webhook signature: ${e.message}`);
  }

  const type = event.type;
  if (type !== 'checkout.session.completed') {
    return { ok: true, ignored: true, type };
  }

  const session = event.data && event.data.object;
  const meta = (session && session.metadata) || {};
  const userId = meta.user_id || session.client_reference_id;
  const interval = meta.interval || null;
  const planId = meta.plan_id || null;
  if (!userId) throw httpError(400, 'Missing user_id in metadata');

  const now = new Date();
  let until = null;
  if (interval === 'month') until = addMonths(now, 1).toISOString();
  else if (interval === 'year') until = addMonths(now, 12).toISOString();
  else until = addMonths(now, 1).toISOString();

  await repo.createPayment({
    user_id: userId,
    provider: 'stripe',
    provider_session_id: session.id,
    provider_event_id: event.id,
    plan_id: planId,
    interval,
    amount_cents: session.amount_total || null,
    currency: session.currency ? String(session.currency).toUpperCase() : null,
    status: 'paid',
  });

  await repo.setUserPremium({ userId, tier: 'premium', until });

  return { ok: true, applied: true, user_id: userId, premium_until: until };
}

module.exports = { plans, createCheckoutSession, handleWebhook, eligibility, unlockByReputation };
