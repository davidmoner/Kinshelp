'use strict';
const { Router } = require('express');
const ctrl = require('./premium.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();

router.get('/plans', ctrl.getPlans);
router.post('/checkout', authenticate, ctrl.checkout);
router.post('/webhook', ctrl.webhook);
router.get('/eligibility', authenticate, ctrl.eligibility);
router.post('/unlock', authenticate, ctrl.unlockByReputation);

module.exports = router;
