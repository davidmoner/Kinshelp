'use strict';
/**
 * matches.service.js — business logic only (~120 LOC).
 * DB access via repo; input validation via validators.
 */
const db = require('../../config/db');
const httpError = require('../../shared/http-error');
const cooldown = require('../../shared/cooldown.service');
const notifications = require('../notifications/notifications.service');
const repo = require('./matches.repo');
const pointsSvc = require('../points/points.service');
const badgesSvc = require('../badges/badges.service');
const {
    MATCH_TRANSITIONS,
    MATCH_ACTION_PERMISSIONS,
    REPUTATION_AWARD,
    LEDGER_REASON,
    ANTI_FRAUD_MIN_CHAT_MSG_EACH,
    ANTI_FRAUD_PAIR_WINDOW_DAYS,
    ANTI_FRAUD_PAIR_MAX_FULL_AWARDS,
} = require('../../config/constants');
const { logEvent } = require('../admin/admin.events.repo');

// ── Internal helpers ──────────────────────────────────────────────────────────
function requireMatch(id) {
    const match = repo.findById(id);
    if (!match) throw httpError(404, 'Match not found');
    return match;
}

function requireParticipant(match, userId) {
    const isProvider = match.provider_id === userId;
    const isSeeker = match.seeker_id === userId;
    if (!isProvider && !isSeeker) throw httpError(403, 'Forbidden');
    return { isProvider, isSeeker, role: isProvider ? 'provider' : 'seeker' };
}

function ensureAgreementForDone(match) {
    const comp = match.compensation_type || 'cash';
    if (comp === 'coins' || comp === 'cash') {
        const amt = +match.points_agreed || 0;
        if (amt < 1) throw httpError(422, 'Agreement required: set EUR amount in chat before completing');
        return;
    }
    if (comp === 'barter') {
        const terms = String(match.barter_terms || '').trim();
        if (!terms) throw httpError(422, 'Agreement required: add barter terms in chat before completing');
    }
    // altruistic: no precondition
}

function isAgreementComplete(match) {
    const comp = match.compensation_type || 'cash';
    if (comp === 'coins' || comp === 'cash') return (+match.points_agreed || 0) >= 1;
    if (comp === 'barter') return String(match.barter_terms || '').trim().length > 0;
    return true;
}

function normalizeCompType(match) {
    const c = match.compensation_type || 'cash';
    if (c === 'coins') return 'cash';
    if (c === 'cash' || c === 'barter' || c === 'altruistic') return c;
    return 'cash';
}

function ensureAntiFraudForDone(match) {
    const minEach = Number(ANTI_FRAUD_MIN_CHAT_MSG_EACH || 0);
    if (minEach > 0) {
        const nP = repo.countNonSystemMessages(match.id, match.provider_id);
        const nS = repo.countNonSystemMessages(match.id, match.seeker_id);
        if (nP < minEach || nS < minEach) {
            throw httpError(422, 'Antes de completar: escribid al menos 1 mensaje cada uno en el chat (anti-fraude).');
        }
    }
}

function requireOffer(id) {
    const row = db.isPg
        ? null
        : db.prepare('SELECT id, status FROM service_offers WHERE id = ?').get(id);
    if (db.isPg) throw httpError(501, 'Offer checks not implemented for Postgres yet');
    if (!row) throw httpError(404, 'Offer not found');
    if (row.status !== 'active') throw httpError(422, 'Offer is not active');
    return row;
}

function requireRequest(id) {
    const row = db.isPg
        ? null
        : db.prepare('SELECT id, status FROM help_requests WHERE id = ?').get(id);
    if (db.isPg) throw httpError(501, 'Request checks not implemented for Postgres yet');
    if (!row) throw httpError(404, 'Request not found');
    if (row.status !== 'open') throw httpError(422, 'Request is not open');
    return row;
}

function updateUserRating(userId) {
    const { avg, cnt } = repo.calcUserRatingAvg(userId);
    if (db.isPg) {
        return db.exec('UPDATE users SET rating_avg = $1, rating_count = $2, updated_at = $3 WHERE id = $4', [avg || 0, cnt || 0, new Date().toISOString(), userId]);
    }
    db.prepare('UPDATE users SET rating_avg = ?, rating_count = ?, updated_at = ? WHERE id = ?').run(avg || 0, cnt || 0, new Date().toISOString(), userId);
}

// ── Public API ────────────────────────────────────────────────────────────────
function list(userId, opts) {
    return repo.listForUser(userId, opts);
}

function getById(id) {
    return requireMatch(id);
}

