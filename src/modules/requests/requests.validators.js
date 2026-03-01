'use strict';
const httpError = require('../../shared/http-error');
const { CATEGORIES } = require('../../config/constants');

function validateCreate(body) {
  const { title, category, points_offered, expires_at, compensation_type } = body;
  if (!title) throw httpError(400, 'title is required');
  if (!category) throw httpError(400, 'category is required');
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
  return { ...body, compensation_type: comp, points_offered: comp === 'cash' ? pts : 0, expires_at };
}

module.exports = { validateCreate };
