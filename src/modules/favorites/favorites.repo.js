'use strict';
const db = require('../../config/db');
const { randomUUID } = require('crypto');

function parseMedia(row) {
  if (!row) return row;
  if (!row.media_urls) {
    row.media_urls = [];
    return row;
  }
  if (Array.isArray(row.media_urls)) return row;
  try {
    const parsed = JSON.parse(String(row.media_urls));
    row.media_urls = Array.isArray(parsed) ? parsed : [];
  } catch {
    row.media_urls = [];
  }
  return row;
}

async function addFavorite({ userId, targetType, targetId }) {
  const id = randomUUID();
  if (db.isPg) {
    const res = await db.one(
      `INSERT INTO favorites (id, user_id, target_type, target_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, target_type, target_id) DO NOTHING
       RETURNING id`,
      [id, userId, targetType, targetId]
    );
    if (res && res.id) return { id: res.id, created: true };
    const existing = await db.one(
      'SELECT id FROM favorites WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
      [userId, targetType, targetId]
    );
    return { id: existing && existing.id, created: false };
  }

  db.prepare(`INSERT OR IGNORE INTO favorites (id, user_id, target_type, target_id)
              VALUES (?, ?, ?, ?)`)
    .run(id, userId, targetType, targetId);
  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND target_type = ? AND target_id = ?')
    .get(userId, targetType, targetId);
  return { id: existing && existing.id, created: !!(existing && existing.id === id) };
}

async function removeFavorite({ userId, targetType, targetId }) {
  if (db.isPg) {
    await db.exec('DELETE FROM favorites WHERE user_id = $1 AND target_type = $2 AND target_id = $3', [userId, targetType, targetId]);
    return { ok: true };
  }
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND target_type = ? AND target_id = ?')
    .run(userId, targetType, targetId);
  return { ok: true };
}

async function listFavorites({ userId, limit = 50, offset = 0 }) {
  if (db.isPg) {
    const sql = `
      SELECT * FROM (
        SELECT f.id AS favorite_id, f.target_type, f.target_id, f.created_at AS favorited_at,
               f.target_id AS id, r.title, r.description, r.category, r.compensation_type, r.location_text,
               r.expires_at, r.created_at, r.media_urls, r.status, r.is_hidden,
               u.display_name AS user_name, u.rating_avg AS user_rating, u.is_verified AS user_verified,
               u.premium_tier AS user_tier, 'request' AS kind
        FROM favorites f
        JOIN help_requests r ON r.id = f.target_id
        JOIN users u ON u.id = r.seeker_id
        WHERE f.user_id = $1 AND f.target_type = 'request' AND r.is_hidden = FALSE

        UNION ALL

        SELECT f.id AS favorite_id, f.target_type, f.target_id, f.created_at AS favorited_at,
               f.target_id AS id, o.title, o.description, o.category, o.compensation_type, o.location_text,
               o.expires_at, o.created_at, o.media_urls, o.status, o.is_hidden,
               u.display_name AS user_name, u.rating_avg AS user_rating, u.is_verified AS user_verified,
               u.premium_tier AS user_tier, 'offer' AS kind
        FROM favorites f
        JOIN service_offers o ON o.id = f.target_id
        JOIN users u ON u.id = o.provider_id
        WHERE f.user_id = $1 AND f.target_type = 'offer' AND o.is_hidden = FALSE
      ) t
      ORDER BY favorited_at DESC
      LIMIT $2 OFFSET $3`;
    const rows = await db.many(sql, [userId, limit, offset]);
    rows.forEach(parseMedia);
    return rows;
  }

  const sql = `
    SELECT * FROM (
      SELECT f.id AS favorite_id, f.target_type, f.target_id, f.created_at AS favorited_at,
             f.target_id AS id, r.title, r.description, r.category, r.compensation_type, r.location_text,
             r.expires_at, r.created_at, r.media_urls, r.status, r.is_hidden,
             u.display_name AS user_name, u.rating_avg AS user_rating, u.is_verified AS user_verified,
             u.premium_tier AS user_tier, 'request' AS kind
      FROM favorites f
      JOIN help_requests r ON r.id = f.target_id
      JOIN users u ON u.id = r.seeker_id
      WHERE f.user_id = ? AND f.target_type = 'request' AND r.is_hidden = 0

      UNION ALL

      SELECT f.id AS favorite_id, f.target_type, f.target_id, f.created_at AS favorited_at,
             f.target_id AS id, o.title, o.description, o.category, o.compensation_type, o.location_text,
             o.expires_at, o.created_at, o.media_urls, o.status, o.is_hidden,
             u.display_name AS user_name, u.rating_avg AS user_rating, u.is_verified AS user_verified,
             u.premium_tier AS user_tier, 'offer' AS kind
      FROM favorites f
      JOIN service_offers o ON o.id = f.target_id
      JOIN users u ON u.id = o.provider_id
      WHERE f.user_id = ? AND f.target_type = 'offer' AND o.is_hidden = 0
    ) t
    ORDER BY favorited_at DESC
    LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(userId, userId, limit, offset);
  rows.forEach(parseMedia);
  return rows;
}

async function findTarget({ targetType, targetId }) {
  if (db.isPg) {
    if (targetType === 'request') {
      return db.one('SELECT id FROM help_requests WHERE id = $1 AND is_hidden = FALSE', [targetId]);
    }
    if (targetType === 'offer') {
      return db.one('SELECT id FROM service_offers WHERE id = $1 AND is_hidden = FALSE', [targetId]);
    }
    return null;
  }
  if (targetType === 'request') {
    return db.prepare('SELECT id FROM help_requests WHERE id = ? AND is_hidden = 0').get(targetId);
  }
  if (targetType === 'offer') {
    return db.prepare('SELECT id FROM service_offers WHERE id = ? AND is_hidden = 0').get(targetId);
  }
  return null;
}

module.exports = { addFavorite, removeFavorite, listFavorites, findTarget };
