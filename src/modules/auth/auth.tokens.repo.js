'use strict';
const { randomUUID, createHash, randomBytes } = require('crypto');
const db = require('../../config/db');

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function newToken() {
  return randomBytes(32).toString('hex');
}

async function createToken({ userId, type, ttlMinutes }) {
  const id = randomUUID();
  const token = newToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Number(ttlMinutes || 30) * 60 * 1000).toISOString();
  const createdAt = now.toISOString();

  if (db.isPg) {
    await db.exec(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, used_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, userId, type, tokenHash, expiresAt, null, createdAt]
    );
    return { token, expires_at: expiresAt };
  }

  db.prepare(
    'INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, used_at, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(id, userId, type, tokenHash, expiresAt, null, createdAt);
  return { token, expires_at: expiresAt };
}

async function consumeToken({ type, token }) {
  const tokenHash = hashToken(token);
  const nowIso = new Date().toISOString();

  if (db.isPg) {
    const row = await db.one(
      `SELECT id, user_id, expires_at, used_at
       FROM auth_tokens
       WHERE type = $1 AND token_hash = $2`,
      [type, tokenHash]
    );
    if (!row) return null;
    if (row.used_at) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    await db.exec('UPDATE auth_tokens SET used_at = $1 WHERE id = $2', [nowIso, row.id]);
    return { user_id: row.user_id };
  }

  const row = db.prepare(
    'SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE type = ? AND token_hash = ?'
  ).get(type, tokenHash);
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?').run(nowIso, row.id);
  return { user_id: row.user_id };
}

module.exports = { createToken, consumeToken };
