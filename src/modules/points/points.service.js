'use strict';
const db = require('../../config/db');
const httpError = require('../../shared/http-error');
const repo = require('./points.repo');
const lb = require('./points.leaderboard');
const { LEDGER_REASON } = require('../../config/constants');

// In-memory cache for public leaderboard (short TTL).
// Avoids repeated SQLite scans when multiple clients refresh at once.
const LB_CACHE = new Map();
const LB_CACHE_TTL_MS = 15 * 1000;
const LB_CACHE_MAX = 200;

function normalizeLbKey(opts) {
    const o = opts || {};
    const keyObj = {
        limit: Number.isFinite(+o.limit) ? Math.trunc(+o.limit) : undefined,
        offset: Number.isFinite(+o.offset) ? Math.trunc(+o.offset) : undefined,
        lat: (o.lat === undefined ? undefined : +o.lat),
        lng: (o.lng === undefined ? undefined : +o.lng),
        radius_km: (o.radius_km === undefined ? undefined : +o.radius_km),
        sort: (o.sort === undefined ? undefined : String(o.sort)),
        min_level: (o.min_level === undefined ? undefined : String(o.min_level)),
        q: (o.q === undefined ? undefined : String(o.q)),
    };
    return JSON.stringify(keyObj);
}

function getCachedLb(key) {
    const hit = LB_CACHE.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
        LB_CACHE.delete(key);
        return null;
    }
    return hit.value;
}

function setCachedLb(key, value) {
    if (LB_CACHE.size >= LB_CACHE_MAX) {
        // Simple prune: drop oldest-ish by iterating insertion order.
        const firstKey = LB_CACHE.keys().next().value;
        if (firstKey) LB_CACHE.delete(firstKey);
    }
    LB_CACHE.set(key, { value, expiresAt: Date.now() + LB_CACHE_TTL_MS });
}

async function transfer({ matchId, fromUserId, toUserId, amount }) {
    if (!amount || amount <= 0) return;
    if (db.isPg) {
        const balance = await repo.getBalance(fromUserId);
        if (balance < amount) throw httpError(422, 'Insufficient points balance');
        const now = new Date().toISOString();
        // Best-effort (phase 1): no explicit tx wrapper yet.
        await repo.debit(fromUserId, amount, matchId, LEDGER_REASON.MATCH_COMPLETED, now);
        await repo.credit(toUserId, amount, matchId, LEDGER_REASON.MATCH_COMPLETED, now);
        return;
    }

    db.transaction(() => {
        const balance = repo.getBalance(fromUserId);
        if (balance < amount) throw httpError(422, 'Insufficient points balance');
        const now = new Date().toISOString();
        repo.debit(fromUserId, amount, matchId, LEDGER_REASON.MATCH_COMPLETED, now);
        repo.credit(toUserId, amount, matchId, LEDGER_REASON.MATCH_COMPLETED, now);
    })();
}

async function award({ userId, amount, reason = LEDGER_REASON.MATCH_COMPLETED, matchId = null, forceLedger = false }) {
    const n = Number(amount || 0);
    if (n <= 0 && !forceLedger) return repo.getBalance(userId);
    const now = new Date().toISOString();
    return repo.credit(userId, Math.max(0, n), matchId, reason, now);
}

async function grant({ userId, amount, reason = LEDGER_REASON.ADMIN_GRANT, matchId = null }) {
    const now = new Date().toISOString();
    return repo.credit(userId, amount, matchId, reason, now);
}

async function getLedger(userId, opts) {
    return { balance: await repo.getBalance(userId), ledger: await repo.ledger(userId, opts || {}) };
}

async function leaderboard(opts) {
    const key = normalizeLbKey(opts);
    const cached = getCachedLb(key);
    if (cached) return cached;
    const out = await lb.getLeaderboardResult(opts);
    setCachedLb(key, out);
    return out;
}

async function leaderboardMe(userId, opts) {
    const rows = await lb.getSortedUsers(opts);
    const idx = rows.findIndex(r => r.id === userId);
    if (idx < 0) return { me: null, rank: null, total: rows.length };
    return { me: rows[idx], rank: idx + 1, total: rows.length };
}

module.exports = { transfer, award, grant, getLedger, leaderboard, leaderboardMe };
