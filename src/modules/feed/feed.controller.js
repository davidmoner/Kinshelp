'use strict';
const svc = require('./feed.service');

const list = (req, res, next) => {
  (async () => {
    const { limit = 40, offset = 0 } = req.query;
    const userId = req.user ? req.user.id : null;
    res.json({ data: await svc.listFeedForUser(userId, { limit: +limit, offset: +offset }) });
  })().catch(next);
};

module.exports = { list };
