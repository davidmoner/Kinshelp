'use strict';
const db = require('../../config/database');
const httpError = require('../../shared/http-error');
const repo = require('./automatch.repo');
const matchesSvc = require('../matches/matches.service');
const {
  AUTOMATCH_INVITE_TTL_MINUTES,
  AUTOMATCH_MAX_INVITES_PER_REQUEST,
  AUTOMATCH_MAX_PENDING_PER_PROVIDER,
  AUTOMATCH_MAX_PENDING_PER_USER,
  CATEGORIES,
} = require('../../config/constants');

function isPremiumActive(userId) {
  const u = db.prepare('SELECT premium_tier, premium_until FROM users WHERE id = ?').get(userId);
  if (!u) return false;
  if (!u.premium_tier || u.premium_tier === 'free') return false;
  if (!u.premium_until) return true;
  return new Date(u.premium_until).getTime() > Date.now();
}

function getSettings(userId) {
  if (!isPremiumActive(userId)) throw httpError(403, 'AutoMatch es una funcion Premium');
  const s = repo.getSettings(userId);
  if (s) return s;
  // default settings row not created yet
  return {
    user_id: userId,
    enabled: 0,
    seeker_enabled: 0,
    categories: [],
    seeker_categories: [],
    radius_km: 5,
    max_invites_per_day: 25,
    quiet_start: null,
    quiet_end: null,
  };
}

function updateSettings(userId, fields) {
  if (!isPremiumActive(userId)) throw httpError(403, 'AutoMatch es una funcion Premium');
  const cats = Array.isArray(fields.categories) ? fields.categories : undefined;
  const scats = Array.isArray(fields.seeker_categories) ? fields.seeker_categories : undefined;
  for (const list of [cats, scats]) {
    if (!list) continue;
    for (const c of list) {
      if (!CATEGORIES.includes(c)) throw httpError(400, `Categoria invalida: ${c}`);
    }
  }
  return repo.upsertSettings(userId, fields);
}

function onRequestCreated(requestRow) {
  if (!requestRow) return { ok: true, invites: 0 };
  const { id: requestId, seeker_id: seekerId, category } = requestRow;
  if (!category) return { ok: true, invites: 0 };

  const providerIds = repo.findEligibleProvidersForCategory({
    category,
    excludeUserId: seekerId,
    limit: Number(AUTOMATCH_MAX_INVITES_PER_REQUEST || 6),
  });

  if (!providerIds.length) return { ok: true, invites: 0 };

  // Filter providers that are already overloaded or exceeded daily cap
  const filtered = providerIds.filter(pid => {
    const pending = repo.countPendingForProvider(pid);
    if (pending >= Number(AUTOMATCH_MAX_PENDING_PER_PROVIDER || 4)) return false;
    const s = repo.getSettings(pid);
    const cap = s ? Number(s.max_invites_per_day || 25) : 25;
    const today = repo.countInvitesToday(pid);
    if (today >= cap) return false;
    // Optional category allowlist
    if (s && s.categories && Array.isArray(s.categories) && s.categories.length) {
      if (!s.categories.includes(category)) return false;
    }
    return true;
  });

  // Also: if seeker is Premium and enabled "Necesito", propose existing offers automatically.
  // This is a premium shortcut to avoid browsing.
  try {
    if (isPremiumActive(seekerId)) {
      const s = repo.getSettings(seekerId);
      const seekerEnabled = s ? !!s.seeker_enabled : false;
      const allow = s && Array.isArray(s.seeker_categories) && s.seeker_categories.length
        ? s.seeker_categories.includes(category)
        : true;
      if (seekerEnabled && allow) {
        const offers = repo.findActiveOffersForCategory({
          category,
          excludeUserId: seekerId,
          limit: Number(AUTOMATCH_MAX_INVITES_PER_REQUEST || 6),
        });
        if (offers && offers.length) {
          const ttl = Number(AUTOMATCH_INVITE_TTL_MINUTES || 12);
          const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();
          repo.insertOfferInvitesToSeeker({ seekerId, offers, expiresAt });
        }
      }
    }
  } catch {
    // non-blocking
  }

  if (!filtered.length) return { ok: true, invites: 0 };

  const ttl = Number(AUTOMATCH_INVITE_TTL_MINUTES || 12);
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();
  repo.insertInvites({ requestId, seekerId, providerIds: filtered, expiresAt });
  return { ok: true, invites: filtered.length, expires_at: expiresAt };
}

function onOfferCreated(offerRow) {
  if (!offerRow) return { ok: true, invites: 0 };
  const { id: offerId, provider_id: providerId, category } = offerRow;
  if (!category) return { ok: true, invites: 0 };

  const seekerIds = repo.findEligibleSeekersForCategory({
    category,
    excludeUserId: providerId,
    limit: Number(AUTOMATCH_MAX_INVITES_PER_REQUEST || 6),
  });
  if (!seekerIds.length) return { ok: true, invites: 0 };

  const filtered = seekerIds.filter(sid => {
    const pendingReq = repo.countPendingForProvider(sid); // pending as provider
    const pendingOff = repo.countPendingOfferInvitesForSeeker(sid);
    const pendingAll = pendingReq + pendingOff;
    if (pendingAll >= Number(AUTOMATCH_MAX_PENDING_PER_USER || AUTOMATCH_MAX_PENDING_PER_PROVIDER || 4)) return false;
    const s = repo.getSettings(sid);
    const cap = s ? Number(s.max_invites_per_day || 25) : 25;
    const today = repo.countInvitesTodayForSeeker(sid);
    if (today >= cap) return false;
    if (s && Array.isArray(s.seeker_categories) && s.seeker_categories.length) {
      if (!s.seeker_categories.includes(category)) return false;
    }
    return true;
  });
  if (!filtered.length) return { ok: true, invites: 0 };

  const ttl = Number(AUTOMATCH_INVITE_TTL_MINUTES || 12);
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();
  repo.insertOfferInvites({ offerId, providerId, seekerIds: filtered, expiresAt });
  return { ok: true, invites: filtered.length, expires_at: expiresAt };
}

