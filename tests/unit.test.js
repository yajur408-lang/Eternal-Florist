'use strict';
process.env.ESEWA_SECRET = '8gBm/:&EnhH.1/q'; // eSewa's public UAT key
process.env.ESEWA_MODE = 'sandbox';
process.env.PGLITE_DIR = 'memory://';
const test = require('node:test');
const assert = require('node:assert');
const log = require('../src/logger');
const esewa = require('../src/esewa');
const db = require('../src/db');
const { migrate } = require('../src/migrate');
const orders = require('../src/orders');
const mailer = require('../src/mailer');
const { ageFromDob } = require('../src/app');

test('logs never contain passwords, tokens, signatures, card/account numbers or auth headers', () => {
  const lines = [];
  log._setSink((l) => lines.push(l));
  log.info('login attempt', { email: 'a@b.test', password: 'hunter2-SECRET', newPassword: 'x-SECRET' });
  log.error('upstream', { headers: { authorization: 'Bearer abc.SECRET.def' }, signature: 'sig-SECRET', esewa_secret: 'k-SECRET' });
  log.warn('card 4111111111111111 acct 9806533832 token=reset-SECRET seen at /account/reset?token=reset-SECRET');
  log.error('boom', { error: new Error('failed for https://x.test/esewa/success?data=SECRETDATA Authorization: Basic dXNlcjpwYXNz') });
  const out = lines.join('\n');
  for (const s of ['hunter2', 'SECRET', '4111111111111111', '9806533832', 'dXNlcjpwYXNz']) assert.ok(!out.includes(s), `log leaked ${s}: ${out}`);
  log._setSink((l) => process.stdout.write(l + '\n'));
});

test('eSewa signature matches the documented example format', () => {
  // HMAC-SHA256 base64 over "total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST"
  const sig = esewa.sign('total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST');
  assert.strictEqual(sig, require('crypto').createHmac('sha256', process.env.ESEWA_SECRET).update('total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST').digest('base64'));
  const form = esewa.buildForm({ amount: 1050, transactionUuid: 'abc-123', publicId: 'p'.repeat(16) });
  assert.strictEqual(form.fields.signature, esewa.sign('total_amount=1050,transaction_uuid=abc-123,product_code=EPAYTEST'));
});

test('eSewa response: valid accepted, tampered and unsigned rejected', () => {
  const p = { transaction_code: 'X1', status: 'COMPLETE', total_amount: '1,050.0', transaction_uuid: 'abc-123', product_code: 'EPAYTEST', signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names' };
  p.signature = esewa.signFields(p, p.signed_field_names);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  assert.ok(esewa.decodeResponse(enc(p)).ok);
  assert.strictEqual(esewa.parseAmount(p.total_amount), 1050);
  assert.strictEqual(esewa.decodeResponse(enc({ ...p, total_amount: '1.0' })).reason, 'bad-signature');
  assert.strictEqual(esewa.decodeResponse(enc({ ...p, signed_field_names: 'transaction_code' })).reason, 'unsigned-field');
  assert.strictEqual(esewa.decodeResponse('%%%').ok, false);
});

test('age check', () => {
  const y = new Date().getUTCFullYear();
  assert.strictEqual(ageFromDob(`${y - 12}-01-01`) < 13, true);
  assert.strictEqual(ageFromDob(`${y - 30}-01-01`) >= 29, true);
  assert.strictEqual(ageFromDob('2010-02-31'), null);
  assert.strictEqual(ageFromDob('nonsense'), null);
});

test('server computes totals from DB; client prices ignored; unpriced items refused', async () => {
  await db.connect({ pgliteDir: 'memory://' });
  await migrate();
  const q = await orders.quote([{ id: 'hello-kitty-bouquet-combo', qty: 2, price: 1 }]);
  assert.strictEqual(q.total, 2100);
  await assert.rejects(orders.quote([{ id: 'tulip-bouquet', qty: 1 }]), orders.UserError);
  await assert.rejects(orders.quote([{ id: 'hello-kitty-bouquet-combo', qty: -1 }]), orders.UserError);
});

test('pay first, then details: fulfil is atomic, details accepted once, one confirmation email', async () => {
  let sent = 0;
  mailer._setTransport({ sendMail: async () => { sent++; } });
  const { order } = await orders.createPending({ items: [{ id: 'hello-kitty-bouquet-combo', qty: 1 }] });
  const customer = { name: 'T', phone: '9800000000', email: 't@x.test', address: 'Somewhere', note: '' };
  assert.strictEqual(await orders.addDetails(order.public_id, customer), false, 'no details before payment');
  const results = await Promise.all([orders.fulfillOrder(order.id, 'R1'), orders.fulfillOrder(order.id, 'R1'), orders.fulfillOrder(order.id, 'R1')]);
  assert.strictEqual(results.filter(Boolean).length, 1);
  assert.strictEqual(sent, 0, 'no email until details exist');
  assert.strictEqual(await orders.addDetails(order.public_id, customer), true);
  assert.strictEqual(await orders.addDetails(order.public_id, { ...customer, address: 'Hijack' }), false, 'details cannot be overwritten');
  assert.strictEqual(sent, 1);
  assert.strictEqual(await orders.markFailed(order.id), false, 'paid order cannot become FAILED');
});

test('marketing email refuses without postal address; unsubscribe token verifies', async () => {
  await assert.rejects(mailer.sendMarketing({ userId: 1, to: 'a@b.test', subject: 's', body: 'b' }), /postal address/);
  const tok = mailer.unsubscribeUrl(42).split('/').pop();
  assert.strictEqual(mailer.verifyUnsubscribeToken(tok), 42);
  assert.strictEqual(mailer.verifyUnsubscribeToken(tok.replace(/.$/, 'A') === tok ? tok.replace(/.$/, 'B') : tok.replace(/.$/, 'A')), null);
  await db.close();
});
