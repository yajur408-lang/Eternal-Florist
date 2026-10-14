'use strict';
// Logical backup of every table to a JSON file (works on Postgres and local PGlite).
// The host's automated daily snapshots are the primary backup; this is the portable second copy.
// Usage: npm run backup [outFile]   (stop the dev server first when using local PGlite)
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const TABLES = ['users', 'products', 'orders', 'order_items', 'email_suppressions'];

async function backup(outFile) {
  const dump = { createdAt: new Date().toISOString(), tables: {} };
  for (const t of TABLES) dump.tables[t] = (await db.query(`select * from ${t}`)).rows;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(dump));
  return Object.fromEntries(TABLES.map((t) => [t, dump.tables[t].length]));
}

if (require.main === module) {
  (async () => {
    await db.connect();
    const out = process.argv[2] || path.join('data', 'backups', `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    console.log('Backed up', await backup(out), 'to', out);
    await db.close();
  })().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { backup, TABLES };
