'use strict';
const db = require('../../config/db');
const { randomUUID } = require('crypto');

function nowIso() { return new Date().toISOString(); }

const DEFAULT_SCHEDULE = {
  weekday_start: '17:00',
  weekday_end: '21:00',
  weekend_start: '00:00',
  weekend_end: '23:59',
  tz_offset_min: null,
};

function parseSchedule(row) {
  if (!row) return DEFAULT_SCHEDULE;
  let schedule = null;
  const raw = row.quiet_start;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.weekday_start || parsed.weekday_end || parsed.weekend_start || parsed.weekend_end) {
          schedule = {
            weekday_start: parsed.weekday_start,
            weekday_end: parsed.weekday_end,
            weekend_start: parsed.weekend_start,
            weekend_end: parsed.weekend_end,
            tz_offset_min: parsed.tz_offset_min ?? null,
          };
        } else if (Array.isArray(parsed.weekday) || Array.isArray(parsed.weekend)) {
          schedule = {
            weekday_start: (parsed.weekday && parsed.weekday[0]) || null,
            weekday_end: (parsed.weekday && parsed.weekday[1]) || null,
            weekend_start: (parsed.weekend && parsed.weekend[0]) || null,
            weekend_end: (parsed.weekend && parsed.weekend[1]) || null,
            tz_offset_min: parsed.tz ?? parsed.tz_offset_min ?? null,
          };
        }
      }
    } catch { }
  }

  if (!schedule && row.quiet_start && row.quiet_end) {
    schedule = {
      weekday_start: row.quiet_start,
      weekday_end: row.quiet_end,
      weekend_start: DEFAULT_SCHEDULE.weekend_start,
      weekend_end: DEFAULT_SCHEDULE.weekend_end,
      tz_offset_min: null,
    };
  }

  return {
    ...DEFAULT_SCHEDULE,
    ...(schedule || {}),
  };
}

function expireStale() {
  if (db.isPg) {
    const now = nowIso();
    return db.exec(`
      UPDATE automatch_invites
      SET status = 'expired', updated_at = $1
      WHERE status = 'pending'
        AND expires_at <= $1
    `, [now]).then(() => db.exec(`
      UPDATE automatch_offer_invites
      SET status = 'expired', updated_at = $1
      WHERE status = 'pending'
        AND expires_at <= $1
    `, [now]));
  }
  const now = nowIso();
  db.prepare(`
    UPDATE automatch_invites
    SET status = 'expired', updated_at = ?
    WHERE status = 'pending'
      AND expires_at <= ?
  `).run(now, now);

  db.prepare(`
    UPDATE automatch_offer_invites
    SET status = 'expired', updated_at = ?
    WHERE status = 'pending'
      AND expires_at <= ?
  `).run(now, now);
}

function getUserBasics(userId) {
  if (db.isPg) {
    return db.one('SELECT id, rating_avg, is_verified, lat, lng FROM users WHERE id = $1', [userId]);
  }
  return db.prepare('SELECT id, rating_avg, is_verified, lat, lng FROM users WHERE id = ?').get(userId);
}

function getRequestStatus(requestId) {
  if (db.isPg) {
    return db.one('SELECT id, status FROM help_requests WHERE id = $1', [requestId]);
  }
  return db.prepare('SELECT id, status FROM help_requests WHERE id = ?').get(requestId);
}

function getOfferStatus(offerId) {
  if (db.isPg) {
    return db.one('SELECT id, status FROM service_offers WHERE id = $1', [offerId]);
  }
  return db.prepare('SELECT id, status FROM service_offers WHERE id = ?').get(offerId);
}

function countPendingForRequest(requestId) {
  if (db.isPg) {
    return db.one("SELECT COUNT(*)::int AS n FROM automatch_invites WHERE request_id = $1 AND status = 'pending'", [requestId])
      .then(r => (r && r.n) || 0);
  }
  expireStale();
  const row = db.prepare("SELECT COUNT(*) AS n FROM automatch_invites WHERE request_id = ? AND status = 'pending'").get(requestId);
  return (row && row.n) || 0;
}

