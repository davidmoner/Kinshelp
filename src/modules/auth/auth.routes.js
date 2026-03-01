'use strict';
const { Router } = require('express');
const ctrl = require('./auth.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', authenticate, ctrl.me);
router.patch('/me', authenticate, ctrl.updateMe);

module.exports = router;
