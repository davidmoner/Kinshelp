'use strict';

// Postgres seed.
// - Idempotente para badges basicos.
// - Crea/asegura cuentas demo con password conocido.

const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { getPool } = require('../config/postgres');

function nowIso() {
  return new Date().toISOString();
}

async function ensureBadge(client, slug, name, description, iconUrl, pointsBonus) {
  await client.query(
    `INSERT INTO badges (id, slug, name, description, icon_url, points_bonus, created_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (slug) DO NOTHING`,
    [randomUUID(), slug, name, description, iconUrl, pointsBonus]
  );
}

async function upsertUserByEmail(client, {
  email,
  displayName,
  passwordHash,
  bio,
  locationText,
  pointsBalance,
  isVerified,
}) {
  // Keep id stable: if user exists keep existing id; else create new.
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  const id = existing.rows[0]?.id || randomUUID();
  const updatedAt = nowIso();
  const createdAt = nowIso();

  await client.query(
    `INSERT INTO users (
        id, display_name, email, password_hash, bio, location_text,
        points_balance, is_verified, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (email) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        password_hash = EXCLUDED.password_hash,
        bio = EXCLUDED.bio,
        location_text = EXCLUDED.location_text,
        points_balance = EXCLUDED.points_balance,
        is_verified = EXCLUDED.is_verified,
        updated_at = EXCLUDED.updated_at`,
    [
      id,
      displayName,
      email,
      passwordHash,
      bio || null,
      locationText || null,
      Number.isFinite(pointsBalance) ? pointsBalance : 0,
      !!isVerified,
      createdAt,
      updatedAt,
    ]
  );
}

async function seed() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Badges basicos (mismos slugs que en SQLite).
    await ensureBadge(client, 'rep_100', 'Vecino en Marcha', 'Alcanzaste 100 de reputacion.', '🧱', 0);
    await ensureBadge(client, 'rep_250', 'Buen Vecino', 'Alcanzaste 250 de reputacion.', '🏡', 0);
    await ensureBadge(client, 'rep_500', 'Vecino de Confianza', 'Alcanzaste 500 de reputacion.', '🛡️', 0);
    await ensureBadge(client, 'rep_1000', 'Pilar del Barrio', 'Alcanzaste 1000 de reputacion.', '🏛️', 0);

    await ensureBadge(client, 'svc_repairs', 'Manitas del barrio', 'Completaste 2 servicios de reparaciones.', '🔧', 25);
    await ensureBadge(client, 'svc_packages', 'Mensajero vecinal', 'Completaste 2 servicios de paquetes.', '📦', 25);
    await ensureBadge(client, 'svc_pets', 'Amigo de las mascotas', 'Completaste 2 servicios de mascotas.', '🐕', 25);
    await ensureBadge(client, 'svc_cleaning', 'Orden y limpieza', 'Completaste 2 servicios de limpieza.', '🧹', 25);
    await ensureBadge(client, 'svc_transport', 'Transporte solidario', 'Completaste 2 servicios de transporte.', '🚗', 25);
    await ensureBadge(client, 'svc_tech', 'Tech de confianza', 'Completaste 2 servicios de tecnologia.', '💻', 25);
    await ensureBadge(client, 'svc_gardening', 'Jardinero urbano', 'Completaste 2 servicios de jardineria.', '🌿', 25);
    await ensureBadge(client, 'svc_care', 'Acompanamiento', 'Completaste 2 servicios de acompanamiento.', '👴', 25);
    await ensureBadge(client, 'svc_tutoring', 'Profe del barrio', 'Completaste 2 servicios de clases.', '📚', 25);
    await ensureBadge(client, 'svc_creative', 'Creatividad', 'Completaste 2 servicios creativos.', '🎨', 25);
    await ensureBadge(client, 'svc_errands', 'Recados express', 'Completaste 2 servicios de recados.', '🧾', 25);
    await ensureBadge(client, 'svc_other', 'Multiusos', 'Completaste 2 servicios de otros.', '✨', 25);

    await ensureBadge(client, 'col_vecino_total', 'Vecino Total', 'Consigue 4 insignias de categorias distintas.', '🏅', 120);
    await ensureBadge(client, 'col_barrio_solidario', 'Barrio Solidario', 'Completa acompanamiento, recados y clases.', '🤝', 90);
    await ensureBadge(client, 'col_mano_hogar', 'Manitas y Hogar', 'Completa reparaciones, limpieza y jardineria.', '🧰', 90);
    await ensureBadge(client, 'col_movilidad_rapida', 'Movilidad Rapida', 'Completa transporte y paquetes.', '🚀', 60);
    await ensureBadge(client, 'col_super_vecino', 'Super Vecino', 'Consigue 8 insignias de categorias distintas.', '👑', 250);

    // Demo users.
    const demoPassword = 'password123';
    const hash = await bcrypt.hash(demoPassword, 10);
    const demos = [
      {
        email: 'demo.alice@kingshelp.local',
        displayName: 'Demo Alice',
        bio: 'Cuenta demo para pruebas.',
        locationText: 'Demo',
        pointsBalance: 420,
        isVerified: true,
      },
      {
        email: 'demo.bob@kingshelp.local',
        displayName: 'Demo Bob',
        bio: 'Cuenta demo para pruebas.',
        locationText: 'Demo',
        pointsBalance: 250,
        isVerified: false,
      },
      {
        email: 'demo.carol@kingshelp.local',
        displayName: 'Demo Carol',
        bio: 'Cuenta demo para pruebas.',
        locationText: 'Demo',
        pointsBalance: 110,
        isVerified: false,
      },
    ];

    for (const u of demos) {
      await upsertUserByEmail(client, { ...u, passwordHash: hash });
    }

    await client.query('COMMIT');
    console.log('✅  Postgres seed complete. Demo password: password123');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌  Postgres seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

seed().catch(e => {
  console.error('❌  Postgres seed failed:', e.message);
  process.exit(1);
});
