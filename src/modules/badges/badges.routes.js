'use strict';
const { Router } = require('express');
const ctrl = require('./badges.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();

router.get('/', authenticate, ctrl.listAll);
router.get('/mine', authenticate, ctrl.listMine);
router.get('/user/:userId', authenticate, ctrl.listForUser);

module.exports = router;
