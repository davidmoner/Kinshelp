'use strict';
const { Router } = require('express');
const ctrl = require('./auth.oauth.controller');

const router = Router();

router.post('/google', ctrl.google);
router.post('/facebook', ctrl.facebook);

module.exports = router;
