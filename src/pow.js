'use strict';
// Self-hosted proof-of-work bot check. No third-party script, no cookies, no tracking.
// The browser must find a nonce so that sha256(salt + ':' + nonce) starts with N hex zeros.
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');

const TTL_MS = 10 * 60 * 1000;

const hmac = (s) => crypto.createHmac('sha256', config.appSecret).update(s).digest('base64url');

function issue() {
  const payload = { salt: crypto.randomBytes(16).toString('hex'), exp: Date.now() + TTL_MS, d: config.powDifficulty };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { challenge: `${body}.${hmac(body)}`, salt: payload.salt, difficulty: payload.d };
}

async function verify(challenge, nonce) {
  if (typeof challenge !== 'string' || typeof nonce !== 'string' || nonce.length > 32) return false;
  const [body, sig] = challenge.split('.');
  if (!body || !sig) return false;
  const expected = hmac(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return false; }
  if (Date.now() > payload.exp) return false;
  const hash = crypto.createHash('sha256').update(`${payload.salt}:${nonce}`).digest('hex');
  if (!hash.startsWith('0'.repeat(payload.d))) return false;
  // One-time use.
  const r = await db.query('insert into pow_used (id, expires_at) values ($1, to_timestamp($2/1000.0)) on conflict do nothing', [payload.salt, payload.exp]);
  return r.rowCount === 1;
}

async function purgeExpired() {
  await db.query('delete from pow_used where expires_at < now()');
}

module.exports = { issue, verify, purgeExpired };
