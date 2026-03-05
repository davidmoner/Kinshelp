'use strict';
const jwt = require('jsonwebtoken');
const httpError = require('../shared/http-error');
const { JWT_SECRET } = require('../config/env');
const db = require('../config/db');

const ADMIN_COOKIE = 'admin_token';

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  const parts = String(header).split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function getTokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[ADMIN_COOKIE] || '';
}

async function getAdminUserById(id) {
  if (!id) return null;
  if (db.isPg) return db.one('SELECT id, email, display_name, is_banned FROM users WHERE id = $1', [id]);
  return db.prepare('SELECT id, email, display_name, is_banned FROM users WHERE id = ?').get(id);
}

async function verifyAdminRequest(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || payload.typ !== 'admin') return null;
    const role = payload.role || 'admin';
    const userId = payload.sub || null;
    const user = await getAdminUserById(userId);
    if (!user || user.is_banned) return null;
    return { id: user.id, email: user.email, role, display_name: user.display_name || null };
  } catch {
    return null;
  }
}

async function requireAdminAuth(req, res, next) {
  const admin = await verifyAdminRequest(req);
  if (!admin) return next(httpError(401, 'Admin auth required'));
  req.admin = admin;
  req.user = { id: admin.id, email: admin.email };
  return next();
}

module.exports = { ADMIN_COOKIE, parseCookies, getTokenFromRequest, verifyAdminRequest, requireAdminAuth };
