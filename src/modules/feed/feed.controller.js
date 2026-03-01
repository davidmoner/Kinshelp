'use strict';
const svc = require('./feed.service');

const list = (req, res, next) => {
  try {
    const { limit = 40, offset = 0 } = req.query;
    res.json({ data: svc.listFeedForUser(req.user.id, { limit: +limit, offset: +offset }) });
  } catch (e) { next(e); }
};

module.exports = { list };
