'use strict';
const { randomUUID } = require('crypto');
const db = require('../../config/db');

async function create({ userId, kind, title = null, body = null, payload = {} }) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const payloadJson = JSON.stringify(payload || {});

  if (db.isPg) {
    await db.exec(
      `INSERT INTO notifications (id, user_id, kind, title, body, payload, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [id, userId, kind, title, body, payloadJson, createdAt]
    );
    return id;
  }

  db.prepare(
    'INSERT INTO notifications (id, user_id, kind, title, body, payload, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(id, userId, kind, title, body, payloadJson, createdAt);
  return id;
}

async function listForUser(userId, { limit = 40, offset = 0, unreadOnly = false } = {}) {
  const lim = Math.max(1, Math.min(100, Number(limit || 40)));
  const off = Math.max(0, Number(offset || 0));

  if (db.isPg) {
    const rows = await db.many(
      `SELECT id, kind, title, body, payload, read_at, created_at
       FROM notifications
       WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, lim, off]
    );
    rows.forEach(r => {
      try { r.payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload || {}); } catch { r.payload = {}; }
    });
    return rows;
  }

  const rows = db.prepare(
    `SELECT id, kind, title, body, payload, read_at, created_at
     FROM notifications
     WHERE user_id = ? ${unreadOnly ? 'AND read_at IS NULL' : ''}
     ORDER BY datetime(created_at) DESC
     LIMIT ? OFFSET ?`
  ).all(userId, lim, off);

  rows.forEach(r => {
    try { r.payload = JSON.parse(r.payload || '{}'); } catch { r.payload = {}; }
  });
  return rows;
}

async function markRead(userId, notificationId) {
  const now = new Date().toISOString();
  if (db.isPg) {
    await db.exec(
      'UPDATE notifications SET read_at = COALESCE(read_at, $1) WHERE id = $2 AND user_id = $3',
      [now, notificationId, userId]
    );
    return;
  }
  db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?').run(now, notificationId, userId);
}

async function markAllRead(userId) {
  const now = new Date().toISOString();
  if (db.isPg) {
    await db.exec(
      'UPDATE notifications SET read_at = COALESCE(read_at, $1) WHERE user_id = $2 AND read_at IS NULL',
      [now, userId]
    );
    return;
  }
  db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND read_at IS NULL').run(now, userId);
}

module.exports = { create, listForUser, markRead, markAllRead };
