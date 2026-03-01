'use strict';
/**
 * matches.repo.js — raw DB access only. No business logic.
 */
const db = require('../../config/database');
const { randomUUID } = require('crypto');

const WITH_USERS = `
  SELECT m.*,
         p.display_name AS provider_name, p.avatar_url AS provider_avatar,
         s.display_name AS seeker_name,   s.avatar_url AS seeker_avatar,
         r.title        AS request_title, r.category   AS request_category,
         o.title        AS offer_title,   o.category   AS offer_category
  FROM matches m
  JOIN users p ON p.id = m.provider_id
  JOIN users s ON s.id = m.seeker_id
  LEFT JOIN help_requests   r ON r.id = m.request_id
  LEFT JOIN service_offers  o ON o.id = m.offer_id
`;

function findById(id) {
    return db.prepare(`${WITH_USERS} WHERE m.id = ?`).get(id);
}

function listForUser(userId, { status, limit = 20, offset = 0 }) {
    let sql = `${WITH_USERS} WHERE (m.provider_id = ? OR m.seeker_id = ?)`;
    const params = [userId, userId];
    if (status) { sql += ' AND m.status = ?'; params.push(status); }
    sql += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return db.prepare(sql).all(...params);
}

function insert({ offer_id, request_id, provider_id, seeker_id, points_agreed, initiated_by, compensation_type }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
        db.prepare(`
      INSERT INTO matches
        (id, offer_id, request_id, provider_id, seeker_id, points_agreed, initiated_by, created_at, updated_at, compensation_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, offer_id || null, request_id || null, provider_id, seeker_id, points_agreed, initiated_by, now, now, compensation_type || 'cash');
    } catch {
        // Backward compatibility if DB wasn't migrated yet
        db.prepare(`
      INSERT INTO matches
        (id, offer_id, request_id, provider_id, seeker_id, points_agreed, initiated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, offer_id || null, request_id || null, provider_id, seeker_id, points_agreed, initiated_by, now, now);
    }
    return id;
}

// STATUS_TIMESTAMP maps each terminal status to its dedicated timestamp column
const STATUS_TS = { accepted: 'accepted_at', done: 'completed_at', rejected: 'rejected_at', expired: 'expired_at' };

