# oohflorist shop: setup and deployment

**Stack:** Node 22.9+ (tested on 24), Express 5, server-rendered HTML with plain CSS and JS, and Postgres. Local dev uses PGlite, which is Postgres compiled to WASM, so you don't need a database server. Payments go through eSewa ePay v2. All fonts and images are self-hosted, so there are zero third-party requests.

## 1. Run locally
```bash
npm install
```
```bash
cp ENV_EXAMPLE .env
```
```bash
npm start
```
Open http://localhost:3000. `ESEWA_MODE=sandbox` talks to the real eSewa test environment. `ESEWA_MODE=mock` uses a local stand-in, which the automated tests need.

Tests:
```bash
npm test
```
```bash
npx playwright install chromium
```
Then, with the server running in `ESEWA_MODE=mock`:
```bash
npm run e2e
```
Screenshots and `e2e-report.txt` are written to `artifacts/`.

### Try a real sandbox payment (you, not the build)
Set `ESEWA_MODE=sandbox` and restart. Buy the combo set and log in on eSewa's test page with the **test credentials from eSewa's docs** (https://developer.esewa.com.np/pages/Epay): eSewa ID `9711111111`, password `Nepal@123`, OTP token `123456`. I didn't do this step myself because it means signing in to a third-party site. I did check that eSewa's sandbox accepts this app's signed form (HTTP 302 to its checkout) and that its status API answers.

## 2. Production deployment (Render)
1. **Database.** Create a Render Postgres instance (a paid plan, so you get **daily automated backups**; check the current retention for your plan). Copy the *external* URL; that's the admin URL.
2. **Least-privilege roles.** From your own computer, run `db/roles.sql` with the admin URL (`psql "<admin url>" -f db/roles.sql`), replacing both passwords first. Then run the migration as the owner role:
   ```bash
   MIGRATION_DATABASE_URL="postgres://oohflorist_owner:...@host/db" npm run migrate
   ```
   After that, run the `grant ...` lines at the bottom of `roles.sql` as `oohflorist_owner`. **Do not** put the admin or owner URL into Render.
3. **Web service.** New Web Service from this repo, build command `npm ci`, start command `node server.js`, Node 22+.
4. **Environment variables** (Render dashboard): `NODE_ENV=production`, `BASE_URL=https://your-domain`, `APP_SECRET` (48+ random bytes), `DATABASE_URL` (the **oohflorist_app** role), `ESEWA_MODE=sandbox` at first, `ESEWA_CODE`, `ESEWA_SECRET`, `SMTP_URL`, `MAIL_FROM`, `OWNER_NOTIFY_EMAIL`.
5. **Custom domain plus HTTPS.** Render issues TLS automatically. The app redirects HTTP to HTTPS, sends HSTS (2 years) and marks cookies `Secure` with the `__Host-` prefix.
6. **Admin account.** Sign up on the site with the owner's email, then run `npm run make-admin owner@email` against the production DB, using the owner role from your machine.
7. **Fill in the owner facts** in `content/business.json` and `content/products.json`. Production will not start until the launch blockers in OPEN_QUESTIONS.md are filled in.

The reconcile job (re-checking PENDING orders with eSewa) runs inside the server every 5 minutes. If you run more than one instance, also add a Render Cron Job that runs `node scripts/ops.js reconcile` every 5 minutes.

Netlify note: Netlify static hosting can't run this Express server. Use Render or Railway as described above.

## 3. Going live with eSewa
1. Apply for an eSewa **merchant account** (business documents are needed, so start early).
2. Set `ESEWA_MODE=production`, `ESEWA_CODE=<your merchant code>` and `ESEWA_SECRET=<your secret key>` in Render. The production form and status URLs switch automatically (`epay.esewa.com.np` and `esewa.com.np`).
3. Make **one small real payment**, check it reaches PAID in `/admin`, then refund it through eSewa.
4. **No real money has been moved by this build.**

## 4. Billing and usage alerts (turn these on)
- **Render:** Account → Billing → set a **spend limit / budget alert** (for example US$25/month). Also enable email notifications for failed deploys and service down.
- **Render Postgres:** turn on the **storage usage alert** (for example at 80%), and check that the backup schedule shows daily backups.
- **Email provider** (Brevo, Postmark or Resend): set the **monthly sending quota alert**. Also turn on **bounce/complaint rate alerts**, which help catch abuse of the reset form.
- **eSewa merchant portal:** enable transaction notifications to the owner's phone or email.
- **Domain registrar:** turn on auto-renew and expiry reminders.

## 5. Backups and restore
- **Primary:** Render Postgres daily automated backups (retention depends on plan).
- **Second copy:** run `npm run backup` (on a schedule from your machine or a cron job) with `DATABASE_URL` set to the app role. It writes `data/backups/backup-<date>.json`. Keep 30 days and store a copy off-site, such as an encrypted cloud drive.
- **Restore:** create an empty database, then run `MIGRATION_DATABASE_URL=... npm run migrate`, then run `npm run restore <file>`.
- **Tested:** `tests/backup.test.js` backs up a DB with a paid order, restores it into a brand-new empty DB and checks the data matches. Do a real restore drill against a scratch Render database once a quarter.

## 6. Day-to-day for the owner
- Orders: `/admin` (log in with the admin account). It lists paid, pending and failed orders, and you can set progress (Being made, Out for delivery, Delivered).
- Paid orders also email `OWNER_NOTIFY_EMAIL`.
- Prices and products: edit `content/products.json`, then run `npm run migrate` (owner role).
