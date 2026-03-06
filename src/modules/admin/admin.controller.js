'use strict';
const { randomUUID } = require('crypto');
const repo = require('./admin.repo');
const eventsRepo = require('./admin.events.repo');
const reportsRepo = require('./admin.reports.repo');
const badgesRepo = require('../badges/badges.repo');
const badgesService = require('../badges/badges.service');
const db = require('../../config/db');
const pointsRepo = require('../points/points.repo');
const { OFFER_STATUS, REQUEST_STATUS, PREMIUM_TIER } = require('../../config/constants');
const httpError = require('../../shared/http-error');

function safeUser(user) {
  if (!user) return null;
  const { password_hash, lat, lng, ...safe } = user;
  // Avoid exposing exact geo and password hash.
  return safe;
}

function me(req, res) {
  res.json({ ok: true, admin: true, role: req.admin ? req.admin.role : 'admin', user: safeUser(req.user) });
}

function overview(req, res) {
  // Keep MVP minimal and safe. Expand later.
  // For now: total users + last 24h registrations.
  const get = async () => {
    if (db.isPg) {
      const [a, b, reqOpen, offOpen, mPend, mDone, prem] = await Promise.all([
        db.one('SELECT COUNT(*)::int AS n FROM users', []),
        db.one("SELECT COUNT(*)::int AS n FROM users WHERE created_at >= (now() - interval '1 day')", []),
        db.one("SELECT COUNT(*)::int AS n FROM help_requests WHERE status = 'open'", []),
        db.one("SELECT COUNT(*)::int AS n FROM service_offers WHERE status = 'open'", []),
        db.one("SELECT COUNT(*)::int AS n FROM matches WHERE status = 'pending'", []),
        db.one("SELECT COUNT(*)::int AS n FROM matches WHERE status = 'done'", []),
        db.one("SELECT COUNT(*)::int AS n FROM users WHERE premium_tier <> 'free'", []),
      ]);
      return {
        users: { total: a.n, last_24h: b.n },
        requests: { open: reqOpen.n, offers_open: offOpen.n },
        matches: { pending: mPend.n, done: mDone.n },
        premium: { active_users: prem.n },
      };
    }

    const totalUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const last24h = db.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-1 day')").get().n;
    const reqOpen = db.prepare("SELECT COUNT(*) AS n FROM help_requests WHERE status = 'open'").get().n;
    const offOpen = db.prepare("SELECT COUNT(*) AS n FROM service_offers WHERE status = 'open'").get().n;
    const mPend = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE status = 'pending'").get().n;
    const mDone = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE status = 'done'").get().n;
    const prem = db.prepare("SELECT COUNT(*) AS n FROM users WHERE premium_tier <> 'free'").get().n;
    return {
      users: { total: totalUsers, last_24h: last24h },
      requests: { open: reqOpen, offers_open: offOpen },
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
  const status = req.query.status ? String(req.query.status) : '';
  const verified = req.query.verified ? String(req.query.verified) : '';
  const premium = req.query.premium ? String(req.query.premium) : '';
  Promise.resolve(repo.listUsers({ query, status, verified, premium, limit, offset }))
    .then(rows => res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } }))
    .catch(() => res.status(500).json({ error: 'Failed to load users' }));
}

function listRequests(req, res) {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const offset = (page - 1) * limit;
  const query = req.query.query ? String(req.query.query) : '';
  Promise.resolve(repo.listRequests({ query, limit, offset }))
    .then(rows => res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } }))
    .catch(() => res.status(500).json({ error: 'Failed to load requests' }));
}

function listOffers(req, res) {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const offset = (page - 1) * limit;
  const query = req.query.query ? String(req.query.query) : '';
  Promise.resolve(repo.listOffers({ query, limit, offset }))
    .then(rows => res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } }))
    .catch(() => res.status(500).json({ error: 'Failed to load offers' }));
}

function listMatches(req, res) {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const offset = (page - 1) * limit;
  const query = req.query.query ? String(req.query.query) : '';
  Promise.resolve(repo.listMatches({ query, limit, offset }))
    .then(rows => res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } }))
    .catch(() => res.status(500).json({ error: 'Failed to load matches' }));
}

function getRequestDetail(req, res) {
  const id = String(req.params.id);
  Promise.resolve(repo.getRequestById(id))
    .then(row => {
      if (!row) throw httpError(404, 'Request not found');
      res.json({ ok: true, data: row });
    })
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to load request' }));
}

