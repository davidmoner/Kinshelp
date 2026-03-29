'use strict';
/**
 * Migration — idempotent (IF NOT EXISTS everywhere).
 * Run: npm run migrate
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const db = require('../config/database');

db.exec(`
  -- ── Users ─────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    display_name   TEXT NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    password_hash  TEXT,
    avatar_url     TEXT,
    bio            TEXT,
    location_text  TEXT,
    lat            REAL,
    lng            REAL,
    points_balance INTEGER NOT NULL DEFAULT 0,
    rating_avg     REAL    NOT NULL DEFAULT 0.0,
    rating_count   INTEGER NOT NULL DEFAULT 0,
    premium_tier   TEXT    NOT NULL DEFAULT 'free',
    premium_until  TEXT,
    is_verified    INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── Service Offers ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS service_offers (
    id            TEXT PRIMARY KEY,
    provider_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT,
    category      TEXT NOT NULL,
    points_value  INTEGER NOT NULL,
    media_urls    TEXT NOT NULL DEFAULT '[]',
    location_text TEXT,
    lat           REAL,
    lng           REAL,
    expires_at    TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active',
    is_hidden     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── Help Requests ─────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS help_requests (
    id             TEXT PRIMARY KEY,
    seeker_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    description    TEXT,
    category       TEXT NOT NULL,
    points_offered INTEGER NOT NULL,
    media_urls     TEXT NOT NULL DEFAULT '[]',
    location_text  TEXT,
    when_text      TEXT NOT NULL DEFAULT 'asap',
    lat            REAL,
    lng            REAL,
    expires_at     TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'open',
    is_hidden      INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── Matches ───────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS matches (
    id               TEXT PRIMARY KEY,
    offer_id         TEXT REFERENCES service_offers(id),
    request_id       TEXT REFERENCES help_requests(id),
    provider_id      TEXT NOT NULL REFERENCES users(id),
    seeker_id        TEXT NOT NULL REFERENCES users(id),
    points_agreed    INTEGER NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    initiated_by     TEXT NOT NULL,
    seeker_cancelled INTEGER NOT NULL DEFAULT 0,
    accepted_at      TEXT,
    completed_at     TEXT,
    rejected_at      TEXT,
    expired_at       TEXT,
    provider_rating  INTEGER,
    seeker_rating    INTEGER,
    provider_review  TEXT,
    seeker_review    TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── Points Ledger ─────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS points_ledger (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id      TEXT REFERENCES matches(id),
    delta         INTEGER NOT NULL,
    reason        TEXT NOT NULL,
    balance_after INTEGER NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── Badges ────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS badges (
    id           TEXT PRIMARY KEY,
    slug         TEXT UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    icon_url     TEXT,
    points_bonus INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── User Badges (join) ────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS user_badges (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id   TEXT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, badge_id)
  );

  -- ── Notification Cooldowns ────────────────────────────────────────────────
  -- Stores the last time a user was notified per category to prevent spam.
  CREATE TABLE IF NOT EXISTS notification_cooldowns (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category         TEXT NOT NULL,
    last_notified_at TEXT NOT NULL,
    UNIQUE(user_id, category)
  );

  -- ── Favorites ─────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS favorites (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_unique ON favorites(user_id, target_type, target_id);

  -- ── Payments / Subscriptions (Stripe) ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS payments (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider           TEXT NOT NULL,
    provider_session_id TEXT,
    provider_event_id  TEXT,
    plan_id            TEXT,
    interval           TEXT,
    amount_cents       INTEGER,
    currency           TEXT,
    status             TEXT NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider, provider_event_id)
  );
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at);

  -- ── In-app notifications ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    title      TEXT,
    body       TEXT,
    payload    TEXT NOT NULL DEFAULT '{}',
    read_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at);

  -- ── Auth tokens (email verify / reset password) ───────────────────────────
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(type, token_hash)
  );
  CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens(user_id, type);

  -- ── Indexes ───────────────────────────────────────────────────────────────
  -- Offers: composite for the two most common feed queries
  CREATE INDEX IF NOT EXISTS idx_offers_provider       ON service_offers(provider_id);
  CREATE INDEX IF NOT EXISTS idx_offers_category_status ON service_offers(category, status);

  -- Requests: composite mirrors offers pattern
  CREATE INDEX IF NOT EXISTS idx_requests_seeker          ON help_requests(seeker_id);
  CREATE INDEX IF NOT EXISTS idx_requests_category_status ON help_requests(category, status);

  -- Matches: composite covers participant-status lookups; request_id for join
  CREATE INDEX IF NOT EXISTS idx_matches_provider_status ON matches(provider_id, status);
  CREATE INDEX IF NOT EXISTS idx_matches_seeker          ON matches(seeker_id);
  CREATE INDEX IF NOT EXISTS idx_matches_request_id      ON matches(request_id);

  -- Points ledger: single-user scans
  CREATE INDEX IF NOT EXISTS idx_ledger_user ON points_ledger(user_id);

  -- Badges
  CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

  -- Notification cooldowns
  CREATE INDEX IF NOT EXISTS idx_cooldowns_user ON notification_cooldowns(user_id);

  -- AutoMatch
  CREATE TABLE IF NOT EXISTS automatch_settings (
    user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled             INTEGER NOT NULL DEFAULT 0,
    categories_json     TEXT NOT NULL DEFAULT '[]',
    radius_km           INTEGER NOT NULL DEFAULT 5,
    max_invites_per_day INTEGER NOT NULL DEFAULT 20,
    quiet_start         TEXT,
    quiet_end           TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS automatch_invites (
    id          TEXT PRIMARY KEY,
    request_id  TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
    seeker_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending',
    expires_at  TEXT NOT NULL,
    accepted_at TEXT,
    declined_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(request_id, provider_id)
  );

  CREATE INDEX IF NOT EXISTS idx_automatch_inv_provider_status ON automatch_invites(provider_id, status);
  CREATE INDEX IF NOT EXISTS idx_automatch_inv_expires ON automatch_invites(expires_at);

  -- AutoMatch (offers -> seekers)
  CREATE TABLE IF NOT EXISTS automatch_offer_invites (
    id          TEXT PRIMARY KEY,
    offer_id    TEXT NOT NULL REFERENCES service_offers(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seeker_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending',
    expires_at  TEXT NOT NULL,
    accepted_at TEXT,
    declined_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(offer_id, seeker_id)
  );

  CREATE INDEX IF NOT EXISTS idx_automatch_off_inv_seeker_status ON automatch_offer_invites(seeker_id, status);
  CREATE INDEX IF NOT EXISTS idx_automatch_off_inv_expires ON automatch_offer_invites(expires_at);
`);

// ── Lightweight column adds (SQLite: ALTER TABLE ADD COLUMN) ────────────────
// Keep migrations idempotent without a full migration framework.
function hasColumn(table, col) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(c => c.name === col);
  } catch {
    return false;
  }
}

function addColumn(table, ddl) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl};`);
  } catch {
    // ignore if already exists or table missing
  }
}

// Compensation context
if (!hasColumn('help_requests', 'compensation_type')) {
  addColumn('help_requests', "compensation_type TEXT NOT NULL DEFAULT 'cash'");
}
if (!hasColumn('help_requests', 'when_text')) {
  addColumn('help_requests', "when_text TEXT NOT NULL DEFAULT 'asap'");
}
if (!hasColumn('service_offers', 'compensation_type')) {
  addColumn('service_offers', "compensation_type TEXT NOT NULL DEFAULT 'cash'");
}
if (!hasColumn('matches', 'compensation_type')) {
  addColumn('matches', "compensation_type TEXT NOT NULL DEFAULT 'cash'");
}

// Match agreement + messages
if (!hasColumn('matches', 'barter_terms')) {
  addColumn('matches', 'barter_terms TEXT');
}
if (!hasColumn('matches', 'agreement_at')) {
  addColumn('matches', 'agreement_at TEXT');
}

// Profile photos (max 2 in UI, stored as JSON array)
if (!hasColumn('users', 'profile_photos')) {
  addColumn('users', "profile_photos TEXT NOT NULL DEFAULT '[]'");
}
if (!hasColumn('users', 'is_banned')) {
  addColumn('users', 'is_banned INTEGER NOT NULL DEFAULT 0');
}

// AutoMatch settings additions (provider + seeker modes)
if (!hasColumn('automatch_settings', 'seeker_enabled')) {
  addColumn('automatch_settings', 'seeker_enabled INTEGER NOT NULL DEFAULT 0');
}
if (!hasColumn('automatch_settings', 'seeker_categories_json')) {
  addColumn('automatch_settings', "seeker_categories_json TEXT NOT NULL DEFAULT '[]'");
}
if (!hasColumn('automatch_settings', 'automatch_mode')) {
  addColumn('automatch_settings', "automatch_mode TEXT NOT NULL DEFAULT 'simple'");
}

// ── Perks / collections (lightweight) ───────────────────────────────────────
if (!hasColumn('users', 'emblem_slug')) {
  addColumn('users', 'emblem_slug TEXT');
}
if (!hasColumn('users', 'boost_48h_tokens')) {
  addColumn('users', 'boost_48h_tokens INTEGER NOT NULL DEFAULT 0');
}

// Admin tables (idempotent)
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id            TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL,
    action        TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     TEXT,
    before_json   TEXT,
    after_json    TEXT,
    ip            TEXT,
    user_agent    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_user_id, created_at);

  CREATE TABLE IF NOT EXISTS admin_config (
    key        TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Admin events (activity) + reports (moderation)
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_events (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL,
    actor_user_id TEXT,
    target_type   TEXT,
    target_id     TEXT,
    meta_json     TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_admin_events_created ON admin_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_events_type_created ON admin_events(type, created_at);

  CREATE TABLE IF NOT EXISTS reports (
    id           TEXT PRIMARY KEY,
    reporter_id  TEXT,
    target_type  TEXT NOT NULL,
    target_id    TEXT NOT NULL,
    reason       TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open',
    notes        TEXT,
    resolved_at  TEXT,
    resolved_by  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at);
`);

if (!hasColumn('help_requests', 'boost_48h_used')) {
  addColumn('help_requests', 'boost_48h_used INTEGER NOT NULL DEFAULT 0');
}
if (!hasColumn('service_offers', 'boost_48h_used')) {
  addColumn('service_offers', 'boost_48h_used INTEGER NOT NULL DEFAULT 0');
}

// Moderation: hide/unhide content
if (!hasColumn('service_offers', 'is_hidden')) {
  addColumn('service_offers', 'is_hidden INTEGER NOT NULL DEFAULT 0');
}
if (!hasColumn('help_requests', 'is_hidden')) {
  addColumn('help_requests', 'is_hidden INTEGER NOT NULL DEFAULT 0');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS match_messages (
    id         TEXT PRIMARY KEY,
    match_id   TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_match_messages_match ON match_messages(match_id, created_at);
`);

// Seed core badges (idempotent + update) — so new installs get the gamification.
function upsertBadge(slug, name, description, icon, pointsBonus) {
  try {
    const row = db.prepare('SELECT id FROM badges WHERE slug = ?').get(slug);
    const now = new Date().toISOString();
    if (!row) {
      const { randomUUID } = require('crypto');
      db.prepare('INSERT INTO badges (id, slug, name, description, icon_url, points_bonus, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(), slug, name, description, icon, pointsBonus, now);
      return;
    }
    db.prepare('UPDATE badges SET name = ?, description = ?, icon_url = ?, points_bonus = ? WHERE slug = ?')
      .run(name, description, icon, pointsBonus, slug);
  } catch {
    // ignore
  }
}

upsertBadge('rep_100', 'Vecino en Marcha', 'Alcanzaste 100 de reputacion.', '🧱', 0);
upsertBadge('rep_250', 'Buen Vecino', 'Alcanzaste 250 de reputacion.', '🏡', 0);
upsertBadge('rep_500', 'Vecino de Confianza', 'Alcanzaste 500 de reputacion.', '🛡️', 0);
upsertBadge('rep_1000', 'Pilar de la Comunidad', 'Alcanzaste 1000 de reputacion.', '🏛️', 0);

upsertBadge('svc_repairs', 'Manitas de la comunidad', 'Completaste 2 servicios de reparaciones.', '🔧', 25);
upsertBadge('svc_packages', 'Mensajero de la comunidad', 'Completaste 2 servicios de paquetes.', '📦', 25);
upsertBadge('svc_pets', 'Amigo de las mascotas', 'Completaste 2 servicios de mascotas.', '🐕', 25);
upsertBadge('svc_cleaning', 'Orden y limpieza', 'Completaste 2 servicios de limpieza.', '🧹', 25);
upsertBadge('svc_transport', 'Transporte solidario', 'Completaste 2 servicios de transporte.', '🚗', 25);
upsertBadge('svc_tech', 'Tech de confianza', 'Completaste 2 servicios de tecnologia.', '💻', 25);
upsertBadge('svc_gardening', 'Jardinero urbano', 'Completaste 2 servicios de jardineria.', '🌿', 25);
upsertBadge('svc_care', 'Acompanamiento', 'Completaste 2 servicios de acompanamiento.', '👴', 25);
upsertBadge('svc_tutoring', 'Profe de la comunidad', 'Completaste 2 servicios de clases.', '📚', 25);
upsertBadge('svc_creative', 'Creatividad', 'Completaste 2 servicios creativos.', '🎨', 25);
upsertBadge('svc_errands', 'Recados express', 'Completaste 2 servicios de recados.', '🧾', 25);
upsertBadge('svc_other', 'Multiusos', 'Completaste 2 servicios de otros.', '✨', 25);

upsertBadge('col_vecino_total', 'Vecino Total', 'Consigue 4 insignias de categorias distintas.', '🏅', 120);
upsertBadge('col_barrio_solidario', 'Comunidad Solidaria', 'Completa acompanamiento, recados y clases.', '🤝', 90);
upsertBadge('col_mano_hogar', 'Manitas y Hogar', 'Completa reparaciones, limpieza y jardineria.', '🧰', 90);
upsertBadge('col_movilidad_rapida', 'Movilidad Rapida', 'Completa transporte y paquetes.', '🚀', 60);
upsertBadge('col_super_vecino', 'Super Vecino', 'Consigue 8 insignias de categorias distintas.', '👑', 250);

console.log('✅  Migration complete — all tables and indexes created.');
process.exit(0);
