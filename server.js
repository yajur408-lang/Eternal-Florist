'use strict';
const config = require('./src/config');
const db = require('./src/db');
const log = require('./src/logger');
const { migrate } = require('./src/migrate');
const { createApp } = require('./src/app');
const orders = require('./src/orders');
const session = require('./src/session');
const pow = require('./src/pow');
const business = require('./content/business.json');

async function main() {
  const missing = business.requiredForLaunch.filter((k) => !business.pending[k]);
  if (config.isProd && missing.length && process.env.ALLOW_PENDING_CONTENT !== '1') {
    throw new Error(`Refusing to start in production: owner info missing in content/business.json: ${missing.join(', ')}`);
  }
  await db.connect();
  // Local PGlite: migrate on boot. Postgres: run `npm run migrate` with the owner role instead.
  if (!config.databaseUrl) await migrate();

  const app = createApp();
  app.listen(config.port, () => log.info(`listening on ${config.baseUrl} (eSewa: ${config.esewa.mode})`));

  // Reconcile job: re-check PENDING orders with eSewa every 5 minutes.
  setInterval(() => orders.reconcilePending().catch((e) => log.error('reconcile failed', { error: e })), config.reconcileEveryMs).unref();
  setInterval(() => Promise.all([session.purgeExpired(), pow.purgeExpired()]).catch((e) => log.error('purge failed', { error: e })), 60 * 60 * 1000).unref();
}

main().catch((e) => {
  log.error('startup failed', { error: e });
  process.exit(1);
});
