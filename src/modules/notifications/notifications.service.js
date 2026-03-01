'use strict';
const repo = require('./notifications.repo');

async function notify(userId, kind, { title = null, body = null, payload = {} } = {}) {
  if (!userId) return null;
  return repo.create({ userId, kind, title, body, payload });
}

async function list(userId, opts) {
  return repo.listForUser(userId, opts || {});
}

async function markRead(userId, notificationId) {
  return repo.markRead(userId, notificationId);
}

module.exports = { notify, list, markRead };
