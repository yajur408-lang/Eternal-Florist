'use strict';
// Minimal structured logger. Everything is scrubbed before it is written.
const SENSITIVE_KEY = /pass(word)?|pwd|token|secret|signature|authorization|cookie|csrf|session|^data$|card|account_?number|otp|mpin|pow|nonce|dob|birth/i;
const LONG_DIGITS = /\b\d{9,19}\b/g; // phone, card or account numbers
const BEARER = /(bearer|basic)\s+[a-z0-9._~+/=-]+/gi;
const KV_SECRET = /(pass(?:word)?|token|secret|signature|api_?key|otp|mpin)(\s*[=:]\s*)[^\s&,;]+/gi;
const URL_QUERY = /((?:https?:\/\/)?[^\s?"']*)\?[^\s"']*/g;

function scrubString(s) {
  return s.replace(BEARER, '$1 [REDACTED]').replace(KV_SECRET, '$1$2[REDACTED]').replace(URL_QUERY, '$1?[REDACTED]').replace(LONG_DIGITS, '[REDACTED_NUMBER]');
}

function scrub(value, depth = 0) {
  if (depth > 6) return '[DEPTH]';
  if (typeof value === 'string') return scrubString(value);
  if (value instanceof Error) return { name: value.name, message: scrubString(value.message), stack: scrubString(value.stack || '') };
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : scrub(v, depth + 1);
    return out;
  }
  return value;
}

let sink = (line) => process.stdout.write(line + '\n');

function log(level, msg, meta) {
  const entry = { t: new Date().toISOString(), level, msg: scrubString(String(msg)) };
  if (meta !== undefined) entry.meta = scrub(meta);
  sink(JSON.stringify(entry));
}

module.exports = {
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
  scrub,
  _setSink: (fn) => { sink = fn; },
};