function countAcceptedForRequest(requestId) {
  if (db.isPg) {
    return db.one("SELECT COUNT(*)::int AS n FROM automatch_invites WHERE request_id = $1 AND status = 'accepted'", [requestId])
      .then(r => (r && r.n) || 0);
  }
  const row = db.prepare("SELECT COUNT(*) AS n FROM automatch_invites WHERE request_id = ? AND status = 'accepted'").get(requestId);
  return (row && row.n) || 0;
}

function countPendingForOffer(offerId) {
  if (db.isPg) {
    return db.one("SELECT COUNT(*)::int AS n FROM automatch_offer_invites WHERE offer_id = $1 AND status = 'pending'", [offerId])
      .then(r => (r && r.n) || 0);
  }
  expireStale();
  const row = db.prepare("SELECT COUNT(*) AS n FROM automatch_offer_invites WHERE offer_id = ? AND status = 'pending'").get(offerId);
  return (row && row.n) || 0;
}

function countAcceptedForOffer(offerId) {
  if (db.isPg) {
    return db.one("SELECT COUNT(*)::int AS n FROM automatch_offer_invites WHERE offer_id = $1 AND status = 'accepted'", [offerId])
      .then(r => (r && r.n) || 0);
  }
  const row = db.prepare("SELECT COUNT(*) AS n FROM automatch_offer_invites WHERE offer_id = ? AND status = 'accepted'").get(offerId);
  return (row && row.n) || 0;
}

function getRecentExposureForProvider(providerId, sinceMinutes) {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
  if (db.isPg) {
    return db.one(`
      SELECT COUNT(*)::int AS n, MAX(created_at) AS last_at
      FROM automatch_invites
      WHERE provider_id = $1 AND created_at >= $2
    `, [providerId, since]);
  }
  const row = db.prepare(`
    SELECT COUNT(*) AS n, MAX(created_at) AS last_at
    FROM automatch_invites
    WHERE provider_id = ? AND datetime(created_at) >= datetime(?)
  `).get(providerId, since);
  return row || { n: 0, last_at: null };
}

function getRecentExposureForSeeker(seekerId, sinceMinutes) {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
  if (db.isPg) {
    return db.one(`
      SELECT COUNT(*)::int AS n, MAX(created_at) AS last_at
      FROM automatch_offer_invites
      WHERE seeker_id = $1 AND created_at >= $2
    `, [seekerId, since]);
  }
  const row = db.prepare(`
    SELECT COUNT(*) AS n, MAX(created_at) AS last_at
    FROM automatch_offer_invites
    WHERE seeker_id = ? AND datetime(created_at) >= datetime(?)
  `).get(seekerId, since);
  return row || { n: 0, last_at: null };
}

function parseSettingsRow(row) {
  if (!row) return null;
  try { row.categories = JSON.parse(row.categories_json || '[]'); } catch { row.categories = []; }
  try { row.seeker_categories = JSON.parse(row.seeker_categories_json || '[]'); } catch { row.seeker_categories = []; }
  const schedule = parseSchedule(row);
  row.weekday_start = schedule.weekday_start;
  row.weekday_end = schedule.weekday_end;
  row.weekend_start = schedule.weekend_start;
  row.weekend_end = schedule.weekend_end;
  row.tz_offset_min = schedule.tz_offset_min;
  row.automatch_mode = row.automatch_mode || 'simple';
  delete row.categories_json;
  delete row.seeker_categories_json;
  return row;
}

function getSettings(userId) {
  if (db.isPg) {
    return db.one('SELECT * FROM automatch_settings WHERE user_id = $1', [userId])
      .then(parseSettingsRow);
  }
  const row = db.prepare('SELECT * FROM automatch_settings WHERE user_id = ?').get(userId);
  return parseSettingsRow(row ? { ...row } : null);
}

