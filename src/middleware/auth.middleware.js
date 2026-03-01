'use strict';
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const db = require('../config/database');

function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
        if (!user) return res.status(401).json({ error: 'User not found' });
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { authenticate };
