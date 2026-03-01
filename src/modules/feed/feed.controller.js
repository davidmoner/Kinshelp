'use strict';
const svc = require('./feed.service');

const list = (req, res, next) => {
  (async () => {
    const { limit = 40, offset = 0 } = req.query;
    res.json({ data: await svc.listFeedForUser(req.user.id, { limit: +limit, offset: +offset }) });
  })().catch(next);
};

module.exports = { list };