function upsertSettings(userId, fields) {
  if (db.isPg) {
    return Promise.resolve(getSettings(userId)).then(existing => {
      const now = nowIso();
      const enabled = fields.enabled != null ? (fields.enabled ? 1 : 0) : (existing ? existing.enabled : 0);
      const seeker_enabled = fields.seeker_enabled != null ? (fields.seeker_enabled ? 1 : 0) : (existing ? (existing.seeker_enabled ? 1 : 0) : 0);
      const radius_km = fields.radius_km != null ? Number(fields.radius_km) : (existing ? Number(existing.radius_km) : 5);
      const max_invites_per_day = fields.max_invites_per_day != null ? Number(fields.max_invites_per_day)
        : (existing ? Number(existing.max_invites_per_day) : 20);
      const quiet_start = fields.quiet_start !== undefined ? fields.quiet_start : (existing ? existing.quiet_start : null);
      const quiet_end = fields.quiet_end !== undefined ? fields.quiet_end : (existing ? existing.quiet_end : null);
      const automatch_mode = fields.automatch_mode != null ? String(fields.automatch_mode) : (existing ? existing.automatch_mode : 'simple');
      const categories_json = JSON.stringify(Array.isArray(fields.categories) ? fields.categories : (existing ? existing.categories : []));
      const seeker_categories_json = JSON.stringify(Array.isArray(fields.seeker_categories) ? fields.seeker_categories : (existing ? existing.seeker_categories : []));
      return db.exec(`
        INSERT INTO automatch_settings
          (user_id, enabled, seeker_enabled, categories_json, seeker_categories_json, radius_km, max_invites_per_day, quiet_start, quiet_end, automatch_mode, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (user_id) DO UPDATE SET
          enabled = EXCLUDED.enabled, seeker_enabled = EXCLUDED.seeker_enabled,
          categories_json = EXCLUDED.categories_json, seeker_categories_json = EXCLUDED.seeker_categories_json,
          radius_km = EXCLUDED.radius_km, max_invites_per_day = EXCLUDED.max_invites_per_day,
          quiet_start = EXCLUDED.quiet_start, quiet_end = EXCLUDED.quiet_end,
          automatch_mode = EXCLUDED.automatch_mode,
          updated_at = EXCLUDED.updated_at
      `, [userId, enabled, seeker_enabled, categories_json, seeker_categories_json, radius_km, max_invites_per_day, quiet_start || null, quiet_end || null, automatch_mode, now, now])
        .then(() => getSettings(userId));
    });
  }
  const existing = getSettings(userId);
  const now = nowIso();

  const enabled = fields.enabled != null ? (fields.enabled ? 1 : 0) : (existing ? existing.enabled : 0);
  const seeker_enabled = fields.seeker_enabled != null ? (fields.seeker_enabled ? 1 : 0) : (existing ? (existing.seeker_enabled ? 1 : 0) : 0);
  const radius_km = fields.radius_km != null ? Number(fields.radius_km) : (existing ? Number(existing.radius_km) : 5);
  const max_invites_per_day = fields.max_invites_per_day != null ? Number(fields.max_invites_per_day)
    : (existing ? Number(existing.max_invites_per_day) : 20);
  const quiet_start = fields.quiet_start !== undefined ? fields.quiet_start : (existing ? existing.quiet_start : null);
  const quiet_end = fields.quiet_end !== undefined ? fields.quiet_end : (existing ? existing.quiet_end : null);
  const automatch_mode = fields.automatch_mode != null ? String(fields.automatch_mode) : (existing ? existing.automatch_mode : 'simple');
  const categories_json = JSON.stringify(Array.isArray(fields.categories) ? fields.categories : (existing ? existing.categories : []));
  const seeker_categories_json = JSON.stringify(Array.isArray(fields.seeker_categories) ? fields.seeker_categories : (existing ? existing.seeker_categories : []));

  if (!existing) {
    db.prepare(`
      INSERT INTO automatch_settings
        (user_id, enabled, seeker_enabled, categories_json, seeker_categories_json, radius_km, max_invites_per_day, quiet_start, quiet_end, automatch_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, enabled, seeker_enabled, categories_json, seeker_categories_json, radius_km, max_invites_per_day, quiet_start || null, quiet_end || null, automatch_mode, now, now);
  } else {
    db.prepare(`
      UPDATE automatch_settings
      SET enabled = ?, seeker_enabled = ?, categories_json = ?, seeker_categories_json = ?, radius_km = ?, max_invites_per_day = ?, quiet_start = ?, quiet_end = ?, automatch_mode = ?, updated_at = ?
      WHERE user_id = ?
    `).run(enabled, seeker_enabled, categories_json, seeker_categories_json, radius_km, max_invites_per_day, quiet_start || null, quiet_end || null, automatch_mode, now, userId);
  }

  return getSettings(userId);
}

function countPendingOfferInvitesForSeeker(seekerId) {
  if (db.isPg) {
    return db.one("SELECT COUNT(*)::int AS n FROM automatch_offer_invites WHERE seeker_id = $1 AND status = 'pending'", [seekerId])
      .then(r => (r && r.n) || 0);
  }
  expireStale();
  const row = db.prepare("SELECT COUNT(*) AS n FROM automatch_offer_invites WHERE seeker_id = ? AND status = 'pending'").get(seekerId);
  return (row && row.n) || 0;
}

function countInvitesTodayForSeeker(seekerId) {
  if (db.isPg) {
    return db.one(`
      SELECT COUNT(*)::int AS n
      FROM automatch_offer_invites
      WHERE seeker_id = $1
        AND created_at >= date_trunc('day', now())
    `, [seekerId]).then(r => (r && r.n) || 0);
  }
  const row = db.prepare(`
    SELECT COUNT(*) AS n
    FROM automatch_offer_invites
    WHERE seeker_id = ?
      AND datetime(created_at) >= datetime('now', 'start of day')
  `).get(seekerId);
  return (row && row.n) || 0;
}

function countOfferInvitesSince(seekerId, sinceIso) {
  if (db.isPg) {
    return db.one(`
      SELECT COUNT(*)::int AS n
      FROM automatch_offer_invites
      WHERE seeker_id = $1
        AND created_at >= $2
    `, [seekerId, sinceIso]).then(r => (r && r.n) || 0);
  }
  const row = db.prepare(`
    SELECT COUNT(*) AS n
    FROM automatch_offer_invites
    WHERE seeker_id = ?
      AND datetime(created_at) >= datetime(?)
  `).get(seekerId, sinceIso);
  return (row && row.n) || 0;
}

function listOfferInvitesForSeeker(seekerId, { status, limit = 20, offset = 0 } = {}) {
  if (db.isPg) {
    return Promise.resolve(expireStale()).then(() => {
      let sql = `
        SELECT ai.*, o.title AS offer_title, o.category AS offer_category, o.location_text AS offer_location,
               o.compensation_type AS offer_compensation, o.media_urls AS offer_media,
               u.display_name AS provider_name, u.rating_avg AS provider_rating, u.premium_tier AS provider_tier,
               u.is_verified AS provider_verified
        FROM automatch_offer_invites ai
        JOIN service_offers o ON o.id = ai.offer_id
        JOIN users u ON u.id = ai.provider_id
        WHERE ai.seeker_id = $1
      `;
      const params = [seekerId];
      if (status) { params.push(status); sql += ` AND ai.status = $${params.length}`; }
      params.push(limit, offset);
      sql += ` ORDER BY ai.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
      return db.many(sql, params).then(rows => rows.map(r => ({
        ...r,
        offer_media: r.offer_media || [],
      })));
    });
  }
  expireStale();
  let sql = `
    SELECT ai.*, o.title AS offer_title, o.category AS offer_category, o.location_text AS offer_location,
           o.compensation_type AS offer_compensation, o.media_urls AS offer_media,
           u.display_name AS provider_name, u.rating_avg AS provider_rating, u.premium_tier AS provider_tier,
           u.is_verified AS provider_verified
    FROM automatch_offer_invites ai
    JOIN service_offers o ON o.id = ai.offer_id
    JOIN users u ON u.id = ai.provider_id
    WHERE ai.seeker_id = ?
  `;
  const params = [seekerId];
  if (status) { sql += ' AND ai.status = ?'; params.push(status); }
  sql += ' ORDER BY ai.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = db.prepare(sql).all(...params);
  rows.forEach(r => {
    try { r.offer_media = JSON.parse(r.offer_media || '[]'); } catch { r.offer_media = []; }
  });
  return rows;
}

