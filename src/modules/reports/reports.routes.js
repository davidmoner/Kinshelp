'use strict';
const router = require('express').Router();
const { authenticate } = require('../../middleware/auth.middleware');
const repo = require('../admin/admin.reports.repo');
const httpError = require('../../shared/http-error');

const VALID_TYPES = ['user', 'offer', 'request', 'match'];
const VALID_REASONS = ['spam', 'scam', 'abuse', 'inappropriate', 'other'];

router.post('/', authenticate, (req, res, next) => {
  (async () => {
    const { target_type, target_id, reason } = req.body || {};
    if (!target_type || !VALID_TYPES.includes(target_type)) throw httpError(400, 'target_type inválido');
    if (!target_id) throw httpError(400, 'target_id requerido');
    if (!reason || !VALID_REASONS.includes(reason)) throw httpError(400, 'reason inválido');
    const result = await Promise.resolve(
      repo.createReport({ reporterId: req.user.id, targetType: target_type, targetId: target_id, reason })
    );
    res.status(201).json({ ok: true, id: result.id });
  })().catch(next);
});

module.exports = router;