function setStatus(id, newStatus, { seekerCancelled = 0 } = {}) {
    const col = STATUS_TS[newStatus];
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE matches SET status = ?, ${col} = ?, seeker_cancelled = ?, updated_at = ? WHERE id = ?
  `).run(newStatus, now, seekerCancelled, now, id);
}

function setRating(id, role, rating, review) {
    const rCol = role === 'provider' ? 'provider_rating' : 'seeker_rating';
    const vCol = role === 'provider' ? 'provider_review' : 'seeker_review';
    const now = new Date().toISOString();
    db.prepare(`UPDATE matches SET ${rCol} = ?, ${vCol} = ?, updated_at = ? WHERE id = ?`)
        .run(rating, review || null, now, id);
}

function countDone(userId) {
    const total = db.prepare(`
    SELECT COUNT(*) AS n FROM matches WHERE (provider_id = ? OR seeker_id = ?) AND status = 'done'
  `).get(userId, userId).n;

    const asProvider = db.prepare(`
    SELECT COUNT(*) AS n FROM matches WHERE provider_id = ? AND status = 'done'
  `).get(userId).n;

    return { total, asProvider };
}

function countDoneInCategory(userId, category) {
    if (!category) return 0;
    const row = db.prepare(`
    SELECT COUNT(*) AS n
    FROM matches m
    LEFT JOIN help_requests r ON r.id = m.request_id
    LEFT JOIN service_offers o ON o.id = m.offer_id
    WHERE (m.provider_id = ? OR m.seeker_id = ?)
      AND m.status = 'done'
      AND COALESCE(r.category, o.category) = ?
  `).get(userId, userId, category);
    return (row && row.n) || 0;
}

function calcUserRatingAvg(userId) {
    return db.prepare(`
    SELECT AVG(r) AS avg, COUNT(r) AS cnt FROM (
      SELECT provider_rating AS r FROM matches WHERE seeker_id   = ? AND provider_rating IS NOT NULL
      UNION ALL
      SELECT seeker_rating   AS r FROM matches WHERE provider_id = ? AND seeker_rating   IS NOT NULL
    )
  `).get(userId, userId);
}

module.exports = { findById, listForUser, insert, setStatus, setRating, countDone, countDoneInCategory, calcUserRatingAvg };


// ── Messages ────────────────────────────────────────────────────────────────
function listMessages(matchId, { limit = 50, offset = 0 } = {}) {
    const rows = db.prepare(`
    SELECT mm.*, u.display_name AS user_name
    FROM match_messages mm
    JOIN users u ON u.id = mm.user_id
    WHERE mm.match_id = ?
    ORDER BY mm.created_at ASC
    LIMIT ? OFFSET ?
  `).all(matchId, limit, offset);

    // UI-level system messages (stored as regular messages with a prefix)
    return rows.map(r => {
        const msg = String(r.message || '');
        if (msg.startsWith('[SYSTEM] ')) {
            return {
                ...r,
                kind: 'system',
                user_name: null,
                message: msg.replace(/^\[SYSTEM\]\s*/, ''),
            };
        }
        return { ...r, kind: 'user' };
    });
}

function insertMessage(matchId, userId, message) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO match_messages (id, match_id, user_id, message, created_at) VALUES (?,?,?,?,?)')
        .run(id, matchId, userId, message, now);
    return id;
}

function setAgreement(matchId, { compensation_type, points_agreed, barter_terms }) {
    const now = new Date().toISOString();
    const sets = ['agreement_at = ?'];
    const vals = [now];
    if (compensation_type !== undefined) { sets.push('compensation_type = ?'); vals.push(compensation_type); }
    if (points_agreed !== undefined) { sets.push('points_agreed = ?'); vals.push(points_agreed); }
    if (barter_terms !== undefined) { sets.push('barter_terms = ?'); vals.push(barter_terms); }
    db.prepare(`UPDATE matches SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...vals, now, matchId);
}

function countNonSystemMessages(matchId, userId) {
    const row = db.prepare(`
    SELECT COUNT(*) AS n
    FROM match_messages
    WHERE match_id = ?
      AND user_id = ?
      AND message NOT LIKE '[SYSTEM] %'
  `).get(matchId, userId);
    return (row && row.n) || 0;
}

function countDoneBetweenUsersWithinDays(userA, userB, days) {
    const window = `-${Number(days || 0)} days`;
    const row = db.prepare(`
    SELECT COUNT(*) AS n
    FROM matches
    WHERE status = 'done'
      AND ((provider_id = ? AND seeker_id = ?) OR (provider_id = ? AND seeker_id = ?))
      AND datetime(completed_at) >= datetime('now', ?)
  `).get(userA, userB, userB, userA, window);
    return (row && row.n) || 0;
}

function countDistinctDonePartners(userId) {
    const row = db.prepare(`
    SELECT COUNT(DISTINCT other_id) AS n FROM (
      SELECT CASE WHEN provider_id = ? THEN seeker_id ELSE provider_id END AS other_id
      FROM matches
      WHERE (provider_id = ? OR seeker_id = ?)
        AND status = 'done'
    )
  `).get(userId, userId, userId);
    return (row && row.n) || 0;
}

module.exports.listMessages = listMessages;
module.exports.insertMessage = insertMessage;
module.exports.setAgreement = setAgreement;
module.exports.countNonSystemMessages = countNonSystemMessages;
module.exports.countDoneBetweenUsersWithinDays = countDoneBetweenUsersWithinDays;
module.exports.countDistinctDonePartners = countDistinctDonePartners;
