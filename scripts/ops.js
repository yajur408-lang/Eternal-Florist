'use strict';
// Small owner/operator commands.
//   node scripts/ops.js reconcile          re-check PENDING orders with eSewa now (also runs every 5 min in the server)
//   node scripts/ops.js make-admin <email> give an existing account access to /admin
//   node scripts/ops.js check-content      list owner facts still missing from content/business.json
const db = require('../src/db');
const business = require('../content/business.json');

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'check-content') {
    const missing = Object.entries(business.pending).filter(([, v]) => !v).map(([k]) => k);
    console.log(missing.length ? `Missing owner info: ${missing.join(', ')}` : 'All owner info present.');
    const unpriced = require('../content/products.json').filter((p) => p.price_npr == null).map((p) => p.name);
    console.log(`Products without a confirmed price (not purchasable online): ${unpriced.join(', ') || 'none'}`);
    return;
  }
  await db.connect();
  if (cmd === 'reconcile') console.log(await require('../src/orders').reconcilePending({ minAgeSeconds: 120 }));
  else if (cmd === 'make-admin') {
    const r = await db.query(`update users set role='admin' where email=$1`, [String(arg || '').toLowerCase()]);
    console.log(r.rowCount ? 'Done.' : 'No account with that email. Sign up on the site first.');
  } else console.log('Unknown command');
  await db.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
