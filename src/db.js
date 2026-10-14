'use strict';
// Database adapter: Postgres (pg) in production, PGlite (real Postgres compiled to WASM) for local dev and tests.
// Both expose query(text, params) -> { rows, rowCount }. Parameterized queries only.
// All tables live in the "shop" schema. On Supabase this keeps them out of the auto-generated
// public Data API (which serves the "public" schema to anyone holding the anon key).
const fs = require('fs');
const config = require('./config');

const SCHEMA = 'shop';

// TLS: verify the server certificate. Supabase signs with its own CA, so download it from
// Dashboard > Project Settings > Database > SSL Configuration and set DATABASE_CA_CERT to the file path.
function sslOptions(url) {
  const local = /@(localhost|127.0.0.1)[:/]/.test(url);
  if (local) return undefined;
  if (process.env.DATABASE_CA_CERT) return { ca: fs.readFileSync(process.env.DATABASE_CA_CERT, 'utf8'), rejectUnauthorized: true };
  if (config.isProd) return { rejectUnauthorized: true };
  console.warn('[db] DATABASE_CA_CERT not set: TLS is encrypted but the server certificate is NOT verified (dev only).');
  return { rejectUnauthorized: false };
}

let impl = null;

async function connect(opts = {}) {
  const url = opts.databaseUrl ?? config.databaseUrl;
  if (url) {
    const { Pool } = require('pg');
    const clean = new URL(url);
    clean.searchParams.delete('sslmode'); // TLS is configured explicitly below
    const pool = new Pool({ connectionString: clean.toString(), max: 5, ssl: sslOptions(url) });
    pool.on('connect', (client) => { client.query(`set search_path to ${SCHEMA}`); });
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
    await pg.exec(`create schema if not exists ${SCHEMA}; set search_path to ${SCHEMA};`);
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
