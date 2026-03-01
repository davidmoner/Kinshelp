'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { DB_PATH } = require('./env');

function resolveDbPath() {
  // On Render (or similar), mount a persistent disk and set DATA_DIR=/var/data
  const dataDir = process.env.DATA_DIR || process.env.RENDER_DISK_PATH || process.cwd();
  if (path.isAbsolute(DB_PATH)) return DB_PATH;
  // If DB_PATH is relative with leading './', normalize it.
  const rel = String(DB_PATH || '').replace(/^\.\//, '');
  return path.resolve(dataDir, rel);
}

const dbPath = resolveDbPath();
let db;
try {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
  db = new Database(dbPath);
} catch (e) {
  // Fall back to a guaranteed-writable temp dir on platforms like Render.
  const fallbackDir = process.env.TMPDIR || process.env.TEMP || '/tmp';
  const altPath = path.resolve(String(fallbackDir), path.basename(dbPath));
  try { fs.mkdirSync(path.dirname(altPath), { recursive: true }); } catch { }
  console.warn('DB dir not writable, using fallback:', altPath);
  db = new Database(altPath);
}

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

module.exports = db;
