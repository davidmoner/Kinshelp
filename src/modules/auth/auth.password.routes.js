'use strict';
const { Router } = require('express');
const ctrl = require('./auth.password.controller');

const router = Router();

router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.post('/verify-email', ctrl.verifyEmail);

module.exports = router;
