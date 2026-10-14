'use strict';
// Restore a JSON backup into an EMPTY database (run migrations first).
// Usage: PGLITE_DIR=./data/restore-test npm run restore <backupFile>
const fs = require('fs');
const db = require('../src/db');
const { migrate } = require('../src/migrate');
const { TABLES } = require('./backup');

async function restore(file) {
  const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
  await migrate();
  const counts = {};
  await db.tx(async (q) => {
    for (const t of TABLES) {
      if (t === 'products') await q('delete from products where id not in (select product_id from order_items)');
      const rows = dump.tables[t] || [];
      for (const r of rows) {
        const cols = Object.keys(r);
        await q(`insert into ${t} (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) on conflict do nothing`, cols.map((c) => r[c]));
      }
      counts[t] = rows.length;
    }
    for (const t of ['users', 'orders']) await q(`select setval(pg_get_serial_sequence('${t}','id'), coalesce((select max(id) from ${t}), 1))`);
  });
  return counts;
}

if (require.main === module) {
  (async () => {
    await db.connect();
    console.log('Restored', await restore(process.argv[2]));
    await db.close();
  })().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { restore };
