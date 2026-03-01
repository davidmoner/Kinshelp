'use strict';
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const db = require('../config/db');

function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    (async () => {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = db.isPg
            ? await db.one('SELECT * FROM users WHERE id = $1', [payload.sub])
            : db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
        if (!user) return res.status(401).json({ error: 'User not found' });
        req.user = user;
        next();
    })().catch(() => {
        return res.status(401).json({ error: 'Invalid or expired token' });
    });
}

module.exports = { authenticate };
