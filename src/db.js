'use strict';
// Database adapter: Postgres (pg) in production, PGlite (real Postgres compiled to WASM) for local dev and tests.
// Both expose query(text, params) -> { rows, rowCount }. Parameterized queries only.
const config = require('./config');

let impl = null;

async function connect(opts = {}) {
  const url = opts.databaseUrl ?? config.databaseUrl;
  if (url) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: url, max: 10, ssl: config.isProd ? { rejectUnauthorized: true } : undefined });
    const wrap = (r) => ({ rows: r.rows, rowCount: r.rowCount });
    impl = {
      query: async (text, params) => wrap(await pool.query(text, params)),
      tx: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(async (t, p) => wrap(await client.query(t, p)));
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = opts.pgliteDir ?? config.pgliteDir;
    if (!dir.includes('://')) require('fs').mkdirSync(require('path').dirname(dir), { recursive: true });
    const pg = new PGlite(dir);
    const wrap = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
    impl = {
      query: async (text, params) => wrap(await pg.query(text, params)),
      tx: (fn) => pg.transaction((t) => fn(async (text, params) => wrap(await t.query(text, params)))),
      close: () => pg.close(),
    };
  }
  return impl;
}

module.exports = {
  connect,
  query: (t, p) => impl.query(t, p),
  tx: (fn) => impl.tx(fn),
  close: () => (impl ? impl.close() : undefined),
};
