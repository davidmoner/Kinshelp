'use strict';
const express = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireAdmin } = require('../../middleware/admin.middleware');
const controller = require('./admin.controller');

const r = express.Router();

// All admin routes require auth + admin.
r.use(authenticate, requireAdmin);

r.get('/me', controller.me);
r.get('/stats/overview', controller.overview);

// Activity
r.get('/events', controller.listEvents);

// Moderation
r.get('/reports', controller.listReports);
r.post('/reports', controller.createReport);
r.post('/reports/:id/resolve', controller.resolveReport);

// Users
r.get('/users', controller.listUsers);
r.get('/users/:id', controller.getUser);
r.patch('/users/:id', controller.patchUser);
r.post('/users/:id/ban', controller.banUser);
r.post('/users/:id/unban', controller.unbanUser);

// Audit log
r.get('/audit', controller.listAudit);

// Config
r.get('/config', controller.getConfig);
r.patch('/config', controller.patchConfig);

module.exports = r;
