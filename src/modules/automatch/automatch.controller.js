'use strict';
const svc = require('./automatch.service');
const httpError = require('../../shared/http-error');

function validateSettings(body) {
  const out = {};
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  const parseTime = (val, label) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    const str = String(val).trim();
    if (!timeRe.test(str)) throw httpError(400, `${label} debe ser HH:MM`);
    return str;
  };
  if (!body || typeof body !== 'object') throw httpError(400, 'Invalid body');
  if (body.enabled !== undefined) out.enabled = !!body.enabled;
  if (body.seeker_enabled !== undefined) out.seeker_enabled = !!body.seeker_enabled;
  if (body.radius_km !== undefined) out.radius_km = Math.max(1, Math.min(30, Number(body.radius_km) || 5));
  if (body.max_invites_per_day !== undefined) out.max_invites_per_day = Math.max(1, Math.min(20, Number(body.max_invites_per_day) || 20));
  if (body.quiet_start !== undefined) out.quiet_start = body.quiet_start ? String(body.quiet_start) : null;
  if (body.quiet_end !== undefined) out.quiet_end = body.quiet_end ? String(body.quiet_end) : null;
  if (body.automatch_mode !== undefined) {
    const mode = String(body.automatch_mode || '').trim().toLowerCase();
    if (mode !== 'simple' && mode !== 'advanced') throw httpError(400, 'automatch_mode invalido');
    out.automatch_mode = mode;
  }
  const weekdayStart = parseTime(body.weekday_start, 'weekday_start');
  const weekdayEnd = parseTime(body.weekday_end, 'weekday_end');
  const weekendStart = parseTime(body.weekend_start, 'weekend_start');
  const weekendEnd = parseTime(body.weekend_end, 'weekend_end');
  if (weekdayStart !== undefined) out.weekday_start = weekdayStart;
  if (weekdayEnd !== undefined) out.weekday_end = weekdayEnd;
  if (weekendStart !== undefined) out.weekend_start = weekendStart;
  if (weekendEnd !== undefined) out.weekend_end = weekendEnd;
  if (body.tz_offset_min !== undefined) {
    const v = Number(body.tz_offset_min);
    if (!Number.isFinite(v)) throw httpError(400, 'tz_offset_min invalido');
    out.tz_offset_min = Math.max(-720, Math.min(840, Math.trunc(v)));
  }
  if (body.categories !== undefined) {
    if (!Array.isArray(body.categories)) throw httpError(400, 'categories must be an array');
    out.categories = body.categories.map(String);
  }
  if (body.seeker_categories !== undefined) {
    if (!Array.isArray(body.seeker_categories)) throw httpError(400, 'seeker_categories must be an array');
    out.seeker_categories = body.seeker_categories.map(String);
  }
  return out;
}

const getSettings = (req, res, next) => {
  (async () => {
    res.json(await svc.getSettings(req.user.id));
  })().catch(next);
};

const updateSettings = (req, res, next) => {
  (async () => {
    res.json(await svc.updateSettings(req.user.id, validateSettings(req.body)));
  })().catch(next);
};

const listInvites = (req, res, next) => {
  (async () => {
    const { status, limit = 20, offset = 0 } = req.query;
    res.json({ data: await svc.listInvites(req.user.id, { status, limit: +limit, offset: +offset }) });
  })().catch(next);
};

const acceptInvite = (req, res, next) => {
  (async () => {
    res.json(await svc.acceptInvite(req.params.id, req.user.id));
  })().catch(next);
};

const declineInvite = (req, res, next) => {
  (async () => {
    res.json(await svc.declineInvite(req.params.id, req.user.id));
  })().catch(next);
};

module.exports = { getSettings, updateSettings, listInvites, acceptInvite, declineInvite };
