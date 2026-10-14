'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const argon2 = require('@node-rs/argon2');

const config = require('./config');
const db = require('./db');
const log = require('./logger');
const session = require('./session');
const pow = require('./pow');
const esewa = require('./esewa');
const orders = require('./orders');
const mailer = require('./mailer');
const views = require('./views/pages');
const policies = require('./views/policies');

const ESEWA_ORIGIN = new URL(config.esewa.formUrl).origin;

function ageFromDob(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dob = new Date(Date.UTC(y, mo - 1, d));
  if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== mo - 1 || dob.getUTCDate() !== d) return null;
  const now = new Date();
  if (dob > now || y < 1900) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() < mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d)) age--;
  return age;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 -]{7,20}$/;
const PASSWORD_MIN = 10;

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1);

  // HTTPS only in production (HSTS is set by helmet below).
  app.use((req, res, next) => {
    if (config.isProd && !req.secure) return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    next();
  });

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'", ESEWA_ORIGIN],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: config.isProd ? { maxAge: 63072000, includeSubDomains: true, preload: false } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
    xFrameOptions: { action: 'deny' },
  }));
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  // Request log: method, path without query string, status, duration. Nothing else.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => log.info('request', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: config.isProd ? '7d' : 0,
    setHeaders: (res, p) => { if (p.endsWith('.woff2')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); },
  }));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(express.json({ limit: '20kb' }));
  app.use((req, res, next) => { if (!req.body || typeof req.body !== 'object') req.body = {}; next(); });
  app.use(session.middleware());
  app.use(session.csrf({ exempt: ['/__mock-esewa/', '/unsubscribe/'] }));

  const ctx = (req) => ({ session: req.session });
  const send = (res, page, status = 200) => res.status(status).type('html').send(page);
  const noStore = (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (req, res) => send(res, views.message(ctx(req), { title: 'Too many attempts', text: 'Please wait 15 minutes and try again.' }), 429) });
  const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false });
  app.use('/api/', apiLimiter);

  const allProducts = async () => (await db.query('select * from products where active order by sort')).rows;

  // ---------- Shop pages ----------
  app.get('/', async (req, res) => send(res, views.home(ctx(req), await allProducts())));
  app.get('/p/:id', async (req, res, next) => {
    const { rows } = await db.query('select * from products where id=$1 and active', [req.params.id]);
    if (!rows[0]) return next();
    send(res, views.product(ctx(req), rows[0]));
  });
  app.get('/bag', (req, res) => send(res, views.bag(ctx(req))));
  app.get('/checkout', noStore, (req, res) => {
    if (req.session && req.session.ageBlocked) return send(res, ageBlockedPage(req), 403);
    send(res, views.checkout(ctx(req)));
  });
  app.get('/custom', (req, res) => send(res, views.custom(ctx(req))));
  app.get('/contact', (req, res) => send(res, views.contact(ctx(req))));
  app.get('/policies/:key', (req, res, next) => {
    const page = policies.policy(ctx(req), req.params.key);
    return page ? send(res, page) : next();
  });

  function ageBlockedPage(req) {
    return views.message(ctx(req), { title: 'Sorry', text: "We can't take this order or create an account online. Please ask a parent or guardian to contact the shop.", actions: [{ href: '/', label: 'Back to the shop' }] });
  }

  // ---------- API ----------
  app.get('/api/products', async (req, res) => {
    res.json((await allProducts()).map((p) => ({ id: p.id, name: p.name, price: p.price_npr, image: p.image })));
  });
  app.get('/api/pow', noStore, (req, res) => res.json(pow.issue()));

  app.post('/api/quote', async (req, res) => {
    try {
      res.json(await orders.quote(req.body && req.body.items));
    } catch (e) {
      if (e instanceof orders.UserError) return res.status(400).json({ error: e.message });
      throw e;
    }
  });

  // Step 1: bag -> PENDING order -> straight to eSewa. No personal data is asked for before payment.
  app.post('/api/checkout/initiate', checkoutLimiter, noStore, async (req, res) => {
    const user = req.session && req.session.user;
    try {
      const { order } = await orders.createPending({ items: req.body.items, userId: user ? user.id : null });
      res.json({ orderId: order.public_id, ...esewa.buildForm({ amount: order.amount, transactionUuid: order.transaction_uuid, publicId: order.public_id }) });
    } catch (e) {
      if (e instanceof orders.UserError) return res.status(400).json({ error: e.message });
      throw e;
    }
  });

  const ORDER_ID_RE = /^[A-Za-z0-9_-]{16}$/;

  app.get('/api/order/:publicId', noStore, async (req, res) => {
    if (!ORDER_ID_RE.test(req.params.publicId)) return res.status(404).json({ error: 'not found' });
    const { rows } = await db.query(
      `select o.status, o.fulfillment, o.amount, o.created_at, o.details_at,
              coalesce(json_agg(json_build_object('name', i.name, 'qty', i.qty)) filter (where i.name is not null), '[]') as items
       from orders o left join order_items i on i.order_id=o.id where o.public_id=$1 group by o.id`,
      [req.params.publicId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    const o = rows[0];
    res.json({
      status: o.status,
      fulfillment: o.fulfillment,
      amount: o.amount,
      needsDetails: o.status === 'PAID' && !o.details_at,
      items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
    });
  });

  // Step 3: after a confirmed payment, collect delivery details (once). Age check first (COPPA).
  app.post('/api/order/:publicId/details', checkoutLimiter, noStore, async (req, res) => {
    if (!ORDER_ID_RE.test(req.params.publicId)) return res.status(404).json({ error: 'not found' });
    const b = req.body;
    const user = req.session && req.session.user;
    const blocked = "We can't take your details online. Please ask a parent or guardian to message the shop on WhatsApp about this order.";
    if (req.session.ageBlocked) return res.status(403).json({ error: blocked });
    if (!user) {
      const age = ageFromDob(b.dob);
      if (age == null) return res.status(400).json({ error: 'Please enter your date of birth.' });
      if (age < 13) {
        // COPPA: store nothing from this submission; block retries in this session.
        await session.setAgeBlocked(req);
        return res.status(403).json({ error: blocked });
      }
    }
    const customer = {
      name: clean(b.name, 80),
      phone: clean(b.phone, 20),
      email: clean(b.email, 120).toLowerCase(),
      address: clean(b.address, 300),
      note: clean(b.note, 500),
    };
    if (!customer.name) return res.status(400).json({ error: 'Please enter your name.' });
    if (!PHONE_RE.test(customer.phone)) return res.status(400).json({ error: 'Please enter a phone number we can call for delivery.' });
    if (!EMAIL_RE.test(customer.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (customer.address.length < 5) return res.status(400).json({ error: 'Please enter your delivery address.' });
    const ok = await orders.addDetails(req.params.publicId, customer);
    if (!ok) return res.status(409).json({ error: 'This order is not paid yet, or its details were already saved.' });
    res.json({ ok: true });
  });

  // ---------- eSewa return URLs ----------
  app.get('/esewa/success', noStore, async (req, res) => {
    const decoded = esewa.decodeResponse(req.query.data);
    if (!decoded.ok) {
      log.warn('esewa success rejected', { reason: decoded.reason });
      return send(res, views.message(ctx(req), { title: "We couldn't verify this payment", text: "The payment details we got back didn't check out, so we haven't marked anything as paid. If money left your eSewa account, contact us with your eSewa transaction code.", actions: [{ href: '/contact', label: 'Contact the shop', primary: true }] }), 400);
    }
    const p = decoded.payload;
    const { rows } = await db.query('select id, public_id, amount, status, transaction_uuid from orders where transaction_uuid=$1', [String(p.transaction_uuid)]);
    const order = rows[0];
    if (!order || p.product_code !== config.esewa.code || esewa.parseAmount(p.total_amount) !== order.amount || p.status !== 'COMPLETE') {
      log.warn('esewa success mismatch', { found: !!order });
      return send(res, views.message(ctx(req), { title: "We couldn't verify this payment", text: "The payment didn't match an order in our system. Nothing has been marked as paid. Please contact us with your eSewa transaction code.", actions: [{ href: '/contact', label: 'Contact the shop', primary: true }] }), 400);
    }
    if (order.status === 'PENDING') {
      try {
        const st = await esewa.checkStatus({ amount: order.amount, transactionUuid: order.transaction_uuid });
        if (st.status === 'COMPLETE') await orders.fulfillOrder(order.id, st.ref || String(p.transaction_code || ''));
      } catch (e) {
        // The reconcile job retries. The status page keeps polling.
        log.warn('esewa status check failed on success', { orderId: order.id, error: e });
      }
    }
    res.redirect(303, `/payment-success?order=${encodeURIComponent(order.public_id)}`);
  });

  app.get('/esewa/failure', noStore, async (req, res) => {
    const publicId = (/^[A-Za-z0-9_-]{16}/.exec(String(req.query.order || '')) || [''])[0]; // eSewa may append its own params
    const { rows } = await db.query('select id, public_id, amount, status, transaction_uuid, created_at from orders where public_id=$1', [publicId]);
    const order = rows[0];
    if (order && order.status === 'PENDING') {
      try {
        const r = await orders.reconcileOne(order, { failAfterMs: 0 });
        if (r === 'PAID' || r === 'NOOP') return res.redirect(303, `/payment-success?order=${encodeURIComponent(order.public_id)}`);
      } catch (e) {
        log.warn('esewa status check failed on failure', { orderId: order.id, error: e });
      }
    }
    send(res, views.message(ctx(req), { title: 'Payment not completed', text: "Your eSewa payment was cancelled or didn't go through, so you haven't been charged. Your bag is still saved.", actions: [{ href: '/checkout', label: 'Try again', primary: true }, { href: '/bag', label: 'Back to your bag' }] }));
  });

  app.get('/payment-success', noStore, (req, res, next) => {
    const id = String(req.query.order || '');
    if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return next();
    send(res, views.paymentStatus(ctx(req), id));
  });

  // ---------- Accounts ----------
  const DUMMY_HASH = argon2.hash('not-a-real-password-just-for-timing');
  const hashPassword = (pw) => argon2.hash(pw, { algorithm: 2 /* Argon2id */ });

  app.get('/account/login', noStore, (req, res) => {
    if (req.session && req.session.user) return res.redirect('/account');
    send(res, views.login(ctx(req), { notice: req.query.notice === 'created' ? 'Your account is ready (if it is new). Please log in.' : req.query.notice === 'reset' ? 'Password saved. Please log in.' : null }));
  });

  app.post('/account/login', authLimiter, async (req, res) => {
    const email = clean(req.body.email, 120).toLowerCase();
    const password = String(req.body.password || '').slice(0, 200);
    if (!(await pow.verify(req.body.pow_challenge, req.body.pow_nonce))) {
      return send(res, views.login(ctx(req), { email, error: 'The security check did not finish. Please try again.' }), 400);
    }
    const { rows } = await db.query('select id, password_hash from users where email=$1', [email]);
    const ok = rows[0] ? await argon2.verify(rows[0].password_hash, password) : (await argon2.verify(await DUMMY_HASH, password), false);
    if (!ok) return send(res, views.login(ctx(req), { email, error: "That email and password don't match." }), 401);
    await session.rotate(req, res, rows[0].id);
    res.redirect(303, '/account');
  });

  app.get('/account/signup', noStore, (req, res) => {
    if (req.session && req.session.ageBlocked) return send(res, ageBlockedPage(req), 403);
    send(res, views.signup(ctx(req)));
  });

  app.post('/account/signup', authLimiter, async (req, res) => {
    if (req.session.ageBlocked) return send(res, ageBlockedPage(req), 403);
    const values = { name: clean(req.body.name, 80), email: clean(req.body.email, 120).toLowerCase() };
    const password = String(req.body.password || '');
    const err = (msg) => send(res, views.signup(ctx(req), { error: msg, values }), 400);
    if (!(await pow.verify(req.body.pow_challenge, req.body.pow_nonce))) return err('The security check did not finish. Please try again.');
    const age = ageFromDob(req.body.dob);
    if (age == null) return err('Please enter your date of birth.');
    if (age < 13) {
      // COPPA: store nothing from this submission. Block further attempts in this session.
      await session.setAgeBlocked(req);
      return send(res, ageBlockedPage(req), 403);
    }
    if (!values.name) return err('Please enter your name.');
    if (!EMAIL_RE.test(values.email)) return err('Please enter a valid email address.');
    if (password.length < PASSWORD_MIN || password.length > 200) return err(`Please choose a password of at least ${PASSWORD_MIN} characters.`);
    const hash = await hashPassword(password);
    const r = await db.query(
      'insert into users (email, password_hash, name, marketing_opt_in) values ($1,$2,$3,$4) on conflict (email) do nothing returning id',
      [values.email, hash, values.name, req.body.marketing === '1']
    );
    if (r.rowCount === 0) {
      // Same response as a new signup so the form does not reveal which emails have accounts.
      await mailer.sendTransactional({ to: values.email, subject: 'Someone tried to create an account with your email', body: `Someone (maybe you) tried to create a new ${config.baseUrl} account with this email, but you already have one.\n\nLog in: ${config.baseUrl}/account/login\nForgot your password? ${config.baseUrl}/account/forgot\n\nIf this wasn't you, you can ignore this email.` });
    }
    res.redirect(303, '/account/login?notice=created');
  });

  app.post('/account/logout', async (req, res) => {
    await session.destroy(req, res);
    res.redirect(303, '/');
  });

  app.get('/account/forgot', noStore, (req, res) => send(res, views.forgot(ctx(req), { sent: req.query.sent === '1' })));

  app.post('/account/forgot', authLimiter, async (req, res) => {
    if (!(await pow.verify(req.body.pow_challenge, req.body.pow_nonce))) return send(res, views.forgot(ctx(req)), 400);
    const email = clean(req.body.email, 120).toLowerCase();
    const { rows } = await db.query('select id from users where email=$1', [email]);
    if (rows[0]) {
      const token = session.randomToken(32);
      await db.query('insert into password_resets (token_hash, user_id, expires_at) values ($1,$2, now() + ($3::int * interval \'1 millisecond\'))', [session.sha256(token), rows[0].id, config.resetTokenMs]);
      await mailer.sendTransactional({ to: email, subject: 'Reset your password', body: `Use this link to choose a new password. It works once and expires in 30 minutes:\n\n${config.baseUrl}/account/reset?token=${token}\n\nIf you didn't ask for this, you can ignore this email.` });
    }
    res.redirect(303, '/account/forgot?sent=1');
  });

  app.get('/account/reset', noStore, (req, res) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    const token = String(req.query.token || '');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return send(res, views.message(ctx(req), { title: 'Link not valid', text: 'This reset link is not valid. Please ask for a new one.', actions: [{ href: '/account/forgot', label: 'Get a new link', primary: true }] }), 400);
    send(res, views.reset(ctx(req), { token }));
  });

  app.post('/account/reset', authLimiter, async (req, res) => {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    if (!(await pow.verify(req.body.pow_challenge, req.body.pow_nonce))) return send(res, views.reset(ctx(req), { token, error: 'The security check did not finish. Please try again.' }), 400);
    if (password.length < PASSWORD_MIN || password.length > 200) return send(res, views.reset(ctx(req), { token, error: `Please choose a password of at least ${PASSWORD_MIN} characters.` }), 400);
    const hash = await hashPassword(password);
    const userId = await db.tx(async (q) => {
      const { rows } = await q('update password_resets set used_at=now() where token_hash=$1 and used_at is null and expires_at > now() returning user_id', [session.sha256(token)]);
      if (!rows[0]) return null;
      await q('update users set password_hash=$1, password_changed_at=now() where id=$2', [hash, rows[0].user_id]);
      await q('delete from password_resets where user_id=$1', [rows[0].user_id]); // invalidate every other reset token
      await q('delete from sessions where user_id=$1', [rows[0].user_id]); // log out everywhere
      return rows[0].user_id;
    });
    if (!userId) return send(res, views.message(ctx(req), { title: 'Link expired', text: 'This reset link has expired or was already used. Please ask for a new one.', actions: [{ href: '/account/forgot', label: 'Get a new link', primary: true }] }), 400);
    res.redirect(303, '/account/login?notice=reset');
  });

  const requireUser = (req, res, next) => (req.session && req.session.user ? next() : res.redirect(303, '/account/login'));
  const requireAdmin = (req, res, next) => (req.session && req.session.user && req.session.user.role === 'admin' ? next() : res.status(404).send('Not found'));

  app.get('/account', noStore, requireUser, async (req, res) => {
    const { rows } = await db.query('select public_id, amount, status, fulfillment, created_at from orders where user_id=$1 order by created_at desc limit 50', [req.session.user.id]);
    send(res, views.account(ctx(req), { orders: rows, user: req.session.user }));
  });

  app.post('/account/delete', requireUser, async (req, res) => {
    await db.query('delete from users where id=$1', [req.session.user.id]); // sessions + reset tokens cascade, orders keep no link
    await session.destroy(req, res);
    send(res, views.message({ session: null }, { title: 'Account deleted', text: 'Your account and login details have been deleted.', actions: [{ href: '/', label: 'Back to the shop' }] }));
  });

  // ---------- Unsubscribe (CAN-SPAM). Token-authenticated, honoured immediately. ----------
  app.get('/unsubscribe/:token', noStore, async (req, res) => {
    const userId = mailer.verifyUnsubscribeToken(req.params.token);
    if (!userId) return send(res, views.message(ctx(req), { title: 'Link not valid', text: 'This unsubscribe link is not valid.' }), 400);
    await mailer.unsubscribe(userId);
    send(res, views.message(ctx(req), { title: 'You are unsubscribed', text: "You won't get any more marketing emails from us. Order emails still arrive as normal." }));
  });
  app.post('/unsubscribe/:token', async (req, res) => {
    const userId = mailer.verifyUnsubscribeToken(req.params.token);
    if (!userId) return res.status(400).send('invalid');
    await mailer.unsubscribe(userId);
    res.status(200).send('unsubscribed');
  });

  // ---------- Owner admin ----------
  app.get('/admin', noStore, requireAdmin, async (req, res) => {
    const filter = ['PAID', 'PENDING', 'FAILED', 'ALL'].includes(req.query.status) ? req.query.status : 'PAID';
    const { rows } = await db.query(
      `select o.*, string_agg(i.qty || ' x ' || i.name, ', ') as items
       from orders o left join order_items i on i.order_id=o.id
       where ($1 = 'ALL' or o.status = $1) group by o.id order by o.created_at desc limit 200`,
      [filter]
    );
    send(res, views.admin(ctx(req), { orders: rows, filter }));
  });
  app.post('/admin/orders/:id/fulfillment', requireAdmin, async (req, res) => {
    const f = String(req.body.fulfillment || '');
    if (!Object.keys(views.FULFIL_TEXT).includes(f) || !/^\d+$/.test(req.params.id)) return res.status(400).send('Bad request');
    await db.query(`update orders set fulfillment=$1 where id=$2 and status='PAID'`, [f, req.params.id]);
    res.redirect(303, '/admin');
  });

  if (config.esewa.mode === 'mock') require('./mock-esewa').mount(app);

  // ---------- 404 + errors ----------
  app.use((req, res) => send(res, views.message(ctx(req), { title: 'Page not found', text: "We couldn't find that page.", actions: [{ href: '/', label: 'Back to the shop', primary: true }] }), 404));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    log.error('unhandled error', { path: req.path, error: err });
    if (res.headersSent) return;
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    send(res, views.message(ctx(req), { title: 'Something went wrong', text: 'Please try again in a moment.' }), 500);
  });

  return app;
}

module.exports = { createApp, ageFromDob };
