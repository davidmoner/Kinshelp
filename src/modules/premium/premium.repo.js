'use strict';
const { randomUUID } = require('crypto');
const db = require('../../config/db');

async function createPayment({
  user_id,
  provider,
  provider_session_id,
  provider_event_id,
  plan_id,
  interval,
  amount_cents,
  currency,
  status,
}) {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (db.isPg) {
    await db.exec(
      `INSERT INTO payments (id, user_id, provider, provider_session_id, provider_event_id, plan_id, interval, amount_cents, currency, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (provider, provider_event_id) DO NOTHING`,
      [id, user_id, provider, provider_session_id || null, provider_event_id || null, plan_id || null, interval || null, amount_cents || null, currency || null, status, now, now]
    );
    return id;
  }

  db.prepare(
    `INSERT OR IGNORE INTO payments (id, user_id, provider, provider_session_id, provider_event_id, plan_id, interval, amount_cents, currency, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    user_id,
    provider,
    provider_session_id || null,
    provider_event_id || null,
    plan_id || null,
    interval || null,
    amount_cents || null,
    currency || null,
    status,
    now,
    now
  );
  return id;
}

async function setUserPremium({ userId, tier, until }) {
  const now = new Date().toISOString();
  if (db.isPg) {
    await db.exec(
      'UPDATE users SET premium_tier = $1, premium_until = $2, updated_at = $3 WHERE id = $4',
      [tier, until, now, userId]
    );
    return;
  }
  db.prepare('UPDATE users SET premium_tier = ?, premium_until = ?, updated_at = ? WHERE id = ?').run(tier, until, now, userId);
}

module.exports = { createPayment, setUserPremium };
