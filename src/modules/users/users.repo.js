'use strict';
const db = require('../../config/database');

function findById(id) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return null;
    const { password_hash, ...safe } = user;
    return safe;
}

function patch(id, sets, vals) {
    db.prepare(`UPDATE users SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...vals, new Date().toISOString(), id);
}

module.exports = { findById, patch };
