'use strict';
const { Router } = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl = require('./automatch.controller');

const router = Router();

router.get('/settings', authenticate, ctrl.getSettings);
router.put('/settings', authenticate, ctrl.updateSettings);

router.get('/invites', authenticate, ctrl.listInvites);
router.post('/invites/:id/accept', authenticate, ctrl.acceptInvite);
router.post('/invites/:id/decline', authenticate, ctrl.declineInvite);

module.exports = router;
