'use strict';
const db = require('../../config/db');
const repo = require('./feed.repo');

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function listFeedForUser(userId, opts) {
  let me = null;
  if (userId) {
    me = db.isPg
      ? await db.one('SELECT lat, lng FROM users WHERE id = $1', [userId])
      : db.prepare('SELECT lat, lng FROM users WHERE id = ?').get(userId);
  }
  const rows = await repo.listFeed(opts);
  const hasMe = me && me.lat != null && me.lng != null;
  return rows.map(r => {
    const hasItem = r.lat != null && r.lng != null;
    const distance_km = (hasMe && hasItem) ? Math.round(haversineKm(me.lat, me.lng, r.lat, r.lng) * 10) / 10 : null;
    const premium = r.user_tier && r.user_tier !== 'free';
    return { ...r, distance_km, premium_user: !!premium };
  });
}

module.exports = { listFeedForUser };
