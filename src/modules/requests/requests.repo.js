'use strict';
const db = require('../../config/db');
const { randomUUID } = require('crypto');

const WITH_SEEKER = `
  SELECT r.*, u.display_name AS seeker_name, u.avatar_url AS seeker_avatar,
         u.rating_avg AS seeker_rating, u.premium_tier AS seeker_tier
  FROM help_requests r JOIN users u ON u.id = r.seeker_id
`;

function findById(id) {
    expireStale();
    if (db.isPg) {
        return db.one(`${WITH_SEEKER} WHERE r.id = $1`, [id]).then(row => {
            if (row) {
                try { row.media_urls = JSON.parse(row.media_urls || '[]'); } catch { row.media_urls = []; }
            }
            return row;
        });
    }
    const row = db.prepare(`${WITH_SEEKER} WHERE r.id = ?`).get(id);
    if (row) row.media_urls = JSON.parse(row.media_urls || '[]');
    return row;
}

function list({ category, status = 'open', seeker_id, include_hidden = false, limit = 20, offset = 0 }) {
    expireStale();
    if (db.isPg) {
        let i = 1;
        let sql = `${WITH_SEEKER} WHERE r.status = $${i++}`;
        const params = [status];
        if (!include_hidden) { sql += ` AND r.is_hidden = FALSE`; }
        if (category) { sql += ` AND r.category = $${i++}`; params.push(category); }
        if (seeker_id) { sql += ` AND r.seeker_id = $${i++}`; params.push(seeker_id); }
        sql += ` ORDER BY r.created_at DESC LIMIT $${i++} OFFSET $${i++}`;
        params.push(limit, offset);
        return db.many(sql, params).then(rows => {
            rows.forEach(r => {
                try { r.media_urls = JSON.parse(r.media_urls || '[]'); } catch { r.media_urls = []; }
            });
            return rows;
        });
    }

    let sql = `${WITH_SEEKER} WHERE r.status = ?`;
    const params = [status];
    if (!include_hidden) { sql += ' AND r.is_hidden = 0'; }
    if (category) { sql += ' AND r.category = ?'; params.push(category); }
    if (seeker_id) { sql += ' AND r.seeker_id = ?'; params.push(seeker_id); }
    sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const rows = db.prepare(sql).all(...params);
    rows.forEach(r => {
        try { r.media_urls = JSON.parse(r.media_urls || '[]'); } catch { r.media_urls = []; }
    });
    return rows;
}

function expireStale() {
    const now = new Date().toISOString();

    // Postgres: expiry/renewal runs in pg migration/cron later; skip here.
    if (db.isPg) return;

    // Premium auto-renew: keep open and extend 60 days
    db.prepare(`
      UPDATE help_requests
      SET expires_at = datetime('now', '+60 days'), updated_at = ?
      WHERE status = 'open'
        AND expires_at <= ?
        AND seeker_id IN (
          SELECT id FROM users
          WHERE premium_tier != 'free'
            AND (premium_until IS NULL OR premium_until > datetime('now'))
        )
    `).run(now, now);

    // Free users: expire
    db.prepare(`
      UPDATE help_requests
      SET status = 'expired', updated_at = ?
      WHERE status = 'open'
        AND expires_at <= ?
    `).run(now, now);
}

function insert({ seeker_id, title, description, category, points_offered, expires_at, media_urls, location_text, compensation_type }) {
    const id = randomUUID(), now = new Date().toISOString();
    if (db.isPg) {
        return db.exec(
            `INSERT INTO help_requests
              (id, seeker_id, title, description, category, points_offered, media_urls, location_text, expires_at, status, created_at, updated_at, compensation_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10,$11,$12)`,
            [
                id,
                seeker_id,
                title,
                description || null,
                category,
                points_offered,
                JSON.stringify(media_urls || []),
                location_text || null,
                expires_at,
                now,
                now,
                compensation_type || 'cash',
            ]
        ).then(() => id);
    }
    try {
        db.prepare(`
      INSERT INTO help_requests
        (id, seeker_id, title, description, category, points_offered, media_urls, location_text, expires_at, status, created_at, updated_at, compensation_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `).run(id, seeker_id, title, description || null, category, points_offered,
            JSON.stringify(media_urls || []), location_text || null, expires_at, now, now, compensation_type || 'cash');
    } catch (e) {
        // Backward compatibility if DB wasn't migrated yet
        db.prepare(`
      INSERT INTO help_requests
        (id, seeker_id, title, description, category, points_offered, expires_at, media_urls, location_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, seeker_id, title, description || null, category, points_offered,
            expires_at, JSON.stringify(media_urls || []), location_text || null, now, now);
    }
    return id;
}

function patch(id, sets, vals) {
    if (db.isPg) {
        let i = 1;
        const pgSets = sets.replace(/\?/g, () => `$${i++}`);
        return db.exec(
            `UPDATE help_requests SET ${pgSets}, updated_at = $${i++} WHERE id = $${i}`,
            [...vals, new Date().toISOString(), id]
        );
    }
    db.prepare(`UPDATE help_requests SET ${sets}, updated_at = ? WHERE id = ?`).run(...vals, new Date().toISOString(), id);
}

function setStatus(id, status) {
    if (db.isPg) {
        return db.exec('UPDATE help_requests SET status = $1, updated_at = $2 WHERE id = $3', [status, new Date().toISOString(), id]);
    }
    db.prepare("UPDATE help_requests SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
}

function suggestedProviders(category, excludeUserId) {
    expireStale();
    if (db.isPg) {
        return db.many(`
    SELECT DISTINCT u.id, u.display_name, u.avatar_url, u.rating_avg, u.rating_count,
                    u.premium_tier, u.location_text,
                    COUNT(o.id) AS active_offer_count
    FROM users u
    JOIN service_offers o ON o.provider_id = u.id
    WHERE o.category = $1 AND o.status = 'active' AND o.expires_at > NOW() AND u.id != $2
    GROUP BY u.id
    ORDER BY
      CASE
        WHEN u.premium_tier != 'free' AND (u.premium_until IS NULL OR u.premium_until > NOW()) THEN 2
        ELSE 1
      END DESC,
      u.rating_avg DESC
    LIMIT 20
  `, [category, excludeUserId]);
    }

    return db.prepare(`
    SELECT DISTINCT u.id, u.display_name, u.avatar_url, u.rating_avg, u.rating_count,
                    u.premium_tier, u.location_text,
                    COUNT(o.id) AS active_offer_count
    FROM users u
    JOIN service_offers o ON o.provider_id = u.id
    WHERE o.category = ? AND o.status = 'active' AND o.expires_at > datetime('now') AND u.id != ?
    GROUP BY u.id
    ORDER BY
      CASE
        WHEN u.premium_tier != 'free' AND (u.premium_until IS NULL OR u.premium_until > datetime('now')) THEN 2
        ELSE 1
      END DESC,
      u.rating_avg DESC
    LIMIT 20
  `).all(category, excludeUserId);
}

module.exports = { findById, list, insert, patch, setStatus, suggestedProviders, expireStale };
