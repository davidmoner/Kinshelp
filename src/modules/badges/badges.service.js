'use strict';
const repo = require('./badges.repo');
const pointsSvc = require('../points/points.service');
const matchesRepo = require('../matches/matches.repo');
const { LEDGER_REASON } = require('../../config/constants');

const CATEGORY_BADGE = {
    repairs: { slug: 'svc_repairs', name: 'Manitas del barrio', minDone: 2 },
    packages: { slug: 'svc_packages', name: 'Mensajero vecinal', minDone: 2 },
    pets: { slug: 'svc_pets', name: 'Amigo de las mascotas', minDone: 2 },
    cleaning: { slug: 'svc_cleaning', name: 'Orden y limpieza', minDone: 2 },
    transport: { slug: 'svc_transport', name: 'Transporte solidario', minDone: 2 },
    tech: { slug: 'svc_tech', name: 'Tech de confianza', minDone: 2 },
    gardening: { slug: 'svc_gardening', name: 'Jardinero urbano', minDone: 2 },
    care: { slug: 'svc_care', name: 'Acompanamiento', minDone: 2 },
    tutoring: { slug: 'svc_tutoring', name: 'Profe del barrio', minDone: 2 },
    creative: { slug: 'svc_creative', name: 'Creatividad', minDone: 2 },
    errands: { slug: 'svc_errands', name: 'Recados express', minDone: 2 },
    other: { slug: 'svc_other', name: 'Multiusos', minDone: 2 },
};

const CATEGORY_SLUGS = Object.values(CATEGORY_BADGE).map(x => x.slug);

const COLLECTIONS = [
    { slug: 'col_vecino_total', type: 'count', count: 4 },
    { slug: 'col_barrio_solidario', type: 'all', required: ['svc_care', 'svc_errands', 'svc_tutoring'] },
    { slug: 'col_mano_hogar', type: 'all', required: ['svc_repairs', 'svc_cleaning', 'svc_gardening'] },
    { slug: 'col_movilidad_rapida', type: 'all', required: ['svc_transport', 'svc_packages'] },
    { slug: 'col_super_vecino', type: 'count', count: 8 },
];

async function listAll() { return repo.findAll(); }
async function listForUser(userId) { return repo.findForUser(userId); }

async function awardBadge(userId, slug, matchId = null) {
    const badge = await repo.getBySlug(slug);
    if (!badge) return null;
    if (await repo.hasAwarded(userId, badge.id)) return null;

    await repo.award(userId, badge.id);
    if (badge.points_bonus > 0) {
        await pointsSvc.grant({ userId, amount: badge.points_bonus, reason: LEDGER_REASON.BADGE_BONUS, matchId });
    }

    return badge;
}

async function maybeAwardCategoryBadge(userId, category, matchId) {
    const entry = category ? CATEGORY_BADGE[String(category)] : null;
    if (!entry || !entry.slug) return;
    const required = Number(entry.minDone || 2);
    const done = await matchesRepo.countDoneInCategory(userId, String(category));
    if (done >= required) {
        await awardBadge(userId, entry.slug, matchId);
    }
}

async function evaluateOnMatchDone(providerId, seekerId, matchId) {
    let cat = null;
    try {
        const m = await matchesRepo.findById(matchId);
        cat = (m && (m.request_category || m.offer_category)) || null;
    } catch {
        cat = null;
    }

    if (cat) {
        await maybeAwardCategoryBadge(providerId, cat, matchId);
        await maybeAwardCategoryBadge(seekerId, cat, matchId);
    }

    await _checkBadges(providerId, matchId);
    await _checkBadges(seekerId, matchId);

    await _checkCollections(providerId, matchId);
    await _checkCollections(seekerId, matchId);
}

async function _checkBadges(userId, matchId) {
    // Reputation milestone badges
    const u = await repo.getUserStats(userId);
    const rep = (u && u.points_balance) || 0;
    if (rep >= 100) await awardBadge(userId, 'rep_100', matchId);
    if (rep >= 250) await awardBadge(userId, 'rep_250', matchId);
    if (rep >= 500) await awardBadge(userId, 'rep_500', matchId);
    if (rep >= 1000) await awardBadge(userId, 'rep_1000', matchId);

    const { total, asProvider } = await matchesRepo.countDone(userId);
    if (total >= 1) await awardBadge(userId, 'first_match', matchId);
    if (asProvider >= 5) await awardBadge(userId, 'helping_hand_5', matchId);
    if (asProvider >= 10) await awardBadge(userId, 'top_helper_10', matchId);
    if (total >= 25) await awardBadge(userId, 'community_pillar', matchId);
}

async function _checkCollections(userId, matchId) {
    const categoryCount = await repo.countBadgeSlugs(userId, CATEGORY_SLUGS);

    for (const c of COLLECTIONS) {
        try {
            if (await repo.hasBadgeSlug(userId, c.slug)) continue;
            if (c.type === 'count') {
                if (categoryCount < Number(c.count || 0)) continue;
                await awardBadge(userId, c.slug, matchId);
                continue;
            }
            if (c.type === 'all') {
                if (!await repo.hasAllBadgeSlugs(userId, c.required)) continue;
                await awardBadge(userId, c.slug, matchId);
            }
        } catch {
            // ignore
        }
    }
}

module.exports = { listAll, listForUser, awardBadge, evaluateOnMatchDone };
