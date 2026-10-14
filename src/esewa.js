'use strict';
// eSewa ePay v2 integration (developer.esewa.com.np/pages/Epay).
const crypto = require('crypto');
const config = require('./config');

function sign(message, secret = config.esewa.secret) {
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

function signFields(fields, names) {
  return sign(names.split(',').map((n) => `${n}=${fields[n]}`).join(','));
}

// Fields for the auto-submitted form. Amounts are whole rupees from our DB.
function buildForm({ amount, transactionUuid, publicId }) {
  const fields = {
    amount: String(amount),
    tax_amount: '0',
    total_amount: String(amount),
    transaction_uuid: transactionUuid,
    product_code: config.esewa.code,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: `${config.baseUrl}/esewa/success`,
    failure_url: `${config.baseUrl}/esewa/failure?order=${encodeURIComponent(publicId)}`,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
  };
  fields.signature = signFields(fields, fields.signed_field_names);
  return { url: config.esewa.formUrl, fields };
}

// eSewa may format amounts like "1,050.0".
const parseAmount = (v) => Number(String(v).replace(/,/g, ''));

// Decode and verify the base64 `data` param eSewa sends to success_url.
function decodeResponse(data) {
  if (typeof data !== 'string' || data.length > 4096) return { ok: false, reason: 'missing' };
  let payload;
  try { payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }
  if (!payload || typeof payload.signed_field_names !== 'string' || typeof payload.signature !== 'string') return { ok: false, reason: 'malformed' };
  const names = payload.signed_field_names.split(',');
  // Must at least cover the fields we rely on.
  for (const n of ['transaction_uuid', 'total_amount', 'status', 'product_code']) if (!names.includes(n)) return { ok: false, reason: 'unsigned-field' };
  const expected = signFields(payload, payload.signed_field_names);
  const a = Buffer.from(expected);
  const b = Buffer.from(payload.signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad-signature' };
  return { ok: true, payload };
}

// Server-to-server status check. Returns { status, ref } or throws on network error.
async function checkStatus({ amount, transactionUuid }) {
  const url = new URL(config.esewa.statusUrl);
  url.searchParams.set('product_code', config.esewa.code);
  url.searchParams.set('total_amount', String(amount));
  url.searchParams.set('transaction_uuid', transactionUuid);
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`eSewa status HTTP ${res.status}`);
  const body = await res.json();
  if (body.code === 0) throw new Error('eSewa status service unavailable');
  return { status: body.status, ref: body.ref_id || null };
}

module.exports = { sign, signFields, buildForm, decodeResponse, checkStatus, parseAmount };
