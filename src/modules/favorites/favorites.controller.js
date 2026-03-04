'use strict';
const httpError = require('../../shared/http-error');
const repo = require('./favorites.repo');

function list(req, res, next) {
  Promise.resolve((async () => {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '50', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
    const rows = await repo.listFavorites({ userId: req.user.id, limit, offset });
    res.json({ data: rows });
  })()).catch(next);
}

function add(req, res, next) {
  Promise.resolve((async () => {
    const targetType = String((req.body && req.body.target_type) || '').toLowerCase();
    const targetId = String((req.body && req.body.target_id) || '').trim();
    if (!targetType || !targetId) throw httpError(422, 'target_type and target_id are required');
    if (targetType !== 'request' && targetType !== 'offer') throw httpError(422, 'target_type must be request or offer');
    const exists = await repo.findTarget({ targetType, targetId });
    if (!exists) throw httpError(404, 'Target not found');
    const out = await repo.addFavorite({ userId: req.user.id, targetType, targetId });
    res.status(201).json({ ok: true, ...out });
  })()).catch(next);
}

function remove(req, res, next) {
  Promise.resolve((async () => {
    const targetType = String(req.query.target_type || '').toLowerCase();
    const targetId = String(req.query.target_id || '').trim();
    if (!targetType || !targetId) throw httpError(422, 'target_type and target_id are required');
    if (targetType !== 'request' && targetType !== 'offer') throw httpError(422, 'target_type must be request or offer');
    const out = await repo.removeFavorite({ userId: req.user.id, targetType, targetId });
    res.json(out);
  })()).catch(next);
}

module.exports = { list, add, remove };
