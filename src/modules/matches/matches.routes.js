'use strict';
const { Router } = require('express');
const ctrl = require('./matches.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();

router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, ctrl.create);
router.get('/:id', authenticate, ctrl.getOne);
router.get('/:id/messages', authenticate, ctrl.listMessages);
router.post('/:id/messages', authenticate, ctrl.postMessage);
router.patch('/:id/agreement', authenticate, ctrl.setAgreement);
router.patch('/:id/status', authenticate, ctrl.changeStatus);
router.post('/:id/ratings', authenticate, ctrl.submitRating);

module.exports = router;
