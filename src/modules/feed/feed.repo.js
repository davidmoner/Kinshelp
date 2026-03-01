
'use strict';
const db = require('../../config/db');

async function listFeed({ limit = 40, offset = 0 } = {}) {
  const sql = `
    SELECT * FROM (
      SELECT
        'request' AS kind,
        r.id AS id,
        r.title AS title,
        r.category AS category,
        r.location_text AS location_text,
        r.lat AS lat,
        r.lng AS lng,
        r.compensation_type AS compensation_type,
        r.media_urls AS media_urls,
        r.created_at AS created_at,
        r.expires_at AS expires_at,
        u.id AS user_id,
        u.display_name AS user_name,
        u.rating_avg AS user_rating,
        u.premium_tier AS user_tier
      FROM help_requests r
      JOIN users u ON u.id = r.seeker_id
      WHERE r.status = 'open' AND r.expires_at > ${db.isPg ? 'now()' : "datetime('now')"}

      UNION ALL

      SELECT
        'offer' AS kind,
        o.id AS id,
        o.title AS title,
        o.category AS category,
        o.location_text AS location_text,
        o.lat AS lat,
        o.lng AS lng,
        o.compensation_type AS compensation_type,
        o.media_urls AS media_urls,
        o.created_at AS created_at,
        o.expires_at AS expires_at,
        u.id AS user_id,
        u.display_name AS user_name,
        u.rating_avg AS user_rating,
        u.premium_tier AS user_tier
      FROM service_offers o
      JOIN users u ON u.id = o.provider_id
      WHERE o.status = 'active' AND o.expires_at > ${db.isPg ? 'now()' : "datetime('now')"}
    )
    ORDER BY ${db.isPg ? 'created_at' : 'datetime(created_at)'} DESC
    LIMIT ${db.isPg ? '$1' : '?'} OFFSET ${db.isPg ? '$2' : '?'}
  `;

  const rows = db.isPg ? await db.many(sql, [limit, offset]) : db.prepare(sql).all(limit, offset);

  rows.forEach(r => {
    try {
      if (typeof r.media_urls === 'string') r.media_urls = JSON.parse(r.media_urls || '[]');
      else if (!r.media_urls) r.media_urls = [];
    } catch { r.media_urls = []; }
  });
  return rows;
}

module.exports = { listFeed };
