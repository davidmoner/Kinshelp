'use strict';
const db = require('../../config/database');

function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLng / 2) ** 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function sanitizePublicUser(u) {
  if (!u) return u;
  // Do not expose exact coordinates in public ranking.
  const { lat, lng, ...rest } = u;
  return rest;
}

function minRepForLevel(level) {
  const l = String(level || '').toLowerCase();
  if (!l || l === 'all') return null;
  if (l === 'incept') return 0;
  if (l === 'bronce' || l === 'bronze') return 100;
  if (l === 'plata' || l === 'silver') return 250;
  if (l === 'oro' || l === 'gold') return 500;
  if (l === 'leyenda' || l === 'legend') return 1000;
  return null;
}

function getSortedUsers({
  lat,
  lng,
  radius_km,
  sort,
  min_level,
  q,
} = {}) {
  const rows = db.prepare(`
    SELECT
      u.id,
      u.display_name,
      u.avatar_url,
      u.location_text,
      u.lat,
      u.lng,
      u.points_balance,
      u.rating_avg,
      u.rating_count,
      u.premium_tier,
      COUNT(ub.id) AS badge_count
    FROM users u
    LEFT JOIN user_badges ub ON ub.user_id = u.id
    GROUP BY u.id
  `).all();

  const hasOrigin = Number.isFinite(+lat) && Number.isFinite(+lng);
  const hasRadius = Number.isFinite(+radius_km);
  const rKm = Math.max(0.2, Math.min(50, Number(radius_km || 0)));

  let filtered = rows;

  const qn = String(q || '').trim().toLowerCase();
  if (qn) {
    filtered = filtered.filter(u => {
      const name = String(u.display_name || '').toLowerCase();
      const loc = String(u.location_text || '').toLowerCase();
      return name.includes(qn) || loc.includes(qn);
    });
  }

  const minRep = minRepForLevel(min_level);
  if (minRep !== null) {
    filtered = filtered.filter(u => Number(u.points_balance || 0) >= minRep);
  }

  if (hasOrigin) {
    const aLat = Number(lat);
    const aLng = Number(lng);
    filtered = rows.map(u => {
      if (!Number.isFinite(+u.lat) || !Number.isFinite(+u.lng)) return u;
      return { ...u, distance_km: haversineKm(aLat, aLng, Number(u.lat), Number(u.lng)) };
    });
    if (hasRadius) {
      filtered = filtered
        .filter(u => Number.isFinite(+u.distance_km))
        .filter(u => u.distance_km <= rKm);
    }
  }

  const s = String(sort || '').toLowerCase();
  const sortByDistance = s === 'distance' && hasOrigin;

  filtered.sort((a, b) => {
    if (sortByDistance) {
      const ad = Number(a.distance_km);
      const bd = Number(b.distance_km);
      const aHas = Number.isFinite(ad);
      const bHas = Number.isFinite(bd);
      if (aHas && bHas) {
        const d = ad - bd;
        if (d) return d;
      } else if (aHas !== bHas) {
        return aHas ? -1 : 1;
      }
    }

    const bc = (Number(b.badge_count || 0) - Number(a.badge_count || 0));
    if (bc) return bc;
    const rp = (Number(b.points_balance || 0) - Number(a.points_balance || 0));
    if (rp) return rp;
    const ra = (Number(b.rating_avg || 0) - Number(a.rating_avg || 0));
    if (ra) return ra;

    if (hasOrigin) {
      const ad = Number(a.distance_km);
      const bd = Number(b.distance_km);
      if (Number.isFinite(ad) && Number.isFinite(bd)) {
        const d = ad - bd;
        if (d) return d;
      }
    }

    const n = String(a.display_name || '').localeCompare(String(b.display_name || ''));
    if (n) return n;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  return filtered.map(u => {
    if (u.distance_km === undefined) return u;
    return { ...u, distance_km: Math.round(Number(u.distance_km) * 10) / 10 };
  });
}

function getLeaderboardResult({
  limit = 10,
  offset = 0,
  lat,
  lng,
  radius_km,
  sort,
  min_level,
  q,
} = {}) {
  const lim = clampInt(limit, 1, 50, 10);
  const off = clampInt(offset, 0, 1_000_000, 0);

  const all = getSortedUsers({ lat, lng, radius_km, sort, min_level, q });
  const total = all.length;
  const data = all.slice(off, off + lim).map(sanitizePublicUser);
  return {
    data,
    meta: {
      limit: lim,
      offset: off,
      total,
      has_more: (off + lim) < total,
    },
  };
}

function getLeaderboard({
  limit = 10,
  offset = 0,
  lat,
  lng,
  radius_km,
  sort,
} = {}) {
  return getLeaderboardResult({ limit, offset, lat, lng, radius_km, sort }).data;
}

module.exports = { getLeaderboard, getLeaderboardResult, getSortedUsers };
