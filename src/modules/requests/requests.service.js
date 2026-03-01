'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const httpError = require('../../shared/http-error');
const repo = require('./requests.repo');
const db = require('../../config/database');
const automatchSvc = require('../automatch/automatch.service');
const { LISTING_MAX_PHOTOS } = require('../../config/constants');

const EDITABLE = ['title', 'description', 'location_text', 'media_urls'];

function isPremiumUser(userId) {
  const u = db.prepare('SELECT premium_tier, premium_until FROM users WHERE id = ?').get(userId);
  if (!u) return false;
  if (u.premium_tier && u.premium_tier !== 'free') {
    if (!u.premium_until) return true;
    return new Date(u.premium_until).getTime() > Date.now();
  }
  return false;
}

function computeExpiresAt(userId) {
  const days = isPremiumUser(userId) ? 60 : 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function requireRequest(id) {
  const req = repo.findById(id);
  if (!req) throw httpError(404, 'Request not found');
  return req;
}

function list(filters) { return repo.list(filters); }
function getById(id) { return requireRequest(id); }

function create(data) {
  const expires_at = computeExpiresAt(data.seeker_id);
  const id = repo.insert({ ...data, expires_at });
  const row = requireRequest(id);
  try { automatchSvc.onRequestCreated(row); } catch { /* don't block request creation */ }
  return row;
}

function update(id, userId, fields) {
  const req = requireRequest(id);
  if (req.seeker_id !== userId) throw httpError(403, 'Forbidden');
  if (req.status !== 'open') throw httpError(422, 'Only open requests can be edited');

  const sets = [], vals = [];
  for (const key of EDITABLE) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(key === 'media_urls' ? JSON.stringify(fields[key]) : fields[key]);
    }
  }
  if (!sets.length) return requireRequest(id);
  repo.patch(id, sets.join(', '), vals);
  return requireRequest(id);
}

function remove(id, userId) {
  const req = requireRequest(id);
  if (req.seeker_id !== userId) throw httpError(403, 'Forbidden');
  repo.setStatus(id, 'closed');
  return { message: 'Request closed' };
}

function suggestedProviders(requestId) {
  const helpReq = requireRequest(requestId);
  const providers = repo.suggestedProviders(helpReq.category, helpReq.seeker_id);
  return { request: helpReq, suggested_providers: providers };
}

function parseMedia(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function addPhoto(id, userId, file, baseUrl) {
  if (!file) throw httpError(400, 'Photo is required');
  const req = requireRequest(id);
  if (req.seeker_id !== userId) {
    try { fs.unlinkSync(file.path); } catch { }
    throw httpError(403, 'Forbidden');
  }
  if (req.status !== 'open') {
    try { fs.unlinkSync(file.path); } catch { }
    throw httpError(422, 'Solo se pueden anadir fotos en solicitudes activas');
  }

  const max = Number(LISTING_MAX_PHOTOS || 6);
  const media = parseMedia(req.media_urls);
  if (media.length >= max) {
    try { fs.unlinkSync(file.path); } catch { }
    throw httpError(422, `Maximo ${max} fotos por solicitud`);
  }

  const pid = randomUUID();
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/uploads/${file.filename}`;
  const next = [...media, { id: pid, url, filename: file.filename, created_at: new Date().toISOString() }];
  repo.patch(id, 'media_urls = ?', [JSON.stringify(next)]);
  return { ok: true, media_urls: next };
}

function deletePhoto(id, userId, photoId) {
  const req = requireRequest(id);
  if (req.seeker_id !== userId) throw httpError(403, 'Forbidden');
  const media = parseMedia(req.media_urls);
  const idx = media.findIndex(p => String(p && p.id) === String(photoId));
  if (idx < 0) throw httpError(404, 'Photo not found');
  const [removed] = media.splice(idx, 1);
  repo.patch(id, 'media_urls = ?', [JSON.stringify(media)]);

  const filename = removed && removed.filename;
  if (filename) {
    const p = path.resolve(__dirname, '../../../uploads', filename);
    try { fs.unlinkSync(p); } catch { }
  }
  return { ok: true, media_urls: media };
}

function boost48h(id, userId) {
  const req = requireRequest(id);
  if (req.seeker_id !== userId) throw httpError(403, 'Forbidden');
  if (req.status !== 'open') throw httpError(422, 'Solo se pueden boostear solicitudes activas');
  if (Number(req.boost_48h_used || 0) === 1) throw httpError(409, 'Este anuncio ya uso su boost 48h');

  const u = db.prepare('SELECT premium_tier, premium_until, boost_48h_tokens FROM users WHERE id = ?').get(userId);
  if (!u) throw httpError(404, 'User not found');

  const premiumActive = (u.premium_tier && u.premium_tier !== 'free')
    ? (!u.premium_until || new Date(u.premium_until).getTime() > Date.now())
    : false;
  if (premiumActive) throw httpError(422, 'El boost 48h es solo para cuentas gratis');

  const tokens = Number(u.boost_48h_tokens || 0);
  if (tokens <= 0) throw httpError(422, 'No tienes boosts 48h disponibles');

  const cur = Date.parse(req.expires_at || '') || Date.now();
  const base = Math.max(cur, Date.now());
  const next = new Date(base + 48 * 60 * 60 * 1000).toISOString();

  db.transaction(() => {
    db.prepare('UPDATE users SET boost_48h_tokens = boost_48h_tokens - 1 WHERE id = ? AND COALESCE(boost_48h_tokens,0) > 0')
      .run(userId);
    repo.patch(id, 'expires_at = ?, boost_48h_used = 1', [next]);
  })();

  return requireRequest(id);
}

module.exports = { list, getById, create, update, remove, suggestedProviders, addPhoto, deletePhoto, boost48h };
