'use strict';
// Proves a backup can be restored into a fresh database with identical data.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const db = require('../src/db');
const { migrate } = require('../src/migrate');
const orders = require('../src/orders');
const mailer = require('../src/mailer');
const { backup } = require('../scripts/backup');
const { restore } = require('../scripts/restore');

test('backup then restore into a fresh DB reproduces orders', async () => {
  mailer._setTransport({ sendMail: async () => {} });
  await db.connect({ pgliteDir: 'memory://' });
  await migrate();
  const { order } = await orders.createPending({ items: [{ id: 'hello-kitty-bouquet-combo', qty: 3 }], customer: { name: 'B', phone: '9800000000', email: 'b@x.test', address: 'Addr 1', note: 'n' } });
  await orders.fulfillOrder(order.id, 'REF');
  await orders.addDetails(order.public_id, { name: 'B', phone: '9800000000', email: 'b@x.test', address: 'Addr 1', note: 'n' });
  const file = path.join(os.tmpdir(), `oohflorist-backup-${Date.now()}.json`);
  const counts = await backup(file);
  assert.strictEqual(counts.orders, 1);
  await db.close();

  await db.connect({ pgliteDir: 'memory://' }); // brand-new empty database
  await restore(file);
  const { rows } = await db.query('select o.amount, o.status, i.qty from orders o join order_items i on i.order_id=o.id');
  assert.deepStrictEqual(rows, [{ amount: 3150, status: 'PAID', qty: 3 }]);
  await db.close();
});
