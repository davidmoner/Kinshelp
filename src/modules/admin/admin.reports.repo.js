'use strict';
const { randomUUID } = require('crypto');
const db = require('../../config/db');

function ensureTables() {
  if (db.isPg) {
    return db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id          uuid PRIMARY KEY,
        reporter_id uuid,
        target_type text NOT NULL,
        target_id   text NOT NULL,
        reason      text NOT NULL,
        status      text NOT NULL DEFAULT 'open',
        notes       text,
        resolved_at timestamptz,
        resolved_by uuid,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at);
    `);
  }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id           TEXT PRIMARY KEY,
        reporter_id  TEXT,
        target_type  TEXT NOT NULL,
        target_id    TEXT NOT NULL,
        reason       TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'open',
        notes        TEXT,
        resolved_at  TEXT,
        resolved_by  TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at);
    `);
  } catch { }
}

function createReport({ reporterId, targetType, targetId, reason }) {
  const ensure = ensureTables();
  const id = randomUUID();
  if (db.isPg) {
    return Promise.resolve(ensure)
      .then(() => db.exec(
        `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at)
         VALUES ($1,$2,$3,$4,$5,'open',now())`,
        [id, reporterId || null, targetType, targetId, reason]
      ))
      .then(() => ({ id }));
  }
  db.prepare(`
    INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', datetime('now'))
  `).run(id, reporterId || null, targetType, targetId, reason);
  return { id };
}

function listReports({ status, limit, offset }) {
  const ensure = ensureTables();
  if (db.isPg) {
    const baseQuery = status
      ? `SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at,
            CASE
              WHEN target_type = 'offer' THEN (SELECT is_hidden FROM service_offers o WHERE o.id = reports.target_id)
              WHEN target_type = 'request' THEN (SELECT is_hidden FROM help_requests h WHERE h.id = reports.target_id)
              ELSE NULL
            END AS target_hidden
         FROM reports
         WHERE status = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`
      : `SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at,
            CASE
              WHEN target_type = 'offer' THEN (SELECT is_hidden FROM service_offers o WHERE o.id = reports.target_id)
              WHEN target_type = 'request' THEN (SELECT is_hidden FROM help_requests h WHERE h.id = reports.target_id)
              ELSE NULL
            END AS target_hidden
         FROM reports
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`;

    const fallbackQuery = status
      ? `SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at,
            NULL AS target_hidden
         FROM reports
         WHERE status = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`
      : `SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at,
            NULL AS target_hidden
         FROM reports
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`;

    if (status) {
      return Promise.resolve(ensure)
        .then(() => db.many(baseQuery, [status, limit, offset]))
        .catch(() => Promise.resolve(ensure).then(() => db.many(fallbackQuery, [status, limit, offset])).catch(() => []));
    }
    return Promise.resolve(ensure)
      .then(() => db.many(baseQuery, [limit, offset]))
      .catch(() => Promise.resolve(ensure).then(() => db.many(fallbackQuery, [limit, offset])).catch(() => []));
  }

  if (status) {
    return db.prepare(`
      SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at,
        CASE
          WHEN target_type = 'offer' THEN (SELECT is_hidden FROM service_offers o WHERE o.id = reports.target_id)
          WHEN target_type = 'request' THEN (SELECT is_hidden FROM help_requests h WHERE h.id = reports.target_id)
          ELSE NULL
        END AS target_hidden
      FROM reports
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(status, limit, offset);
  }
  return db.prepare(`
    SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at,
      CASE
        WHEN target_type = 'offer' THEN (SELECT is_hidden FROM service_offers o WHERE o.id = reports.target_id)
        WHEN target_type = 'request' THEN (SELECT is_hidden FROM help_requests h WHERE h.id = reports.target_id)
        ELSE NULL
      END AS target_hidden
    FROM reports
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getReportById(id) {
  const ensure = ensureTables();
  if (db.isPg) {
    return Promise.resolve(ensure).then(() => db.one(
      `SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at
       FROM reports WHERE id = $1`,
      [id]
    ));
  }
  return db.prepare(`
    SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at
    FROM reports WHERE id = ?
  `).get(id);
}

function setContentHidden({ targetType, targetId, hidden }) {
  const isHidden = hidden ? 1 : 0;
  const now = new Date().toISOString();
  if (targetType === 'offer') {
    if (db.isPg) {
      return db.exec('UPDATE service_offers SET is_hidden = $1, updated_at = $2 WHERE id = $3', [hidden, now, targetId]);
    }
    db.prepare('UPDATE service_offers SET is_hidden = ?, updated_at = ? WHERE id = ?').run(isHidden, now, targetId);
    return;
  }
  if (targetType === 'request') {
    if (db.isPg) {
      return db.exec('UPDATE help_requests SET is_hidden = $1, updated_at = $2 WHERE id = $3', [hidden, now, targetId]);
    }
    db.prepare('UPDATE help_requests SET is_hidden = ?, updated_at = ? WHERE id = ?').run(isHidden, now, targetId);
  }
}

function resolveReport({ id, adminUserId, notes }) {
  const ensure = ensureTables();
  if (db.isPg) {
    return Promise.resolve(ensure).then(() => db.exec(
      `UPDATE reports SET status = 'resolved', notes = $1, resolved_at = now(), resolved_by = $2 WHERE id = $3`,
      [notes || null, adminUserId, id]
    ));
  }
  db.prepare(`
    UPDATE reports
    SET status = 'resolved', notes = ?, resolved_at = datetime('now'), resolved_by = ?
    WHERE id = ?
  `).run(notes || null, adminUserId, id);
}

module.exports = { createReport, listReports, resolveReport, getReportById, setContentHidden };
