'use strict';
const db = require('../../config/db');

function listUsers({ query, limit, offset }) {
  const q = query ? `%${String(query).toLowerCase()}%` : null;

  if (db.isPg) {
    if (q) {
      return db.many(
        `SELECT id, display_name, email, points_balance, premium_tier, is_verified, created_at, updated_at
         FROM users
         WHERE lower(email) LIKE $1 OR lower(display_name) LIKE $1 OR cast(id as text) LIKE $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [q, limit, offset]
      );
    }
    return db.many(
      `SELECT id, display_name, email, points_balance, premium_tier, is_verified, created_at, updated_at
       FROM users
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }

  if (q) {
    return db.prepare(`
      SELECT id, display_name, email, points_balance, premium_tier, is_verified, created_at, updated_at
      FROM users
      WHERE lower(email) LIKE ? OR lower(display_name) LIKE ? OR id LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(q, q, q, limit, offset);
  }

  return db.prepare(`
    SELECT id, display_name, email, points_balance, premium_tier, is_verified, created_at, updated_at
    FROM users
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getUserById(id) {
  if (db.isPg) return db.one('SELECT * FROM users WHERE id = $1', [id]);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listRequests({ query, limit, offset }) {
  const q = query ? `%${String(query).toLowerCase()}%` : null;
  if (db.isPg) {
    if (q) {
      return db.many(
        `SELECT r.id, r.title, r.category, r.status, r.is_hidden, r.created_at, r.updated_at,
                r.seeker_id, u.display_name AS seeker_name, u.email AS seeker_email
         FROM help_requests r
         JOIN users u ON u.id = r.seeker_id
         WHERE lower(r.title) LIKE $1 OR lower(u.display_name) LIKE $1 OR lower(u.email) LIKE $1 OR cast(r.id as text) LIKE $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [q, limit, offset]
      );
    }
    return db.many(
      `SELECT r.id, r.title, r.category, r.status, r.is_hidden, r.created_at, r.updated_at,
              r.seeker_id, u.display_name AS seeker_name, u.email AS seeker_email
       FROM help_requests r
       JOIN users u ON u.id = r.seeker_id
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }

  if (q) {
    return db.prepare(
      `SELECT r.id, r.title, r.category, r.status, r.is_hidden, r.created_at, r.updated_at,
              r.seeker_id, u.display_name AS seeker_name, u.email AS seeker_email
       FROM help_requests r
       JOIN users u ON u.id = r.seeker_id
       WHERE lower(r.title) LIKE ? OR lower(u.display_name) LIKE ? OR lower(u.email) LIKE ? OR r.id LIKE ?
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(q, q, q, q, limit, offset);
  }

  return db.prepare(
    `SELECT r.id, r.title, r.category, r.status, r.is_hidden, r.created_at, r.updated_at,
            r.seeker_id, u.display_name AS seeker_name, u.email AS seeker_email
     FROM help_requests r
     JOIN users u ON u.id = r.seeker_id
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset);
}

function listOffers({ query, limit, offset }) {
  const q = query ? `%${String(query).toLowerCase()}%` : null;
  if (db.isPg) {
    if (q) {
      return db.many(
        `SELECT o.id, o.title, o.category, o.status, o.is_hidden, o.created_at, o.updated_at,
                o.provider_id, u.display_name AS provider_name, u.email AS provider_email
         FROM service_offers o
         JOIN users u ON u.id = o.provider_id
         WHERE lower(o.title) LIKE $1 OR lower(u.display_name) LIKE $1 OR lower(u.email) LIKE $1 OR cast(o.id as text) LIKE $1
         ORDER BY o.created_at DESC
         LIMIT $2 OFFSET $3`,
        [q, limit, offset]
      );
    }
    return db.many(
      `SELECT o.id, o.title, o.category, o.status, o.is_hidden, o.created_at, o.updated_at,
              o.provider_id, u.display_name AS provider_name, u.email AS provider_email
       FROM service_offers o
       JOIN users u ON u.id = o.provider_id
       ORDER BY o.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }

  if (q) {
    return db.prepare(
      `SELECT o.id, o.title, o.category, o.status, o.is_hidden, o.created_at, o.updated_at,
              o.provider_id, u.display_name AS provider_name, u.email AS provider_email
       FROM service_offers o
       JOIN users u ON u.id = o.provider_id
       WHERE lower(o.title) LIKE ? OR lower(u.display_name) LIKE ? OR lower(u.email) LIKE ? OR o.id LIKE ?
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(q, q, q, q, limit, offset);
  }

  return db.prepare(
    `SELECT o.id, o.title, o.category, o.status, o.is_hidden, o.created_at, o.updated_at,
            o.provider_id, u.display_name AS provider_name, u.email AS provider_email
     FROM service_offers o
     JOIN users u ON u.id = o.provider_id
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset);
}

function ensureTables() {
  if (db.isPg) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id            TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      action        TEXT NOT NULL,
      entity_type   TEXT NOT NULL,
      entity_id     TEXT,
      before_json   TEXT,
      after_json    TEXT,
      ip            TEXT,
      user_agent    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_user_id, created_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_config (
      key        TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function insertAudit({ id, adminUserId, action, entityType, entityId, beforeJson, afterJson, ip, userAgent }) {
  ensureTables();
  if (db.isPg) {
    return db.exec(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, entity_type, entity_id, before_json, after_json, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, adminUserId, action, entityType, entityId || null, beforeJson ? JSON.parse(beforeJson) : null, afterJson ? JSON.parse(afterJson) : null, ip || null, userAgent || null]
    );
  }
  db.prepare(`
    INSERT INTO admin_audit_log (id, admin_user_id, action, entity_type, entity_id, before_json, after_json, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(id, adminUserId, action, entityType, entityId || null, beforeJson || null, afterJson || null, ip || null, userAgent || null);
}

function listAudit({ limit, offset }) {
  ensureTables();
  if (db.isPg) {
    return db.many(
      `SELECT id, admin_user_id, action, entity_type, entity_id, created_at, ip
       FROM admin_audit_log
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }
  return db.prepare(`
    SELECT id, admin_user_id, action, entity_type, entity_id, created_at, ip
    FROM admin_audit_log
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getConfig() {
  ensureTables();
  if (db.isPg) {
    return db.many('SELECT key, value_json, updated_at FROM admin_config', []).then(rows => {
      const out = {};
      for (const r of rows) out[r.key] = r.value_json;
      return out;
    });
  }
  const rows = db.prepare('SELECT key, value_json, updated_at FROM admin_config').all();
  const out = {};
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value_json); } catch { out[r.key] = r.value_json; }
  }
  return out;
}

function upsertConfig(key, valueJson) {
  ensureTables();
  if (db.isPg) {
    return db.exec(
      `INSERT INTO admin_config (key, value_json, updated_at)
       VALUES ($1,$2,now())
       ON CONFLICT(key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()`,
      [key, JSON.parse(valueJson)]
    );
  }
  db.prepare(`
    INSERT INTO admin_config (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `).run(key, valueJson);
}

module.exports = {
  listUsers,
  getUserById,
  listRequests,
  listOffers,
  insertAudit,
  listAudit,
  getConfig,
  upsertConfig,
  ensureTables,
};
