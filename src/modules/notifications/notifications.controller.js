'use strict';
const svc = require('./notifications.service');

const list = (req, res, next) => {
  (async () => {
    const { limit = 40, offset = 0, unread } = req.query;
    const data = await svc.list(req.user.id, {
      limit: +limit,
      offset: +offset,
      unreadOnly: String(unread || '').toLowerCase() === 'true',
    });
    res.json({ data });
  })().catch(next);
};

const markRead = (req, res, next) => {
  (async () => {
    await svc.markRead(req.user.id, req.params.id);
    res.json({ ok: true });
  })().catch(next);
};

module.exports = { list, markRead };
