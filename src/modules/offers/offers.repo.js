'use strict';
const db = require('../../config/database');
const { randomUUID } = require('crypto');

const WITH_PROVIDER = `
  SELECT o.*, u.display_name AS provider_name, u.avatar_url AS provider_avatar,
         u.rating_avg AS provider_rating, u.premium_tier AS provider_tier
  FROM service_offers o JOIN users u ON u.id = o.provider_id
`;

function findById(id) {
    expireStale();
    const row = db.prepare(`${WITH_PROVIDER} WHERE o.id = ?`).get(id);
    if (row) row.media_urls = JSON.parse(row.media_urls || '[]');
    return row;
}

function list({ category, status = 'active', provider_id, limit = 20, offset = 0 }) {
    expireStale();
    let sql = `${WITH_PROVIDER} WHERE o.status = ?`;
    const params = [status];
    if (category) { sql += ' AND o.category = ?'; params.push(category); }
    if (provider_id) { sql += ' AND o.provider_id = ?'; params.push(provider_id); }
    sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const rows = db.prepare(sql).all(...params);
    rows.forEach(r => {
        try { r.media_urls = JSON.parse(r.media_urls || '[]'); } catch { r.media_urls = []; }
    });
    return rows;
}

function expireStale() {
    const now = new Date().toISOString();

    // Premium auto-renew: keep active and extend 60 days
    db.prepare(`
      UPDATE service_offers
      SET expires_at = datetime('now', '+60 days'), updated_at = ?
      WHERE status = 'active'
        AND expires_at <= ?
        AND provider_id IN (
          SELECT id FROM users
          WHERE premium_tier != 'free'
            AND (premium_until IS NULL OR premium_until > datetime('now'))
        )
    `).run(now, now);

    // Free users: expire
    db.prepare(`
      UPDATE service_offers
      SET status = 'expired', updated_at = ?
      WHERE status = 'active'
        AND expires_at <= ?
    `).run(now, now);
}

function insert({ provider_id, title, description, category, points_value, expires_at, media_urls, location_text, compensation_type }) {
    const id = randomUUID(), now = new Date().toISOString();
    try {
        db.prepare(`
      INSERT INTO service_offers
        (id, provider_id, title, description, category, points_value, media_urls, location_text, expires_at, status, created_at, updated_at, compensation_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(id, provider_id, title, description || null, category, points_value,
            JSON.stringify(media_urls || []), location_text || null, expires_at, now, now, compensation_type || 'cash');
    } catch (e) {
        // Backward compatibility if DB wasn't migrated yet
        db.prepare(`
      INSERT INTO service_offers
        (id, provider_id, title, description, category, points_value, expires_at, media_urls, location_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, provider_id, title, description || null, category, points_value,
            expires_at, JSON.stringify(media_urls || []), location_text || null, now, now);
    }
    return id;
}

function patch(id, sets, vals) {
    db.prepare(`UPDATE service_offers SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...vals, new Date().toISOString(), id);
}

function setStatus(id, status) {
    db.prepare("UPDATE service_offers SET status = ?, updated_at = ? WHERE id = ?")
        .run(status, new Date().toISOString(), id);
}

module.exports = { findById, list, insert, patch, setStatus, expireStale };
