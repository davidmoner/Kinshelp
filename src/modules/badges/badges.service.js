'use strict';
const repo = require('./badges.repo');
const pointsSvc = require('../points/points.service');
const matchesRepo = require('../matches/matches.repo');
const { LEDGER_REASON } = require('../../config/constants');

const CATEGORY_BADGE = {
    repairs: { slug: 'svc_repairs', name: 'Manitas del barrio' },
    packages: { slug: 'svc_packages', name: 'Mensajero vecinal' },
    pets: { slug: 'svc_pets', name: 'Amigo de las mascotas' },
    cleaning: { slug: 'svc_cleaning', name: 'Orden y limpieza' },
    transport: { slug: 'svc_transport', name: 'Transporte solidario' },
    tech: { slug: 'svc_tech', name: 'Tech de confianza' },
    gardening: { slug: 'svc_gardening', name: 'Jardinero urbano' },
    care: { slug: 'svc_care', name: 'Acompanamiento' },
    tutoring: { slug: 'svc_tutoring', name: 'Profe del barrio' },
    creative: { slug: 'svc_creative', name: 'Creatividad' },
    errands: { slug: 'svc_errands', name: 'Recados express' },
    other: { slug: 'svc_other', name: 'Multiusos' },
};

const COLLECTIONS = [
    {
        slug: 'col_barrio_pack',
        required: ['svc_pets', 'svc_transport', 'svc_cleaning', 'svc_repairs', 'svc_gardening'],
        emblem: 'kh_emblem_barrio',
        emblemWeight: 1,
        boostTokens: 1,
    },
    {
        slug: 'col_corona_pack',
        required: Object.values(CATEGORY_BADGE).map(x => x.slug),
        emblem: 'kh_emblem_corona',
        emblemWeight: 2,
        boostTokens: 2,
    },
    {
        slug: 'col_leyenda_pack',
        required: ['rep_1000', 'community_pillar', 'five_star'],
        emblem: 'kh_emblem_leyenda',
        emblemWeight: 3,
        boostTokens: 2,
    },
];

function listAll() { return repo.findAll(); }
function listForUser(userId) { return repo.findForUser(userId); }

function awardBadge(userId, slug, matchId = null) {
    const badge = repo.getBySlug(slug);
    if (!badge || repo.hasAwarded(userId, badge.id)) return null;

    repo.award(userId, badge.id);
    if (badge.points_bonus > 0)
        pointsSvc.grant({ userId, amount: badge.points_bonus, reason: LEDGER_REASON.BADGE_BONUS, matchId });

    return badge;
}

function evaluateOnMatchDone(providerId, seekerId, matchId) {
    // Category badge: one per service type (both participants)
    try {
        const m = matchesRepo.findById(matchId);
        const cat = (m && (m.request_category || m.offer_category)) || null;
        const entry = cat ? CATEGORY_BADGE[String(cat)] : null;
        if (entry && entry.slug) {
            awardBadge(providerId, entry.slug, matchId);
            awardBadge(seekerId, entry.slug, matchId);
        }
    } catch {
        // ignore
    }

    _checkBadges(providerId, matchId);
    _checkBadges(seekerId, matchId);

    _checkCollections(providerId, matchId);
    _checkCollections(seekerId, matchId);
}

function _checkBadges(userId, matchId) {
    // Reputation milestone badges
    const u = repo.getUserStats(userId);
    const rep = (u && u.points_balance) || 0;
    if (rep >= 100) awardBadge(userId, 'rep_100', matchId);
    if (rep >= 250) awardBadge(userId, 'rep_250', matchId);
    if (rep >= 500) awardBadge(userId, 'rep_500', matchId);
    if (rep >= 1000) awardBadge(userId, 'rep_1000', matchId);

    const { total, asProvider } = matchesRepo.countDone(userId);
    if (total >= 1) awardBadge(userId, 'first_match', matchId);
    if (asProvider >= 5) awardBadge(userId, 'helping_hand_5', matchId);
    if (asProvider >= 10) awardBadge(userId, 'top_helper_10', matchId);
    if (total >= 25) awardBadge(userId, 'community_pillar', matchId);
}

function _checkCollections(userId, matchId) {
    COLLECTIONS.forEach(c => {
        try {
            // Already awarded?
            if (repo.hasBadgeSlug(userId, c.slug)) return;
            if (!repo.hasAllBadgeSlugs(userId, c.required)) return;
            const got = awardBadge(userId, c.slug, matchId);
            if (!got) return;

            // Collection perks
            repo.addBoostTokens(userId, c.boostTokens || 0);
            repo.setEmblemIfBetter(userId, c.emblem, c.emblemWeight || 0);
        } catch {
            // ignore
        }
    });
}

module.exports = { listAll, listForUser, awardBadge, evaluateOnMatchDone };
