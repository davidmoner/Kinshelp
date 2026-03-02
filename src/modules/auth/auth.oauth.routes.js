'use strict';
const { Router } = require('express');
const ctrl = require('./auth.oauth.controller');

const router = Router();

router.post('/google', ctrl.google);
router.post('/facebook', ctrl.facebook);

// Authorization code callback endpoints for web flows (build redirect with PUBLIC_BASE_URL)
router.get('/google/callback', ctrl.googleCallback);
router.get('/facebook/callback', ctrl.facebookCallback);

module.exports = router;
