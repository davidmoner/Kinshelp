'use strict';

// DB facade.
// - Local/dev: SQLite (better-sqlite3) via ./database
// - Production with DATABASE_URL: Postgres via ./postgres

const hasPg = !!process.env.DATABASE_URL;

if (!hasPg) {
  module.exports = require('./database');
  return;
}

const { getPool } = require('./postgres');

function mapRow(row) {
  if (!row) return row;
  // Keep API compatible with SQLite layer keys.
  if (Object.prototype.hasOwnProperty.call(row, 'passwordHash')) {
    row.password_hash = row.passwordHash;
    delete row.passwordHash;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'displayName')) {
    row.display_name = row.displayName;
    delete row.displayName;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'avatarUrl')) {
    row.avatar_url = row.avatarUrl;
    delete row.avatarUrl;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'locationText')) {
    row.location_text = row.locationText;
    delete row.locationText;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'pointsBalance')) {
    row.points_balance = row.pointsBalance;
    delete row.pointsBalance;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'ratingAvg')) {
    row.rating_avg = row.ratingAvg;
    delete row.ratingAvg;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'ratingCount')) {
    row.rating_count = row.ratingCount;
    delete row.ratingCount;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'premiumTier')) {
    row.premium_tier = row.premiumTier;
    delete row.premiumTier;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'premiumUntil')) {
    row.premium_until = row.premiumUntil;
    delete row.premiumUntil;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'isVerified')) {
    row.is_verified = row.isVerified;
    delete row.isVerified;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'createdAt')) {
    row.created_at = row.createdAt;
    delete row.createdAt;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'updatedAt')) {
    row.updated_at = row.updatedAt;
    delete row.updatedAt;
  }
  return row;
}

async function query(sql, params) {
  const pool = getPool();
  const res = await pool.query(sql, params);
  return res;
}

async function one(sql, params) {
  const res = await query(sql, params);
  const row = res.rows && res.rows[0];
  return mapRow(row);
}

async function many(sql, params) {
  const res = await query(sql, params);
  const rows = Array.isArray(res.rows) ? res.rows : [];
  return rows.map(mapRow);
}

async function exec(sql, params) {
  await query(sql, params);
}

module.exports = { one, many, exec, query, isPg: true };
