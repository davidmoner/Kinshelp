'use strict';
const { getPool } = require('../config/postgres');

async function migrate() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id             uuid PRIMARY KEY,
        display_name   text NOT NULL,
        email          text UNIQUE NOT NULL,
        password_hash  text,
        avatar_url     text,
        bio            text,
        location_text  text,
        lat            double precision,
        lng            double precision,
        points_balance integer NOT NULL DEFAULT 0,
        rating_avg     double precision NOT NULL DEFAULT 0,
        rating_count   integer NOT NULL DEFAULT 0,
        premium_tier   text NOT NULL DEFAULT 'free',
        premium_until  timestamptz,
        is_verified    boolean NOT NULL DEFAULT false,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        profile_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
        emblem_slug    text,
        boost_48h_tokens integer NOT NULL DEFAULT 0
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS service_offers (
        id            uuid PRIMARY KEY,
        provider_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title         text NOT NULL,
        description   text,
        category      text NOT NULL,
        points_value  integer NOT NULL,
        compensation_type text NOT NULL DEFAULT 'cash',
        media_urls    jsonb NOT NULL DEFAULT '[]'::jsonb,
        location_text text,
        lat           double precision,
        lng           double precision,
        expires_at    timestamptz NOT NULL,
        status        text NOT NULL DEFAULT 'active',
        boost_48h_used boolean NOT NULL DEFAULT false,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_offers_provider ON service_offers(provider_id);
      CREATE INDEX IF NOT EXISTS idx_offers_category_status ON service_offers(category, status);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS help_requests (
        id             uuid PRIMARY KEY,
        seeker_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title          text NOT NULL,
        description    text,
        category       text NOT NULL,
        points_offered integer NOT NULL,
        compensation_type text NOT NULL DEFAULT 'cash',
        media_urls     jsonb NOT NULL DEFAULT '[]'::jsonb,
        location_text  text,
        lat            double precision,
        lng            double precision,
        expires_at     timestamptz NOT NULL,
        status         text NOT NULL DEFAULT 'open',
        boost_48h_used boolean NOT NULL DEFAULT false,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_requests_seeker ON help_requests(seeker_id);
      CREATE INDEX IF NOT EXISTS idx_requests_category_status ON help_requests(category, status);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id               uuid PRIMARY KEY,
        offer_id         uuid REFERENCES service_offers(id),
        request_id       uuid REFERENCES help_requests(id),
        provider_id      uuid NOT NULL REFERENCES users(id),
        seeker_id        uuid NOT NULL REFERENCES users(id),
        points_agreed    integer NOT NULL,
        compensation_type text NOT NULL DEFAULT 'cash',
        barter_terms     text,
        agreement_at     timestamptz,
        status           text NOT NULL DEFAULT 'pending',
        initiated_by     text NOT NULL,
        seeker_cancelled boolean NOT NULL DEFAULT false,
        accepted_at      timestamptz,
        completed_at     timestamptz,
        rejected_at      timestamptz,
        expired_at       timestamptz,
        provider_rating  integer,
        seeker_rating    integer,
        provider_review  text,
        seeker_review    text,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_matches_provider_status ON matches(provider_id, status);
      CREATE INDEX IF NOT EXISTS idx_matches_seeker ON matches(seeker_id);
      CREATE INDEX IF NOT EXISTS idx_matches_request_id ON matches(request_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS points_ledger (
        id            uuid PRIMARY KEY,
        user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        match_id      uuid REFERENCES matches(id),
        delta         integer NOT NULL,
        reason        text NOT NULL,
        balance_after integer NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_user ON points_ledger(user_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS badges (
        id           uuid PRIMARY KEY,
        slug         text UNIQUE NOT NULL,
        name         text NOT NULL,
        description  text,
        icon_url     text,
        points_bonus integer NOT NULL DEFAULT 0,
        created_at   timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_badges (
        id         uuid PRIMARY KEY,
        user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        badge_id   uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
        awarded_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id, badge_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_cooldowns (
        id               uuid PRIMARY KEY,
        user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category         text NOT NULL,
        last_notified_at timestamptz NOT NULL,
        UNIQUE(user_id, category)
      );
      CREATE INDEX IF NOT EXISTS idx_cooldowns_user ON notification_cooldowns(user_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                  uuid PRIMARY KEY,
        user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider            text NOT NULL,
        provider_session_id text,
        provider_event_id   text,
        plan_id             text,
        interval            text,
        amount_cents        integer,
        currency            text,
        status              text NOT NULL,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        UNIQUE(provider, provider_event_id)
      );
      CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         uuid PRIMARY KEY,
        user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind       text NOT NULL,
        title      text,
        body       text,
        payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
        read_at    timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS automatch_settings (
        user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        enabled             boolean NOT NULL DEFAULT false,
        seeker_enabled      boolean NOT NULL DEFAULT false,
        categories_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
        seeker_categories_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        radius_km           integer NOT NULL DEFAULT 5,
        max_invites_per_day integer NOT NULL DEFAULT 25,
        quiet_start         text,
        quiet_end           text,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS automatch_invites (
        id          uuid PRIMARY KEY,
        request_id  uuid NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
        seeker_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status      text NOT NULL DEFAULT 'pending',
        expires_at  timestamptz NOT NULL,
        accepted_at timestamptz,
        declined_at timestamptz,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE(request_id, provider_id)
      );
      CREATE INDEX IF NOT EXISTS idx_automatch_inv_provider_status ON automatch_invites(provider_id, status);
      CREATE INDEX IF NOT EXISTS idx_automatch_inv_expires ON automatch_invites(expires_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS automatch_offer_invites (
        id          uuid PRIMARY KEY,
        offer_id    uuid NOT NULL REFERENCES service_offers(id) ON DELETE CASCADE,
        provider_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        seeker_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status      text NOT NULL DEFAULT 'pending',
        expires_at  timestamptz NOT NULL,
        accepted_at timestamptz,
        declined_at timestamptz,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE(offer_id, seeker_id)
      );
      CREATE INDEX IF NOT EXISTS idx_automatch_off_inv_seeker_status ON automatch_offer_invites(seeker_id, status);
      CREATE INDEX IF NOT EXISTS idx_automatch_off_inv_expires ON automatch_offer_invites(expires_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS match_messages (
        id         uuid PRIMARY KEY,
        match_id   uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message    text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_match_messages_match ON match_messages(match_id, created_at);
    `);

    await client.query('COMMIT');
    console.log('✅  Postgres migration complete.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌  Postgres migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

migrate().catch(e => {
  console.error('❌  Postgres migration failed:', e.message);
  process.exit(1);
});
