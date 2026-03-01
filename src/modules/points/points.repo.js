'use strict';
const db = require('../../config/database');
const { randomUUID } = require('crypto');

function getBalance(userId) {
    const row = db.prepare('SELECT points_balance FROM users WHERE id = ?').get(userId);
    return row ? row.points_balance : 0;
}

function ledger(userId, { limit = 20, offset = 0 }) {
    return db.prepare(`
    SELECT l.*, m.status AS match_status FROM points_ledger l
    LEFT JOIN matches m ON m.id = l.match_id
    WHERE l.user_id = ?
    ORDER BY l.created_at DESC LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

function debit(userId, amount, matchId, reason, now) {
    const bal = getBalance(userId) - amount;
    db.prepare('UPDATE users SET points_balance = ?, updated_at = ? WHERE id = ?').run(bal, now, userId);
    db.prepare('INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(), userId, matchId, -amount, reason, bal, now);
    return bal;
}

function credit(userId, amount, matchId, reason, now) {
    const bal = getBalance(userId) + amount;
    db.prepare('UPDATE users SET points_balance = ?, updated_at = ? WHERE id = ?').run(bal, now, userId);
    db.prepare('INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(), userId, matchId, +amount, reason, bal, now);
    return bal;
}

module.exports = { getBalance, ledger, debit, credit };
