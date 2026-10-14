# Security and legal checklist

Status key: **DONE** (built and verified) · **OWNER** (needs owner/operator action) · **N/A** (doesn't apply, with the reason).
Evidence: `npm test` (8/8 pass) · `npm run e2e` (83/83 pass, report in `artifacts/e2e-report.txt`) · `npm audit` (0 vulnerabilities).

> **Not legal advice.** The policies were written only from facts that are known, and the gaps are marked on the page. The owner should have a lawyer in Nepal review the Privacy Policy, Terms of Sale, Refund Policy and Cookie notice before launch. The US rules below (COPPA, CAN-SPAM, CIPA, DMCA, auto-renewal) were applied because the brief requires them.

## Section 4: Legal
| # | Item | Status | How / evidence |
|---|---|---|---|
| 1 | COPPA age check | **DONE** | Signup and guest checkout ask for a neutral "Date of birth" field, with no hint about the required age. Under 13: nothing is stored, the session is flagged so retrying in that session is blocked, and the message is generic. The DOB is never stored. e2e: "under-13 signup blocked", "block persists". Logged-in users are checked at signup. |
| 2 | No Google Fonts / third-party assets | **DONE** | Fraunces and Figtree woff2 files are self-hosted in `public/fonts`. CSP `font-src 'self'`. e2e: "no requests to Google Fonts..." and "no third-party requests at all". |
| 3 | No session replay / keystroke logging | **DONE** | No analytics or recording scripts. The CSP `script-src 'self'` would block them anyway. The e2e network check is clean. |
| 4 | CAN-SPAM | **DONE** in code, **OWNER** for the address | `sendMarketing` refuses to send without `postalAddress`, always adds an unsubscribe link plus one-click `List-Unsubscribe` headers, and skips suppressed addresses. Unsubscribing takes effect immediately (`email_suppressions`). Transactional emails carry contact info. Marketing opt-in at signup is an unchecked box. Unit test: "marketing email refuses without postal address". OWNER: provide the postal address before any marketing email. |
| 5 | Subscription renewal terms | **N/A** | The shop sells no subscriptions or recurring products. None were added. |
| 6 | DMCA | **N/A** (uploads disabled) | Users can't upload anything: no file inputs exist and custom references go through WhatsApp or Instagram. This is stated on `/policies/images` and `/custom`. The image ownership notice is in the footer and on `/policies/images`. **OWNER:** get the owner's **written permission** to reuse their Instagram photos and logo. If uploads are ever added: a DMCA page and agent, plus registering the agent with the U.S. Copyright Office ($6). |
| — | Privacy, Terms, Refunds, Cookies pages | **DONE**, with gaps marked | `/policies/*`. Gaps are listed in OPEN_QUESTIONS.md. |

## Section 5: Security
| Item | Status | How / evidence |
|---|---|---|
| HTTPS redirect, HSTS, secure cookies | **DONE** (prod) | 301 to https when `NODE_ENV=production` (behind proxy, `trust proxy`). HSTS max-age 2 years. Cookie is `__Host-sid; HttpOnly; Secure; SameSite=Lax`. Lax is required so the session survives the top-level redirect back from eSewa. |
| Password hashing | **DONE** | Argon2id (`@node-rs/argon2`, OWASP default params). Minimum 10 characters, maximum 200. Plaintext is never stored or logged. |
| No account enumeration | **DONE** | Login: one generic error, plus a dummy hash for equal timing. Reset: always "If an account exists...". Signup with an existing email gives the same response and emails the account owner instead. |
| Bot protection | **DONE** | Self-hosted SHA-256 proof-of-work (`src/pow.js`). The challenge is HMAC-signed, expires in 10 minutes and works only once. It's on signup, login and reset. No third-party script, so there's no GDPR tradeoff. It runs alongside rate limiting (10 attempts per 15 minutes per IP on auth, 30 per 15 minutes on checkout, 120 per minute on the API). |
| Session expiry | **DONE** | 30 min idle and 12 h absolute, enforced server-side. The session ID is rotated on login. Logout deletes the row. A password reset deletes all of the user's sessions. e2e: "logout invalidates session". |
| CSRF | **DONE** | A synchronizer token on every POST (form field or `x-csrf-token` header) plus an Origin check. e2e: "POST without CSRF token refused (403)". Exempt: the token-authenticated one-click unsubscribe and the test-only mock eSewa. |
| Password reset | **DONE** | 32-byte token. Only the SHA-256 is stored. 30-minute expiry, single use (atomic `UPDATE ... WHERE used_at IS NULL`). All of the user's reset tokens are deleted when the password changes. `Referrer-Policy: no-referrer` on the reset page. |
| Least-privilege DB credential | **DONE** in code, **OWNER** to apply | `db/roles.sql`: the app role has no DDL, no superuser and can't delete orders or edit prices. Migrations use a separate owner role that is never deployed. |
| Logs scrub secrets | **DONE** | `src/logger.js` redacts sensitive keys, `key=value` secrets, URL query strings, bearer/basic auth and long digit runs. Request logs record the path only. Unit test: "logs never contain passwords, tokens, signatures, card/account numbers or auth headers". |
| Billing alerts | **OWNER** | Exact steps are in SETUP.md §4 (Render spend, Postgres storage, email quota and bounces, eSewa notifications, domain renewal). |
| Automated backups | **DONE** (tested), **OWNER** to enable | Render daily backups plus `npm run backup` JSON copies, 30-day retention. The restore is tested in `tests/backup.test.js`. SETUP.md §5. |
| Validation and escaping | **DONE** | Server-side validation and length caps on every field. All HTML output goes through the auto-escaping `html` template. The client builds DOM nodes with `textContent`. |
| Parameterized queries | **DONE** | Every query uses `$1..$n` params. |
| Security headers | **DONE** | Helmet: strict CSP (`default-src 'self'`, no inline script or style, `form-action 'self' <eSewa origin>`, `frame-ancestors 'none'`), nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy. |
| Dependency audit | **DONE** | `npm audit`: 0 vulnerabilities (13 Oct 2026). Re-run monthly. |
| Secrets in env only | **DONE** | Production refuses to start without `APP_SECRET`, `ESEWA_CODE` and `ESEWA_SECRET`. `.env` is gitignored. The only key in `ENV_EXAMPLE` is eSewa's public test key. |
| Server-side prices | **DONE** | `orders.quote()` reads prices from the DB and ignores anything else the browser sends. Unit test: "client prices ignored". The eSewa amount is re-checked against the DB on return. |

## Section 6A: eSewa
| Step | Status | Evidence |
|---|---|---|
| 1 Sandbox EPAYTEST and official test login | **DONE** | Values taken from developer.esewa.com.np/pages/Epay. The real sandbox accepted our signed form (HTTP 302 to its checkout) and the status API answered `NOT_FOUND` for a probe transaction. **OWNER:** apply for a merchant account now. |
| 2 Secrets in env | **DONE** | `ESEWA_SECRET`, `ESEWA_CODE`. |
| 3 Node 18+ on Render/Railway | **DONE** | Node 22.9+ (uses `--env-file-if-exists`). |
| 4 Orders table | **DONE** | `transaction_uuid` unique, `amount`, `status` PENDING/PAID/FAILED, `created_at`, `paid_at`. |
| 5 POST /initiate | **DONE** | `/api/checkout/initiate`: amount from the DB, PENDING insert, HMAC-SHA256 base64 over `total_amount,transaction_uuid,product_code`. |
| 6 Hidden auto-submit form | **DONE** | `public/js/app.js`. |
| 7 GET /success verify | **DONE** | Base64-decode, signature check (timing-safe, required fields must be signed), order exists, amount and product code match. |
| 8 Status API = COMPLETE | **DONE** | It is required before fulfilment. |
| 9 Atomic fulfilment | **DONE** | `UPDATE ... WHERE status='PENDING'`. Emails only go out if a row changed. Unit test: 3 concurrent calls give 1 fulfilment and 1 email. |
| 10 /payment-success polling | **DONE** | Every 2 s, up to 10 tries. |
| 11 Reconcile every 5 min | **DONE** | In-process timer plus `npm run reconcile`. |
| 12 Tests: normal, refresh, tampered, cancelled, tab closed | **DONE** (against the local eSewa double) | e2e at 360, 768 and 1440 px for the normal flow; the rest at 360. **OWNER:** repeat the normal and cancel cases once by hand in the real sandbox (SETUP.md §1). |
| 13 Go live | **OWNER** | SETUP.md §3. **No real money has been moved.** |
