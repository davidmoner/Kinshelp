'use strict';
const express = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const controller = require('./favorites.controller');

const r = express.Router();

r.use(authenticate);

r.get('/', controller.list);
r.post('/', controller.add);
r.delete('/', controller.remove);

module.exports = r;
