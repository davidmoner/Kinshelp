'use strict';
const db = require('../../config/db');
const { randomUUID } = require('crypto');

async function findAll() {
    if (db.isPg) return db.many('SELECT * FROM badges ORDER BY name');
    return db.prepare('SELECT * FROM badges ORDER BY name').all();
}

async function findForUser(userId) {
    const sql = `
      SELECT b.*, ub.awarded_at
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ${db.isPg ? '$1' : '?'}
      ORDER BY ub.awarded_at DESC
    `;
    if (db.isPg) return db.many(sql, [userId]);
    return db.prepare(sql).all(userId);
}

async function getBySlug(slug) {
    if (db.isPg) return db.one('SELECT * FROM badges WHERE slug = $1', [slug]);
    return db.prepare('SELECT * FROM badges WHERE slug = ?').get(slug);
}

async function hasAwarded(userId, badgeId) {
    if (db.isPg) return !!(await db.one('SELECT id FROM user_badges WHERE user_id = $1 AND badge_id = $2', [userId, badgeId]));
    return !!db.prepare('SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?').get(userId, badgeId);
}

async function award(userId, badgeId) {
    const id = randomUUID();
    const at = new Date().toISOString();
    if (db.isPg) {
        await db.exec(
            'INSERT INTO user_badges (id, user_id, badge_id, awarded_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, badge_id) DO NOTHING',
            [id, userId, badgeId, at]
        );
        return;
    }
    db.prepare('INSERT INTO user_badges (id, user_id, badge_id, awarded_at) VALUES (?, ?, ?, ?)')
        .run(id, userId, badgeId, at);
}

async function getUserStats(userId) {
    if (db.isPg) return db.one('SELECT points_balance FROM users WHERE id = $1', [userId]);
    return db.prepare('SELECT points_balance FROM users WHERE id = ?').get(userId);
}

async function hasBadgeSlug(userId, slug) {
    const sql = `
      SELECT ub.id
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ${db.isPg ? '$1' : '?'} AND b.slug = ${db.isPg ? '$2' : '?'}
    `;
    if (db.isPg) return !!(await db.one(sql, [userId, slug]));
    return !!db.prepare(sql).get(userId, slug);
}

async function hasAllBadgeSlugs(userId, slugs) {
    const want = Array.isArray(slugs) ? slugs.filter(Boolean) : [];
    if (!want.length) return true;
    if (db.isPg) {
        const row = await db.one(
            `SELECT COUNT(DISTINCT b.slug) AS n
             FROM user_badges ub
             JOIN badges b ON b.id = ub.badge_id
             WHERE ub.user_id = $1 AND b.slug = ANY($2::text[])`,
            [userId, want]
        );
        return Number((row && row.n) || 0) === want.length;
    }

    const placeholders = want.map(() => '?').join(',');
    const row = db.prepare(`
      SELECT COUNT(DISTINCT b.slug) AS n
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ? AND b.slug IN (${placeholders})
    `).get(userId, ...want);
    return ((row && row.n) || 0) === want.length;
}

async function countBadgeSlugs(userId, slugs) {
    const want = Array.isArray(slugs) ? slugs.filter(Boolean) : [];
    if (!want.length) return 0;
    if (db.isPg) {
        const row = await db.one(
            `SELECT COUNT(DISTINCT b.slug) AS n
             FROM user_badges ub
             JOIN badges b ON b.id = ub.badge_id
             WHERE ub.user_id = $1 AND b.slug = ANY($2::text[])`,
            [userId, want]
        );
        return Number((row && row.n) || 0);
    }

    const placeholders = want.map(() => '?').join(',');
    const row = db.prepare(`
      SELECT COUNT(DISTINCT b.slug) AS n
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ? AND b.slug IN (${placeholders})
    `).get(userId, ...want);
    return (row && row.n) || 0;
}

async function addBoostTokens(userId, n) {
    const delta = Math.max(0, Number(n || 0));
    if (!delta) return;
    if (db.isPg) {
        await db.exec('UPDATE users SET boost_48h_tokens = COALESCE(boost_48h_tokens, 0) + $1 WHERE id = $2', [delta, userId]);
        return;
    }
    db.prepare('UPDATE users SET boost_48h_tokens = COALESCE(boost_48h_tokens, 0) + ? WHERE id = ?').run(delta, userId);
}

async function setEmblemIfBetter(userId, emblemSlug, weight) {
    if (!emblemSlug) return;
    // Store current emblem weight in-memory mapping (no DB column needed).
    const row = db.isPg
        ? await db.one('SELECT emblem_slug FROM users WHERE id = $1', [userId])
        : db.prepare('SELECT emblem_slug FROM users WHERE id = ?').get(userId);
    const current = row && row.emblem_slug;
    const curW = EMBLEM_WEIGHT[current] || 0;
    const nextW = Number(weight || 0);
    if (nextW <= curW) return;
    if (db.isPg) {
        await db.exec('UPDATE users SET emblem_slug = $1 WHERE id = $2', [String(emblemSlug), userId]);
        return;
    }
    db.prepare('UPDATE users SET emblem_slug = ? WHERE id = ?').run(String(emblemSlug), userId);
}

const EMBLEM_WEIGHT = {
    null: 0,
    undefined: 0,
    'kh_emblem_barrio': 1,
    'kh_emblem_corona': 2,
    'kh_emblem_leyenda': 3,
};

module.exports = {
    findAll,
    findForUser,
    getBySlug,
    hasAwarded,
    award,
    getUserStats,
    hasBadgeSlug,
    hasAllBadgeSlugs,
    countBadgeSlugs,
    addBoostTokens,
    setEmblemIfBetter,
};
