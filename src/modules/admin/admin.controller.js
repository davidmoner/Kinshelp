'use strict';
const { randomUUID } = require('crypto');
const repo = require('./admin.repo');
const eventsRepo = require('./admin.events.repo');
const reportsRepo = require('./admin.reports.repo');
const httpError = require('../../shared/http-error');

function safeUser(user) {
  if (!user) return null;
  const { password_hash, lat, lng, ...safe } = user;
  // Avoid exposing exact geo and password hash.
  return safe;
}

function me(req, res) {
  res.json({ ok: true, admin: true, user: safeUser(req.user) });
}

function overview(req, res) {
  // Keep MVP minimal and safe. Expand later.
  // For now: total users + last 24h registrations.
  const db = require('../../config/db');

  const get = async () => {
    if (db.isPg) {
      const [a, b, reqOpen, mPend, mDone, prem] = await Promise.all([
        db.one('SELECT COUNT(*)::int AS n FROM users', []),
        db.one("SELECT COUNT(*)::int AS n FROM users WHERE created_at >= (now() - interval '1 day')", []),
        db.one("SELECT COUNT(*)::int AS n FROM help_requests WHERE status = 'open'", []),
        db.one("SELECT COUNT(*)::int AS n FROM matches WHERE status = 'pending'", []),
        db.one("SELECT COUNT(*)::int AS n FROM matches WHERE status = 'done'", []),
        db.one("SELECT COUNT(*)::int AS n FROM users WHERE premium_tier <> 'free'", []),
      ]);
      return {
        users: { total: a.n, last_24h: b.n },
        requests: { open: reqOpen.n },
        matches: { pending: mPend.n, done: mDone.n },
        premium: { active_users: prem.n },
      };
    }

    const totalUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const last24h = db.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-1 day')").get().n;
    const reqOpen = db.prepare("SELECT COUNT(*) AS n FROM help_requests WHERE status = 'open'").get().n;
    const mPend = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE status = 'pending'").get().n;
    const mDone = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE status = 'done'").get().n;
    const prem = db.prepare("SELECT COUNT(*) AS n FROM users WHERE premium_tier <> 'free'").get().n;
    return {
      users: { total: totalUsers, last_24h: last24h },
      requests: { open: reqOpen },
      matches: { pending: mPend, done: mDone },
      premium: { active_users: prem },
    };
  };

  get().then(async (stats) => {
    const events = await Promise.resolve(eventsRepo.listEvents({ limit: 12, offset: 0 }));
    const reports = await Promise.resolve(reportsRepo.listReports({ status: 'open', limit: 8, offset: 0 }));
    res.json({ ok: true, data: { ...stats, recent_events: events, open_reports: reports } });
  }).catch(() => res.status(500).json({ error: 'Failed to compute overview' }));
}

function listEvents(req, res) {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const offset = (page - 1) * limit;
  const type = req.query.type ? String(req.query.type) : null;
  Promise.resolve(eventsRepo.listEvents({ type, limit, offset }))
    .then(rows => res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } }))
    .catch(() => res.status(500).json({ error: 'Failed to load events' }));
}

function listReports(req, res) {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const offset = (page - 1) * limit;
  const status = req.query.status ? String(req.query.status) : null;
  Promise.resolve(reportsRepo.listReports({ status, limit, offset }))
    .then(rows => res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } }))
    .catch(() => res.status(500).json({ error: 'Failed to load reports' }));
}

function createReport(req, res) {
  const { target_type, target_id, reason } = req.body || {};
  if (!target_type || !target_id || !reason) throw httpError(400, 'Missing target_type, target_id, or reason');
  Promise.resolve(reportsRepo.createReport({ reporterId: req.user.id, targetType: String(target_type), targetId: String(target_id), reason: String(reason) }))
    .then(out => {
      // Track as an admin event as well.
      return Promise.resolve(eventsRepo.logEvent({
        type: 'report.created',
        actorUserId: req.user.id,
        targetType: String(target_type),
        targetId: String(target_id),
        meta: { reason: String(reason) },
      })).then(() => out);
    })
    .then(out => res.status(201).json({ ok: true, data: out }))
    .catch(() => res.status(500).json({ error: 'Failed to create report' }));
}

