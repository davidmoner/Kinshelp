'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');
const env = require('./config/env');
const db = require('./config/db');
const { verifyAdminRequest } = require('./middleware/admin-auth.middleware');

const { errorHandler, notFound } = require('./middleware/error.middleware');

const app = express();

// Security headers
// Note: CSP is relaxed because the static landing uses inline scripts/handlers.
app.use(helmet({
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
}));
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
  // Production
  'https://kingshelp.es',
  'https://www.kingshelp.es',
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

// CSP (hardened): inline handlers removed; allow only hashed inline scripts (JSON-LD + admin bundle).
const cspScriptHashes = [
  "'sha256-SXk7z1QIWnFhmfe1L3zWbBaoIOoy8eRqkbIL09e/eVk='",
  "'sha256-o5jUa2287/3qNrLao2K53IA9k0M3fu/1sqSLdPpmHK4='",
  "'sha256-YQpG8tDKHvf0v0iZSC0Ogp2tLbCPTGBkXaTzbSAmrKs='",
];

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", ...cspScriptHashes],
      'script-src-elem': ["'self'", ...cspScriptHashes],
      'script-src-attr': ["'none'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", 'https:'],
    },
  },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 15552000, includeSubDomains: true, preload: true } : false,
}));
app.set('trust proxy', 1);

// Rate limit: keep API protected, avoid breaking static assets.
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

// Request ID + lightweight structured logging
app.use((req, res, next) => {
  const inbound = req.headers['x-request-id'];
  const requestId = inbound ? String(inbound) : randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    const durationMs = Date.now() - start;
    const entry = {
      ts: new Date().toISOString(),
      request_id: requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      ms: durationMs,
      user_id: req.user && req.user.id ? req.user.id : null,
    };
    try { console.log(JSON.stringify(entry)); } catch { }
  });
  next();
});

async function checkDb() {
  if (db.isPg) {
    await db.one('SELECT 1 AS ok', []);
    return { ok: true, type: 'postgres' };
  }
  // SQLite
  db.prepare('SELECT 1 AS ok').get();
  return { ok: true, type: 'sqlite' };
}

async function healthPayload() {
  let dbStatus = { ok: false, type: db.isPg ? 'postgres' : 'sqlite' };
  try { dbStatus = await checkDb(); } catch (e) { dbStatus = { ok: false, type: db.isPg ? 'postgres' : 'sqlite', error: e && e.message ? e.message : String(e) }; }
  const emailConfigured = !!(env.EMAIL_PROVIDER && env.MAIL_FROM && (env.EMAIL_PROVIDER !== 'sendgrid' || env.SENDGRID_API_KEY));
  const oauthGoogle = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const oauthFacebook = !!(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
  return {
    status: 'ok',
    service: 'KingsHelp API',
    ts: new Date().toISOString(),
    db: dbStatus,
    email: { provider: env.EMAIL_PROVIDER || null, configured: emailConfigured },
    oauth: { google_configured: oauthGoogle, facebook_configured: oauthFacebook },
  };
}

app.get('/health', (req, res) => {
  healthPayload()
    .then(payload => res.json(payload))
    .catch(() => res.status(500).json({ status: 'error', service: 'KingsHelp API' }));
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

// Convenience: allow API health checks via /api/v1/health
api.get('/health', (req, res) => {
  healthPayload()
    .then(payload => res.json({ ...payload, version: 'v1' }))
    .catch(() => res.status(500).json({ status: 'error', service: 'KingsHelp API', version: 'v1' }));
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
api.use('/auth', authLimiter, require('./modules/auth/auth.routes'));
api.use('/users', require('./modules/users/users.routes'));
api.use('/offers', require('./modules/offers/offers.routes'));
api.use('/requests', require('./modules/requests/requests.routes'));
api.use('/matches', require('./modules/matches/matches.routes'));
api.use('/favorites', require('./modules/favorites/favorites.routes'));
api.use('/points', require('./modules/points/points.routes'));
api.use('/badges', require('./modules/badges/badges.routes'));
api.use('/premium', require('./modules/premium/premium.routes'));
api.use('/automatch', require('./modules/automatch/automatch.routes'));
api.use('/feed', require('./modules/feed/feed.routes'));
api.use('/config', require('./modules/config/config.routes'));
api.use('/stats', require('./modules/stats/stats.routes'));
api.use('/notifications', require('./modules/notifications/notifications.routes'));
api.use('/reports', require('./modules/reports/reports.routes'));

// Admin (protected by admin auth)
api.use('/admin', adminLimiter, require('./modules/admin/admin.routes'));

app.use('/api/v1', apiLimiter, api);

// Serve only public static assets (avoid exposing repo root).
// Keep the set tight: landing, web SPA pages, legal, admin, and assets.
const publicRoot = path.resolve(__dirname, '..');
const CACHE_ASSET = 'public, max-age=604800, stale-while-revalidate=86400';
const CACHE_HTML = 'no-cache';

function applyStaticHeaders(res, filePath) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.html' || ext === '.json' || ext === '.webmanifest') {
    const isAdmin = String(filePath || '').includes(`${path.sep}admin${path.sep}`);
    res.setHeader('Cache-Control', isAdmin ? 'no-store' : CACHE_HTML);
    return;
  }
  res.setHeader('Cache-Control', CACHE_ASSET);
}

const staticOpts = {
  fallthrough: false,
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    applyStaticHeaders(res, filePath);
  },
};

app.use('/web', express.static(path.join(publicRoot, 'web'), staticOpts));
app.use('/legal', express.static(path.join(publicRoot, 'legal'), staticOpts));
app.use('/img', express.static(path.join(publicRoot, 'img'), staticOpts));
app.get('/admin/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return sendStaticFile(res, 'admin/index.html');
});

async function adminGate(req, res, next) {
  if (req.path === '/login' || req.path === '/login/') return next();
  const admin = await verifyAdminRequest(req);
  if (!admin) return res.redirect(302, '/admin/login');
  return next();
}

app.use('/admin', adminGate, express.static(path.join(publicRoot, 'admin'), staticOpts));
app.use('/css', express.static(path.join(publicRoot, 'css'), staticOpts));
app.use('/js', express.static(path.join(publicRoot, 'js'), staticOpts));
app.use('/.well-known', express.static(path.join(publicRoot, '.well-known'), staticOpts));

function sendStaticFile(res, relPath) {
  const p = path.join(publicRoot, relPath);
  if (!fs.existsSync(p)) return res.status(404).end();
  applyStaticHeaders(res, p);
  return res.sendFile(p);
}

app.get('/robots.txt', (req, res) => sendStaticFile(res, 'robots.txt'));
app.get('/sitemap.xml', (req, res) => sendStaticFile(res, 'sitemap.xml'));
app.get('/site.webmanifest', (req, res) => sendStaticFile(res, 'site.webmanifest'));
app.get('/favicon.svg', (req, res) => sendStaticFile(res, 'favicon.svg'));
app.get('/favicon.ico', (req, res) => res.redirect(302, '/favicon.svg'));
app.get('/index.html', (req, res) => sendStaticFile(res, 'index.html'));

// Best-effort SPA entrypoint: only serve index.html if it exists.
// In some deployments the frontend may not be bundled; avoid ENOENT.
app.get('/', (req, res, next) => {
  const p = path.join(publicRoot, 'index.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return next();
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
