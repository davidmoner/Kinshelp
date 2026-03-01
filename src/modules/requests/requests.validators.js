'use strict';
const httpError = require('../../shared/http-error');
const { CATEGORIES } = require('../../config/constants');

function validateCreate(body) {
  const { title, category, points_offered, expires_at, compensation_type, location_text, when } = body;
  if (!title) throw httpError(400, 'title is required');
  if (!category) throw httpError(400, 'category is required');
  if (!location_text) throw httpError(400, 'location_text is required');
  if (!CATEGORIES.includes(category))
    throw httpError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
  const compRaw = compensation_type || 'cash';
  const comp = compRaw === 'coins' ? 'cash' : compRaw;
  if (!['cash', 'barter', 'altruistic'].includes(comp))
    throw httpError(400, "compensation_type must be one of: cash, barter, altruistic");

  // In KingsHelp, the EUR amount is agreed later inside the match chat.
  // Keep request points optional and default to 0.
  if (points_offered !== undefined && points_offered !== null && points_offered !== '') {
    if (+points_offered < 0) throw httpError(400, 'points_offered must be >= 0');
  }
  // expires_at is computed server-side (free: 1 week, premium: 2 months)
  
  const pts = (points_offered === undefined || points_offered === null || points_offered === '') ? 0 : +points_offered;

  const whenNorm = (when === undefined || when === null || when === '') ? 'asap' : String(when);
  if (!['asap', 'today', 'this_week', 'flexible'].includes(whenNorm)) {
    throw httpError(400, 'when must be one of: asap, today, this_week, flexible');
  }

  const loc = String(location_text || '').trim();
  if (loc.length < 2) throw httpError(400, 'location_text must be at least 2 characters');
  if (loc.length > 80) throw httpError(400, 'location_text must be <= 80 characters');

  const out = { ...body };
  out.location_text = loc;
  out.when_text = whenNorm;
  delete out.when;
  out.compensation_type = comp;
  out.points_offered = comp === 'cash' ? pts : 0;
  out.expires_at = expires_at;
  return out;
}

module.exports = { validateCreate };