function resolveReport(req, res) {
  const id = String(req.params.id);
  const notes = (req.body && req.body.notes) ? String(req.body.notes) : null;
  Promise.resolve(reportsRepo.resolveReport({ id, adminUserId: req.user.id, notes }))
    .then(() => repo.insertAudit({
      id: randomUUID(),
      adminUserId: req.user.id,
      action: 'report.resolve',
      entityType: 'report',
      entityId: id,
      beforeJson: null,
      afterJson: JSON.stringify({ status: 'resolved', notes: notes || null }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    }))
    .then(() => Promise.resolve(eventsRepo.logEvent({ type: 'report.resolved', actorUserId: req.user.id, targetType: 'report', targetId: id, meta: { notes: notes || null } })))
    .then(() => res.json({ ok: true }))
    .catch(() => res.status(500).json({ error: 'Failed to resolve report' }));
}

function hideReportTarget(req, res) {
  const id = String(req.params.id);
  Promise.resolve(reportsRepo.getReportById(id))
    .then(report => {
      if (!report) throw httpError(404, 'Report not found');
      const targetType = String(report.target_type || '').toLowerCase();
      if (!['offer', 'request'].includes(targetType)) throw httpError(400, 'Unsupported target type');
      return Promise.resolve(reportsRepo.setContentHidden({ targetType, targetId: String(report.target_id), hidden: true }))
        .then(() => report);
    })
    .then(report => repo.insertAudit({
      id: randomUUID(),
      adminUserId: req.user.id,
      action: 'report.hide_target',
      entityType: report.target_type,
      entityId: report.target_id,
      beforeJson: null,
      afterJson: JSON.stringify({ is_hidden: true, report_id: report.id }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    }).then(() => report))
    .then(report => Promise.resolve(eventsRepo.logEvent({
      type: 'content.hidden',
      actorUserId: req.user.id,
      targetType: report.target_type,
      targetId: report.target_id,
      meta: { report_id: report.id },
    })))
    .then(() => res.json({ ok: true }))
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to hide content' }));
}

function unhideReportTarget(req, res) {
  const id = String(req.params.id);
  Promise.resolve(reportsRepo.getReportById(id))
    .then(report => {
      if (!report) throw httpError(404, 'Report not found');
      const targetType = String(report.target_type || '').toLowerCase();
      if (!['offer', 'request'].includes(targetType)) throw httpError(400, 'Unsupported target type');
      return Promise.resolve(reportsRepo.setContentHidden({ targetType, targetId: String(report.target_id), hidden: false }))
        .then(() => report);
    })
    .then(report => repo.insertAudit({
      id: randomUUID(),
      adminUserId: req.user.id,
      action: 'report.unhide_target',
      entityType: report.target_type,
      entityId: report.target_id,
      beforeJson: null,
      afterJson: JSON.stringify({ is_hidden: false, report_id: report.id }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    }).then(() => report))
    .then(report => Promise.resolve(eventsRepo.logEvent({
      type: 'content.unhidden',
      actorUserId: req.user.id,
      targetType: report.target_type,
      targetId: report.target_id,
      meta: { report_id: report.id },
    })))
    .then(() => res.json({ ok: true }))
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to unhide content' }));
}

function listUsers(req, res) {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const offset = (page - 1) * limit;
  const query = req.query.query ? String(req.query.query) : '';
  const rows = repo.listUsers({ query, limit, offset });
  res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } });
}

function listRequests(req, res) {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const offset = (page - 1) * limit;
  const query = req.query.query ? String(req.query.query) : '';
  const rows = repo.listRequests({ query, limit, offset });
  res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } });
}

function listOffers(req, res) {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const offset = (page - 1) * limit;
  const query = req.query.query ? String(req.query.query) : '';
  const rows = repo.listOffers({ query, limit, offset });
  res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } });
}

function getUser(req, res) {
  const u = repo.getUserById(req.params.id);
  if (!u) throw httpError(404, 'User not found');
  res.json({ ok: true, data: safeUser(u) });
}

