'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { errorHandler, notFound } = require('./middleware/error.middleware');

const app = express();
app.disable('x-powered-by');

// Stripe webhooks require raw body for signature verification.
app.use((req, res, next) => {
  const url = String(req.originalUrl || req.url || '');
  if (url.startsWith('/api/v1/premium/webhook')) return next();
  return express.json({ limit: '64kb' })(req, res, next);
});

// Static uploads (photos). Stored locally for MVP.
// In production, mount a persistent disk and set DATA_DIR so uploads survive deploys.
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '..');
const uploadsDir = path.resolve(dataDir, 'uploads');
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch { }
app.use('/uploads', express.static(uploadsDir, {
  fallthrough: false,
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=604800');
  },
}));

const defaultCors = [
  // Local frontend dev servers
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Backend-served frontend (this app)
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const corsOriginsEnv = process.env.CORS_ORIGINS;
const allowedOrigins = (corsOriginsEnv || defaultCors.join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isLocalhostOrigin(origin) {
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Dev ergonomics: if CORS_ORIGINS is not set, allow any localhost port.
    if (!corsOriginsEnv && process.env.NODE_ENV !== 'production' && isLocalhostOrigin(origin)) return cb(null, true);
    // Dev ergonomics: if CORS_ORIGINS is not set, allow any origin (useful for LAN testing).
    if (!corsOriginsEnv && process.env.NODE_ENV !== 'production') return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.options('*', cors());

app.use(helmet());
app.set('trust proxy', 1);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'KingsHelp API', ts: new Date().toISOString() });
});

const api = express.Router();
api.get('/', (req, res) => res.json({ ok: true, service: 'KingsHelp API', version: 'v1' }));

// Raw body route (Stripe webhook)
api.use('/premium/webhook', express.raw({ type: '*/*', limit: '2mb' }), (req, res, next) => {
  req.rawBody = req.body;
  // express.raw sets req.body to Buffer; leave it for stripe.
  next();
});

// JSON for all other API routes
api.use(express.json({ limit: '64kb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
api.use('/auth', authLimiter, require('./modules/auth/auth.routes'));
api.use('/users', require('./modules/users/users.routes'));
api.use('/offers', require('./modules/offers/offers.routes'));
api.use('/requests', require('./modules/requests/requests.routes'));
api.use('/matches', require('./modules/matches/matches.routes'));
api.use('/points', require('./modules/points/points.routes'));
api.use('/badges', require('./modules/badges/badges.routes'));
api.use('/premium', require('./modules/premium/premium.routes'));
api.use('/automatch', require('./modules/automatch/automatch.routes'));
api.use('/feed', require('./modules/feed/feed.routes'));
api.use('/notifications', require('./modules/notifications/notifications.routes'));

app.use('/api/v1', api);

// Serve the frontend (single-page) from /web
const webDir = path.resolve(__dirname, '../web');
app.use('/', express.static(webDir));
app.get('/', (req, res) => res.sendFile(path.join(webDir, 'index.html')));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
