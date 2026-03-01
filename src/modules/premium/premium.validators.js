'use strict';
const httpError = require('../../shared/http-error');

function validateCheckout(body) {
  const interval = (body && body.interval) || 'month';
  if (!['month', 'year'].includes(interval)) throw httpError(400, "interval must be 'month' or 'year'");
  const success_url = body && body.success_url ? String(body.success_url) : null;
  const cancel_url = body && body.cancel_url ? String(body.cancel_url) : null;
  return { interval, success_url, cancel_url };
}

module.exports = { validateCheckout };
