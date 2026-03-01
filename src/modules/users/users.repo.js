
'use strict';
const db = require('../../config/db');

function findById(id) {
    if (db.isPg) {
        return db.one(`
            SELECT
              u.*,
              COUNT(ub.id) AS badge_count
            FROM users u
            LEFT JOIN user_badges ub ON ub.user_id = u.id
            WHERE u.id = $1
            GROUP BY u.id
        `, [id]).then(user => {
            if (!user) return null;
            const { password_hash, ...safe } = user;
            return safe;
        });
    }
    const user = db.prepare(`
        SELECT
          u.*,
          (SELECT COUNT(*) FROM user_badges ub WHERE ub.user_id = u.id) AS badge_count
        FROM users u
        WHERE u.id = ?
    `).get(id);
    if (!user) return null;
    const { password_hash, ...safe } = user;
    return safe;
}

function patch(id, sets, vals) {
    if (db.isPg) {
        throw new Error('users patch not implemented for Postgres yet');
    }
    db.prepare(`UPDATE users SET ${sets}, updated_at = ? WHERE id = ?`).run(...vals, new Date().toISOString(), id);
}

module.exports = { findById, patch };