function getUserDetail(req, res) {
  const db = require('../../config/db');
  const id = String(req.params.id);
  const fetch = async () => {
    const user = await Promise.resolve(repo.getUserById(id));
    if (!user) throw httpError(404, 'User not found');

    if (db.isPg) {
      const [badges, matches, reports] = await Promise.all([
        db.many(`
          SELECT b.slug, b.name, b.icon_url, ub.awarded_at
          FROM user_badges ub
          JOIN badges b ON b.id = ub.badge_id
          WHERE ub.user_id = $1
          ORDER BY ub.awarded_at DESC
          LIMIT 50
        `, [id]),
        db.many(`
          SELECT id, status, provider_id, seeker_id, created_at, completed_at
          FROM matches
          WHERE provider_id = $1 OR seeker_id = $1
          ORDER BY created_at DESC
          LIMIT 50
        `, [id]),
        db.many(`
          SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at
          FROM reports r
          LEFT JOIN service_offers o ON r.target_type = 'offer' AND o.id = r.target_id
          LEFT JOIN help_requests h ON r.target_type = 'request' AND h.id = r.target_id
          WHERE o.provider_id = $1 OR h.seeker_id = $1
          ORDER BY r.created_at DESC
          LIMIT 50
        `, [id]),
      ]);
      return { user: safeUser(user), badges, matches, reports };
    }

    const badges = db.prepare(`
      SELECT b.slug, b.name, b.icon_url, ub.awarded_at
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ?
      ORDER BY ub.awarded_at DESC
      LIMIT 50
    `).all(id);
    const matches = db.prepare(`
      SELECT id, status, provider_id, seeker_id, created_at, completed_at
      FROM matches
      WHERE provider_id = ? OR seeker_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(id, id);
    const reports = db.prepare(`
      SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at
      FROM reports r
      LEFT JOIN service_offers o ON r.target_type = 'offer' AND o.id = r.target_id
      LEFT JOIN help_requests h ON r.target_type = 'request' AND h.id = r.target_id
      WHERE o.provider_id = ? OR h.seeker_id = ?
      ORDER BY r.created_at DESC
      LIMIT 50
    `).all(id, id);

    return { user: safeUser(user), badges, matches, reports };
  };

  Promise.resolve(fetch())
    .then(data => res.json({ ok: true, data }))
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to load user detail' }));
}

function patchUser(req, res) {
  // Minimal, safe patch: allow toggling is_verified only for now.
  const db = require('../../config/db');

  const id = req.params.id;
  const before = repo.getUserById(id);
  if (!before) throw httpError(404, 'User not found');

  const fields = {};
  if (req.body.is_verified !== undefined) fields.is_verified = req.body.is_verified ? 1 : 0;
  if (req.body.is_banned !== undefined) fields.is_banned = req.body.is_banned ? 1 : 0;

  const keys = Object.keys(fields);
  if (!keys.length) throw httpError(400, 'No fields to update');

  if (db.isPg) {
    const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const vals = keys.map(k => fields[k]);
    db.exec(`UPDATE users SET ${setSql}, updated_at = now() WHERE id = $${keys.length + 1}`, [...vals, id])
      .then(() => repo.getUserById(id))
      .then(after => {
        return repo.insertAudit({
          id: randomUUID(),
          adminUserId: req.user.id,
          action: 'user.patch',
          entityType: 'user',
          entityId: id,
          beforeJson: JSON.stringify(safeUser(before)),
          afterJson: JSON.stringify(safeUser(after)),
          ip: req.ip,
          userAgent: req.headers['user-agent'] || null,
        }).then(() => res.json({ ok: true, data: safeUser(after) }));
      })
      .catch(() => res.status(500).json({ error: 'Failed to update user' }));
    return;
  }

  const setSql = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => fields[k]);
  db.prepare(`UPDATE users SET ${setSql}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id);
  const after = repo.getUserById(id);

  repo.insertAudit({
    id: randomUUID(),
    adminUserId: req.user.id,
    action: 'user.patch',
    entityType: 'user',
    entityId: id,
    beforeJson: JSON.stringify(safeUser(before)),
    afterJson: JSON.stringify(safeUser(after)),
    ip: req.ip,
    userAgent: req.headers['user-agent'] || null,
  });

  res.json({ ok: true, data: safeUser(after) });
}

function banUser(req, res) {
  const db = require('../../config/db');
  const id = req.params.id;
  const before = repo.getUserById(id);
  if (!before) throw httpError(404, 'User not found');
  const now = new Date().toISOString();
  if (db.isPg) {
    db.exec('UPDATE users SET is_banned = TRUE, updated_at = $1 WHERE id = $2', [now, id])
      .then(() => {
        eventsRepo.logEvent({ type: 'user.ban', actorUserId: req.user.id, targetType: 'user', targetId: id, meta: {} });
        return repo.insertAudit({ id: randomUUID(), adminUserId: req.user.id, action: 'user.ban', entityType: 'user', entityId: id, beforeJson: JSON.stringify(safeUser(before)), afterJson: JSON.stringify({ is_banned: true }), ip: req.ip, userAgent: req.headers['user-agent'] || null });
      })
      .then(() => res.json({ ok: true }))
      .catch(() => res.status(500).json({ error: 'Failed to ban user' }));
    return;
  }
  db.prepare("UPDATE users SET is_banned = 1, updated_at = ? WHERE id = ?").run(now, id);
  try { eventsRepo.logEvent({ type: 'user.ban', actorUserId: req.user.id, targetType: 'user', targetId: id, meta: {} }); } catch { }
  repo.insertAudit({ id: randomUUID(), adminUserId: req.user.id, action: 'user.ban', entityType: 'user', entityId: id, beforeJson: JSON.stringify(safeUser(before)), afterJson: JSON.stringify({ is_banned: true }), ip: req.ip, userAgent: req.headers['user-agent'] || null });
  res.json({ ok: true });
}

function unbanUser(req, res) {
  const db = require('../../config/db');
  const id = req.params.id;
  const before = repo.getUserById(id);
  if (!before) throw httpError(404, 'User not found');
  const now = new Date().toISOString();
  if (db.isPg) {
    db.exec('UPDATE users SET is_banned = FALSE, updated_at = $1 WHERE id = $2', [now, id])
      .then(() => {
        eventsRepo.logEvent({ type: 'user.unban', actorUserId: req.user.id, targetType: 'user', targetId: id, meta: {} });
        return repo.insertAudit({ id: randomUUID(), adminUserId: req.user.id, action: 'user.unban', entityType: 'user', entityId: id, beforeJson: JSON.stringify({ is_banned: true }), afterJson: JSON.stringify({ is_banned: false }), ip: req.ip, userAgent: req.headers['user-agent'] || null });
      })
      .then(() => res.json({ ok: true }))
      .catch(() => res.status(500).json({ error: 'Failed to unban user' }));
    return;
  }
  db.prepare("UPDATE users SET is_banned = 0, updated_at = ? WHERE id = ?").run(now, id);
  try { eventsRepo.logEvent({ type: 'user.unban', actorUserId: req.user.id, targetType: 'user', targetId: id, meta: {} }); } catch { }
  repo.insertAudit({ id: randomUUID(), adminUserId: req.user.id, action: 'user.unban', entityType: 'user', entityId: id, beforeJson: JSON.stringify({ is_banned: true }), afterJson: JSON.stringify({ is_banned: false }), ip: req.ip, userAgent: req.headers['user-agent'] || null });
  res.json({ ok: true });
}

function resetCooldowns(req, res) {
  const db = require('../../config/db');
  const id = String(req.params.id);
  const now = new Date().toISOString();

  const run = async () => {
    if (db.isPg) {
      await db.exec('DELETE FROM notification_cooldowns WHERE user_id = $1', [id]);
      return;
    }
    db.prepare('DELETE FROM notification_cooldowns WHERE user_id = ?').run(id);
  };

  Promise.resolve(run())
    .then(() => repo.insertAudit({
      id: randomUUID(),
      adminUserId: req.user.id,
      action: 'user.reset_cooldowns',
      entityType: 'user',
      entityId: id,
      beforeJson: null,
      afterJson: JSON.stringify({ reset_at: now }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    }))
    .then(() => Promise.resolve(eventsRepo.logEvent({ type: 'user.cooldowns_reset', actorUserId: req.user.id, targetType: 'user', targetId: id, meta: {} })))
    .then(() => res.json({ ok: true }))
    .catch(() => res.status(500).json({ error: 'Failed to reset cooldowns' }));
}

function listAudit(req, res) {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const offset = (page - 1) * limit;
  const rows = repo.listAudit({ limit, offset });
  res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } });
}

