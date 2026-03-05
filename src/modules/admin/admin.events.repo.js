'use strict';
const { randomUUID } = require('crypto');
const db = require('../../config/db');

function ensureTables() {
  // tables created by migration; keep lightweight best-effort for sqlite dev
  if (db.isPg) {
    return db.exec(`
      CREATE TABLE IF NOT EXISTS admin_events (
        id            uuid PRIMARY KEY,
        type          text NOT NULL,
        actor_user_id uuid,
        target_type   text,
        target_id     text,
        meta_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_admin_events_created ON admin_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_admin_events_type_created ON admin_events(type, created_at);
    `);
  }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_events (
        id            TEXT PRIMARY KEY,
        type          TEXT NOT NULL,
        actor_user_id TEXT,
        target_type   TEXT,
        target_id     TEXT,
        meta_json     TEXT NOT NULL DEFAULT '{}',
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_admin_events_created ON admin_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_admin_events_type_created ON admin_events(type, created_at);
    `);
  } catch { }
}

function logEvent({ type, actorUserId, targetType, targetId, meta }) {
  const ensure = ensureTables();
  const id = randomUUID();
  const metaJson = JSON.stringify(meta || {});

  if (db.isPg) {
    return Promise.resolve(ensure).then(() => db.exec(
      `INSERT INTO admin_events (id, type, actor_user_id, target_type, target_id, meta_json)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, type, actorUserId || null, targetType || null, targetId || null, meta || {}]
    ));
  }

  db.prepare(`
    INSERT INTO admin_events (id, type, actor_user_id, target_type, target_id, meta_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(id, type, actorUserId || null, targetType || null, targetId || null, metaJson);
}

function listEvents({ type, limit, offset }) {
  const ensure = ensureTables();
  if (db.isPg) {
    if (type) {
      return Promise.resolve(ensure).then(() => db.many(
        `SELECT id, type, actor_user_id, target_type, target_id, meta_json, created_at
         FROM admin_events
         WHERE type = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [type, limit, offset]
      )).catch(() => []);
    }
    return Promise.resolve(ensure).then(() => db.many(
      `SELECT id, type, actor_user_id, target_type, target_id, meta_json, created_at
       FROM admin_events
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )).catch(() => []);
  }

  if (type) {
    return db.prepare(`
      SELECT id, type, actor_user_id, target_type, target_id, meta_json, created_at
      FROM admin_events
      WHERE type = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(type, limit, offset);
  }
  return db.prepare(`
    SELECT id, type, actor_user_id, target_type, target_id, meta_json, created_at
    FROM admin_events
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

module.exports = { logEvent, listEvents };
