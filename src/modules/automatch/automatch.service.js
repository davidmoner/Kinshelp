'use strict';
const db = require('../../config/db');
const httpError = require('../../shared/http-error');
const repo = require('./automatch.repo');
const matchesSvc = require('../matches/matches.service');
const notifications = require('../notifications/notifications.service');
const cooldown = require('../../shared/cooldown.service');
const {
  AUTOMATCH_INVITE_TTL_MINUTES,
  AUTOMATCH_MAX_INVITES_PER_REQUEST,
  AUTOMATCH_MAX_PENDING_PER_PROVIDER,
  AUTOMATCH_MAX_PENDING_PER_USER,
  AUTOMATCH_WAVE_SIZE,
  AUTOMATCH_WAVE_DELAY_MINUTES,
  AUTOMATCH_FAIRNESS_WINDOW_MINUTES,
  AUTOMATCH_FAIRNESS_MAX_EXPOSURE,
  CATEGORIES,
} = require('../../config/constants');

const AUTOMATCH_ALLOWLIST = new Set(['contact@kingshelp.es']);

function timeToMinutes(val) {
  if (!val || typeof val !== 'string') return null;
  const parts = val.split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function isScheduleActive(settings, now = new Date()) {
  if (!settings) return true;
  const tzOffset = Number(settings.tz_offset_min);
  const offset = Number.isFinite(tzOffset) ? tzOffset : 0;
  const local = new Date(now.getTime() - offset * 60 * 1000);
  const day = local.getDay();
  const minutes = local.getHours() * 60 + local.getMinutes();
  const weekend = day === 0 || day === 6;
  const start = timeToMinutes(weekend ? settings.weekend_start : settings.weekday_start);
  const end = timeToMinutes(weekend ? settings.weekend_end : settings.weekday_end);
  if (start == null || end == null) return true;
  if (start === end) return true;
  if (end > start) return minutes >= start && minutes <= end;
  return minutes >= start || minutes <= end;
}

function toRadians(n) {
  return (Number(n) * Math.PI) / 180;
}

function distanceKm(aLat, aLng, bLat, bLng) {
  if (!Number.isFinite(aLat) || !Number.isFinite(aLng) || !Number.isFinite(bLat) || !Number.isFinite(bLng)) return null;
  const R = 6371;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function scoreCandidate({
  distance_km,
  radius_km,
  rating,
  verified,
  pendingCount,
  pendingCap,
  exposureCount,
  fairnessCap,
  minutesSinceLast,
}) {
  const radius = Number(radius_km || 5);
  const distScore = distance_km == null ? 0.6 : clamp01(1 - (distance_km / Math.max(1, radius)));
  const trustScore = clamp01((Number(rating || 0) / 5) + (verified ? 0.1 : 0));
  const pendingScore = clamp01(1 - (Number(pendingCount || 0) / Math.max(1, pendingCap || 1)));
  const fairnessScore = clamp01(1 - (Number(exposureCount || 0) / Math.max(1, fairnessCap || 1)));
  const recencyBoost = clamp01(Number(minutesSinceLast || 0) / Math.max(1, Number(AUTOMATCH_FAIRNESS_WINDOW_MINUTES || 1440))) * 0.15;

  const weights = {
    distance: 0.28,
    trust: 0.28,
    availability: 0.18,
    fairness: 0.18,
    category: 0.08,
  };

  const score =
    distScore * weights.distance
    + trustScore * weights.trust
    + pendingScore * weights.availability
    + fairnessScore * weights.fairness
    + weights.category
    + recencyBoost;

  return score;
}

function minutesSince(ts) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

function startOfLocalDayIso(offsetMin, now = new Date()) {
  const offset = Number.isFinite(offsetMin) ? offsetMin : 0;
  const local = new Date(now.getTime() - offset * 60 * 1000);
  local.setHours(0, 0, 0, 0);
  return new Date(local.getTime() + offset * 60 * 1000).toISOString();
}

async function countActiveMatchesForProvider(providerId) {
  if (db.isPg) {
    const row = await db.one(
      "SELECT COUNT(*)::int AS n FROM matches WHERE provider_id = $1 AND status IN ('pending','accepted')",
      [providerId]
    );
    return (row && row.n) || 0;
  }
  const row = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE provider_id = ? AND status IN ('pending','accepted')").get(providerId);
  return (row && row.n) || 0;
}

const waveQueue = new Map();

function buildWaveKey(kind, entityId) {
  return `${kind}:${entityId}`;
}

async function canSendNextWave(kind, entityId) {
  if (kind === 'request') {
    const req = await Promise.resolve(repo.getRequestStatus(entityId));
    if (!req || req.status !== 'open') return false;
    const accepted = await Promise.resolve(repo.countAcceptedForRequest(entityId));
    if (accepted > 0) return false;
    const pending = await Promise.resolve(repo.countPendingForRequest(entityId));
    if (pending > 0) return false;
    return true;
  }
  const off = await Promise.resolve(repo.getOfferStatus(entityId));
  if (!off || off.status !== 'active') return false;
  const accepted = await Promise.resolve(repo.countAcceptedForOffer(entityId));
  if (accepted > 0) return false;
  const pending = await Promise.resolve(repo.countPendingForOffer(entityId));
  if (pending > 0) return false;
  return true;
}

async function dispatchWave(plan, ids) {
  const ttl = Number(AUTOMATCH_INVITE_TTL_MINUTES || 12);
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

  if (plan.kind === 'request') {
    await Promise.resolve(repo.insertInvites({ requestId: plan.entityId, seekerId: plan.actorId, providerIds: ids, expiresAt }));
    try {
      ids.forEach(pid => {
        Promise.resolve(cooldown.tryNotify(pid, 'automatch_invite'))
          .then(ok => {
            if (!ok) return null;
            return notifications.notify(pid, 'automatch_invite', {
              title: 'Nueva invitacion AutoMatch',
              body: 'Tienes una nueva solicitud cerca. Revisa tu panel Premium.',
              payload: { request_id: plan.entityId, seeker_id: plan.actorId, category: plan.category },
            });
          })
          .catch(() => { });
      });
    } catch { }
    return;
  }

  await Promise.resolve(repo.insertOfferInvites({ offerId: plan.entityId, providerId: plan.actorId, seekerIds: ids, expiresAt }));
  try {
    ids.forEach(sid => {
      Promise.resolve(cooldown.tryNotify(sid, 'automatch_offer_invite'))
        .then(ok => {
          if (!ok) return null;
          return notifications.notify(sid, 'automatch_offer_invite', {
            title: 'Nueva oferta AutoMatch',
            body: 'Hay una nueva oferta compatible contigo. Revisa tu panel Premium.',
            payload: { offer_id: plan.entityId, provider_id: plan.actorId, category: plan.category },
          });
        })
        .catch(() => { });
    });
  } catch { }
}

function scheduleWave(plan) {
  const key = buildWaveKey(plan.kind, plan.entityId);
  if (waveQueue.has(key)) return;
  waveQueue.set(key, plan);
  setTimeout(async () => {
    const current = waveQueue.get(key);
    if (!current) return;
    const ok = await canSendNextWave(current.kind, current.entityId);
    if (!ok) {
      waveQueue.delete(key);
      return;
    }
    const batch = current.remaining.splice(0, current.waveSize);
    if (!batch.length) {
      waveQueue.delete(key);
      return;
    }
    await dispatchWave(current, batch);
    if (current.remaining.length) {
      waveQueue.delete(key);
      scheduleWave(current);
    } else {
      waveQueue.delete(key);
    }
  }, plan.delayMs);
}

function normalizeScheduleFields(fields, existing) {
  const hasSchedule = ['weekday_start', 'weekday_end', 'weekend_start', 'weekend_end', 'tz_offset_min']
    .some(k => fields[k] !== undefined);
  if (!hasSchedule) return fields;
  const schedule = {
    weekday_start: fields.weekday_start ?? (existing && existing.weekday_start) ?? '17:00',
    weekday_end: fields.weekday_end ?? (existing && existing.weekday_end) ?? '21:00',
    weekend_start: fields.weekend_start ?? (existing && existing.weekend_start) ?? '00:00',
    weekend_end: fields.weekend_end ?? (existing && existing.weekend_end) ?? '23:59',
    tz_offset_min: fields.tz_offset_min ?? (existing && existing.tz_offset_min) ?? null,
  };
  return {
    ...fields,
    quiet_start: JSON.stringify(schedule),
    quiet_end: null,
  };
}

function isPremiumActive(userId) {
  if (db.isPg) {
    return db.one('SELECT premium_tier, premium_until, email FROM users WHERE id = $1', [userId]).then(u => {
      if (!u) return false;
      if (u.email && AUTOMATCH_ALLOWLIST.has(String(u.email).trim().toLowerCase())) return true;
      if (!u.premium_tier || u.premium_tier === 'free') return false;
      if (!u.premium_until) return true;
      return new Date(u.premium_until).getTime() > Date.now();
    });
  }
  const u = db.prepare('SELECT premium_tier, premium_until, email FROM users WHERE id = ?').get(userId);
  if (!u) return false;
  if (u.email && AUTOMATCH_ALLOWLIST.has(String(u.email).trim().toLowerCase())) return true;
  if (!u.premium_tier || u.premium_tier === 'free') return false;
  if (!u.premium_until) return true;
  return new Date(u.premium_until).getTime() > Date.now();
}

function getSettings(userId) {
  return Promise.resolve(isPremiumActive(userId)).then(ok => {
    if (!ok) throw httpError(403, 'AutoMatch es una funcion Premium');
    return Promise.resolve(repo.getSettings(userId)).then(s => {
      if (s) return s;
      return {
        user_id: userId,
        enabled: 0,
        seeker_enabled: 0,
        categories: [],
        seeker_categories: [],
        radius_km: 5,
        max_invites_per_day: 20,
        quiet_start: null,
        quiet_end: null,
        automatch_mode: 'simple',
      };
    });
  });
}

function updateSettings(userId, fields) {
  return Promise.resolve(isPremiumActive(userId)).then(ok => {
    if (!ok) throw httpError(403, 'AutoMatch es una funcion Premium');
  const cats = Array.isArray(fields.categories) ? fields.categories : undefined;
  const scats = Array.isArray(fields.seeker_categories) ? fields.seeker_categories : undefined;
  for (const list of [cats, scats]) {
    if (!list) continue;
    for (const c of list) {
      if (!CATEGORIES.includes(c)) throw httpError(400, `Categoria invalida: ${c}`);
    }
  }
    return Promise.resolve(repo.getSettings(userId))
      .then(existing => repo.upsertSettings(userId, normalizeScheduleFields(fields, existing)));
  });
}

async function onRequestCreated(requestRow) {
  if (!requestRow) return { ok: true, invites: 0 };
  const { id: requestId, seeker_id: seekerId, category, lat, lng } = requestRow;
  if (!category) return { ok: true, invites: 0 };

  const maxInvites = Number(AUTOMATCH_MAX_INVITES_PER_REQUEST || 6);
  const waveSize = Math.max(1, Math.min(Number(AUTOMATCH_WAVE_SIZE || 3), maxInvites));
  const delayMs = Number(AUTOMATCH_WAVE_DELAY_MINUTES || 6) * 60 * 1000;

  const providerIds = await Promise.resolve(repo.findEligibleProvidersForCategory({
    category,
    excludeUserId: seekerId,
    limit: Math.max(maxInvites * 3, 12),
  }));

  // Also: if seeker is Premium and enabled "Necesito", propose existing offers automatically.
  try {
    if (await Promise.resolve(isPremiumActive(seekerId))) {
      const s = await Promise.resolve(repo.getSettings(seekerId));
      const seekerEnabled = s ? !!s.seeker_enabled : false;
      const allow = s && Array.isArray(s.seeker_categories) && s.seeker_categories.length
        ? s.seeker_categories.includes(category)
        : true;
      if (seekerEnabled && allow && isScheduleActive(s)) {
        const offers = await Promise.resolve(repo.findActiveOffersForCategory({
          category,
          excludeUserId: seekerId,
          limit: maxInvites,
        }));
        if (offers && offers.length) {
          const ttl = Number(AUTOMATCH_INVITE_TTL_MINUTES || 12);
          const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();
          await Promise.resolve(repo.insertOfferInvitesToSeeker({ seekerId, offers, expiresAt }));
        }
      }
    }
  } catch {
    // non-blocking
  }

  if (!providerIds || !providerIds.length) return { ok: true, invites: 0 };

  const scored = [];
  for (const pid of providerIds) {
    const pending = await Promise.resolve(repo.countPendingForProvider(pid));
    if (pending >= Number(AUTOMATCH_MAX_PENDING_PER_PROVIDER || 4)) continue;

    const activeMatches = await countActiveMatchesForProvider(pid);
    if (activeMatches >= 1) continue;

    const settings = await Promise.resolve(repo.getSettings(pid));
    if (settings && !isScheduleActive(settings)) continue;

    const cap = settings ? Number(settings.max_invites_per_day || 20) : 20;
    const tzOffset = settings ? Number(settings.tz_offset_min) : 0;
    const since = startOfLocalDayIso(Number.isFinite(tzOffset) ? tzOffset : 0);
    const today = await Promise.resolve(repo.countInvitesSince(pid, since));
    if (today >= cap) continue;

    if (settings && Array.isArray(settings.categories) && settings.categories.length) {
      if (!settings.categories.includes(category)) continue;
    }

    const user = await Promise.resolve(repo.getUserBasics(pid));
    if (!user) continue;

    const exposure = await Promise.resolve(repo.getRecentExposureForProvider(pid, Number(AUTOMATCH_FAIRNESS_WINDOW_MINUTES || 1440)));
    const dist = distanceKm(Number(lat), Number(lng), Number(user.lat), Number(user.lng));
    const score = scoreCandidate({
      distance_km: dist,
      radius_km: settings ? settings.radius_km : 5,
      rating: user.rating_avg,
      verified: !!user.is_verified,
      pendingCount: pending,
      pendingCap: Number(AUTOMATCH_MAX_PENDING_PER_PROVIDER || 4),
      exposureCount: exposure && exposure.n,
      fairnessCap: Number(AUTOMATCH_FAIRNESS_MAX_EXPOSURE || 8),
      minutesSinceLast: minutesSince(exposure && exposure.last_at),
    });
    scored.push({ id: pid, score });
  }

  if (!scored.length) return { ok: true, invites: 0 };

  scored.sort((a, b) => b.score - a.score);
  const ordered = scored.slice(0, maxInvites).map(r => r.id);
  const firstWave = ordered.slice(0, waveSize);
  const remaining = ordered.slice(waveSize);

  if (firstWave.length) {
    await dispatchWave({ kind: 'request', entityId: requestId, actorId: seekerId, category }, firstWave);
  }

  if (remaining.length) {
    scheduleWave({
      kind: 'request',
      entityId: requestId,
      actorId: seekerId,
      category,
      remaining,
      waveSize,
      delayMs,
    });
  }

  return { ok: true, invites: firstWave.length };
}

async function onOfferCreated(offerRow) {
  if (!offerRow) return { ok: true, invites: 0 };
  const { id: offerId, provider_id: providerId, category, lat, lng } = offerRow;
  if (!category) return { ok: true, invites: 0 };

  const activeMatches = await countActiveMatchesForProvider(providerId);
  if (activeMatches >= 1) return { ok: true, invites: 0 };

  const maxInvites = Number(AUTOMATCH_MAX_INVITES_PER_REQUEST || 6);
  const waveSize = Math.max(1, Math.min(Number(AUTOMATCH_WAVE_SIZE || 3), maxInvites));
  const delayMs = Number(AUTOMATCH_WAVE_DELAY_MINUTES || 6) * 60 * 1000;

  const seekerIds = await Promise.resolve(repo.findEligibleSeekersForCategory({
    category,
    excludeUserId: providerId,
    limit: Math.max(maxInvites * 3, 12),
  }));
  if (!seekerIds || !seekerIds.length) return { ok: true, invites: 0 };

  const scored = [];
  for (const sid of seekerIds) {
    const pendingReq = await Promise.resolve(repo.countPendingForProvider(sid));
    const pendingOff = await Promise.resolve(repo.countPendingOfferInvitesForSeeker(sid));
    const pendingAll = pendingReq + pendingOff;
    if (pendingAll >= Number(AUTOMATCH_MAX_PENDING_PER_USER || AUTOMATCH_MAX_PENDING_PER_PROVIDER || 4)) continue;

    const settings = await Promise.resolve(repo.getSettings(sid));
    if (settings && !isScheduleActive(settings)) continue;

    const cap = settings ? Number(settings.max_invites_per_day || 20) : 20;
    const tzOffset = settings ? Number(settings.tz_offset_min) : 0;
    const since = startOfLocalDayIso(Number.isFinite(tzOffset) ? tzOffset : 0);
    const today = await Promise.resolve(repo.countOfferInvitesSince(sid, since));
    if (today >= cap) continue;

    if (settings && Array.isArray(settings.seeker_categories) && settings.seeker_categories.length) {
      if (!settings.seeker_categories.includes(category)) continue;
    }

    const user = await Promise.resolve(repo.getUserBasics(sid));
    if (!user) continue;

    const exposure = await Promise.resolve(repo.getRecentExposureForSeeker(sid, Number(AUTOMATCH_FAIRNESS_WINDOW_MINUTES || 1440)));
    const dist = distanceKm(Number(lat), Number(lng), Number(user.lat), Number(user.lng));
    const score = scoreCandidate({
      distance_km: dist,
      radius_km: settings ? settings.radius_km : 5,
      rating: user.rating_avg,
      verified: !!user.is_verified,
      pendingCount: pendingAll,
      pendingCap: Number(AUTOMATCH_MAX_PENDING_PER_USER || AUTOMATCH_MAX_PENDING_PER_PROVIDER || 4),
      exposureCount: exposure && exposure.n,
      fairnessCap: Number(AUTOMATCH_FAIRNESS_MAX_EXPOSURE || 8),
      minutesSinceLast: minutesSince(exposure && exposure.last_at),
    });
    scored.push({ id: sid, score });
  }

  if (!scored.length) return { ok: true, invites: 0 };

  scored.sort((a, b) => b.score - a.score);
  const ordered = scored.slice(0, maxInvites).map(r => r.id);
  const firstWave = ordered.slice(0, waveSize);
  const remaining = ordered.slice(waveSize);

  if (firstWave.length) {
    await dispatchWave({ kind: 'offer', entityId: offerId, actorId: providerId, category }, firstWave);
  }

  if (remaining.length) {
    scheduleWave({
      kind: 'offer',
      entityId: offerId,
      actorId: providerId,
      category,
      remaining,
      waveSize,
      delayMs,
    });
  }

  return { ok: true, invites: firstWave.length };
}

async function listInvites(userId, opts) {
  const ok = await Promise.resolve(isPremiumActive(userId));
  if (!ok) throw httpError(403, 'AutoMatch es una funcion Premium');
  const asProvider = await Promise.resolve(repo.listInvitesForProvider(userId, opts));
  const asSeeker = await Promise.resolve(repo.listOfferInvitesForSeeker(userId, opts));

  const mappedProvider = (asProvider || []).map(r => ({
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
    other_verified: r.seeker_verified,
    seeker_id: r.seeker_id,
  }));

  const mappedSeeker = (asSeeker || []).map(r => ({
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
    other_verified: r.provider_verified,
    provider_id: r.provider_id,
  }));

  const all = [...mappedProvider, ...mappedSeeker];
  all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return all;
}

async function acceptInvite(inviteId, actingProviderId) {
  const premOk = await Promise.resolve(isPremiumActive(actingProviderId));
  if (!premOk) throw httpError(403, 'AutoMatch es una funcion Premium');

  const activeMatchError = 'Ya hay un servicio activo en curso';

  const invReq = await Promise.resolve(repo.getInvite(inviteId));
  if (invReq) {
    if (invReq.provider_id !== actingProviderId) throw httpError(403, 'Forbidden');
    if (invReq.status !== 'pending') throw httpError(422, `Invitacion no disponible (${invReq.status})`);
    if (new Date(invReq.expires_at).getTime() <= Date.now()) throw httpError(422, 'Invitacion caducada');

    const activeMatches = await countActiveMatchesForProvider(invReq.provider_id);
    if (activeMatches >= 1) throw httpError(409, activeMatchError);

    let req;
    if (db.isPg) {
      req = await db.one('SELECT id, status, compensation_type FROM help_requests WHERE id = $1', [invReq.request_id]);
    } else {
      req = db.prepare('SELECT id, status, compensation_type FROM help_requests WHERE id = ?').get(invReq.request_id);
    }
    if (!req) throw httpError(404, 'Solicitud no encontrada');
    if (req.status !== 'open') throw httpError(422, 'La solicitud ya no esta disponible');

    const accepted = await Promise.resolve(repo.tryAcceptInvite(inviteId));
    if (!accepted) throw httpError(422, 'Invitacion no disponible');

    await Promise.resolve(repo.expireOtherPendingForRequest(invReq.request_id, inviteId));
    try {
      const match = await matchesSvc.create({
        request_id: invReq.request_id,
        offer_id: null,
        provider_id: invReq.provider_id,
        seeker_id: invReq.seeker_id,
        points_agreed: 0,
        initiated_by: 'provider',
        compensation_type: req.compensation_type || 'cash',
      });
      return { ok: true, match };
    } catch (err) {
      try { await Promise.resolve(repo.markDeclined(inviteId)); } catch { }
      throw err;
    }
  }

  const invOffer = await Promise.resolve(repo.getOfferInvite(inviteId));
  if (!invOffer) throw httpError(404, 'Invitacion no encontrada');
  if (invOffer.seeker_id !== actingProviderId) throw httpError(403, 'Forbidden');
  if (invOffer.status !== 'pending') throw httpError(422, `Invitacion no disponible (${invOffer.status})`);
  if (new Date(invOffer.expires_at).getTime() <= Date.now()) throw httpError(422, 'Invitacion caducada');

  const activeMatchesOff = await countActiveMatchesForProvider(invOffer.provider_id);
  if (activeMatchesOff >= 1) throw httpError(409, activeMatchError);

  let off;
  if (db.isPg) {
    off = await db.one('SELECT id, status, compensation_type FROM service_offers WHERE id = $1', [invOffer.offer_id]);
  } else {
    off = db.prepare('SELECT id, status, compensation_type FROM service_offers WHERE id = ?').get(invOffer.offer_id);
  }
  if (!off) throw httpError(404, 'Oferta no encontrada');
  if (off.status !== 'active') throw httpError(422, 'La oferta ya no esta disponible');

  const acceptedOffer = await Promise.resolve(repo.tryAcceptOfferInvite(inviteId));
  if (!acceptedOffer) throw httpError(422, 'Invitacion no disponible');

  await Promise.resolve(repo.expireOtherPendingForOffer(invOffer.offer_id, inviteId));
  try {
    const match2 = await matchesSvc.create({
      request_id: null,
      offer_id: invOffer.offer_id,
      provider_id: invOffer.provider_id,
      seeker_id: invOffer.seeker_id,
      points_agreed: 0,
      initiated_by: 'seeker',
      compensation_type: off.compensation_type || 'cash',
    });
    return { ok: true, match: match2 };
  } catch (err) {
    try { await Promise.resolve(repo.markOfferDeclined(inviteId)); } catch { }
    throw err;
  }
}

async function declineInvite(inviteId, actingProviderId) {
  const premOk = await Promise.resolve(isPremiumActive(actingProviderId));
  if (!premOk) throw httpError(403, 'AutoMatch es una funcion Premium');

  const invReq = await Promise.resolve(repo.getInvite(inviteId));
  if (invReq) {
    if (invReq.provider_id !== actingProviderId) throw httpError(403, 'Forbidden');
    if (invReq.status !== 'pending') throw httpError(422, `Invitacion no disponible (${invReq.status})`);
    await Promise.resolve(repo.markDeclined(inviteId));
    return { ok: true };
  }
  const invOff = await Promise.resolve(repo.getOfferInvite(inviteId));
  if (!invOff) throw httpError(404, 'Invitacion no encontrada');
  if (invOff.seeker_id !== actingProviderId) throw httpError(403, 'Forbidden');
  if (invOff.status !== 'pending') throw httpError(422, `Invitacion no disponible (${invOff.status})`);
  await Promise.resolve(repo.markOfferDeclined(inviteId));
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