function insertOfferInvites({ offerId, providerId, seekerIds, expiresAt }) {
  const now = nowIso();
  if (db.isPg) {
    const out = [];
    const baseSql = `
      INSERT INTO automatch_offer_invites
        (id, offer_id, provider_id, seeker_id, status, expires_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)
      ON CONFLICT (offer_id, seeker_id) DO NOTHING
    `;
    return Promise.all((seekerIds || []).map(sid => {
      const id = randomUUID();
      return db.exec(baseSql, [id, offerId, providerId, sid, expiresAt, now, now])
        .then(() => { out.push(id); });
    })).then(() => out);
  }
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO automatch_offer_invites
      (id, offer_id, provider_id, seeker_id, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
  `);
  const out = [];
  for (const sid of seekerIds) {
    const id = randomUUID();
    stmt.run(id, offerId, providerId, sid, expiresAt, now, now);
    out.push(id);
  }
  return out;
}

function getOfferInvite(id) {
  if (db.isPg) return db.one('SELECT * FROM automatch_offer_invites WHERE id = $1', [id]);
  expireStale();
  return db.prepare('SELECT * FROM automatch_offer_invites WHERE id = ?').get(id);
}

function markOfferAccepted(inviteId) {
  const now = nowIso();
  if (db.isPg) return db.exec("UPDATE automatch_offer_invites SET status='accepted', accepted_at=$1, updated_at=$2 WHERE id=$3", [now, now, inviteId]);
  db.prepare("UPDATE automatch_offer_invites SET status='accepted', accepted_at=?, updated_at=? WHERE id=?").run(now, now, inviteId);
}

function markOfferDeclined(inviteId) {
  const now = nowIso();
  if (db.isPg) return db.exec("UPDATE automatch_offer_invites SET status='declined', declined_at=$1, updated_at=$2 WHERE id=$3", [now, now, inviteId]);
  db.prepare("UPDATE automatch_offer_invites SET status='declined', declined_at=?, updated_at=? WHERE id=?").run(now, now, inviteId);
}

function tryAcceptOfferInvite(inviteId) {
  const now = nowIso();
  if (db.isPg) {
    return db.tx(async tx => {
      const inv = await tx.one('SELECT * FROM automatch_offer_invites WHERE id = $1 FOR UPDATE', [inviteId]);
      if (!inv || inv.status !== 'pending') return null;
      const existing = await tx.one(
        "SELECT id FROM automatch_offer_invites WHERE offer_id = $1 AND status = 'accepted' LIMIT 1",
        [inv.offer_id]
      );
      if (existing && existing.id) return null;
      await tx.exec("UPDATE automatch_offer_invites SET status='accepted', accepted_at=$1, updated_at=$2 WHERE id=$3 AND status='pending'",
        [now, now, inviteId]);
      return { ...inv, status: 'accepted', accepted_at: now };
    });
  }

  return db.transaction(() => {
    const inv = db.prepare('SELECT * FROM automatch_offer_invites WHERE id = ?').get(inviteId);
    if (!inv || inv.status !== 'pending') return null;
    const existing = db.prepare("SELECT id FROM automatch_offer_invites WHERE offer_id = ? AND status = 'accepted' LIMIT 1").get(inv.offer_id);
    if (existing && existing.id) return null;
    const res = db.prepare("UPDATE automatch_offer_invites SET status='accepted', accepted_at=?, updated_at=? WHERE id=? AND status='pending'")
      .run(now, now, inviteId);
    if (!res || res.changes === 0) return null;
    return { ...inv, status: 'accepted', accepted_at: now };
  })();
}

function expireOtherPendingForOffer(offerId, exceptInviteId) {
  const now = nowIso();
  if (db.isPg) return db.exec("UPDATE automatch_offer_invites SET status='expired', updated_at=$1 WHERE offer_id=$2 AND status='pending' AND id!=$3", [now, offerId, exceptInviteId]);
  db.prepare("UPDATE automatch_offer_invites SET status='expired', updated_at=? WHERE offer_id=? AND status='pending' AND id!=?").run(now, offerId, exceptInviteId);
}

function findEligibleSeekersForCategory({ category, excludeUserId, limit = 6 }) {
  // NOTE: seeker category allowlist is checked in service layer using parsed JSON.
  if (db.isPg) {
    return db.many(`
      SELECT DISTINCT u.id, u.rating_avg
      FROM users u
      JOIN automatch_settings s ON s.user_id = u.id AND s.seeker_enabled = true
      WHERE u.id != $1
        AND u.premium_tier != 'free'
        AND (u.premium_until IS NULL OR u.premium_until > now())
      ORDER BY u.rating_avg DESC
      LIMIT $2
    `, [excludeUserId, limit]).then(rows => rows.map(r => r.id));
  }
  return db.prepare(`
    SELECT DISTINCT u.id
    FROM users u
    JOIN automatch_settings s ON s.user_id = u.id AND s.seeker_enabled = 1
    WHERE u.id != ?
      AND u.premium_tier != 'free'
      AND (u.premium_until IS NULL OR u.premium_until > datetime('now'))
    ORDER BY u.rating_avg DESC
    LIMIT ?
  `).all(excludeUserId, limit).map(r => r.id);
}

function countPendingForProvider(providerId) {
  if (db.isPg) {
    return db.one("SELECT COUNT(*)::int AS n FROM automatch_invites WHERE provider_id = $1 AND status = 'pending'", [providerId])
      .then(r => (r && r.n) || 0);
  }
  expireStale();
  const row = db.prepare("SELECT COUNT(*) AS n FROM automatch_invites WHERE provider_id = ? AND status = 'pending'").get(providerId);
  return (row && row.n) || 0;
}

function countInvitesToday(providerId) {
  if (db.isPg) {
    return db.one(`
      SELECT COUNT(*)::int AS n
      FROM automatch_invites
      WHERE provider_id = $1
        AND created_at >= date_trunc('day', now())
    `, [providerId]).then(r => (r && r.n) || 0);
  }
  const row = db.prepare(`
    SELECT COUNT(*) AS n
    FROM automatch_invites
    WHERE provider_id = ?
      AND datetime(created_at) >= datetime('now', 'start of day')
  `).get(providerId);
  return (row && row.n) || 0;
}

function countInvitesSince(providerId, sinceIso) {
  if (db.isPg) {
    return db.one(`
      SELECT COUNT(*)::int AS n
      FROM automatch_invites
      WHERE provider_id = $1
        AND created_at >= $2
    `, [providerId, sinceIso]).then(r => (r && r.n) || 0);
  }
  const row = db.prepare(`
    SELECT COUNT(*) AS n
    FROM automatch_invites
    WHERE provider_id = ?
      AND datetime(created_at) >= datetime(?)
  `).get(providerId, sinceIso);
  return (row && row.n) || 0;
}

function listInvitesForProvider(providerId, { status, limit = 20, offset = 0 } = {}) {
  if (db.isPg) {
    return Promise.resolve(expireStale()).then(() => {
      let sql = `
        SELECT ai.*, r.title AS request_title, r.category AS request_category, r.location_text AS request_location,
               r.compensation_type AS request_compensation, r.media_urls AS request_media,
               u.display_name AS seeker_name, u.rating_avg AS seeker_rating, u.premium_tier AS seeker_tier,
               u.is_verified AS seeker_verified
        FROM automatch_invites ai
        JOIN help_requests r ON r.id = ai.request_id
        JOIN users u ON u.id = ai.seeker_id
        WHERE ai.provider_id = $1
      `;
      const params = [providerId];
      if (status) { params.push(status); sql += ` AND ai.status = $${params.length}`; }
      params.push(limit, offset);
      sql += ` ORDER BY ai.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
      return db.many(sql, params).then(rows => rows.map(r => ({
        ...r,
        request_media: r.request_media || [],
      })));
    });
  }
  expireStale();
  let sql = `
    SELECT ai.*, r.title AS request_title, r.category AS request_category, r.location_text AS request_location,
           r.compensation_type AS request_compensation, r.media_urls AS request_media,
           u.display_name AS seeker_name, u.rating_avg AS seeker_rating, u.premium_tier AS seeker_tier,
           u.is_verified AS seeker_verified
    FROM automatch_invites ai
    JOIN help_requests r ON r.id = ai.request_id
    JOIN users u ON u.id = ai.seeker_id
    WHERE ai.provider_id = ?
  `;
  const params = [providerId];
  if (status) { sql += ' AND ai.status = ?'; params.push(status); }
  sql += ' ORDER BY ai.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params);
  rows.forEach(r => {
    try { r.request_media = JSON.parse(r.request_media || '[]'); } catch { r.request_media = []; }
  });
  return rows;
}

