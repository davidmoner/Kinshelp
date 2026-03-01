'use strict';
const db = require('../../config/database');
const { randomUUID } = require('crypto');

function findAll() {
    return db.prepare('SELECT * FROM badges ORDER BY name').all();
}

function findForUser(userId) {
    return db.prepare(`
    SELECT b.*, ub.awarded_at FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id = ? ORDER BY ub.awarded_at DESC
  `).all(userId);
}

function getBySlug(slug) {
    return db.prepare('SELECT * FROM badges WHERE slug = ?').get(slug);
}

function hasAwarded(userId, badgeId) {
    return !!db.prepare('SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?').get(userId, badgeId);
}

function award(userId, badgeId) {
    db.prepare('INSERT INTO user_badges (id, user_id, badge_id, awarded_at) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), userId, badgeId, new Date().toISOString());
}

function getUserStats(userId) {
    return db.prepare('SELECT points_balance FROM users WHERE id = ?').get(userId);
}

function hasBadgeSlug(userId, slug) {
    return !!db.prepare(`
    SELECT ub.id
    FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id = ? AND b.slug = ?
  `).get(userId, slug);
}

function hasAllBadgeSlugs(userId, slugs) {
    const want = Array.isArray(slugs) ? slugs.filter(Boolean) : [];
    if (!want.length) return true;
    const placeholders = want.map(() => '?').join(',');
    const row = db.prepare(`
    SELECT COUNT(DISTINCT b.slug) AS n
    FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id = ? AND b.slug IN (${placeholders})
  `).get(userId, ...want);
    return ((row && row.n) || 0) === want.length;
}

function addBoostTokens(userId, n) {
    const delta = Math.max(0, Number(n || 0));
    if (!delta) return;
    db.prepare('UPDATE users SET boost_48h_tokens = COALESCE(boost_48h_tokens, 0) + ? WHERE id = ?').run(delta, userId);
}

function setEmblemIfBetter(userId, emblemSlug, weight) {
    if (!emblemSlug) return;
    // Store current emblem weight in-memory mapping (no DB column needed).
    const row = db.prepare('SELECT emblem_slug FROM users WHERE id = ?').get(userId);
    const current = row && row.emblem_slug;
    const curW = EMBLEM_WEIGHT[current] || 0;
    const nextW = Number(weight || 0);
    if (nextW <= curW) return;
    db.prepare('UPDATE users SET emblem_slug = ? WHERE id = ?').run(String(emblemSlug), userId);
}

const EMBLEM_WEIGHT = {
    null: 0,
    undefined: 0,
    'kh_emblem_barrio': 1,
    'kh_emblem_corona': 2,
    'kh_emblem_leyenda': 3,
};

module.exports = { findAll, findForUser, getBySlug, hasAwarded, award, getUserStats, hasBadgeSlug, hasAllBadgeSlugs, addBoostTokens, setEmblemIfBetter };
