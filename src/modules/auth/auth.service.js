'use strict';
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const httpError = require('../../shared/http-error');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../../config/env');
const { logEvent } = require('../admin/admin.events.repo');

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

async function register({ display_name, email, password, bio, location_text }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const existing = db.isPg
        ? await db.one('SELECT id FROM users WHERE email = $1', [normalizedEmail])
        : db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) throw httpError(409, 'Email already registered');

    const id = randomUUID();
    const now = new Date().toISOString();
    const passHash = bcrypt.hashSync(password, 10);

    if (db.isPg) {
        await db.exec(
            `INSERT INTO users (id, display_name, email, password_hash, bio, location_text, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, display_name, normalizedEmail, passHash, bio || null, location_text || null, now, now]
        );
        const user = await db.one('SELECT * FROM users WHERE id = $1', [id]);
        const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        try { logEvent({ type: 'user.register', actorUserId: id, targetType: 'user', targetId: id, meta: { email: normalizedEmail } }); } catch { }
        return { user: sanitize(user), token };
    }

    db.prepare(`
    INSERT INTO users (id, display_name, email, password_hash, bio, location_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, display_name, normalizedEmail, passHash, bio || null, location_text || null, now, now);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    try { logEvent({ type: 'user.register', actorUserId: id, targetType: 'user', targetId: id, meta: { email: normalizedEmail } }); } catch { }
    return { user: sanitize(user), token };
}

async function login({ email, password }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = db.isPg
        ? await db.one('SELECT * FROM users WHERE email = $1', [normalizedEmail])
        : db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash))
        throw httpError(401, 'Invalid email or password');
    if (user.is_banned) throw httpError(403, 'Account suspended');
    try { logEvent({ type: 'user.login', actorUserId: user.id, targetType: 'user', targetId: user.id, meta: { email: normalizedEmail } }); } catch { }
    return { user: sanitize(user), token: jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }) };
}

async function me(userId) {
    const user = db.isPg
        ? await db.one('SELECT * FROM users WHERE id = $1', [userId])
        : db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) throw httpError(404, 'User not found');
    return sanitize(user);
}

async function updateMe(userId, fields) {
    const now = new Date().toISOString();
    const allowed = ['display_name', 'bio', 'location_text'];
    const sets = [];
    const vals = [];
    for (const k of allowed) {
        if (fields[k] !== undefined) {
            sets.push(k);
            vals.push(fields[k]);
        }
    }
    if (!sets.length) throw httpError(400, 'No fields to update');

    if (db.isPg) {
        const setSql = sets.map((k, i) => `${k} = $${i + 1}`).join(', ');
        await db.exec(
            `UPDATE users SET ${setSql}, updated_at = $${sets.length + 1} WHERE id = $${sets.length + 2}`,
            [...vals, now, userId]
        );
        return me(userId);
    }

    const setSql = sets.map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE users SET ${setSql}, updated_at = ? WHERE id = ?`).run(...vals, now, userId);
    return me(userId);
}

module.exports = { register, login, me, updateMe };
