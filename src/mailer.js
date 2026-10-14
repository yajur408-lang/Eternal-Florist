'use strict';
// Email. Production uses SMTP_URL. Without it (local dev), emails are written to data/outbox/
// as files, never to logs, because reset emails contain one-time links.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const business = require('../content/business.json');
const db = require('./db');
const log = require('./logger');

let transport = null;
function getTransport() {
  if (transport) return transport;
  if (config.smtpUrl) {
    transport = require('nodemailer').createTransport(config.smtpUrl);
  } else {
    if (config.isProd) throw new Error('SMTP_URL is required in production');
    const dir = path.join(__dirname, '..', 'data', 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    transport = {
      sendMail: async (msg) => {
        const file = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.txt`);
        const headers = Object.entries(msg.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
        fs.writeFileSync(file, `To: ${msg.to}\nFrom: ${msg.from}\nSubject: ${msg.subject}\n${headers}\n\n${msg.text}`);
      },
    };
  }
  return transport;
}

function contactFooter() {
  const lines = [
    `${business.name}, ${business.city}`,
    `WhatsApp: ${business.whatsapp}`,
    `Instagram: @${business.handle}`,
  ];
  if (business.pending.contactEmail) lines.push(`Email: ${business.pending.contactEmail}`);
  return lines.join('\n');
}

async function send({ to, subject, text, headers }) {
  try {
    await getTransport().sendMail({ from: config.mailFrom, to, subject, text, headers });
    log.info('email sent', { subject });
  } catch (e) {
    log.error('email failed', { subject, error: e });
  }
}

// Transactional: includes contact info, no unsubscribe needed.
function sendTransactional({ to, subject, body }) {
  return send({ to, subject, text: `${body}\n\n--\n${contactFooter()}` });
}

// Unsubscribe tokens are opaque: user id + HMAC, no email address in the URL.
const unsubSig = (userId) => crypto.createHmac('sha256', config.appSecret).update(`unsub:${userId}`).digest('base64url').slice(0, 32);
const unsubscribeUrl = (userId) => `${config.baseUrl}/unsubscribe/${userId}.${unsubSig(userId)}`;
function verifyUnsubscribeToken(token) {
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{32})$/.exec(token || '');
  if (!m) return null;
  const expected = unsubSig(m[1]);
  return crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(expected)) ? Number(m[1]) : null;
}

// Marketing (CAN-SPAM): refuses to send without a postal address; always carries an
// unsubscribe link plus one-click List-Unsubscribe headers; skips suppressed addresses.
async function sendMarketing({ userId, to, subject, body }) {
  if (!business.pending.postalAddress) throw new Error('Cannot send marketing email: business postal address is not set in content/business.json');
  const { rows } = await db.query('select 1 from email_suppressions where email=$1', [to.toLowerCase()]);
  if (rows.length) return false;
  const url = unsubscribeUrl(userId);
  await send({
    to,
    subject,
    text: `${body}\n\n--\n${contactFooter()}\n${business.pending.postalAddress}\n\nUnsubscribe from these emails: ${url}`,
    headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  });
  return true;
}

async function unsubscribe(userId) {
  const { rows } = await db.query('update users set marketing_opt_in=false where id=$1 returning email', [userId]);
  if (rows[0]) await db.query('insert into email_suppressions (email) values ($1) on conflict do nothing', [rows[0].email]);
  return rows.length === 1;
}

module.exports = { sendTransactional, sendMarketing, unsubscribe, unsubscribeUrl, verifyUnsubscribeToken, _setTransport: (t) => { transport = t; } };
