'use strict';
const { randomUUID } = require('crypto');
const db = require('../../config/db');

function ensureTables() {
  if (db.isPg) return;
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
  ensureTables();
  const id = randomUUID();
  if (db.isPg) {
    return db.exec(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at)
       VALUES ($1,$2,$3,$4,$5,'open',now())`,
      [id, reporterId || null, targetType, targetId, reason]
    ).then(() => ({ id }));
  }
  db.prepare(`
    INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', datetime('now'))
  `).run(id, reporterId || null, targetType, targetId, reason);
  return { id };
}

function listReports({ status, limit, offset }) {
  ensureTables();
  if (db.isPg) {
    if (status) {
      return db.many(
        `SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at
         FROM reports
         WHERE status = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      );
    }
    return db.many(
      `SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at
       FROM reports
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }

  if (status) {
    return db.prepare(`
      SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at
      FROM reports
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(status, limit, offset);
  }
  return db.prepare(`
    SELECT id, reporter_id, target_type, target_id, reason, status, notes, resolved_at, resolved_by, created_at
    FROM reports
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function resolveReport({ id, adminUserId, notes }) {
  ensureTables();
  if (db.isPg) {
    return db.exec(
      `UPDATE reports SET status = 'resolved', notes = $1, resolved_at = now(), resolved_by = $2 WHERE id = $3`,
      [notes || null, adminUserId, id]
    );
  }
  db.prepare(`
    UPDATE reports
    SET status = 'resolved', notes = ?, resolved_at = datetime('now'), resolved_by = ?
    WHERE id = ?
  `).run(notes || null, adminUserId, id);
}

module.exports = { createReport, listReports, resolveReport };
