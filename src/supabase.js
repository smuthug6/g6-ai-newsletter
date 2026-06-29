const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 60000,
  idleTimeoutMillis: 60000,
});

module.exports = pool;
