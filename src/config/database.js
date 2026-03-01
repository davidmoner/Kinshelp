'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { DB_PATH } = require('./env');

function resolveDbPath() {
  // On Render (or similar), mount a persistent disk and set DATA_DIR=/var/data
  const dataDir = process.env.DATA_DIR || process.env.RENDER_DISK_PATH || process.cwd();
  if (path.isAbsolute(DB_PATH)) return DB_PATH;
  return path.resolve(dataDir, DB_PATH);
}

const dbPath = resolveDbPath();
try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); } catch { }
const db = new Database(dbPath);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

module.exports = db;
