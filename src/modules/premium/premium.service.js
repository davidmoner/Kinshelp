'use strict';
const db = require('../../config/database');
const httpError = require('../../shared/http-error');
const { PREMIUM_UNLOCK_REPUTATION, PREMIUM_UNLOCK_MIN_DISTINCT_PARTNERS } = require('../../config/constants');

function countDistinctPartnersDone(userId) {
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

function createCheckoutSession(userId, { interval }) {
  // Stripe integration is intentionally stubbed for now.
  // When enabling:
  // - Create Stripe Checkout Session
  // - Store pending subscription state
  // - Add webhook handler to mark premium_until/premium_tier
  return {
    implemented: false,
    provider: 'stripe',
    interval,
    message: 'Stripe estara disponible proximamente. Por ahora, Premium se gestiona manualmente en demo.',
    checkout_url: null,
    user_id: userId,
  };
}

function eligibility(userId) {
  const u = db.prepare('SELECT points_balance, premium_tier, premium_until FROM users WHERE id = ?').get(userId);
  if (!u) throw httpError(404, 'User not found');
  const rep = u.points_balance || 0;
  const partners = countDistinctPartnersDone(userId);
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

function unlockByReputation(userId) {
  const e = eligibility(userId);
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
  const now = new Date().toISOString();
  db.prepare("UPDATE users SET premium_tier = 'premium', premium_until = NULL, updated_at = ? WHERE id = ?")
    .run(now, userId);
  return { ok: true, unlocked: true, ...eligibility(userId) };
}

module.exports = { plans, createCheckoutSession, eligibility, unlockByReputation };