function getOfferDetail(req, res) {
  const id = String(req.params.id);
  Promise.resolve(repo.getOfferById(id))
    .then(row => {
      if (!row) throw httpError(404, 'Offer not found');
      res.json({ ok: true, data: row });
    })
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to load offer' }));
}

function getMatchDetail(req, res) {
  const id = String(req.params.id);
  Promise.resolve(repo.getMatchById(id))
    .then(row => {
      if (!row) throw httpError(404, 'Match not found');
      res.json({ ok: true, data: row });
    })
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to load match' }));
}

function setContentHidden(req, res, hidden) {
  const type = String(req.params.type || '').toLowerCase();
  const id = String(req.params.id);
  if (!['offer', 'request'].includes(type)) throw httpError(400, 'Unsupported content type');

  const beforeP = Promise.resolve(type === 'offer' ? repo.getOfferById(id) : repo.getRequestById(id));
  beforeP.then(before => {
    if (!before) throw httpError(404, 'Content not found');
    return Promise.resolve(reportsRepo.setContentHidden({ targetType: type, targetId: id, hidden }))
      .then(() => repo.insertAudit({
        id: randomUUID(),
        adminUserId: req.user.id,
        action: hidden ? 'content.hide' : 'content.unhide',
        entityType: type,
        entityId: id,
        beforeJson: JSON.stringify({ is_hidden: before.is_hidden }),
        afterJson: JSON.stringify({ is_hidden: !!hidden }),
        ip: req.ip,
        userAgent: req.headers['user-agent'] || null,
      }))
      .then(() => Promise.resolve(eventsRepo.logEvent({
        type: hidden ? 'content.hidden' : 'content.unhidden',
        actorUserId: req.user.id,
        targetType: type,
        targetId: id,
        meta: { source: 'admin' },
      })))
      .then(() => res.json({ ok: true }));
  }).catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to update content' }));
}

function hideContent(req, res) {
  return setContentHidden(req, res, true);
}

function unhideContent(req, res) {
  return setContentHidden(req, res, false);
}

function getUser(req, res) {
  Promise.resolve(repo.getUserById(req.params.id))
    .then(u => {
      if (!u) throw httpError(404, 'User not found');
      res.json({ ok: true, data: safeUser(u) });
    })
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to load user' }));
}

