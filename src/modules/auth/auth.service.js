'use strict';
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');
const httpError = require('../../shared/http-error');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../../config/env');

function sanitize(user) {
    const { password_hash, ...safe } = user;
    // Parse profile_photos JSON for the frontend
    if (safe.profile_photos && typeof safe.profile_photos === 'string') {
        try {
            const arr = JSON.parse(safe.profile_photos);
            safe.profile_photos = Array.isArray(arr) ? arr : [];
        } catch {
            safe.profile_photos = [];
        }
    }
    return safe;
}

function register({ display_name, email, password, bio, location_text }) {
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
        throw httpError(409, 'Email already registered');

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
    INSERT INTO users (id, display_name, email, password_hash, bio, location_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, display_name, email, bcrypt.hashSync(password, 10), bio || null, location_text || null, now, now);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return { user: sanitize(user), token: jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }) };
}

function login({ email, password }) {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash))
        throw httpError(401, 'Invalid email or password');
    return { user: sanitize(user), token: jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }) };
}

function me(userId) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) throw httpError(404, 'User not found');
    return sanitize(user);
}

function updateMe(userId, fields) {
    const now = new Date().toISOString();
    const sets = [];
    const vals = [];
    for (const k of ['display_name', 'bio', 'location_text']) {
        if (fields[k] !== undefined) {
            sets.push(`${k} = ?`);
            vals.push(fields[k]);
        }
    }
    if (!sets.length) throw httpError(400, 'No fields to update');
    db.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals, now, userId);
    return me(userId);
}

module.exports = { register, login, me, updateMe };
