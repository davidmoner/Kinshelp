'use strict';
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const httpError = require('../../shared/http-error');
const { JWT_SECRET, JWT_EXPIRES_IN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FACEBOOK_APP_ID, FACEBOOK_APP_SECRET } = require('../../config/env');
const { PUBLIC_BASE_URL } = require('../../config/env');

function isGoogleEnabled() {
  return !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET;
}

function isFacebookEnabled() {
  return !!FACEBOOK_APP_ID && !!FACEBOOK_APP_SECRET;
}

function sanitize(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

async function upsertOAuthUser({ provider, email, displayName }) {
  if (!email) throw httpError(422, 'OAuth profile missing email');
  const now = new Date().toISOString();

  if (db.isPg) {
    const existing = await db.one('SELECT * FROM users WHERE email = $1', [email]);
    if (existing) {
      // keep user data, but patch display_name if empty
      if (!existing.display_name && displayName) {
        await db.exec('UPDATE users SET display_name = $1, updated_at = $2 WHERE id = $3', [displayName, now, existing.id]);
        const u2 = await db.one('SELECT * FROM users WHERE id = $1', [existing.id]);
        return sanitize(u2);
      }
      return sanitize(existing);
    }

    const { randomUUID } = require('crypto');
    const id = randomUUID();
    await db.exec(
      `INSERT INTO users (id, display_name, email, password_hash, bio, location_text, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, displayName || (provider + '_user'), email, null, null, null, now, now]
    );
    const created = await db.one('SELECT * FROM users WHERE id = $1', [id]);
    return sanitize(created);
  }

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) {
    if (!existing.display_name && displayName) {
      db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(displayName, now, existing.id);
      const u2 = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
      return sanitize(u2);
    }
    return sanitize(existing);
  }

  const { randomUUID } = require('crypto');
  const id = randomUUID();
  db.prepare(
    'INSERT INTO users (id, display_name, email, password_hash, bio, location_text, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(id, displayName || (provider + '_user'), email, null, null, null, now, now);
  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return sanitize(created);
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data && (data.error_description || data.error || data.message)) || `HTTP ${res.status}`;
    throw httpError(502, msg);
  }
  return data;
}

async function exchangeCodeForToken({ provider, code, redirectUri }) {
  if (provider === 'google') {
    const body = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    return fetchJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  if (provider === 'facebook') {
    const qs = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    });
    return fetchJson('https://graph.facebook.com/v18.0/oauth/access_token?' + qs.toString());
  }

  throw httpError(400, 'Unknown provider');
}

async function fetchProfile({ provider, accessToken, idToken }) {
  if (provider === 'google') {
    // Prefer OIDC userinfo when access_token present
    if (accessToken) {
      const data = await fetchJson('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      return { email: data.email, displayName: data.name || data.given_name || data.email };
    }
    // If only id_token present, best effort decode (no signature verify here)
    if (idToken) {
      const parts = String(idToken).split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        return { email: payload.email, displayName: payload.name || payload.given_name || payload.email };
      }
    }
    throw httpError(422, 'Google profile not available');
  }

  if (provider === 'facebook') {
    const data = await fetchJson('https://graph.facebook.com/me?fields=id,name,email&access_token=' + encodeURIComponent(accessToken));
    return { email: data.email, displayName: data.name || data.email };
  }

  throw httpError(400, 'Unknown provider');
}

async function google({ idToken, accessToken }) {
  if (!idToken && !accessToken) throw httpError(422, 'id_token or access_token is required');
  if (!isGoogleEnabled()) {
    return { implemented: false, provider: 'google', message: 'Google OAuth not configured yet.' };
  }
  const profile = await fetchProfile({ provider: 'google', accessToken, idToken });
  const user = await upsertOAuthUser({ provider: 'google', email: profile.email, displayName: profile.displayName });
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { implemented: true, provider: 'google', user, token };
}

async function facebook({ accessToken }) {
  if (!accessToken) throw httpError(422, 'access_token is required');
  if (!isFacebookEnabled()) {
    return { implemented: false, provider: 'facebook', message: 'Facebook OAuth not configured yet.' };
  }
  const profile = await fetchProfile({ provider: 'facebook', accessToken });
  const user = await upsertOAuthUser({ provider: 'facebook', email: profile.email, displayName: profile.displayName });
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { implemented: true, provider: 'facebook', user, token };
}

async function googleCallback({ code, state }) {
  if (!isGoogleEnabled()) return { implemented: false, provider: 'google', message: 'Google OAuth not configured yet.' };
  const redirectUri = `${PUBLIC_BASE_URL}/api/v1/auth/oauth/google/callback`;
  const tok = await exchangeCodeForToken({ provider: 'google', code, redirectUri });
  const out = await google({ idToken: tok.id_token || null, accessToken: tok.access_token || null });
  return out;
}

async function facebookCallback({ code, state }) {
  if (!isFacebookEnabled()) return { implemented: false, provider: 'facebook', message: 'Facebook OAuth not configured yet.' };
  const redirectUri = `${PUBLIC_BASE_URL}/api/v1/auth/oauth/facebook/callback`;
  const tok = await exchangeCodeForToken({ provider: 'facebook', code, redirectUri });
  const out = await facebook({ accessToken: tok.access_token });
  return out;
}

module.exports = { google, facebook, googleCallback, facebookCallback };
