'use strict';
const db = require('../../config/db');

function listUsers({ query, status, verified, premium, limit, offset }) {
  const q = query ? `%${String(query).toLowerCase()}%` : null;

  const hasStatus = status === 'active' || status === 'banned';
  const hasVerified = verified === 'yes' || verified === 'no';
  const hasPremium = ['free', 'paid', 'premium', 'gold', 'silver'].includes(premium);

  if (db.isPg) {
    const clauses = [];
    const vals = [];
    let i = 1;

    if (q) {
      clauses.push(`(lower(email) LIKE $${i} OR lower(display_name) LIKE $${i} OR cast(id as text) LIKE $${i})`);
      vals.push(q);
      i++;
    }
    if (hasStatus) clauses.push(`is_banned = ${status === 'banned' ? 'true' : 'false'}`);
    if (hasVerified) clauses.push(`is_verified = ${verified === 'yes' ? 'true' : 'false'}`);
    if (hasPremium) {
      if (premium === 'paid') clauses.push(`(premium_tier IS NOT NULL AND premium_tier != 'free')`);
      else if (premium === 'free') clauses.push(`(premium_tier IS NULL OR premium_tier = 'free')`);
      else {
        clauses.push(`premium_tier = $${i}`);
        vals.push(premium);
        i++;
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT id, display_name, email, points_balance, premium_tier, is_verified, is_banned, created_at, updated_at
       FROM users
       ${where}
       ORDER BY created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`;
    vals.push(limit, offset);
    return db.many(sql, vals).catch(() => listUsersFallback({ query, limit, offset, pg: true }));
  }

  const clauses = [];
  const vals = [];
  if (q) {
    clauses.push('(lower(email) LIKE ? OR lower(display_name) LIKE ? OR id LIKE ?)');
    vals.push(q, q, q);
  }
  if (hasStatus) clauses.push(`is_banned = ${status === 'banned' ? '1' : '0'}`);
  if (hasVerified) clauses.push(`is_verified = ${verified === 'yes' ? '1' : '0'}`);
  if (hasPremium) {
    if (premium === 'paid') clauses.push(`(premium_tier IS NOT NULL AND premium_tier != 'free')`);
    else if (premium === 'free') clauses.push(`(premium_tier IS NULL OR premium_tier = 'free')`);
    else { clauses.push('premium_tier = ?'); vals.push(premium); }
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `
    SELECT id, display_name, email, points_balance, premium_tier, is_verified, is_banned, created_at, updated_at
    FROM users
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  vals.push(limit, offset);
  try {
    return db.prepare(sql).all(...vals);
  } catch {
    return listUsersFallback({ query, limit, offset, pg: false });
  }
}

function listUsersFallback({ query, limit, offset, pg }) {
  const q = query ? `%${String(query).toLowerCase()}%` : null;
  if (pg) {
    if (q) {
      return db.many(
        `SELECT id, display_name, email,
                0 AS points_balance,
                'free' AS premium_tier,
                false AS is_verified,
                false AS is_banned,
                created_at, updated_at
         FROM users
         WHERE lower(email) LIKE $1 OR lower(display_name) LIKE $1 OR cast(id as text) LIKE $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [q, limit, offset]
      );
    }
    return db.many(
      `SELECT id, display_name, email,
              0 AS points_balance,
              'free' AS premium_tier,
              false AS is_verified,
              false AS is_banned,
              created_at, updated_at
       FROM users
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }

  if (q) {
    return db.prepare(
      `SELECT id, display_name, email,
              0 AS points_balance,
              'free' AS premium_tier,
              0 AS is_verified,
              0 AS is_banned,
              created_at, updated_at
       FROM users
       WHERE lower(email) LIKE ? OR lower(display_name) LIKE ? OR id LIKE ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).all(q, q, q, limit, offset);
  }

  return db.prepare(
    `SELECT id, display_name, email,
            0 AS points_balance,
            'free' AS premium_tier,
            0 AS is_verified,
            0 AS is_banned,
            created_at, updated_at
     FROM users
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset);
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

function listMatches({ query, limit, offset }) {
  const q = query ? `%${String(query).toLowerCase()}%` : null;
  if (db.isPg) {
    if (q) {
      return db.many(
        `SELECT m.id, m.status, m.compensation_type, m.created_at, m.updated_at,
                p.display_name AS provider_name, s.display_name AS seeker_name,
                r.title AS request_title, o.title AS offer_title
         FROM matches m
         JOIN users p ON p.id = m.provider_id
         JOIN users s ON s.id = m.seeker_id
         LEFT JOIN help_requests r ON r.id = m.request_id
         LEFT JOIN service_offers o ON o.id = m.offer_id
         WHERE lower(p.display_name) LIKE $1 OR lower(s.display_name) LIKE $1
            OR lower(r.title) LIKE $1 OR lower(o.title) LIKE $1 OR cast(m.id as text) LIKE $1
         ORDER BY m.created_at DESC
         LIMIT $2 OFFSET $3`,
        [q, limit, offset]
      );
    }
    return db.many(
      `SELECT m.id, m.status, m.compensation_type, m.created_at, m.updated_at,
              p.display_name AS provider_name, s.display_name AS seeker_name,
              r.title AS request_title, o.title AS offer_title
       FROM matches m
       JOIN users p ON p.id = m.provider_id
       JOIN users s ON s.id = m.seeker_id
       LEFT JOIN help_requests r ON r.id = m.request_id
       LEFT JOIN service_offers o ON o.id = m.offer_id
       ORDER BY m.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }

  if (q) {
    return db.prepare(
      `SELECT m.id, m.status, m.compensation_type, m.created_at, m.updated_at,
              p.display_name AS provider_name, s.display_name AS seeker_name,
              r.title AS request_title, o.title AS offer_title
       FROM matches m
       JOIN users p ON p.id = m.provider_id
       JOIN users s ON s.id = m.seeker_id
       LEFT JOIN help_requests r ON r.id = m.request_id
       LEFT JOIN service_offers o ON o.id = m.offer_id
       WHERE lower(p.display_name) LIKE ? OR lower(s.display_name) LIKE ?
          OR lower(r.title) LIKE ? OR lower(o.title) LIKE ? OR m.id LIKE ?
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(q, q, q, q, q, limit, offset);
  }

  return db.prepare(
    `SELECT m.id, m.status, m.compensation_type, m.created_at, m.updated_at,
            p.display_name AS provider_name, s.display_name AS seeker_name,
            r.title AS request_title, o.title AS offer_title
     FROM matches m
     JOIN users p ON p.id = m.provider_id
     JOIN users s ON s.id = m.seeker_id
     LEFT JOIN help_requests r ON r.id = m.request_id
     LEFT JOIN service_offers o ON o.id = m.offer_id
     ORDER BY m.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset);
}

function getRequestById(id) {
  if (db.isPg) {
    return db.one(
      `SELECT r.*, u.display_name AS seeker_name, u.email AS seeker_email
       FROM help_requests r
       JOIN users u ON u.id = r.seeker_id
       WHERE r.id = $1`,
      [id]
    );
  }
  return db.prepare(
    `SELECT r.*, u.display_name AS seeker_name, u.email AS seeker_email
     FROM help_requests r
     JOIN users u ON u.id = r.seeker_id
     WHERE r.id = ?`
  ).get(id);
}

function getOfferById(id) {
  if (db.isPg) {
    return db.one(
      `SELECT o.*, u.display_name AS provider_name, u.email AS provider_email
       FROM service_offers o
       JOIN users u ON u.id = o.provider_id
       WHERE o.id = $1`,
      [id]
    );
  }
  return db.prepare(
    `SELECT o.*, u.display_name AS provider_name, u.email AS provider_email
     FROM service_offers o
     JOIN users u ON u.id = o.provider_id
     WHERE o.id = ?`
  ).get(id);
}

function getMatchById(id) {
  if (db.isPg) {
    return db.one(
      `SELECT m.*, p.display_name AS provider_name, p.email AS provider_email,
              s.display_name AS seeker_name, s.email AS seeker_email,
              r.title AS request_title, o.title AS offer_title
       FROM matches m
       JOIN users p ON p.id = m.provider_id
       JOIN users s ON s.id = m.seeker_id
       LEFT JOIN help_requests r ON r.id = m.request_id
       LEFT JOIN service_offers o ON o.id = m.offer_id
       WHERE m.id = $1`,
      [id]
    );
  }
  return db.prepare(
    `SELECT m.*, p.display_name AS provider_name, p.email AS provider_email,
            s.display_name AS seeker_name, s.email AS seeker_email,
            r.title AS request_title, o.title AS offer_title
     FROM matches m
     JOIN users p ON p.id = m.provider_id
     JOIN users s ON s.id = m.seeker_id
     LEFT JOIN help_requests r ON r.id = m.request_id
     LEFT JOIN service_offers o ON o.id = m.offer_id
     WHERE m.id = ?`
  ).get(id);
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
  listMatches,
  getRequestById,
  getOfferById,
  getMatchById,
  insertAudit,
  listAudit,
  getConfig,
  upsertConfig,
  ensureTables,
};
