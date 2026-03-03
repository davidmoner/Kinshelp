'use strict';
const { Router } = require('express');
const ctrl = require('./config.controller');

const router = Router();
router.get('/', ctrl.getPublicConfig);

module.exports = router;
