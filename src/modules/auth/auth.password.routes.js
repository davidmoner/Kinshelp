'use strict';
const { Router } = require('express');
const ctrl = require('./auth.password.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();

router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.post('/verify-email', ctrl.verifyEmail);
router.get('/verify-email', ctrl.verifyEmailGet);
router.post('/request-verify-email', authenticate, ctrl.requestVerifyEmail);

module.exports = router;