function getUserDetail(req, res) {
  const id = String(req.params.id);
  const fetch = async () => {
    const user = await Promise.resolve(repo.getUserById(id));
    if (!user) throw httpError(404, 'User not found');

    const allBadges = await Promise.resolve(badgesRepo.findAll()).catch(() => []);

    if (db.isPg) {
      const [badges, matches, reports] = await Promise.all([
        db.many(`
          SELECT b.slug, b.name, b.icon_url, ub.awarded_at
          FROM user_badges ub
          JOIN badges b ON b.id = ub.badge_id
          WHERE ub.user_id = $1
          ORDER BY ub.awarded_at DESC
          LIMIT 50
        `, [id]).catch(() => []),
        db.many(`
          SELECT id, status, provider_id, seeker_id, created_at, completed_at
          FROM matches
          WHERE provider_id = $1 OR seeker_id = $1
          ORDER BY created_at DESC
          LIMIT 50
        `, [id]).catch(() => []),
        db.many(`
          SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at
          FROM reports r
          LEFT JOIN service_offers o ON r.target_type = 'offer' AND o.id = r.target_id
          LEFT JOIN help_requests h ON r.target_type = 'request' AND h.id = r.target_id
          WHERE o.provider_id = $1 OR h.seeker_id = $1
          ORDER BY r.created_at DESC
          LIMIT 50
        `, [id]).catch(() => []),
      ]);
      return { user: safeUser(user), badges, matches, reports, allBadges };
    }

    let badges = [];
    let matches = [];
    let reports = [];
    try {
      badges = db.prepare(`
        SELECT b.slug, b.name, b.icon_url, ub.awarded_at
        FROM user_badges ub
        JOIN badges b ON b.id = ub.badge_id
        WHERE ub.user_id = ?
        ORDER BY ub.awarded_at DESC
        LIMIT 50
      `).all(id);
    } catch { badges = []; }
    try {
      matches = db.prepare(`
        SELECT id, status, provider_id, seeker_id, created_at, completed_at
        FROM matches
        WHERE provider_id = ? OR seeker_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(id, id);
    } catch { matches = []; }
    try {
      reports = db.prepare(`
        SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at
        FROM reports r
        LEFT JOIN service_offers o ON r.target_type = 'offer' AND o.id = r.target_id
        LEFT JOIN help_requests h ON r.target_type = 'request' AND h.id = r.target_id
        WHERE o.provider_id = ? OR h.seeker_id = ?
        ORDER BY r.created_at DESC
        LIMIT 50
      `).all(id, id);
    } catch { reports = []; }

    return { user: safeUser(user), badges, matches, reports, allBadges };
  };

  Promise.resolve(fetch())
    .then(data => res.json({ ok: true, data }))
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to load user detail' }));
}

function listCreations(req, res) {
  const kind = String(req.query.kind || req.query.type || 'requests');
  if (kind === 'offers') return listOffers(req, res);
  return listRequests(req, res);
}

function getCreationDetail(req, res) {
  const id = String(req.params.id);
  const kind = String(req.query.kind || req.query.type || 'requests');
  const fetch = kind === 'offers' ? repo.getOfferById(id) : repo.getRequestById(id);
  Promise.resolve(fetch)
    .then(row => {
      if (!row) throw httpError(404, kind === 'offers' ? 'Offer not found' : 'Request not found');
      res.json({ ok: true, data: row });
    })
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to load content' }));
}

function patchCreation(req, res) {
  const id = String(req.params.id);
  const kind = String(req.query.kind || req.query.type || 'requests');
  const body = req.body || {};
  const isOffer = kind === 'offers';
  const table = isOffer ? 'service_offers' : 'help_requests';
  const allowedStatus = isOffer ? OFFER_STATUS : REQUEST_STATUS;

  Promise.resolve(isOffer ? repo.getOfferById(id) : repo.getRequestById(id))
    .then(before => {
      if (!before) throw httpError(404, 'Content not found');

      const updates = {};
      if (body.status) {
        const st = String(body.status);
        if (!allowedStatus.includes(st)) throw httpError(400, 'Invalid status');
        updates.status = st;
      }
      if (body.is_hidden !== undefined) updates.is_hidden = body.is_hidden ? 1 : 0;

      const keys = Object.keys(updates);
      if (!keys.length) throw httpError(400, 'No fields to update');

      const now = new Date().toISOString();
      if (db.isPg) {
        const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        const vals = keys.map(k => updates[k]);
        return db.exec(`UPDATE ${table} SET ${setSql}, updated_at = $${keys.length + 1} WHERE id = $${keys.length + 2}`,
          [...vals, now, id])
          .then(() => repo.insertAudit({
            id: randomUUID(),
            adminUserId: req.user.id,
            action: 'content.patch',
            entityType: isOffer ? 'offer' : 'request',
            entityId: id,
            beforeJson: JSON.stringify({ status: before.status, is_hidden: before.is_hidden }),
            afterJson: JSON.stringify(updates),
            ip: req.ip,
            userAgent: req.headers['user-agent'] || null,
          }))
          .then(() => res.json({ ok: true }));
      }

      const setSql = keys.map(k => `${k} = ?`).join(', ');
      const vals = keys.map(k => updates[k]);
      db.prepare(`UPDATE ${table} SET ${setSql}, updated_at = ? WHERE id = ?`).run(...vals, now, id);
      repo.insertAudit({
        id: randomUUID(),
        adminUserId: req.user.id,
        action: 'content.patch',
        entityType: isOffer ? 'offer' : 'request',
        entityId: id,
        beforeJson: JSON.stringify({ status: before.status, is_hidden: before.is_hidden }),
        afterJson: JSON.stringify(updates),
        ip: req.ip,
        userAgent: req.headers['user-agent'] || null,
      });
      res.json({ ok: true });
      return null;
    })
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to update content' }));
}

function resetPoints(req, res) {
  const id = String(req.params.id);
  const now = new Date().toISOString();
  Promise.resolve(pointsRepo.getBalance(id))
    .then((bal) => {
      const balance = Number(bal || 0);
      if (balance === 0) return { balance: 0 };
      if (db.isPg) {
        return db.exec('UPDATE users SET points_balance = $1, updated_at = $2 WHERE id = $3', [0, now, id])
          .then(() => db.exec(
            'INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [randomUUID(), id, null, -balance, 'admin_reset', 0, now]
          ))
          .then(() => ({ balance }));
      }
      db.prepare('UPDATE users SET points_balance = ?, updated_at = ? WHERE id = ?').run(0, now, id);
      db.prepare('INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(), id, null, -balance, 'admin_reset', 0, now);
      return { balance };
    })
    .then((out) => repo.insertAudit({
      id: randomUUID(),
      adminUserId: req.user.id,
      action: 'user.reset_points',
      entityType: 'user',
      entityId: id,
      beforeJson: JSON.stringify({ balance_before: out.balance }),
      afterJson: JSON.stringify({ balance_after: 0 }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    }))
    .then(() => res.json({ ok: true }))
    .catch(() => res.status(500).json({ error: 'Failed to reset points' }));
}

function addUserBadge(req, res) {
  const id = String(req.params.id);
  const slug = (req.body && req.body.slug) ? String(req.body.slug).trim() : '';
  if (!slug) throw httpError(400, 'Badge slug required');

  Promise.resolve(repo.getUserById(id))
    .then((before) => {
      if (!before) throw httpError(404, 'User not found');
      return Promise.resolve(badgesService.awardBadge(id, slug, null))
        .then((badge) => repo.insertAudit({
          id: randomUUID(),
          adminUserId: req.user.id,
          action: 'user.badge_add',
          entityType: 'user',
          entityId: id,
          beforeJson: JSON.stringify({ slug }),
          afterJson: JSON.stringify({ awarded: !!badge }),
          ip: req.ip,
          userAgent: req.headers['user-agent'] || null,
        }).then(() => res.json({ ok: true, data: badge || null })));
    })
    .catch((err) => res.status(err.status || 500).json({ error: err.message || 'Failed to add badge' }));
}

function removeUserBadge(req, res) {
  const id = String(req.params.id);
  const slug = String(req.params.slug || '').trim();
  if (!slug) throw httpError(400, 'Badge slug required');

  const run = async () => {
    const badge = await Promise.resolve(badgesRepo.getBySlug(slug));
    if (!badge) throw httpError(404, 'Badge not found');
    if (db.isPg) {
      await db.exec('DELETE FROM user_badges WHERE user_id = $1 AND badge_id = $2', [id, badge.id]);
      return badge;
    }
    db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?').run(id, badge.id);
    return badge;
  };

  Promise.resolve(repo.getUserById(id))
    .then((before) => {
      if (!before) throw httpError(404, 'User not found');
      return Promise.resolve(run())
        .then((badge) => repo.insertAudit({
          id: randomUUID(),
          adminUserId: req.user.id,
          action: 'user.badge_remove',
          entityType: 'user',
          entityId: id,
          beforeJson: JSON.stringify({ slug: badge.slug }),
          afterJson: JSON.stringify({ removed: true }),
          ip: req.ip,
          userAgent: req.headers['user-agent'] || null,
        }).then(() => res.json({ ok: true })));
    })
    .catch((err) => res.status(err.status || 500).json({ error: err.message || 'Failed to remove badge' }));
}

function setPoints(req, res) {
  const id = String(req.params.id);
  const raw = req.body && req.body.points_balance;
  const next = Number(raw);
  if (!Number.isFinite(next) || next < 0) throw httpError(400, 'Invalid points value');

  Promise.resolve(repo.getUserById(id))
    .then((before) => {
      if (!before) throw httpError(404, 'User not found');
      const now = new Date().toISOString();
      return Promise.resolve(pointsRepo.getBalance(id))
        .then((bal) => {
          const current = Number(bal || 0);
          const delta = Math.round(next - current);
          if (db.isPg) {
            return db.exec('UPDATE users SET points_balance = $1, updated_at = $2 WHERE id = $3', [next, now, id])
              .then(() => {
                if (delta === 0) return null;
                return db.exec(
                  'INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                  [randomUUID(), id, null, delta, 'admin_set', next, now]
                );
              })
              .then(() => ({ current, delta }));
          }
          db.prepare('UPDATE users SET points_balance = ?, updated_at = ? WHERE id = ?').run(next, now, id);
          if (delta !== 0) {
            db.prepare('INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES (?,?,?,?,?,?,?)')
              .run(randomUUID(), id, null, delta, 'admin_set', next, now);
          }
          return { current, delta };
        })
        .then((out) => repo.insertAudit({
          id: randomUUID(),
          adminUserId: req.user.id,
          action: 'user.set_points',
          entityType: 'user',
          entityId: id,
          beforeJson: JSON.stringify({ points_balance: before.points_balance }),
          afterJson: JSON.stringify({ points_balance: next, delta: out && out.delta }),
          ip: req.ip,
          userAgent: req.headers['user-agent'] || null,
        }))
        .then(() => res.json({ ok: true, data: { points_balance: next } }));
    })
    .catch((err) => res.status(err.status || 500).json({ error: err.message || 'Failed to set points' }));
}

function gdprExport(req, res) {
  const id = String(req.params.id);
  const run = async () => {
    const user = await Promise.resolve(repo.getUserById(id));
    if (!user) throw httpError(404, 'User not found');
    if (db.isPg) {
      const [requests, offers, matches, reports, ledger] = await Promise.all([
        db.many('SELECT * FROM help_requests WHERE seeker_id = $1', [id]),
        db.many('SELECT * FROM service_offers WHERE provider_id = $1', [id]),
        db.many('SELECT * FROM matches WHERE provider_id = $1 OR seeker_id = $1', [id]),
        db.many('SELECT * FROM reports WHERE reporter_id = $1', [id]),
        db.many('SELECT * FROM points_ledger WHERE user_id = $1 ORDER BY created_at DESC', [id]),
      ]);
      return { user: safeUser(user), requests, offers, matches, reports, ledger };
    }
    const requests = db.prepare('SELECT * FROM help_requests WHERE seeker_id = ?').all(id);
    const offers = db.prepare('SELECT * FROM service_offers WHERE provider_id = ?').all(id);
    const matches = db.prepare('SELECT * FROM matches WHERE provider_id = ? OR seeker_id = ?').all(id, id);
    const reports = db.prepare('SELECT * FROM reports WHERE reporter_id = ?').all(id);
    const ledger = db.prepare('SELECT * FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC').all(id);
    return { user: safeUser(user), requests, offers, matches, reports, ledger };
  };

  Promise.resolve(run())
    .then(data => res.json({ ok: true, data }))
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to export' }));
}

function gdprDelete(req, res) {
  const id = String(req.params.id);
  const now = new Date().toISOString();
  const run = async () => {
    const user = await Promise.resolve(repo.getUserById(id));
    if (!user) throw httpError(404, 'User not found');

    const deletedEmail = `deleted+${id}@kingshelp.invalid`;
    if (db.isPg) {
      await db.exec(
        `UPDATE users SET email = $1, display_name = $2, bio = NULL, location_text = NULL,
         is_verified = FALSE, is_banned = TRUE, premium_tier = 'free', premium_until = NULL,
         profile_photos = '[]', points_balance = 0, updated_at = $3 WHERE id = $4`,
        [deletedEmail, 'Usuario eliminado', now, id]
      );
      await db.exec(
        'INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(), id, null, -Number(user.points_balance || 0), 'admin_gdpr_delete', 0, now]
      );
    } else {
      db.prepare(`UPDATE users SET email = ?, display_name = ?, bio = NULL, location_text = NULL,
        is_verified = 0, is_banned = 1, premium_tier = 'free', premium_until = NULL,
        profile_photos = '[]', points_balance = 0, updated_at = ? WHERE id = ?`).run(deletedEmail, 'Usuario eliminado', now, id);
      db.prepare('INSERT INTO points_ledger (id, user_id, match_id, delta, reason, balance_after, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(), id, null, -Number(user.points_balance || 0), 'admin_gdpr_delete', 0, now);
    }
    return user;
  };

  Promise.resolve(run())
    .then(before => repo.insertAudit({
      id: randomUUID(),
      adminUserId: req.user.id,
      action: 'user.gdpr_delete',
      entityType: 'user',
      entityId: id,
      beforeJson: JSON.stringify({ email: before.email, display_name: before.display_name, points_balance: before.points_balance }),
      afterJson: JSON.stringify({ email: `deleted+${id}@kingshelp.invalid`, display_name: 'Usuario eliminado', points_balance: 0 }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    }))
    .then(() => res.json({ ok: true }))
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to delete user' }));
}

function patchUser(req, res) {
  // Minimal, safe patch: allow toggling flags and premium tier.

  const id = req.params.id;
  const beforeP = Promise.resolve(repo.getUserById(id));
  const premiumValues = Array.isArray(PREMIUM_TIER) ? PREMIUM_TIER : Object.values(PREMIUM_TIER || {});

  const fields = {};
  if (req.body.is_verified !== undefined) fields.is_verified = req.body.is_verified ? 1 : 0;
  if (req.body.is_banned !== undefined) fields.is_banned = req.body.is_banned ? 1 : 0;
  if (req.body.premium_tier !== undefined) {
    const t = String(req.body.premium_tier || '').trim();
    if (!premiumValues.includes(t)) throw httpError(400, 'Invalid premium_tier');
    fields.premium_tier = t;
    if (t === 'free') fields.premium_until = null;
  }

  const keys = Object.keys(fields);
  if (!keys.length) throw httpError(400, 'No fields to update');

  beforeP.then(before => {
    if (!before) throw httpError(404, 'User not found');
    if (db.isPg) {
      const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const vals = keys.map(k => fields[k]);
      return db.exec(`UPDATE users SET ${setSql}, updated_at = now() WHERE id = $${keys.length + 1}`, [...vals, id])
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
        });
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
    return null;
  }).catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to update user' }));
}

function banUser(req, res) {
  const db = require('../../config/db');
  const id = req.params.id;
  const now = new Date().toISOString();
  Promise.resolve(repo.getUserById(id))
    .then(before => {
      if (!before) throw httpError(404, 'User not found');
      if (db.isPg) {
        return db.exec('UPDATE users SET is_banned = TRUE, updated_at = $1 WHERE id = $2', [now, id])
          .then(() => {
            eventsRepo.logEvent({ type: 'user.ban', actorUserId: req.user.id, targetType: 'user', targetId: id, meta: {} });
            return repo.insertAudit({ id: randomUUID(), adminUserId: req.user.id, action: 'user.ban', entityType: 'user', entityId: id, beforeJson: JSON.stringify(safeUser(before)), afterJson: JSON.stringify({ is_banned: true }), ip: req.ip, userAgent: req.headers['user-agent'] || null });
          })
          .then(() => res.json({ ok: true }));
      }
      db.prepare("UPDATE users SET is_banned = 1, updated_at = ? WHERE id = ?").run(now, id);
      try { eventsRepo.logEvent({ type: 'user.ban', actorUserId: req.user.id, targetType: 'user', targetId: id, meta: {} }); } catch { }
      repo.insertAudit({ id: randomUUID(), adminUserId: req.user.id, action: 'user.ban', entityType: 'user', entityId: id, beforeJson: JSON.stringify(safeUser(before)), afterJson: JSON.stringify({ is_banned: true }), ip: req.ip, userAgent: req.headers['user-agent'] || null });
      res.json({ ok: true });
      return null;
    })
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to ban user' }));
}

function unbanUser(req, res) {
  const db = require('../../config/db');
  const id = req.params.id;
  const now = new Date().toISOString();
  Promise.resolve(repo.getUserById(id))
    .then(before => {
      if (!before) throw httpError(404, 'User not found');
      if (db.isPg) {
        return db.exec('UPDATE users SET is_banned = FALSE, updated_at = $1 WHERE id = $2', [now, id])
          .then(() => {
            eventsRepo.logEvent({ type: 'user.unban', actorUserId: req.user.id, targetType: 'user', targetId: id, meta: {} });
            return repo.insertAudit({ id: randomUUID(), adminUserId: req.user.id, action: 'user.unban', entityType: 'user', entityId: id, beforeJson: JSON.stringify({ is_banned: true }), afterJson: JSON.stringify({ is_banned: false }), ip: req.ip, userAgent: req.headers['user-agent'] || null });
          })
          .then(() => res.json({ ok: true }));
      }
      db.prepare("UPDATE users SET is_banned = 0, updated_at = ? WHERE id = ?").run(now, id);
      try { eventsRepo.logEvent({ type: 'user.unban', actorUserId: req.user.id, targetType: 'user', targetId: id, meta: {} }); } catch { }
      repo.insertAudit({ id: randomUUID(), adminUserId: req.user.id, action: 'user.unban', entityType: 'user', entityId: id, beforeJson: JSON.stringify({ is_banned: true }), afterJson: JSON.stringify({ is_banned: false }), ip: req.ip, userAgent: req.headers['user-agent'] || null });
      res.json({ ok: true });
      return null;
    })
    .catch(err => res.status(err.status || 500).json({ error: err.message || 'Failed to unban user' }));
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
  Promise.resolve(repo.listAudit({ limit, offset }))
    .then(rows => res.json({ ok: true, data: rows, meta: { page, limit, count: rows.length } }))
    .catch(() => res.status(500).json({ error: 'Failed to load audit log' }));
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
  listCreations,
  listUsers,
  listRequests,
  listOffers,
  listMatches,
  getCreationDetail,
  patchCreation,
  getRequestDetail,
  getOfferDetail,
  getMatchDetail,
  getUser,
  getUserDetail,
  resetPoints,
  setPoints,
  addUserBadge,
  removeUserBadge,
  gdprExport,
  gdprDelete,
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
  hideContent,
  unhideContent,
  getConfig,
  patchConfig,
};
