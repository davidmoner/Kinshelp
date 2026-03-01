'use strict';
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('./points.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();

// Specific limiter for public leaderboard (extra protection over global limiter)
const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Own ledger
router.get('/me', authenticate, ctrl.getMyPoints);
// Any user's ledger (admin or public – tighten as needed)
router.get('/user/:userId', authenticate, ctrl.getUserPoints);

// Public leaderboard (top neighbors)
router.get('/leaderboard', leaderboardLimiter, authenticate, ctrl.leaderboard);

// Authenticated: get my rank in scope
router.get('/leaderboard/me', authenticate, ctrl.leaderboardMe);

module.exports = router;
