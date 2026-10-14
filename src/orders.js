'use strict';
const crypto = require('crypto');
const db = require('./db');
const mailer = require('./mailer');
const esewa = require('./esewa');
const config = require('./config');
const log = require('./logger');

const MAX_QTY = 20;

// Prices always come from the DB. Anything the browser sends besides id and qty is ignored.
async function quote(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) throw new UserError('Your bag is empty.');
  const merged = new Map();
  for (const it of items) {
    const id = String(it && it.id || '');
    const qty = Number(it && it.qty);
    if (!/^[a-z0-9-]{1,64}$/.test(id) || !Number.isInteger(qty) || qty < 1) throw new UserError('Your bag has an item we could not read.');
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) || 0) + qty));
  }
  const { rows } = await db.query('select id, name, price_npr, image from products where active and id = any($1::text[])', [[...merged.keys()]]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines = [];
  for (const [id, qty] of merged) {
    const p = byId.get(id);
    if (!p) throw new UserError('An item in your bag is no longer available.');
    if (p.price_npr == null) throw new UserError(`${p.name} is made to order. Please message the shop for a price.`);
    lines.push({ id, name: p.name, image: p.image, unitPrice: p.price_npr, qty, lineTotal: p.price_npr * qty });
  }
  return { lines, total: lines.reduce((s, l) => s + l.lineTotal, 0) };
}

class UserError extends Error {}

const newPublicId = () => crypto.randomBytes(12).toString('base64url');
const newTransactionUuid = () => `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;

async function createPending({ items, customer, userId }) {
  const q = await quote(items);
  const publicId = newPublicId();
  const transactionUuid = newTransactionUuid();
  const order = await db.tx(async (tq) => {
    const { rows } = await tq(
      `insert into orders (public_id, transaction_uuid, user_id, amount, customer_name, phone, email, address, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, public_id, transaction_uuid, amount`,
      [publicId, transactionUuid, userId || null, q.total, customer.name, customer.phone, customer.email, customer.address, customer.note]
    );
    for (const l of q.lines) {
      await tq('insert into order_items (order_id, product_id, name, unit_price, qty) values ($1,$2,$3,$4,$5)', [rows[0].id, l.id, l.name, l.unitPrice, l.qty]);
    }
    return rows[0];
  });
  return { order, quote: q };
}

// Atomic: only the request that flips PENDING -> PAID sends emails.
async function fulfillOrder(orderId, esewaRef) {
  const { rows, rowCount } = await db.query(
    `update orders set status='PAID', paid_at=now(), esewa_ref=$2 where id=$1 and status='PENDING' returning *`,
    [orderId, esewaRef]
  );
  if (rowCount !== 1) return false;
  const order = rows[0];
  const items = (await db.query('select name, unit_price, qty from order_items where order_id=$1', [order.id])).rows;
  const list = items.map((i) => `${i.qty} x ${i.name}  Rs. ${i.unit_price * i.qty}`).join('\n');
  // Made to order: no stock adjustment (see OPEN_QUESTIONS.md).
  await mailer.sendTransactional({
    to: order.email,
    subject: `Order ${order.public_id.slice(0, 8).toUpperCase()} confirmed`,
    body: `Hi ${order.customer_name},\n\nThank you! Your eSewa payment went through and your order is confirmed.\n\n${list}\nTotal paid: Rs. ${order.amount}\n\nDeliver to: ${order.address}\n${order.note ? `Your note: ${order.note}\n` : ''}\nWe'll message you on ${order.phone} about delivery.\n\nOrder status: ${config.baseUrl}/payment-success?order=${order.public_id}`,
  });
  if (config.ownerNotifyEmail) {
    await mailer.sendTransactional({
      to: config.ownerNotifyEmail,
      subject: `New paid order: Rs. ${order.amount}`,
      body: `${list}\n\nCustomer: ${order.customer_name}\nPhone: ${order.phone}\nAddress: ${order.address}\nNote: ${order.note}\n\nOpen ${config.baseUrl}/admin`,
    });
  }
  log.info('order paid', { orderId: order.id });
  return true;
}

async function markFailed(orderId) {
  const { rowCount } = await db.query(`update orders set status='FAILED' where id=$1 and status='PENDING'`, [orderId]);
  return rowCount === 1;
}

// Check one PENDING order with eSewa's status API and act on the answer.
async function reconcileOne(order, { failAfterMs = 30 * 60 * 1000 } = {}) {
  const { status, ref } = await esewa.checkStatus({ amount: order.amount, transactionUuid: order.transaction_uuid });
  if (status === 'COMPLETE') return (await fulfillOrder(order.id, ref)) ? 'PAID' : 'NOOP';
  const age = Date.now() - new Date(order.created_at).getTime();
  if (['NOT_FOUND', 'CANCELED'].includes(status) && age > failAfterMs) return (await markFailed(order.id)) ? 'FAILED' : 'NOOP';
  return 'STILL_PENDING';
}

async function reconcilePending({ minAgeSeconds = 120 } = {}) {
  const { rows } = await db.query(
    `select id, amount, transaction_uuid, created_at from orders
     where status='PENDING' and created_at < now() - ($1::int * interval '1 second') and created_at > now() - interval '7 days'
     order by created_at limit 50`,
    [minAgeSeconds]
  );
  const results = { checked: 0, paid: 0, failed: 0, errors: 0 };
  for (const o of rows) {
    results.checked++;
    try {
      const r = await reconcileOne(o);
      if (r === 'PAID') results.paid++;
      if (r === 'FAILED') results.failed++;
    } catch (e) {
      results.errors++;
      log.warn('reconcile check failed', { orderId: o.id, error: e });
    }
  }
  if (results.checked) log.info('reconcile run', results);
  return results;
}

module.exports = { quote, createPending, fulfillOrder, markFailed, reconcileOne, reconcilePending, UserError };
