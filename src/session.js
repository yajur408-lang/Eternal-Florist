'use strict';
// Server-side sessions. The cookie holds a random ID; the DB stores only its SHA-256 hash.
// Idle and absolute timeouts are enforced on every request. CSRF token lives in the session.
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, value, maxAgeMs) {
  const attrs = [
    `${config.session.cookie}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax', // Lax so the session survives the top-level redirect back from eSewa
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (config.isProd) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

async function create(res, { userId = null, ageBlocked = false } = {}) {
  const id = randomToken();
  const csrf = randomToken();
  await db.query('insert into sessions (id_hash, user_id, csrf, age_blocked) values ($1,$2,$3,$4)', [sha256(id), userId, csrf, ageBlocked]);
  setCookie(res, id, config.session.absoluteMs);
  return { idHash: sha256(id), userId, csrf, ageBlocked, user: null };
}

async function destroy(req, res) {
  if (req.session) await db.query('delete from sessions where id_hash=$1', [req.session.idHash]);
  setCookie(res, '', 0);
}

// Rotate on login: drop the old session row, issue a new ID bound to the user.
async function rotate(req, res, userId) {
  const ageBlocked = req.session ? req.session.ageBlocked : false;
  if (req.session) await db.query('delete from sessions where id_hash=$1', [req.session.idHash]);
  req.session = await create(res, { userId, ageBlocked });
  return req.session;
}

function middleware() {
  return async (req, res, next) => {
    try {
      const raw = parseCookies(req.headers.cookie)[config.session.cookie];
      let session = null;
      if (raw && /^[A-Za-z0-9_-]{20,100}$/.test(raw)) {
        const { rows } = await db.query(
          `select s.id_hash, s.user_id, s.csrf, s.age_blocked, s.created_at, s.last_seen,
                  u.email, u.name, u.role
           from sessions s left join users u on u.id = s.user_id where s.id_hash=$1`,
          [sha256(raw)]
        );
        const row = rows[0];
        const now = Date.now();
        if (row) {
          const idleExpired = now - new Date(row.last_seen).getTime() > config.session.idleMs;
          const absExpired = now - new Date(row.created_at).getTime() > config.session.absoluteMs;
          // Anonymous sessions (cart + CSRF only) are not subject to the idle timeout.
          if (absExpired || (row.user_id && idleExpired)) {
            await db.query('delete from sessions where id_hash=$1', [row.id_hash]);
          } else {
            await db.query('update sessions set last_seen=now() where id_hash=$1', [row.id_hash]);
            session = {
              idHash: row.id_hash,
              userId: row.user_id,
              csrf: row.csrf,
              ageBlocked: row.age_blocked,
              user: row.user_id ? { id: row.user_id, email: row.email, name: row.name, role: row.role } : null,
            };
          }
        }
      }
      // Only create a session on page views, not on every static or API hit.
      if (!session && req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
        session = await create(res);
      }
      req.session = session;
      next();
    } catch (e) {
      next(e);
    }
  };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// CSRF: synchronizer token (form field _csrf or header x-csrf-token) plus an Origin check.
function csrf({ exempt = [] } = {}) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (exempt.some((p) => req.path.startsWith(p))) return next();
    const origin = req.headers.origin;
    if (origin && origin !== config.baseUrl) return res.status(403).send('Bad origin');
    const token = req.get('x-csrf-token') || (req.body && req.body._csrf);
    if (!req.session || !safeEqual(token, req.session.csrf)) {
      return res.status(403).send('Your session expired. Please go back, refresh the page and try again.');
    }
    next();
  };
}

async function setAgeBlocked(req) {
  if (req.session) {
    await db.query('update sessions set age_blocked=true where id_hash=$1', [req.session.idHash]);
    req.session.ageBlocked = true;
  }
}

async function purgeExpired() {
  await db.query(
    `delete from sessions where created_at < now() - ($1::int * interval '1 millisecond')
       or (user_id is not null and last_seen < now() - ($2::int * interval '1 millisecond'))`,
    [config.session.absoluteMs, config.session.idleMs]
  );
}

module.exports = { middleware, csrf, create, destroy, rotate, setAgeBlocked, purgeExpired, sha256, randomToken, safeEqual, parseCookies };