async function create(data) {
    const { offer_id, request_id, provider_id, seeker_id, points_agreed, initiated_by, compensation_type } = data;

    if (offer_id) requireOffer(offer_id);
    if (request_id) requireRequest(request_id);

    let matchId;
    if (db.isPg) {
        matchId = await db.tx(async (tx) => {
            const id = await repo.insert({ offer_id, request_id, provider_id, seeker_id, points_agreed, initiated_by, compensation_type }, tx);
            const now = new Date().toISOString();
            if (offer_id) await tx.exec("UPDATE service_offers SET status='matched', updated_at=$1 WHERE id=$2", [now, offer_id]);
            if (request_id) await tx.exec("UPDATE help_requests SET status='matched', updated_at=$1 WHERE id=$2", [now, request_id]);
            return id;
        });
    } else {
        matchId = db.transaction(() => {
            const id = repo.insert({ offer_id, request_id, provider_id, seeker_id, points_agreed, initiated_by, compensation_type });
            const now = new Date().toISOString();
            if (offer_id) db.prepare("UPDATE service_offers SET status='matched', updated_at=? WHERE id=?").run(now, offer_id);
            if (request_id) db.prepare("UPDATE help_requests  SET status='matched', updated_at=? WHERE id=?").run(now, request_id);
            return id;
        })();
    }

    const created = requireMatch(matchId);
    try {
        notifications.notify(provider_id, 'match_created', {
            title: 'Nuevo match',
            body: 'Tienes una nueva solicitud de match. Acepta o rechaza desde tu panel.',
            payload: { match_id: matchId },
        });
    } catch { }
    try { logEvent({ type: 'match.created', actorUserId: initiated_by === 'provider' ? provider_id : seeker_id, targetType: 'match', targetId: matchId, meta: { provider_id, seeker_id, compensation_type } }); } catch { }
    return created;
}

async function changeStatus(matchId, actingUserId, action) {
    const match = requireMatch(matchId);

    const { role: callerRole } = requireParticipant(match, actingUserId);

    const requiredRole = MATCH_ACTION_PERMISSIONS[action]; // already validated by validators.js
    if (callerRole !== requiredRole)
        throw httpError(403, `Only the ${requiredRole} can perform '${action}'`);

    const transitions = MATCH_TRANSITIONS[match.status];
    if (!transitions || !(action in transitions))
        throw httpError(422, `'${action}' is not valid when match is '${match.status}'`);

    const newStatus = transitions[action];
    const now = new Date().toISOString();

    const pairDoneCount = newStatus === 'done'
        ? repo.countDoneBetweenUsersWithinDays(match.provider_id, match.seeker_id, ANTI_FRAUD_PAIR_WINDOW_DAYS)
        : 0;

    if (newStatus === 'done') {
        ensureAgreementForDone(match);
        ensureAntiFraudForDone(match);
    }

    db.transaction(() => {
        repo.setStatus(matchId, newStatus, { seekerCancelled: action === 'cancel' ? 1 : match.seeker_cancelled });

        if (newStatus === 'rejected' || newStatus === 'expired') {
            if (match.offer_id)
                db.prepare("UPDATE service_offers SET status='active', updated_at=? WHERE id=?").run(now, match.offer_id);
            if (match.request_id)
                db.prepare("UPDATE help_requests SET status='open', updated_at=? WHERE id=?").run(now, match.request_id);
        }

        if (newStatus === 'accepted') {
            const a = (REPUTATION_AWARD && REPUTATION_AWARD.match_accepted) || { provider: 0, seeker: 0 };
            if (a.provider > 0)
                pointsSvc.award({ userId: match.provider_id, amount: a.provider, matchId, reason: LEDGER_REASON.MATCH_ACCEPTED });
        }

        if (newStatus === 'done') {
            const comp = normalizeCompType(match);
            const cfg = (REPUTATION_AWARD && REPUTATION_AWARD.match_done && REPUTATION_AWARD.match_done[comp])
                || { provider: 12, seeker: 6 };

            const maxAwards = Number(ANTI_FRAUD_PAIR_MAX_FULL_AWARDS || 0);
            const limited = maxAwards >= 0 && pairDoneCount >= maxAwards;

            if (limited) {
                repo.insertMessage(matchId, actingUserId,
                    '[SYSTEM] Match completado. Reputación limitada por anti-fraude: demasiados servicios completados recientemente entre las mismas dos cuentas.');
                pointsSvc.award({ userId: match.provider_id, amount: 0, matchId, reason: LEDGER_REASON.MATCH_COMPLETED_LIMITED, forceLedger: true });
                pointsSvc.award({ userId: match.seeker_id, amount: 0, matchId, reason: LEDGER_REASON.MATCH_COMPLETED_LIMITED, forceLedger: true });
            } else {
                pointsSvc.award({ userId: match.provider_id, amount: cfg.provider, matchId, reason: LEDGER_REASON.MATCH_COMPLETED });
                pointsSvc.award({ userId: match.seeker_id, amount: cfg.seeker, matchId, reason: LEDGER_REASON.MATCH_COMPLETED });
                badgesSvc.evaluateOnMatchDone(match.provider_id, match.seeker_id, matchId);
            }
        }
    })();

    // After status updates, encourage agreement via chat
    if (newStatus === 'accepted') {
        const updated = requireMatch(matchId);
        if (!isAgreementComplete(updated)) {
            repo.insertMessage(matchId, actingUserId,
                '[SYSTEM] Para continuar: acordad la compensación en el chat (pago en EUR, trueque o altruista). El pago en EUR se realiza fuera de KingsHelp.');
        }
    }

    // Cooldown-gated notification hook
    const notifyTarget = newStatus === 'accepted' || newStatus === 'done' ? match.seeker_id : match.provider_id;
    try {
        const ok = await cooldown.tryNotify(notifyTarget, `match_${newStatus}`);
        if (ok) {
            await notifications.notify(notifyTarget, `match_${newStatus}`, {
                title: 'Actualizacion de match',
                body: `Tu match cambio a estado: ${newStatus}`,
                payload: { match_id: matchId, status: newStatus },
            });
        }
    } catch { }
    try { logEvent({ type: `match.${newStatus}`, actorUserId: actingUserId, targetType: 'match', targetId: matchId, meta: { prev_status: match.status, new_status: newStatus } }); } catch { }

    return requireMatch(matchId);
}

