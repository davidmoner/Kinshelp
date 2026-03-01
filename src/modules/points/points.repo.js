'use strict';
const db = require('../../config/db');
const { randomUUID } = require('crypto');

async function getBalance(userId) {
    const row = db.isPg
        ? await db.one('SELECT points_balance FROM users WHERE id = $1', [userId])
        : db.prepare('SELECT points_balance FROM users WHERE id = ?').get(userId);
    return row ? Number(row.points_balance || 0) : 0;
}

async function ledger(userId, { limit = 20, offset = 0 }) {
    const sql = `
      SELECT l.*, m.status AS match_status
      FROM points_ledger l
      LEFT JOIN matches m ON m.id = l.match_id
      WHERE l.user_id = ${db.isPg ? '$1' : '?'}
      ORDER BY l.created_at DESC
      LIMIT ${db.isPg ? '$2' : '?'} OFFSET ${db.isPg ? '$3' : '?'}
    `;
    if (db.isPg) return db.many(sql, [userId, limit, offset]);
    return db.prepare(sql).all(userId, limit, offset);
}

async function debit(userId, amount, matchId, reason, now) {
    const bal = (await getBalance(userId)) - amount;
    if (db.isPg) {
        await db.exec('UPDATE users SET points_balance = $1, updated_at = $2 WHERE id = $3', [bal, now, userId]);
        await db.exec(
            'INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [randomUUID(), userId, matchId, -amount, reason, bal, now]
        );
        return bal;
    }
    db.prepare('UPDATE users SET points_balance = ?, updated_at = ? WHERE id = ?').run(bal, now, userId);
    db.prepare('INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(), userId, matchId, -amount, reason, bal, now);
    return bal;
}

async function credit(userId, amount, matchId, reason, now) {
    const bal = (await getBalance(userId)) + amount;
    if (db.isPg) {
        await db.exec('UPDATE users SET points_balance = $1, updated_at = $2 WHERE id = $3', [bal, now, userId]);
        await db.exec(
            'INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [randomUUID(), userId, matchId, +amount, reason, bal, now]
        );
        return bal;
    }
    db.prepare('UPDATE users SET points_balance = ?, updated_at = ? WHERE id = ?').run(bal, now, userId);
    db.prepare('INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(), userId, matchId, +amount, reason, bal, now);
    return bal;
}

module.exports = { getBalance, ledger, debit, credit };
