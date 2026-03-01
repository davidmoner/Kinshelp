'use strict';
const svc = require('./automatch.service');
const httpError = require('../../shared/http-error');

function validateSettings(body) {
  const out = {};
  if (!body || typeof body !== 'object') throw httpError(400, 'Invalid body');
  if (body.enabled !== undefined) out.enabled = !!body.enabled;
  if (body.seeker_enabled !== undefined) out.seeker_enabled = !!body.seeker_enabled;
  if (body.radius_km !== undefined) out.radius_km = Math.max(1, Math.min(30, Number(body.radius_km) || 5));
  if (body.max_invites_per_day !== undefined) out.max_invites_per_day = Math.max(5, Math.min(100, Number(body.max_invites_per_day) || 25));
  if (body.quiet_start !== undefined) out.quiet_start = body.quiet_start ? String(body.quiet_start) : null;
  if (body.quiet_end !== undefined) out.quiet_end = body.quiet_end ? String(body.quiet_end) : null;
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
