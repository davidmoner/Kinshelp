'use strict';
const { Router } = require('express');
const { optionalAuth } = require('../../middleware/auth.middleware');
const ctrl = require('./feed.controller');

const router = Router();
// Public feed (auth optional). If user is logged in, controller can compute distances.
router.get('/', optionalAuth, ctrl.list);
module.exports = router;
