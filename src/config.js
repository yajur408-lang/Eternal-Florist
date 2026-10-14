'use strict';
// All configuration comes from environment variables. No secrets live in code.
const env = process.env;
const isProd = env.NODE_ENV === 'production';
const port = Number(env.PORT || 3000);
const baseUrl = (env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');

const ESEWA_URLS = {
  sandbox: {
    form: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://rc.esewa.com.np/api/epay/transaction/status/',
  },
  production: {
    form: 'https://epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://esewa.com.np/api/epay/transaction/status/',
  },
  // Local stand-in for eSewa used by automated tests. Never allowed in production.
  mock: {
    form: `${baseUrl}/__mock-esewa/form`,
    status: `${baseUrl}/__mock-esewa/status`,
  },
};

const esewaMode = env.ESEWA_MODE || 'sandbox';
if (!ESEWA_URLS[esewaMode]) throw new Error(`ESEWA_MODE must be one of ${Object.keys(ESEWA_URLS).join(', ')}`);
if (isProd && esewaMode === 'mock') throw new Error('ESEWA_MODE=mock is not allowed in production');

function required(name) {
  if (!env[name]) throw new Error(`Missing required environment variable ${name}`);
  return env[name];
}

const config = {
  isProd,
  port,
  baseUrl,
  databaseUrl: env.DATABASE_URL || '',
  pgliteDir: env.PGLITE_DIR || './data/pglite',
  // Signs proof-of-work challenges and unsubscribe links.
  appSecret: isProd ? required('APP_SECRET') : env.APP_SECRET || 'dev-only-not-secret',
  esewa: {
    mode: esewaMode,
    code: isProd ? required('ESEWA_CODE') : env.ESEWA_CODE || 'EPAYTEST',
    secret: isProd ? required('ESEWA_SECRET') : env.ESEWA_SECRET || '',
    formUrl: ESEWA_URLS[esewaMode].form,
    statusUrl: ESEWA_URLS[esewaMode].status,
  },
  smtpUrl: env.SMTP_URL || '',
  mailFrom: env.MAIL_FROM || 'oohflorist <no-reply@localhost>',
  ownerNotifyEmail: env.OWNER_NOTIFY_EMAIL || '',
  session: {
    idleMs: 30 * 60 * 1000, // 30 minutes idle
    absoluteMs: 12 * 60 * 60 * 1000, // 12 hours absolute
    cookie: isProd ? '__Host-sid' : 'sid',
  },
  resetTokenMs: 30 * 60 * 1000,
  powDifficulty: Number(env.POW_DIFFICULTY || 4), // leading hex zeros of sha256
  reconcileEveryMs: 5 * 60 * 1000,
};

if (!config.esewa.secret) {
  console.warn('[config] ESEWA_SECRET is empty. Copy ENV_EXAMPLE to .env to use the eSewa sandbox.');
}

module.exports = config;
