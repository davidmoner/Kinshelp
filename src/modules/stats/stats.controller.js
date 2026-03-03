'use strict';
const svc = require('./stats.service');

const getStats = (req, res, next) => {
  Promise.resolve(svc.getStats())
    .then(data => res.json({ ok: true, data, ts: new Date().toISOString() }))
    .catch(next);
};

module.exports = { getStats };
