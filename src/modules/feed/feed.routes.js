'use strict';
const { Router } = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl = require('./feed.controller');

const router = Router();
router.get('/', authenticate, ctrl.list);
module.exports = router;
