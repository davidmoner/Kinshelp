'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const httpError = require('../../shared/http-error');
const db = require('../../config/db');
const env = require('../../config/env');
const eventsRepo = require('./admin.events.repo');
const adminRepo = require('./admin.repo');
const { ADMIN_COOKIE } = require('../../middleware/admin-auth.middleware');

function normalizeList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function resolveRole(email) {
  const adminList = new Set([
    ...normalizeList(env.ADMIN_EMAILS),
    ...normalizeList(env.ADMIN_EMAIL),
  ]);
  const staffList = new Set(normalizeList(env.ADMIN_STAFF_EMAILS));
  const e = String(email || '').toLowerCase();
  if (adminList.has(e)) return 'admin';
  if (staffList.has(e)) return 'staff';
  return null;
}

async function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (db.isPg) return db.one('SELECT id, email, display_name, is_banned FROM users WHERE email = $1', [normalized]);
  return db.prepare('SELECT id, email, display_name, is_banned FROM users WHERE email = ?').get(normalized);
}

function safeUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, display_name: u.display_name || null };
}

const ADMIN_JWT_EXPIRES_IN = env.ADMIN_JWT_EXPIRES_IN || '12h';

async function login(req, res, next) {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) throw httpError(400, 'Email y contraseña requeridos');

    const role = resolveRole(email);
    if (!role) throw httpError(403, 'Admin access required');

    if (!env.ADMIN_PASSWORD_HASH) throw httpError(500, 'Admin credentials not configured');
    if (!bcrypt.compareSync(password, env.ADMIN_PASSWORD_HASH)) throw httpError(401, 'Invalid credentials');

    const user = await findUserByEmail(email);
    if (!user) throw httpError(403, 'Admin user not found');
    if (user.is_banned) throw httpError(403, 'Account suspended');

    const token = jwt.sign({ sub: user.id, email, role, typ: 'admin' }, env.JWT_SECRET, { expiresIn: ADMIN_JWT_EXPIRES_IN });

    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 12 * 60 * 60 * 1000,
    });

    try {
      await Promise.resolve(eventsRepo.logEvent({
        type: 'admin.login',
        actorUserId: user.id,
        targetType: 'admin',
        targetId: user.id,
        meta: { email, role },
      }));
    } catch { }

    try {
      await Promise.resolve(adminRepo.insertAudit({
        id: randomUUID(),
        adminUserId: user.id,
        action: 'admin.login',
        entityType: 'admin',
        entityId: user.id,
        beforeJson: null,
        afterJson: JSON.stringify({ email, role }),
        ip: req.ip,
        userAgent: req.headers['user-agent'] || null,
      }));
    } catch { }

    res.json({ ok: true, user: safeUser(user), role });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  const admin = req.admin;
  res.json({ ok: true, user: safeUser(admin), role: admin.role });
}

async function logout(req, res) {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.json({ ok: true });
}

module.exports = { login, me, logout };
