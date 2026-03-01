'use strict';
const { Router } = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl = require('./notifications.controller');

const router = Router();
router.get('/', authenticate, ctrl.list);
router.patch('/:id/read', authenticate, ctrl.markRead);

module.exports = router;
