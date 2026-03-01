'use strict';
/**
 * Notification cooldown service.
 * Prevents notification spam per user+category.
 * Stores last_notified_at in notification_cooldowns table.
 *
 * Default cooldown: 60 s (override via NOTIFICATION_COOLDOWN_SEC env var).
 */
const db = require('../config/database');
const { randomUUID } = require('crypto');

const COOLDOWN_SEC = parseInt(process.env.NOTIFICATION_COOLDOWN_SEC || '60', 10);

/**
 * Returns true if the user can be notified for this category right now.
 * Always returns true if no prior entry exists.
 */
function canNotify(userId, category) {
    const row = db.prepare(
        'SELECT last_notified_at FROM notification_cooldowns WHERE user_id = ? AND category = ?'
    ).get(userId, category);

    if (!row) return true;

    const lastMs = new Date(row.last_notified_at).getTime();
    const nowMs = Date.now();
    return (nowMs - lastMs) >= COOLDOWN_SEC * 1000;
}

/**
 * Update (or insert) the cooldown timestamp for a user+category.
 */
function markNotified(userId, category) {
    const now = new Date().toISOString();
    const existing = db.prepare(
        'SELECT id FROM notification_cooldowns WHERE user_id = ? AND category = ?'
    ).get(userId, category);

    if (existing) {
        db.prepare(
            'UPDATE notification_cooldowns SET last_notified_at = ? WHERE id = ?'
        ).run(now, existing.id);
    } else {
        db.prepare(
            'INSERT INTO notification_cooldowns (id, user_id, category, last_notified_at) VALUES (?, ?, ?, ?)'
        ).run(randomUUID(), userId, category, now);
    }
}

/**
 * Convenience: check + mark in one call.
 * Returns true if notification should be sent (and marks it).
 * Returns false if still within cooldown window (no write).
 */
function tryNotify(userId, category) {
    if (!canNotify(userId, category)) return false;
    markNotified(userId, category);
    return true;
}

module.exports = { canNotify, markNotified, tryNotify };