function insertInvites({ requestId, seekerId, providerIds, expiresAt }) {
  const now = nowIso();
  if (db.isPg) {
    const out = [];
    const baseSql = `
      INSERT INTO automatch_invites
        (id, request_id, seeker_id, provider_id, status, expires_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)
      ON CONFLICT (request_id, provider_id) DO NOTHING
    `;
    return Promise.all((providerIds || []).map(pid => {
      const id = randomUUID();
      return db.exec(baseSql, [id, requestId, seekerId, pid, expiresAt, now, now])
        .then(() => { out.push(id); });
    })).then(() => out);
  }
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO automatch_invites
      (id, request_id, seeker_id, provider_id, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
  `);
  const out = [];
  for (const pid of providerIds) {
    const id = randomUUID();
    stmt.run(id, requestId, seekerId, pid, expiresAt, now, now);
    out.push(id);
  }
  return out;
}

function getInvite(id) {
  if (db.isPg) return db.one('SELECT * FROM automatch_invites WHERE id = $1', [id]);
  expireStale();
  return db.prepare('SELECT * FROM automatch_invites WHERE id = ?').get(id);
}

function markAccepted(inviteId) {
  const now = nowIso();
  if (db.isPg) return db.exec("UPDATE automatch_invites SET status='accepted', accepted_at=$1, updated_at=$2 WHERE id=$3", [now, now, inviteId]);
  db.prepare("UPDATE automatch_invites SET status='accepted', accepted_at=?, updated_at=? WHERE id=?").run(now, now, inviteId);
}

function markDeclined(inviteId) {
  const now = nowIso();
  if (db.isPg) return db.exec("UPDATE automatch_invites SET status='declined', declined_at=$1, updated_at=$2 WHERE id=$3", [now, now, inviteId]);
  db.prepare("UPDATE automatch_invites SET status='declined', declined_at=?, updated_at=? WHERE id=?").run(now, now, inviteId);
}

function tryAcceptInvite(inviteId) {
  const now = nowIso();
  if (db.isPg) {
    return db.tx(async tx => {
      const inv = await tx.one('SELECT * FROM automatch_invites WHERE id = $1 FOR UPDATE', [inviteId]);
      if (!inv || inv.status !== 'pending') return null;
      const existing = await tx.one(
        "SELECT id FROM automatch_invites WHERE request_id = $1 AND status = 'accepted' LIMIT 1",
        [inv.request_id]
      );
      if (existing && existing.id) return null;
      await tx.exec("UPDATE automatch_invites SET status='accepted', accepted_at=$1, updated_at=$2 WHERE id=$3 AND status='pending'",
        [now, now, inviteId]);
      return { ...inv, status: 'accepted', accepted_at: now };
    });
  }

  return db.transaction(() => {
    const inv = db.prepare('SELECT * FROM automatch_invites WHERE id = ?').get(inviteId);
    if (!inv || inv.status !== 'pending') return null;
    const existing = db.prepare("SELECT id FROM automatch_invites WHERE request_id = ? AND status = 'accepted' LIMIT 1").get(inv.request_id);
    if (existing && existing.id) return null;
    const res = db.prepare("UPDATE automatch_invites SET status='accepted', accepted_at=?, updated_at=? WHERE id=? AND status='pending'")
      .run(now, now, inviteId);
    if (!res || res.changes === 0) return null;
    return { ...inv, status: 'accepted', accepted_at: now };
  })();
}

function expireOtherPendingForRequest(requestId, exceptInviteId) {
  const now = nowIso();
  if (db.isPg) return db.exec("UPDATE automatch_invites SET status='expired', updated_at=$1 WHERE request_id=$2 AND status='pending' AND id!=$3", [now, requestId, exceptInviteId]);
  db.prepare("UPDATE automatch_invites SET status='expired', updated_at=? WHERE request_id=? AND status='pending' AND id!=?").run(now, requestId, exceptInviteId);
}

function findEligibleProvidersForCategory({ category, excludeUserId, limit = 6 }) {
  // Premium + enabled settings + active offers in category.
  // Radius is not enforced in MVP unless lat/lng are populated.
  if (db.isPg) {
    return db.many(`
      SELECT DISTINCT u.id, u.rating_avg
      FROM users u
      JOIN automatch_settings s ON s.user_id = u.id AND s.enabled = true
      JOIN service_offers o ON o.provider_id = u.id
      WHERE o.status = 'active'
        AND o.expires_at > now()
        AND o.category = $1
        AND u.id != $2
        AND u.premium_tier != 'free'
        AND (u.premium_until IS NULL OR u.premium_until > now())
      ORDER BY u.rating_avg DESC
      LIMIT $3
    `, [category, excludeUserId, limit]).then(rows => rows.map(r => r.id));
  }
  return db.prepare(`
    SELECT DISTINCT u.id
    FROM users u
    JOIN automatch_settings s ON s.user_id = u.id AND s.enabled = 1
    JOIN service_offers o ON o.provider_id = u.id
    WHERE o.status = 'active'
      AND o.expires_at > datetime('now')
      AND o.category = ?
      AND u.id != ?
      AND u.premium_tier != 'free'
      AND (u.premium_until IS NULL OR u.premium_until > datetime('now'))
    ORDER BY u.rating_avg DESC
    LIMIT ?
  `).all(category, excludeUserId, limit).map(r => r.id);
}

function findActiveOffersForCategory({ category, excludeUserId, limit = 6 }) {
  if (db.isPg) {
    return db.many(`
      SELECT o.id AS offer_id, o.provider_id AS provider_id
      FROM service_offers o
      WHERE o.status = 'active'
        AND o.expires_at > now()
        AND o.category = $1
        AND o.provider_id != $2
      ORDER BY o.created_at DESC
      LIMIT $3
    `, [category, excludeUserId, limit]);
  }
  const rows = db.prepare(`
    SELECT o.id AS offer_id, o.provider_id AS provider_id
    FROM service_offers o
    WHERE o.status = 'active'
      AND o.expires_at > datetime('now')
      AND o.category = ?
      AND o.provider_id != ?
    ORDER BY datetime(o.created_at) DESC
    LIMIT ?
  `).all(category, excludeUserId, limit);
  return rows;
}

function insertOfferInvitesToSeeker({ seekerId, offers, expiresAt }) {
  const now = nowIso();
  if (db.isPg) {
    const out = [];
    const baseSql = `
      INSERT INTO automatch_offer_invites
        (id, offer_id, provider_id, seeker_id, status, expires_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)
      ON CONFLICT (offer_id, seeker_id) DO NOTHING
    `;
    return Promise.all((offers || []).map(o => {
      const id = randomUUID();
      return db.exec(baseSql, [id, o.offer_id, o.provider_id, seekerId, expiresAt, now, now])
        .then(() => { out.push(id); });
    })).then(() => out);
  }
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO automatch_offer_invites
      (id, offer_id, provider_id, seeker_id, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
  `);
  const out = [];
  for (const o of (offers || [])) {
    const id = randomUUID();
    stmt.run(id, o.offer_id, o.provider_id, seekerId, expiresAt, now, now);
    out.push(id);
  }
  return out;
}

module.exports = {
  getSettings,
  upsertSettings,
  getUserBasics,
  getRequestStatus,
  getOfferStatus,
  countPendingForRequest,
  countAcceptedForRequest,
  countPendingForOffer,
  countAcceptedForOffer,
  getRecentExposureForProvider,
  getRecentExposureForSeeker,
  countPendingForProvider,
  countInvitesToday,
  countInvitesSince,
  listInvitesForProvider,
  insertInvites,
  getInvite,
  markAccepted,
  markDeclined,
  tryAcceptInvite,
  expireOtherPendingForRequest,
  findEligibleProvidersForCategory,
  findActiveOffersForCategory,
  insertOfferInvitesToSeeker,
  countPendingOfferInvitesForSeeker,
  countInvitesTodayForSeeker,
  countOfferInvitesSince,
  listOfferInvitesForSeeker,
  insertOfferInvites,
  getOfferInvite,
  markOfferAccepted,
  markOfferDeclined,
  tryAcceptOfferInvite,
  expireOtherPendingForOffer,
  findEligibleSeekersForCategory,
  expireStale,
};
