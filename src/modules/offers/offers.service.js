'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const httpError = require('../../shared/http-error');
const repo = require('./offers.repo');
const { OFFER_STATUS } = require('../../config/constants');
const db = require('../../config/db');
const automatchSvc = require('../automatch/automatch.service');
const { LISTING_MAX_PHOTOS } = require('../../config/constants');

const EDITABLE = ['title', 'description', 'location_text', 'media_urls'];

function isPremiumUser(userId) {
    if (db.isPg) {
        return db.one('SELECT premium_tier, premium_until FROM users WHERE id = $1', [userId]).then(u => {
            if (!u) return false;
            if (u.premium_tier && u.premium_tier !== 'free') {
                if (!u.premium_until) return true;
                return new Date(u.premium_until).getTime() > Date.now();
            }
            return false;
        });
    }
    const u = db.prepare('SELECT premium_tier, premium_until FROM users WHERE id = ?').get(userId);
    if (!u) return false;
    if (u.premium_tier && u.premium_tier !== 'free') {
        if (!u.premium_until) return true;
        return new Date(u.premium_until).getTime() > Date.now();
    }
    return false;
}

function computeExpiresAt(userId) {
    if (db.isPg) {
        return Promise.resolve(isPremiumUser(userId)).then(p => {
            const days = p ? 60 : 7;
            return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        });
    }
    const days = isPremiumUser(userId) ? 60 : 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function requireOffer(id) {
    return Promise.resolve(repo.findById(id)).then(offer => {
        if (!offer) throw httpError(404, 'Offer not found');
        return offer;
    });
}

function list(filters) {
    return repo.list(filters);
}

function getById(id) {
    return requireOffer(id);
}

function create(data) {
    return Promise.resolve(computeExpiresAt(data.provider_id)).then(expires_at => repo.insert({ ...data, expires_at }))
        .then(id => requireOffer(id))
        .then(row => {
            try { automatchSvc.onOfferCreated(row); } catch { /* don't block offer creation */ }
            return row;
        });
}

function update(id, userId, fields) {
    return Promise.resolve(requireOffer(id)).then(offer => {
        if (offer.provider_id !== userId) throw httpError(403, 'Forbidden');
        if (offer.status !== OFFER_STATUS.ACTIVE) throw httpError(422, 'Only active offers can be edited');

        const sets = [], vals = [];
        for (const key of EDITABLE) {
            if (fields[key] !== undefined) {
                sets.push(`${key} = ?`);
                vals.push(key === 'media_urls' ? JSON.stringify(fields[key]) : fields[key]);
            }
        }
        if (!sets.length) return requireOffer(id);
        await Promise.resolve(repo.patch(id, sets.join(', '), vals));
        return requireOffer(id);
    });
}

function remove(id, userId) {
    return Promise.resolve(requireOffer(id)).then(async offer => {
        if (offer.provider_id !== userId) throw httpError(403, 'Forbidden');
        await Promise.resolve(repo.setStatus(id, 'closed'));
        return { message: 'Offer closed' };
    });
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

async function addPhoto(id, userId, file, baseUrl) {
    if (!file) throw httpError(400, 'Photo is required');
    const offer = await requireOffer(id);
    if (offer.provider_id !== userId) {
        try { fs.unlinkSync(file.path); } catch { }
        throw httpError(403, 'Forbidden');
    }
    if (offer.status !== OFFER_STATUS.ACTIVE) {
        try { fs.unlinkSync(file.path); } catch { }
        throw httpError(422, 'Solo se pueden anadir fotos en ofertas activas');
    }

    const max = Number(LISTING_MAX_PHOTOS || 6);
    const media = parseMedia(offer.media_urls);
    if (media.length >= max) {
        try { fs.unlinkSync(file.path); } catch { }
        throw httpError(422, `Maximo ${max} fotos por oferta`);
    }

    const pid = randomUUID();
    const url = `${String(baseUrl || '').replace(/\/$/, '')}/uploads/${file.filename}`;
    const next = [...media, { id: pid, url, filename: file.filename, created_at: new Date().toISOString() }];
    await Promise.resolve(repo.patch(id, 'media_urls = ?', [JSON.stringify(next)]));
    return { ok: true, media_urls: next };
}

async function deletePhoto(id, userId, photoId) {
    const offer = await requireOffer(id);
    if (offer.provider_id !== userId) throw httpError(403, 'Forbidden');
    const media = parseMedia(offer.media_urls);
    const idx = media.findIndex(p => String(p && p.id) === String(photoId));
    if (idx < 0) throw httpError(404, 'Photo not found');
    const [removed] = media.splice(idx, 1);
    await Promise.resolve(repo.patch(id, 'media_urls = ?', [JSON.stringify(media)]));

    const filename = removed && removed.filename;
    if (filename) {
        const p = path.resolve(__dirname, '../../../uploads', filename);
        try { fs.unlinkSync(p); } catch { }
    }
    return { ok: true, media_urls: media };
}

async function boost48h(id, userId) {
    const offer = await requireOffer(id);
    if (offer.provider_id !== userId) throw httpError(403, 'Forbidden');
    if (offer.status !== OFFER_STATUS.ACTIVE) throw httpError(422, 'Solo se pueden boostear ofertas activas');
    if (Number(offer.boost_48h_used || 0) === 1) throw httpError(409, 'Este anuncio ya uso su boost 48h');

    let u;
    if (db.isPg) {
        u = await db.one('SELECT premium_tier, premium_until, boost_48h_tokens FROM users WHERE id = $1', [userId]);
    } else {
        u = db.prepare('SELECT premium_tier, premium_until, boost_48h_tokens FROM users WHERE id = ?').get(userId);
    }
    if (!u) throw httpError(404, 'User not found');

    const premiumActive = (u.premium_tier && u.premium_tier !== 'free')
        ? (!u.premium_until || new Date(u.premium_until).getTime() > Date.now())
        : false;
    if (premiumActive) throw httpError(422, 'El boost 48h es solo para cuentas gratis');

    const tokens = Number(u.boost_48h_tokens || 0);
    if (tokens <= 0) throw httpError(422, 'No tienes boosts 48h disponibles');

    const cur = Date.parse(offer.expires_at || '') || Date.now();
    const base = Math.max(cur, Date.now());
    const next = new Date(base + 48 * 60 * 60 * 1000).toISOString();

    if (db.isPg) {
        await db.exec('UPDATE users SET boost_48h_tokens = boost_48h_tokens - 1 WHERE id = $1 AND COALESCE(boost_48h_tokens,0) > 0', [userId]);
        await repo.patch(id, 'expires_at = ?, boost_48h_used = 1', [next]);
    } else {
        db.transaction(() => {
            db.prepare('UPDATE users SET boost_48h_tokens = boost_48h_tokens - 1 WHERE id = ? AND COALESCE(boost_48h_tokens,0) > 0')
                .run(userId);
            repo.patch(id, 'expires_at = ?, boost_48h_used = 1', [next]);
        })();
    }

    return requireOffer(id);
}

module.exports = { list, getById, create, update, remove, addPhoto, deletePhoto, boost48h };
