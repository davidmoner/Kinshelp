
'use strict';
const db = require('../../config/db');

function findById(id) {
    if (db.isPg) {
        return db.one('SELECT * FROM users WHERE id = $1', [id]).then(user => {
            if (!user) return null;
            const { password_hash, ...safe } = user;
            return safe;
        });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
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
