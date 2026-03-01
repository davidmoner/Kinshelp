'use strict';
const { Pool } = require('pg');

let pool;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  pool = new Pool({
    connectionString: url,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    max: 5,
  });
  return pool;
}

module.exports = { getPool };
