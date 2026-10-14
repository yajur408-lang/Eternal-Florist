'use strict';
// LOCAL TEST DOUBLE for eSewa ePay v2. Mounted only when ESEWA_MODE=mock (refused in production).
// It mirrors the documented behaviour: signed form POST in, base64 signed `data` back on
// success_url, failure_url on cancel, and a status API. Used by the automated test suite.
const express = require('express');
const crypto = require('crypto');
const config = require('./config');
const esewa = require('./esewa');
const { html } = require('./views/html');

const txns = new Map(); // transaction_uuid -> { status, amount, ref }

function mount(app) {
  const r = express.Router();

  r.post('/form', (req, res) => {
    const f = req.body;
    const expected = esewa.signFields(f, String(f.signed_field_names || ''));
    if (f.signature !== expected || f.product_code !== config.esewa.code) return res.status(400).send('mock eSewa: bad signature');
    txns.set(f.transaction_uuid, { status: 'PENDING', amount: Number(f.total_amount), ref: null });
    const hidden = ['transaction_uuid', 'total_amount', 'success_url', 'failure_url'].map((k) => html`<input type="hidden" name="${k}" value="${f[k]}">`);
    res.type('html').send(String(html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mock eSewa</title><link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/css/site.css"></head>
      <body><main class="page narrow"><h1>Mock eSewa (test only)</h1><p>Amount: Rs. ${f.total_amount}</p>
      <form method="post" action="/__mock-esewa/pay">${hidden}<input type="hidden" name="action" value="pay"><button class="btn btn-primary" id="mock-pay">Pay</button></form>
      <form method="post" action="/__mock-esewa/pay">${hidden}<input type="hidden" name="action" value="cancel"><button class="btn btn-ghost" id="mock-cancel">Cancel</button></form>
      <form method="post" action="/__mock-esewa/pay">${hidden}<input type="hidden" name="action" value="pay-close"><button class="btn btn-ghost" id="mock-pay-close">Pay, then close tab before redirect</button></form>
      </main></body></html>`));
  });

  r.post('/pay', (req, res) => {
    const f = req.body;
    const t = txns.get(f.transaction_uuid);
    if (!t) return res.status(404).send('unknown txn');
    if (f.action === 'cancel') {
      t.status = 'CANCELED';
      return res.redirect(303, f.failure_url);
    }
    t.status = 'COMPLETE';
    t.ref = `MOCK${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    if (f.action === 'pay-close') return res.type('text').send('Paid. Tab "closed" before redirect.');
    const payload = {
      transaction_code: t.ref,
      status: 'COMPLETE',
      total_amount: Number(t.amount).toLocaleString('en-US', { minimumFractionDigits: 1 }), // eSewa style "1,050.0"
      transaction_uuid: f.transaction_uuid,
      product_code: config.esewa.code,
      signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
    };
    payload.signature = esewa.signFields(payload, payload.signed_field_names);
    res.redirect(303, `${f.success_url}?data=${encodeURIComponent(Buffer.from(JSON.stringify(payload)).toString('base64'))}`);
  });

  r.get('/status', (req, res) => {
    const t = txns.get(String(req.query.transaction_uuid));
    if (!t || Number(req.query.total_amount) !== t.amount) return res.json({ product_code: config.esewa.code, transaction_uuid: req.query.transaction_uuid, total_amount: Number(req.query.total_amount), status: 'NOT_FOUND', ref_id: null });
    res.json({ product_code: config.esewa.code, transaction_uuid: req.query.transaction_uuid, total_amount: t.amount, status: t.status, ref_id: t.ref });
  });

  // Test hook: run the reconcile job now (the real one runs every 5 minutes).
  r.post('/run-reconcile', async (req, res) => res.json(await require('./orders').reconcilePending({ minAgeSeconds: 0 })));

  app.use('/__mock-esewa', r);
}

module.exports = { mount, _txns: txns };
