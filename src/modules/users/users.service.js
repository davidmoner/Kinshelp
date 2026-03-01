'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const httpError = require('../../shared/http-error');
const repo = require('./users.repo');
const { PROFILE_MAX_PHOTOS } = require('../../config/constants');

const EDITABLE = ['display_name', 'bio', 'avatar_url', 'location_text', 'lat', 'lng'];

function sanitizePublic(user, { viewerId } = {}) {
    if (!user) return user;
    const out = { ...user };
    // Do not expose precise coords.
    delete out.lat;
    delete out.lng;
    // Hide internal auth / sensitive fields.
    delete out.password_hash;
    delete out.email;
    delete out.email_verified_at;
    // Only expose verification boolean.
    out.is_verified = !!(user.is_verified || user.email_verified_at);

    // If viewing someone else, do not expose their balance.
    if (viewerId && String(viewerId) !== String(user.id)) {
        delete out.points_balance;
    }
    return out;
}

function getById(id, viewerId = null) {
    return Promise.resolve(repo.findById(id)).then(user => {
        if (!user) throw httpError(404, 'User not found');
        return sanitizePublic(user, { viewerId });
    });
}

function updateProfile(id, actingUserId, fields) {
    if (id !== actingUserId) throw httpError(403, 'Forbidden');
    const sets = [], vals = [];
    for (const key of EDITABLE) {
        if (fields[key] !== undefined) { sets.push(`${key} = ?`); vals.push(fields[key]); }
    }
    if (sets.length) repo.patch(id, sets.join(', '), vals);
    return getById(id);
}

function parsePhotos(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const arr = JSON.parse(String(raw));
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function addMyPhoto(userId, file, baseUrl) {
    if (!file) throw httpError(400, 'Photo is required');
    const user = repo.findById(userId);
    if (!user) throw httpError(404, 'User not found');

    const photos = parsePhotos(user.profile_photos);
    const max = Number(PROFILE_MAX_PHOTOS || 2);
    if (photos.length >= max) {
        try { fs.unlinkSync(file.path); } catch { }
        throw httpError(422, `Maximo ${max} fotos en el perfil`);
    }

    const id = randomUUID();
    const url = `${String(baseUrl || '').replace(/\/$/, '')}/uploads/${file.filename}`;
    const next = [...photos, { id, url, filename: file.filename, created_at: new Date().toISOString() }];
    repo.patch(userId, 'profile_photos = ?', [JSON.stringify(next)]);
    return { ok: true, photos: next };
}

function deleteMyPhoto(userId, photoId) {
    const user = repo.findById(userId);
    if (!user) throw httpError(404, 'User not found');
    const photos = parsePhotos(user.profile_photos);
    const idx = photos.findIndex(p => String(p && p.id) === String(photoId));
    if (idx < 0) throw httpError(404, 'Photo not found');

    const [removed] = photos.splice(idx, 1);
    repo.patch(userId, 'profile_photos = ?', [JSON.stringify(photos)]);

    const filename = removed && removed.filename;
    if (filename) {
        const p = path.resolve(__dirname, '../../../uploads', filename);
        try { fs.unlinkSync(p); } catch { }
    }
    return { ok: true, photos };
}

module.exports = { getById, updateProfile, addMyPhoto, deleteMyPhoto };
