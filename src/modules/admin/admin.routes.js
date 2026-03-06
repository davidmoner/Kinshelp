'use strict';
const express = require('express');
const { requireAdminAuth } = require('../../middleware/admin-auth.middleware');
const rateLimit = require('express-rate-limit');
const controller = require('./admin.controller');
const authController = require('./admin.auth.controller');

const r = express.Router();

// Admin auth
const adminAuthLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
r.post('/auth/login', adminAuthLimiter, authController.login);
r.get('/auth/me', requireAdminAuth, authController.me);
r.post('/auth/logout', requireAdminAuth, authController.logout);

// All admin routes require admin auth.
r.use(requireAdminAuth);

r.get('/me', controller.me);
r.get('/stats/overview', controller.overview);
r.get('/overview', controller.overview);

// Activity
r.get('/events', controller.listEvents);
r.get('/activity', controller.listEvents);

// Moderation
r.get('/reports', controller.listReports);
r.get('/moderation', controller.listReports);
r.post('/reports', controller.createReport);
r.post('/reports/:id/resolve', controller.resolveReport);
r.post('/reports/:id/hide', controller.hideReportTarget);
r.post('/reports/:id/unhide', controller.unhideReportTarget);

// Users
r.get('/users', controller.listUsers);
r.get('/creations', controller.listCreations);
r.get('/requests', controller.listRequests);
r.get('/offers', controller.listOffers);
r.get('/matches', controller.listMatches);
r.get('/creations/:id', controller.getCreationDetail);
r.patch('/creations/:id', controller.patchCreation);
r.get('/requests/:id', controller.getRequestDetail);
r.get('/offers/:id', controller.getOfferDetail);
r.get('/matches/:id', controller.getMatchDetail);
r.post('/users/:id/reset-points', controller.resetPoints);
r.post('/users/:id/points', controller.setPoints);
r.post('/users/:id/gdpr/export', controller.gdprExport);
r.post('/users/:id/gdpr/delete', controller.gdprDelete);
r.post('/:type/:id/hide', controller.hideContent);
r.post('/:type/:id/unhide', controller.unhideContent);
r.get('/users/:id', controller.getUser);
r.get('/users/:id/detail', controller.getUserDetail);
r.patch('/users/:id', controller.patchUser);
r.post('/users/:id/ban', controller.banUser);
r.post('/users/:id/unban', controller.unbanUser);
r.post('/users/:id/suspend', controller.banUser);
r.post('/users/:id/unsuspend', controller.unbanUser);
r.post('/users/:id/reset-cooldowns', controller.resetCooldowns);

// Audit log
r.get('/audit', controller.listAudit);

// Config
r.get('/config', controller.getConfig);
r.patch('/config', controller.patchConfig);

module.exports = r;