function listInvites(userId, opts) {
  if (!isPremiumActive(userId)) throw httpError(403, 'AutoMatch es una funcion Premium');
  const asProvider = repo.listInvitesForProvider(userId, opts);
  const asSeeker = repo.listOfferInvitesForSeeker(userId, opts);

  const mappedProvider = asProvider.map(r => ({
    id: r.id,
    kind: 'request',
    status: r.status,
    expires_at: r.expires_at,
    created_at: r.created_at,
    request_id: r.request_id,
    title: r.request_title,
    category: r.request_category,
    location_text: r.request_location,
    compensation_type: r.request_compensation,
    media_urls: r.request_media,
    other_name: r.seeker_name,
    other_rating: r.seeker_rating,
  }));

  const mappedSeeker = asSeeker.map(r => ({
    id: r.id,
    kind: 'offer',
    status: r.status,
    expires_at: r.expires_at,
    created_at: r.created_at,
    offer_id: r.offer_id,
    title: r.offer_title,
    category: r.offer_category,
    location_text: r.offer_location,
    compensation_type: r.offer_compensation,
    media_urls: r.offer_media,
    other_name: r.provider_name,
    other_rating: r.provider_rating,
  }));

  const all = [...mappedProvider, ...mappedSeeker];
  all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return all;
}

function acceptInvite(inviteId, actingProviderId) {
  if (!isPremiumActive(actingProviderId)) throw httpError(403, 'AutoMatch es una funcion Premium');

  const invReq = repo.getInvite(inviteId);
  if (invReq) {
    if (invReq.provider_id !== actingProviderId) throw httpError(403, 'Forbidden');
    if (invReq.status !== 'pending') throw httpError(422, `Invitacion no disponible (${invReq.status})`);
    if (new Date(invReq.expires_at).getTime() <= Date.now()) throw httpError(422, 'Invitacion caducada');
    const req = db.prepare('SELECT id, status, compensation_type FROM help_requests WHERE id = ?').get(invReq.request_id);
    if (!req) throw httpError(404, 'Solicitud no encontrada');
    if (req.status !== 'open') throw httpError(422, 'La solicitud ya no esta disponible');

    const match = db.transaction(() => {
      repo.markAccepted(inviteId);
      repo.expireOtherPendingForRequest(invReq.request_id, inviteId);
      return matchesSvc.create({
        request_id: invReq.request_id,
        offer_id: null,
        provider_id: invReq.provider_id,
        seeker_id: invReq.seeker_id,
        points_agreed: 0,
        initiated_by: 'provider',
        compensation_type: req.compensation_type || 'cash',
      });
    })();
    return { ok: true, match };
  }

  const invOffer = repo.getOfferInvite(inviteId);
  if (!invOffer) throw httpError(404, 'Invitacion no encontrada');
  if (invOffer.seeker_id !== actingProviderId) throw httpError(403, 'Forbidden');
  if (invOffer.status !== 'pending') throw httpError(422, `Invitacion no disponible (${invOffer.status})`);
  if (new Date(invOffer.expires_at).getTime() <= Date.now()) throw httpError(422, 'Invitacion caducada');
  const off = db.prepare('SELECT id, status, compensation_type FROM service_offers WHERE id = ?').get(invOffer.offer_id);
  if (!off) throw httpError(404, 'Oferta no encontrada');
  if (off.status !== 'active') throw httpError(422, 'La oferta ya no esta disponible');

  const match2 = db.transaction(() => {
    repo.markOfferAccepted(inviteId);
    repo.expireOtherPendingForOffer(invOffer.offer_id, inviteId);
    return matchesSvc.create({
      request_id: null,
      offer_id: invOffer.offer_id,
      provider_id: invOffer.provider_id,
      seeker_id: invOffer.seeker_id,
      points_agreed: 0,
      initiated_by: 'seeker',
      compensation_type: off.compensation_type || 'cash',
    });
  })();

  return { ok: true, match: match2 };
}

function declineInvite(inviteId, actingProviderId) {
  if (!isPremiumActive(actingProviderId)) throw httpError(403, 'AutoMatch es una funcion Premium');
  const invReq = repo.getInvite(inviteId);
  if (invReq) {
    if (invReq.provider_id !== actingProviderId) throw httpError(403, 'Forbidden');
    if (invReq.status !== 'pending') throw httpError(422, `Invitacion no disponible (${invReq.status})`);
    repo.markDeclined(inviteId);
    return { ok: true };
  }
  const invOff = repo.getOfferInvite(inviteId);
  if (!invOff) throw httpError(404, 'Invitacion no encontrada');
  if (invOff.seeker_id !== actingProviderId) throw httpError(403, 'Forbidden');
  if (invOff.status !== 'pending') throw httpError(422, `Invitacion no disponible (${invOff.status})`);
  repo.markOfferDeclined(inviteId);
  return { ok: true };
}

module.exports = {
  getSettings,
  updateSettings,
  onRequestCreated,
  onOfferCreated,
  listInvites,
  acceptInvite,
  declineInvite,
};