function listMessages(matchId, actingUserId, opts) {
    const match = requireMatch(matchId);
    requireParticipant(match, actingUserId);
    return repo.listMessages(matchId, opts);
}

function postMessage(matchId, actingUserId, message) {
    const match = requireMatch(matchId);
    requireParticipant(match, actingUserId);
    const id = repo.insertMessage(matchId, actingUserId, message);
    return { id };
}

function setAgreement(matchId, actingUserId, agreement) {
    const match = requireMatch(matchId);
    requireParticipant(match, actingUserId);

    // Don't allow agreement changes after completion
    if (match.status === 'done') throw httpError(422, 'Cannot change agreement on a completed match');

    db.transaction(() => {
        repo.setAgreement(matchId, {
            compensation_type: agreement.compensation_type,
            points_agreed: agreement.compensation_type === 'cash' ? agreement.points_agreed : 0,
            barter_terms: agreement.compensation_type === 'barter' ? agreement.barter_terms : null,
        });
        // Add a system-like message so both parties see it in chat
        const summary = agreement.compensation_type === 'cash'
            ? `[SYSTEM] Acuerdo confirmado: pago en EUR = ${agreement.points_agreed} €.`
            : (agreement.compensation_type === 'barter'
                ? `[SYSTEM] Acuerdo confirmado: trueque — ${agreement.barter_terms}`
                : '[SYSTEM] Acuerdo confirmado: altruista (sin compensación)');
        repo.insertMessage(matchId, actingUserId, summary);
    })();

    return requireMatch(matchId);
}

function submitRating(matchId, actingUserId, { rating, review }) {
    const match = requireMatch(matchId);
    if (match.status !== 'done') throw httpError(422, 'Ratings only allowed on completed matches');

    const isProvider = match.provider_id === actingUserId;
    const isSeeker = match.seeker_id === actingUserId;
    if (!isProvider && !isSeeker) throw httpError(403, 'Forbidden');

    if (isProvider) {
        if (match.provider_rating !== null) throw httpError(409, 'Rating already submitted');
        repo.setRating(matchId, 'provider', rating, review);
        updateUserRating(match.seeker_id);

        if (Number(rating) === 5) {
            try { badgesSvc.awardBadge(match.seeker_id, 'five_star', matchId); } catch { }
        }
    } else {
        if (match.seeker_rating !== null) throw httpError(409, 'Rating already submitted');
        repo.setRating(matchId, 'seeker', rating, review);
        updateUserRating(match.provider_id);

        if (Number(rating) === 5) {
            try { badgesSvc.awardBadge(match.provider_id, 'five_star', matchId); } catch { }
        }
    }

    return requireMatch(matchId);
}

module.exports = { list, getById, create, changeStatus, submitRating, listMessages, postMessage, setAgreement };
