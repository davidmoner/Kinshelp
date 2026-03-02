'use strict';
const { ADMIN_EMAILS } = require('../config/env');

function parseAdminEmails() {
  if (!ADMIN_EMAILS) return [];
  return String(ADMIN_EMAILS)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function requireAdmin(req, res, next) {
  const admins = parseAdminEmails();
  const email = String(req.user && req.user.email ? req.user.email : '').toLowerCase();
  if (!email || !admins.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

module.exports = { requireAdmin };
