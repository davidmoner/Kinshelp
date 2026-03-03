'use strict';
const { Router } = require('express');
const ctrl = require('./stats.controller');

const router = Router();
router.get('/', ctrl.getStats);

module.exports = router;
