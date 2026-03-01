'use strict';
const httpError = require('../../shared/http-error');
const { MATCH_ACTION_PERMISSIONS } = require('../../config/constants');

const VALID_ACTIONS = new Set(Object.keys(MATCH_ACTION_PERMISSIONS));

function validateCreate(body) {
    const { offer_id, request_id, provider_id, seeker_id, points_agreed, initiated_by, compensation_type } = body;
    if (!offer_id && !request_id)
        throw httpError(400, 'At least one of offer_id or request_id is required');
    if (!provider_id) throw httpError(400, 'provider_id is required');
    if (!seeker_id) throw httpError(400, 'seeker_id is required');
    const compRaw = compensation_type || 'cash';
    const comp = compRaw === 'coins' ? 'cash' : compRaw;
    if (!['cash', 'barter', 'altruistic'].includes(comp))
        throw httpError(400, "compensation_type must be one of: cash, barter, altruistic");

    // points_agreed (EUR) is agreed later in the match chat.
    if (points_agreed !== undefined && points_agreed !== null && points_agreed !== '') {
        if (+points_agreed < 0) throw httpError(400, 'points_agreed must be >= 0');
    }
    if (!initiated_by || !['provider', 'seeker'].includes(initiated_by))
        throw httpError(400, "initiated_by must be 'provider' or 'seeker'");
    if (provider_id === seeker_id)
        throw httpError(400, 'Provider and seeker must be different users');

    const pts = (points_agreed === undefined || points_agreed === null || points_agreed === '') ? 0 : +points_agreed;
    return {
        offer_id,
        request_id,
        provider_id,
        seeker_id,
        compensation_type: comp,
        points_agreed: comp === 'cash' ? pts : 0,
        initiated_by,
    };
}

function validateMessage(body) {
    const text = String((body && body.message) || '').trim();
    if (!text) throw httpError(400, 'message is required');
    if (text.length > 1200) throw httpError(400, 'message too long');
    return { message: text };
}

function validateAgreement(body) {
    const compRaw = (body && body.compensation_type) || 'cash';
    const comp = compRaw === 'coins' ? 'cash' : compRaw;
    if (!['cash', 'barter', 'altruistic'].includes(comp))
        throw httpError(400, "compensation_type must be one of: cash, barter, altruistic");

    const out = { compensation_type: comp };
    if (comp === 'cash') {
        const pts = +(body && body.points_agreed);
        if (!body || body.points_agreed === undefined || body.points_agreed === null || body.points_agreed === '')
            throw httpError(400, 'points_agreed is required');
        if (pts < 1) throw httpError(400, 'points_agreed must be >= 1');
        out.points_agreed = pts;
    }
    if (comp === 'barter') {
        const terms = String((body && body.barter_terms) || '').trim();
        if (!terms) throw httpError(400, 'barter_terms is required');
        if (terms.length > 2000) throw httpError(400, 'barter_terms too long');
        out.barter_terms = terms;
    }
    if (comp === 'altruistic') {
        out.points_agreed = 0;
        out.barter_terms = null;
    }
    return out;
}

function validateAction(action) {
    if (!action) throw httpError(400, 'action is required');
    if (!VALID_ACTIONS.has(action))
        throw httpError(400, `Valid actions: ${[...VALID_ACTIONS].join(', ')}`);
    return action;
}

function validateRating(body) {
    const rating = +(body.rating);
    if (!body.rating) throw httpError(400, 'rating is required');
    if (rating < 1 || rating > 5) throw httpError(400, 'rating must be 1–5');
    return { rating, review: body.review || null };
}

module.exports = { validateCreate, validateAction, validateRating, validateMessage, validateAgreement };