function getConfig(req, res) {
  Promise.resolve(repo.getConfig())
    .then(cfg => res.json({ ok: true, data: cfg }))
    .catch(() => res.status(500).json({ error: 'Failed to load config' }));
}

function patchConfig(req, res) {
  const body = req.body || {};
  const keys = Object.keys(body);
  if (!keys.length) throw httpError(400, 'No config keys to update');

  const beforeOut = repo.getConfig();
  const beforeP = (beforeOut && typeof beforeOut.then === 'function') ? beforeOut : Promise.resolve(beforeOut);

  beforeP.then(before => {
    const ups = keys.map(k => repo.upsertConfig(String(k), JSON.stringify(body[k])));
    return Promise.all(ups).then(() => ({ before }));
  }).then(({ before }) => {
    const afterOut = repo.getConfig();
    const afterP = (afterOut && typeof afterOut.then === 'function') ? afterOut : Promise.resolve(afterOut);
    return afterP.then(after => ({ before, after }));
  }).then(({ before, after }) => {
    return repo.insertAudit({
      id: randomUUID(),
      adminUserId: req.user.id,
      action: 'config.patch',
      entityType: 'config',
      entityId: null,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    }).then(() => res.json({ ok: true, data: after }));
  }).catch(() => res.status(500).json({ error: 'Failed to update config' }));
}

module.exports = {
  me,
  overview,
  listEvents,
  listUsers,
  listRequests,
  listOffers,
  getUser,
  getUserDetail,
  patchUser,
  banUser,
  unbanUser,
  resetCooldowns,
  listAudit,
  listReports,
  createReport,
  resolveReport,
  hideReportTarget,
  unhideReportTarget,
  getConfig,
  patchConfig,
};
