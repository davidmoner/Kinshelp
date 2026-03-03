'use strict';
const db = require('../../config/db');

async function getStats() {
  if (db.isPg) {
    const [matchesDone, badges, rep, users] = await Promise.all([
      db.one("SELECT COUNT(*)::int AS n FROM matches WHERE status = 'done'", []),
      db.one('SELECT COUNT(*)::int AS n FROM user_badges', []),
      db.one('SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0)::int AS n FROM points_ledger', []),
      db.one('SELECT COUNT(*)::int AS n FROM users', []),
    ]);

    return {
      matches_done: matchesDone.n || 0,
      badges_awarded: badges.n || 0,
      reputation_gained: rep.n || 0,
      users_total: users.n || 0,
    };
  }

  const matchesDone = (db.prepare("SELECT COUNT(*) AS n FROM matches WHERE status = 'done'").get() || {}).n || 0;
  const badges = (db.prepare('SELECT COUNT(*) AS n FROM user_badges').get() || {}).n || 0;
  const rep = (db.prepare('SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS n FROM points_ledger').get() || {}).n || 0;
  const users = (db.prepare('SELECT COUNT(*) AS n FROM users').get() || {}).n || 0;

  return {
    matches_done: matchesDone,
    badges_awarded: badges,
    reputation_gained: rep,
    users_total: users,
  };
}

module.exports = { getStats };
