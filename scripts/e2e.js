'use strict';
// End-to-end check with Playwright against a running server in ESEWA_MODE=mock.
// Usage: npm start (with ESEWA_MODE=mock) then: npm run e2e [baseUrl]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'artifacts');
fs.mkdirSync(OUT, { recursive: true });
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
// Endpoints the suite deliberately calls with bad input; their 4xx responses are expected.
const EXPECTED_4XX = /\/esewa\/success|\/account\/signup|\/account\/login|\/api\/quote/;
const BANNED_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com|hotjar|fullstory|clarity\.ms|logrocket|mouseflow|smartlook|inspectlet|luckyorange|google-analytics|googletagmanager/i;
const VIEWPORTS = [
  { name: '360', width: 360, height: 780 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];

const results = [];
const fail = (msg) => { results.push({ ok: false, msg }); console.log('FAIL', msg); };
const pass = (msg) => { results.push({ ok: true, msg }); console.log('ok  ', msg); };
const check = (cond, msg) => (cond ? pass(msg) : fail(msg));

function watch(page, bucket) {
  page.on('console', (m) => { if (m.type() === 'error' && !(m.text().startsWith('Failed to load resource') && EXPECTED_4XX.test(page.url()))) bucket.consoleErrors.push(`${page.url()} :: ${m.text()}`); });
  page.on('pageerror', (e) => bucket.consoleErrors.push(`${page.url()} :: ${e.message}`));
  page.on('request', (r) => bucket.requests.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/nope')) bucket.badResponses.push(`${r.status()} ${r.url()}`); });
}

async function brokenImages(page) {
  return page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
}

async function axe(page, label) {
  await page.evaluate(AXE); // evaluated via DevTools, so the strict CSP stays on
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
  check(r.length === 0, `axe WCAG A/AA (incl. contrast, target size) on ${label}${r.length ? ': ' + r.join('; ') : ''}`);
}

async function smallTapTargets(page) {
  return page.evaluate(() => [...document.querySelectorAll('a, button, input, select, textarea, summary')]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      if (e.type === 'hidden') return false;
      if (e.closest('p, li, dd') && e.tagName === 'A' && !e.className) return false; // inline text links are exempt (WCAG 2.5.8)
      return r.height < 24 || r.width < 24;
    })
    .map((e) => `${e.tagName.toLowerCase()}.${e.className || ''} "${(e.textContent || e.name || '').trim().slice(0, 20)}" ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
}

async function startCheckout(page, vp) {
  await page.goto(`${BASE}/p/hello-kitty-bouquet-combo`);
  await page.evaluate(() => localStorage.clear());
  await page.click('[data-qty-step="1"]');
  await page.click('[data-add-btn]');
  await page.waitForSelector('.add-status a');
  await page.goto(`${BASE}/bag`);
  await page.waitForSelector('.bag-line');
  check((await page.textContent('.total-row')).includes('2,100'), `${vp}: bag total is 2 x Rs. 1,050 = Rs. 2,100`);
  await page.screenshot({ path: path.join(OUT, `${vp}-bag.png`), fullPage: true });
  await page.click('text=Go to checkout');
  await page.waitForSelector('[data-summary] .total-row');
  await page.fill('#name', 'Test Customer');
  await page.fill('#phone', '9800000000');
  await page.fill('#email', 'test.customer@example.test');
  if (await page.$('#dob')) await page.fill('#dob', '1998-04-12');
  await page.fill('#address', 'Lakeside, test address');
  await page.fill('#note', 'Blue ribbon please');
  await page.screenshot({ path: path.join(OUT, `${vp}-checkout.png`), fullPage: true });
  await page.click('[data-pay-btn]');
  await page.waitForURL(/__mock-esewa\/form/);
}

(async () => {
  const browser = await chromium.launch();
  const bucket = { consoleErrors: [], requests: [], badResponses: [] };

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    watch(page, bucket);

    for (const [p, label] of [['/', 'home'], ['/p/hello-kitty-bouquet-combo', 'product'], ['/p/tulip-bouquet', 'product-ask'], ['/custom', 'custom'], ['/contact', 'contact'], ['/policies/privacy', 'privacy'], ['/account/signup', 'signup']]) {
      await page.goto(BASE + p, { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(OUT, `${vp.name}-${label}.png`), fullPage: true });
      const broken = await brokenImages(page);
      check(broken.length === 0, `${vp.name} ${label}: no broken images${broken.length ? ' ' + broken.join(', ') : ''}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(overflow <= 0, `${vp.name} ${label}: no horizontal scroll (overflow ${overflow}px)`);
      if (vp.name === '360') {
        await axe(page, `${label} @360`);
        const small = await smallTapTargets(page);
        check(small.length === 0, `${vp.name} ${label}: tap targets >= 24px${small.length ? ' ' + small.join('; ') : ''}`);
      }
    }

    // Full purchase flow.
    await startCheckout(page, vp.name);
    await page.click('#mock-pay');
    await page.waitForURL(/payment-success/);
    await page.waitForSelector('[data-state="paid"]', { timeout: 25000 });
    check(true, `${vp.name}: purchase flow ends on confirmed order page`);
    await page.screenshot({ path: path.join(OUT, `${vp.name}-confirmed.png`), fullPage: true });
    if (vp.name === '360') await axe(page, 'confirmation @360');

    if (vp.name === '360') {
      // Refresh of the success URL: must not double-fulfil.
      const confirmedUrl = page.url();
      await page.reload();
      await page.waitForSelector('[data-state="paid"]');
      pass('360: refreshing confirmation page keeps order PAID');

      // Replay of the eSewa success redirect (same data param).
      const successHits = bucket.requests.filter((u) => u.includes('/esewa/success?data='));
      const replay = await page.goto(successHits[successHits.length - 1]);
      check(replay.url().startsWith(confirmedUrl.split('?')[0]), '360: replaying eSewa success URL redirects to the same order, no error');

      // Tampered data param: change the amount and keep the old signature.
      const data = new URL(successHits[successHits.length - 1]).searchParams.get('data');
      const payload = JSON.parse(Buffer.from(data, 'base64').toString());
      payload.total_amount = '1.0';
      const tampered = await page.goto(`${BASE}/esewa/success?data=${encodeURIComponent(Buffer.from(JSON.stringify(payload)).toString('base64'))}`);
      check(tampered.status() === 400, `360: tampered data param rejected (HTTP ${tampered.status()})`);
      const garbage = await page.goto(`${BASE}/esewa/success?data=not-base64-json`);
      check(garbage.status() === 400, '360: garbage data param rejected');

      // Cancelled payment.
      await startCheckout(page, '360-cancel');
      await page.click('#mock-cancel');
      await page.waitForURL(/esewa\/failure/);
      check((await page.textContent('h1')).includes('Payment not completed'), '360: cancelled payment shows "Payment not completed"');
      await page.goto(`${BASE}/bag`);
      await page.waitForSelector('.bag-line');
      pass('360: bag kept after cancelled payment');

      // Pay, then close the tab before the redirect. The reconcile job must pick it up.
      await startCheckout(page, '360-close');
      const formUrl = page.url();
      const orderTxn = await page.inputValue('input[name="transaction_uuid"]');
      await page.click('#mock-pay-close');
      await page.close();
      const page2 = await ctx.newPage();
      watch(page2, bucket);
      await page2.goto(BASE + '/');
      const rec = await page2.evaluate(async () => (await fetch('/__mock-esewa/run-reconcile', { method: 'POST' })).json());
      check(rec.paid >= 1, `360: reconcile job marked tab-closed payment PAID (${JSON.stringify(rec)})`);
      void formUrl; void orderTxn;

      // Accounts: under-13 blocked, signup, login, logout.
      await page2.goto(`${BASE}/account/signup`);
      await page2.fill('#name', 'Kid');
      await page2.fill('#email', 'kid@example.test');
      await page2.fill('#password', 'a-long-test-password');
      const y = new Date().getFullYear() - 10;
      await page2.fill('#dob', `${y}-01-01`);
      await Promise.all([page2.waitForNavigation(), page2.click('button[type="submit"]')]);
      check((await page2.textContent('h1')) === 'Sorry', '360: under-13 signup blocked');
      await page2.goto(`${BASE}/account/signup`);
      check((await page2.textContent('h1')) === 'Sorry', '360: under-13 block persists in session (no retry)');
      await ctx.clearCookies();

      const email = `e2e-${Date.now()}@example.test`;
      await page2.goto(`${BASE}/account/signup`);
      await page2.fill('#name', 'E2E Tester');
      await page2.fill('#email', email);
      await page2.fill('#password', 'correct-horse-battery');
      await page2.fill('#dob', '1995-06-01');
      await page2.click('button[type="submit"]');
      await page2.waitForURL(/notice=created/);
      await page2.fill('#email', email);
      await page2.fill('#password', 'wrong-password-123');
      await page2.click('button[type="submit"]');
      await page2.waitForSelector('.form-error:not(:empty)');
      check((await page2.textContent('.form-error')).includes("don't match"), '360: wrong password gives generic error');
      await page2.fill('#password', 'correct-horse-battery');
      await page2.click('button[type="submit"]');
      await page2.waitForURL(/\/account$/);
      await page2.screenshot({ path: path.join(OUT, '360-account.png'), fullPage: true });
      await axe(page2, 'account @360');
      pass('360: signup and login work');
      await page2.click('text=Log out');
      await page2.waitForURL(BASE + '/');
      const after = await page2.goto(`${BASE}/account`);
      check(after.url().includes('/account/login'), '360: logout invalidates session');

      // CSRF: state-changing request without a token is refused.
      const csrfRes = await page2.evaluate(async () => (await fetch('/api/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"items":[]}' })).status);
      check(csrfRes === 403, `360: POST without CSRF token refused (HTTP ${csrfRes})`);
    }
    await ctx.close();
  }

  const fontHits = bucket.requests.filter((u) => BANNED_HOSTS.test(u));
  check(fontHits.length === 0, `no requests to Google Fonts or session-replay/analytics hosts${fontHits.length ? ': ' + fontHits.join(', ') : ''}`);
  const thirdParty = [...new Set(bucket.requests.map((u) => new URL(u).origin))].filter((o) => o !== BASE);
  check(thirdParty.length === 0, `no third-party requests at all (${thirdParty.join(', ') || 'none'})`);
  check(bucket.consoleErrors.length === 0, `no console errors${bucket.consoleErrors.length ? ': ' + bucket.consoleErrors.join(' | ') : ''}`);
  const bad = bucket.badResponses.filter((r) => !EXPECTED_4XX.test(r));
  check(bad.length === 0, `no unexpected 4xx/5xx responses${bad.length ? ': ' + bad.join(', ') : ''}`);

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'e2e-report.txt'), results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.msg}`).join('\n') + '\n');
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in artifacts/`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
