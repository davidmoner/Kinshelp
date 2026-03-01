'use strict';
/**
 * matches.repo.js — raw DB access only. No business logic.
 */
const db = require('../../config/db');
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
    if (db.isPg) return db.one(`${WITH_USERS} WHERE m.id = $1`, [id]);
    return db.prepare(`${WITH_USERS} WHERE m.id = ?`).get(id);
}

function listForUser(userId, { status, limit = 20, offset = 0 }) {
    if (db.isPg) {
        const params = [userId];
        let sql = `${WITH_USERS} WHERE (m.provider_id = $1 OR m.seeker_id = $1)`;
        let i = 2;
        if (status) { sql += ` AND m.status = $${i++}`; params.push(status); }
        sql += ` ORDER BY m.created_at DESC LIMIT $${i++} OFFSET $${i++}`;
        params.push(limit, offset);
        return db.many(sql, params);
    }

    let sql = `${WITH_USERS} WHERE (m.provider_id = ? OR m.seeker_id = ?)`;
    const params = [userId, userId];
    if (status) { sql += ' AND m.status = ?'; params.push(status); }
    sql += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return db.prepare(sql).all(...params);
}

function insert({ offer_id, request_id, provider_id, seeker_id, points_agreed, initiated_by, compensation_type }, tx = null) {
    const id = randomUUID();
    const now = new Date().toISOString();
    if (db.isPg) {
        const runner = tx || db;
        return (async () => {
            await runner.exec(
                 `INSERT INTO matches
                   (id, offer_id, request_id, provider_id, seeker_id, points_agreed, initiated_by, created_at, updated_at, compensation_type)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                 [id, offer_id || null, request_id || null, provider_id, seeker_id, points_agreed, initiated_by, now, now, compensation_type || 'cash']
             );
             return id;
         })();
    }
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
    if (db.isPg) {
        return db.exec(
            `UPDATE matches SET status = $1, ${col} = $2, seeker_cancelled = $3, updated_at = $4 WHERE id = $5`,
            [newStatus, now, !!seekerCancelled, now, id]
        );
    }
    db.prepare(`UPDATE matches SET status = ?, ${col} = ?, seeker_cancelled = ?, updated_at = ? WHERE id = ?`)
        .run(newStatus, now, seekerCancelled, now, id);
}

function setRating(id, role, rating, review) {
    const rCol = role === 'provider' ? 'provider_rating' : 'seeker_rating';
    const vCol = role === 'provider' ? 'provider_review' : 'seeker_review';
    const now = new Date().toISOString();
    if (db.isPg) {
        return db.exec(
            `UPDATE matches SET ${rCol} = $1, ${vCol} = $2, updated_at = $3 WHERE id = $4`,
            [rating, review || null, now, id]
        );
    }
    db.prepare(`UPDATE matches SET ${rCol} = ?, ${vCol} = ?, updated_at = ? WHERE id = ?`).run(rating, review || null, now, id);
}

function countDone(userId) {
    if (db.isPg) {
        return (async () => {
            const totalRow = await db.one(
                "SELECT COUNT(*)::int AS n FROM matches WHERE (provider_id = $1 OR seeker_id = $1) AND status = 'done'",
                [userId]
            );
            const asProviderRow = await db.one(
                "SELECT COUNT(*)::int AS n FROM matches WHERE provider_id = $1 AND status = 'done'",
                [userId]
            );
            return { total: (totalRow && totalRow.n) || 0, asProvider: (asProviderRow && asProviderRow.n) || 0 };
        })();
    }

    const total = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE (provider_id = ? OR seeker_id = ?) AND status = 'done'")
        .get(userId, userId).n;
    const asProvider = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE provider_id = ? AND status = 'done'").get(userId).n;
    return { total, asProvider };
}

function countDoneInCategory(userId, category) {
    if (!category) return 0;
    if (db.isPg) {
        return (async () => {
            const row = await db.one(
                `SELECT COUNT(*)::int AS n
                 FROM matches m
                 LEFT JOIN help_requests r ON r.id = m.request_id
                 LEFT JOIN service_offers o ON o.id = m.offer_id
                 WHERE (m.provider_id = $1 OR m.seeker_id = $1)
                   AND m.status = 'done'
                   AND COALESCE(r.category, o.category) = $2`,
                [userId, category]
            );
            return (row && row.n) || 0;
        })();
    }

    const row = db.prepare(
        `SELECT COUNT(*) AS n
         FROM matches m
         LEFT JOIN help_requests r ON r.id = m.request_id
         LEFT JOIN service_offers o ON o.id = m.offer_id
         WHERE (m.provider_id = ? OR m.seeker_id = ?)
           AND m.status = 'done'
           AND COALESCE(r.category, o.category) = ?`
    ).get(userId, userId, category);
    return (row && row.n) || 0;
}

function calcUserRatingAvg(userId) {
    if (db.isPg) {
        return db.one(
            `SELECT AVG(r) AS avg, COUNT(r)::int AS cnt FROM (
               SELECT provider_rating AS r FROM matches WHERE seeker_id = $1 AND provider_rating IS NOT NULL
               UNION ALL
               SELECT seeker_rating AS r FROM matches WHERE provider_id = $1 AND seeker_rating IS NOT NULL
             ) t`,
            [userId]
        );
    }

    return db.prepare(
        `SELECT AVG(r) AS avg, COUNT(r) AS cnt FROM (
           SELECT provider_rating AS r FROM matches WHERE seeker_id   = ? AND provider_rating IS NOT NULL
           UNION ALL
           SELECT seeker_rating   AS r FROM matches WHERE provider_id = ? AND seeker_rating   IS NOT NULL
         )`
    ).get(userId, userId);
}

module.exports = { findById, listForUser, insert, setStatus, setRating, countDone, countDoneInCategory, calcUserRatingAvg };


// ── Messages ────────────────────────────────────────────────────────────────
function listMessages(matchId, { limit = 50, offset = 0 } = {}) {
    const sql = `
      SELECT mm.*, u.display_name AS user_name
      FROM match_messages mm
      JOIN users u ON u.id = mm.user_id
      WHERE mm.match_id = ${db.isPg ? '$1' : '?'}
      ORDER BY mm.created_at ASC
      LIMIT ${db.isPg ? '$2' : '?'} OFFSET ${db.isPg ? '$3' : '?'}
    `;
    const rows = db.isPg ? null : db.prepare(sql).all(matchId, limit, offset);
    if (db.isPg) {
        // pg
        return db.many(sql, [matchId, limit, offset]).then(rr => rr.map(r => ({ ...r })));
    }

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
    if (db.isPg) {
        return (async () => {
            await db.exec(
                'INSERT INTO match_messages (id, match_id, user_id, message, created_at) VALUES ($1,$2,$3,$4,$5)',
                [id, matchId, userId, message, now]
            );
            return id;
        })();
    }
    db.prepare('INSERT INTO match_messages (id, match_id, user_id, message, created_at) VALUES (?,?,?,?,?)').run(id, matchId, userId, message, now);
    return id;
}

function setAgreement(matchId, { compensation_type, points_agreed, barter_terms }) {
    const now = new Date().toISOString();
    const sets = ['agreement_at = ?'];
    const vals = [now];
    if (compensation_type !== undefined) { sets.push('compensation_type = ?'); vals.push(compensation_type); }
    if (points_agreed !== undefined) { sets.push('points_agreed = ?'); vals.push(points_agreed); }
    if (barter_terms !== undefined) { sets.push('barter_terms = ?'); vals.push(barter_terms); }
    if (db.isPg) {
        // Translate ? placeholders to $n
        const allVals = [...vals, now, matchId];
        const setSql = sets.map((s, idx) => s.replace(' = ?', ` = $${idx + 1}`)).join(', ');
        const q = `UPDATE matches SET ${setSql}, updated_at = $${allVals.length - 1} WHERE id = $${allVals.length}`;
        return db.exec(q, allVals);
    }

    db.prepare(`UPDATE matches SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals, now, matchId);
}

function countNonSystemMessages(matchId, userId) {
    if (db.isPg) {
        return db.one(
            "SELECT COUNT(*)::int AS n FROM match_messages WHERE match_id = $1 AND user_id = $2 AND message NOT LIKE '[SYSTEM] %'",
            [matchId, userId]
        ).then(r => (r && r.n) || 0);
    }

    const row = db.prepare(
        "SELECT COUNT(*) AS n FROM match_messages WHERE match_id = ? AND user_id = ? AND message NOT LIKE '[SYSTEM] %'"
    ).get(matchId, userId);
    return (row && row.n) || 0;
}

function countDoneBetweenUsersWithinDays(userA, userB, days) {
    if (db.isPg) {
        return db.one(
            `SELECT COUNT(*)::int AS n
             FROM matches
             WHERE status = 'done'
               AND ((provider_id = $1 AND seeker_id = $2) OR (provider_id = $2 AND seeker_id = $1))
               AND completed_at >= (now() - ($3::int * interval '1 day'))`,
            [userA, userB, Number(days || 0)]
        ).then(r => (r && r.n) || 0);
    }

    const window = `-${Number(days || 0)} days`;
    const row = db.prepare(
        `SELECT COUNT(*) AS n
         FROM matches
         WHERE status = 'done'
           AND ((provider_id = ? AND seeker_id = ?) OR (provider_id = ? AND seeker_id = ?))
           AND datetime(completed_at) >= datetime('now', ?)`
    ).get(userA, userB, userB, userA, window);
    return (row && row.n) || 0;
}

function countDistinctDonePartners(userId) {
    if (db.isPg) {
        return db.one(
            `SELECT COUNT(DISTINCT other_id)::int AS n FROM (
               SELECT CASE WHEN provider_id = $1 THEN seeker_id ELSE provider_id END AS other_id
               FROM matches
               WHERE (provider_id = $1 OR seeker_id = $1)
                 AND status = 'done'
             ) t`,
            [userId]
        ).then(r => (r && r.n) || 0);
    }

    const row = db.prepare(
        `SELECT COUNT(DISTINCT other_id) AS n FROM (
           SELECT CASE WHEN provider_id = ? THEN seeker_id ELSE provider_id END AS other_id
           FROM matches
           WHERE (provider_id = ? OR seeker_id = ?)
             AND status = 'done'
         )`
    ).get(userId, userId, userId);
    return (row && row.n) || 0;
}

module.exports.listMessages = listMessages;
module.exports.insertMessage = insertMessage;
module.exports.setAgreement = setAgreement;
module.exports.countNonSystemMessages = countNonSystemMessages;
module.exports.countDoneBetweenUsersWithinDays = countDoneBetweenUsersWithinDays;
module.exports.countDistinctDonePartners = countDistinctDonePartners;
