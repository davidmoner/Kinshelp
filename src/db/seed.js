'use strict';
/**
 * Seed: inserts demo users, offers, requests, badges.
 * Run: npm run seed  (run AFTER npm run migrate)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const now = new Date().toISOString();
const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const futureFree = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const futurePremium = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

// ── Users ───────────────────────────────────────────────────────────────────
const users = [
    {
        id: randomUUID(),
        display_name: 'Alice Gold',
        email: 'alice@example.com',
        password_hash: bcrypt.hashSync('password123', 10),
        bio: 'Full-stack dev, love helping with code!',
        location_text: 'London, UK',
        lat: 51.5074,
        lng: -0.1278,
        points_balance: 500,
        premium_tier: 'premium',
        premium_until: future,
    },
    {
        id: randomUUID(),
        display_name: 'Bob Silver',
        email: 'bob@example.com',
        password_hash: bcrypt.hashSync('password123', 10),
        bio: 'Math tutor and language teacher.',
        location_text: 'Manchester, UK',
        lat: 53.4808,
        lng: -2.2426,
        points_balance: 200,
        premium_tier: 'premium',
        premium_until: future,
    },
    {
        id: randomUUID(),
        display_name: 'Carol Free',
        email: 'carol@example.com',
        password_hash: bcrypt.hashSync('password123', 10),
        bio: 'Graphic designer, love new projects.',
        location_text: 'Birmingham, UK',
        lat: 52.4862,
        lng: -1.8904,
        points_balance: 50,
        premium_tier: 'free',
        premium_until: null,
    },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users
     (id, display_name, email, password_hash, bio, location_text, lat, lng,
      points_balance, rating_avg, rating_count, premium_tier, premium_until, is_verified, created_at, updated_at)
  VALUES
     (@id, @display_name, @email, @password_hash, @bio, @location_text, @lat, @lng,
      @points_balance, 4.5, 3, @premium_tier, @premium_until, 1, '${now}', '${now}')
`);

users.forEach(u => insertUser.run(u));
console.log(`  ✔  ${users.length} users seeded`);

// ── AutoMatch settings (Premium users) ─────────────────────────────────────
try {
    const insAM = db.prepare(`
      INSERT OR IGNORE INTO automatch_settings
        (user_id, enabled, seeker_enabled, categories_json, seeker_categories_json, radius_km, max_invites_per_day, created_at, updated_at)
      VALUES (?, 1, 1, ?, ?, 5, 25, ?, ?)
    `);
    const allCats = JSON.stringify(['repairs', 'packages', 'pets', 'cleaning', 'transport', 'tech', 'gardening', 'care', 'tutoring', 'creative', 'errands', 'other']);
    [users[0], users[1]].forEach(u => insAM.run(u.id, allCats, allCats, now, now));
    console.log('  ✔  automatch_settings seeded for premium users');
} catch {
    // ignore if table not present
}

// ── Badges ───────────────────────────────────────────────────────────────────
const badges = [
    // Milestones
    { id: randomUUID(), slug: 'first_match', name: 'Primer match', description: 'Completaste tu primer match.', icon_url: '🤝', points_bonus: 10 },
    { id: randomUUID(), slug: 'helping_hand_5', name: 'Mano amiga', description: 'Completaste 5 matches como ayudante.', icon_url: '🙌', points_bonus: 25 },
    { id: randomUUID(), slug: 'top_helper_10', name: 'Top KingsHelp', description: 'Completaste 10 matches como ayudante.', icon_url: '⭐', points_bonus: 50 },
    { id: randomUUID(), slug: 'community_pillar', name: 'Pilar del barrio', description: 'Completaste 25 matches en total.', icon_url: '🏛️', points_bonus: 100 },
    { id: randomUUID(), slug: 'five_star', name: 'Cinco estrellas', description: 'Te dejaron una valoracion perfecta (5/5).', icon_url: '🌟', points_bonus: 15 },
    { id: randomUUID(), slug: 'early_adopter', name: 'Early Adopter', description: 'Te uniste durante el lanzamiento Incept.', icon_url: '🚀', points_bonus: 20 },

    // Reputation badges (referenced by badges.service.js)
    { id: randomUUID(), slug: 'rep_100', name: 'Reputacion 100', description: 'Alcanzaste 100 de reputacion.', icon_url: '⚡', points_bonus: 10 },
    { id: randomUUID(), slug: 'rep_250', name: 'Reputacion 250', description: 'Alcanzaste 250 de reputacion.', icon_url: '⚡', points_bonus: 15 },
    { id: randomUUID(), slug: 'rep_500', name: 'Reputacion 500', description: 'Alcanzaste 500 de reputacion.', icon_url: '⚡', points_bonus: 25 },
    { id: randomUUID(), slug: 'rep_1000', name: 'Reputacion 1000', description: 'Alcanzaste 1000 de reputacion.', icon_url: '⚡', points_bonus: 40 },

    // Service-type badges (one per category)
    { id: randomUUID(), slug: 'svc_repairs', name: 'Manitas del barrio', description: 'Completaste un servicio de reparaciones.', icon_url: '🔧', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_packages', name: 'Mensajero vecinal', description: 'Completaste un servicio de paquetes.', icon_url: '📦', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_pets', name: 'Amigo de las mascotas', description: 'Completaste un servicio de mascotas.', icon_url: '🐕', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_cleaning', name: 'Orden y limpieza', description: 'Completaste un servicio de limpieza.', icon_url: '🧹', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_transport', name: 'Transporte solidario', description: 'Completaste un servicio de transporte.', icon_url: '🚗', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_tech', name: 'Tech de confianza', description: 'Completaste un servicio de tecnologia.', icon_url: '💻', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_gardening', name: 'Jardinero urbano', description: 'Completaste un servicio de jardineria.', icon_url: '🌿', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_care', name: 'Acompanamiento', description: 'Completaste un servicio de acompanamiento.', icon_url: '👴', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_tutoring', name: 'Profe del barrio', description: 'Completaste un servicio de clases.', icon_url: '📚', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_creative', name: 'Creatividad', description: 'Completaste un servicio creativo.', icon_url: '🎨', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_errands', name: 'Recados express', description: 'Completaste un servicio de recados.', icon_url: '🧾', points_bonus: 10 },
    { id: randomUUID(), slug: 'svc_other', name: 'Multiusos', description: 'Completaste un servicio de otros.', icon_url: '✨', points_bonus: 10 },

    // Collections (award points + perks)
    { id: randomUUID(), slug: 'col_barrio_pack', name: 'Coleccion Barrio', description: 'Consigue 5 insignias de servicio (pack inicial).', icon_url: '🏅', points_bonus: 120 },
    { id: randomUUID(), slug: 'col_corona_pack', name: 'Coleccion Corona', description: 'Consigue todas las insignias de servicio.', icon_url: '👑', points_bonus: 250 },
    { id: randomUUID(), slug: 'col_leyenda_pack', name: 'Coleccion Leyenda', description: 'Rep 1000 + Pilar del barrio + Cinco estrellas.', icon_url: '🏆', points_bonus: 300 },
];

const insertBadge = db.prepare(`
  INSERT OR IGNORE INTO badges (id, slug, name, description, icon_url, points_bonus, created_at)
  VALUES (@id, @slug, @name, @description, @icon_url, @points_bonus, '${now}')
`);
badges.forEach(b => insertBadge.run(b));
console.log(`  ✔  ${badges.length} badges seeded`);

// ── Award early-adopter badge to all seed users ───────────────────────────────
const earlyBadge = db.prepare("SELECT id FROM badges WHERE slug = 'early_adopter'").get();
if (earlyBadge) {
    const insertUB = db.prepare(`
    INSERT OR IGNORE INTO user_badges (id, user_id, badge_id, awarded_at)
    VALUES (?, ?, ?, ?)
  `);
    users.forEach(u => insertUB.run(randomUUID(), u.id, earlyBadge.id, now));
    console.log(`  ✔  early_adopter badge awarded to all seed users`);
}

// ── Service Offers ────────────────────────────────────────────────────────────
const alice = users[0];
const bob = users[1];

const offers = [
    {
        id: randomUUID(), provider_id: alice.id,
        title: 'Help debugging Node.js APIs', description: 'I can help review and debug your Express/Node APIs.',
        category: 'tech', points_value: 80, expires_at: futurePremium,
    },
    {
        id: randomUUID(), provider_id: bob.id,
        title: 'GCSE Maths tutoring (1 hour)', description: 'One-on-one maths tutoring via video call.',
        category: 'tutoring', points_value: 60, expires_at: futurePremium,
    },
    {
        id: randomUUID(), provider_id: alice.id,
        title: 'Paseo de perros (30 min)', description: 'Paseo por el barrio. Horarios flexibles.',
        category: 'pets', points_value: 30, expires_at: futurePremium,
    },
    {
        id: randomUUID(), provider_id: bob.id,
        title: 'Ayuda con jardineria (1h)', description: 'Riego, poda ligera y mantenimiento basico.',
        category: 'gardening', points_value: 40, expires_at: futurePremium,
    },
];

const insertOffer = db.prepare(`
  INSERT OR IGNORE INTO service_offers
    (id, provider_id, title, description, category, points_value, expires_at, status, created_at, updated_at)
  VALUES
    (@id, @provider_id, @title, @description, @category, @points_value, @expires_at, 'active', '${now}', '${now}')
`);
offers.forEach(o => insertOffer.run(o));
console.log(`  ✔  ${offers.length} service offers seeded`);

// ── Help Requests ─────────────────────────────────────────────────────────────
const carol = users[2];

const requests = [
    {
        id: randomUUID(), seeker_id: carol.id,
        title: 'Need help setting up a React project', description: 'Complete beginner – need someone to walk me through create-react-app and routing.',
        category: 'tech', points_offered: 70, expires_at: futureFree,
    },
    {
        id: randomUUID(), seeker_id: carol.id,
        title: 'Logo design for my small business', description: 'Looking for a simple modern logo, willing to pay points.',
        category: 'creative', points_offered: 90, expires_at: futureFree,
    },
    {
        id: randomUUID(), seeker_id: carol.id,
        title: 'Necesito pasear a mi perro hoy', description: '30 minutos por el parque. Vivo cerca del centro.',
        category: 'pets', points_offered: 30, expires_at: futureFree,
    },
    {
        id: randomUUID(), seeker_id: carol.id,
        title: 'Ayuda con el jardin (poda ligera)', description: 'Herramientas disponibles. 1 hora aprox.',
        category: 'gardening', points_offered: 45, expires_at: futureFree,
    },
];

const insertRequest = db.prepare(`
  INSERT OR IGNORE INTO help_requests
    (id, seeker_id, title, description, category, points_offered, expires_at, status, created_at, updated_at)
  VALUES
    (@id, @seeker_id, @title, @description, @category, @points_offered, @expires_at, 'open', '${now}', '${now}')
`);
requests.forEach(r => insertRequest.run(r));
console.log(`  ✔  ${requests.length} help requests seeded`);

console.log('\n✅  Seed complete.\n');
console.log('Demo credentials (all password: password123):');
users.forEach(u => console.log(`  ${u.email}  [${u.premium_tier}]  reputacion: ${u.points_balance} rep`));
process.exit(0);
