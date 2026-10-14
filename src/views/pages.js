'use strict';
const { html, raw } = require('./html');
const { layout, npr, waLink, pending, business } = require('./layout');

const priceLabel = (p) => (p.price_npr != null ? npr(p.price_npr) : 'Ask for a price');

function productCard(p, i) {
  return html`
  <li class="card ${i === 0 ? 'card-lead' : ''}">
    <a href="/p/${p.id}" class="card-link">
      <span class="card-photo"><img src="/img/${p.image}" alt="${p.image_alt}" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async"></span>
      <span class="card-name">${p.name}</span>
      <span class="card-price ${p.price_npr == null ? 'is-ask' : ''}">${priceLabel(p)}</span>
    </a>
  </li>`;
}

function home(ctx, products) {
  const [a, b, c] = [products[4], products[1], products[3]].filter(Boolean);
  const body = html`
  <section class="intro">
    <div class="intro-text">
      <p class="intro-handle">@${business.handle} · ${business.city}</p>
      <h1 class="intro-title">${business.bio[0]}</h1>
      <p class="intro-lede">${business.bio[1]} Bouquets, flower bags and baskets that last, from a home studio in ${business.city}.</p>
      <div class="intro-actions">
        <a class="btn btn-primary" href="#shop">Shop bouquets</a>
        <a class="btn btn-ghost" href="${waLink('Hi! I would like to customise a bouquet.')}" rel="noopener">Message on WhatsApp</a>
      </div>
    </div>
    <div class="intro-mosaic" aria-hidden="true">
      ${[a, b, c].map((p, i) => html`<img class="mosaic-${i + 1}" src="/img/${p.image}" alt="" width="338" height="400">`)}
    </div>
  </section>

  <section class="shop" id="shop" aria-labelledby="shop-title">
    <div class="section-head">
      <h2 id="shop-title">The shop</h2>
      <p>Tap a bouquet to see it up close. Pieces marked "Ask for a price" are made to order, so message us first.</p>
    </div>
    <ul class="grid" role="list">${products.map(productCard)}</ul>
  </section>

  <section class="custom-band" aria-labelledby="custom-title">
    <img src="/img/${products[5] ? products[5].image : products[0].image}" alt="" class="custom-photo" loading="lazy">
    <div>
      <h2 id="custom-title">Customise your bouquet</h2>
      <p>Pick the colours, the flowers and the little extras, and we'll make it your own unique design.</p>
      <a class="btn btn-primary" href="/custom">How custom orders work</a>
    </div>
  </section>`;
  return layout(ctx, { body, bodyClass: 'page-home' });
}

function product(ctx, p) {
  const buyable = p.price_npr != null;
  const body = html`
  <article class="product">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/#shop">Shop</a> <span aria-hidden="true">/</span> <span>${p.name}</span></nav>
    <div class="product-photo"><img src="/img/${p.image}" alt="${p.image_alt}" decoding="async"></div>
    <div class="product-info">
      <h1>${p.name}</h1>
      <p class="product-price ${buyable ? '' : 'is-ask'}">${priceLabel(p)}</p>
      <p class="product-desc">${p.description}</p>
      ${buyable
        ? html`
      <form class="add-form" data-add-form data-id="${p.id}">
        <label for="qty">Quantity</label>
        <div class="qty">
          <button type="button" class="qty-btn" data-qty-step="-1" aria-label="One less">−</button>
          <input id="qty" name="qty" type="number" inputmode="numeric" min="1" max="20" value="1">
          <button type="button" class="qty-btn" data-qty-step="1" aria-label="One more">+</button>
        </div>
        <button type="submit" class="btn btn-primary btn-block" data-add-btn>Add to bag</button>
        <p class="add-status" role="status" aria-live="polite"></p>
      </form>`
        : html`
      <p>This one is made to order. Send us a message and we'll talk about colours, size and price.</p>
      <div class="stack-actions">
        <a class="btn btn-primary btn-block" href="${waLink(`Hi! I'm interested in the ${p.name}.`)}" rel="noopener">Ask on WhatsApp</a>
        <a class="btn btn-ghost btn-block" href="${business.instagramUrl}" rel="noopener">DM on Instagram</a>
      </div>`}
      <p class="photo-credit">Photo from <a href="${business.instagramUrl}" rel="noopener">@${business.handle}</a> on Instagram.</p>
    </div>
  </article>`;
  return layout(ctx, { title: p.name, body, description: `${p.name}. ${p.description}` });
}

function bag(ctx) {
  const body = html`
  <section class="page narrow">
    <h1>Your bag</h1>
    <div data-bag-view>
      <p class="muted">Loading your bag...</p>
    </div>
    <noscript><p>Your bag needs JavaScript turned on.</p></noscript>
  </section>`;
  return layout(ctx, { title: 'Bag', body });
}

const dobField = () => html`
  <div class="field">
    <label for="dob">Date of birth</label>
    <input id="dob" name="dob" type="date" required autocomplete="bday">
  </div>`;

function checkout(ctx) {
  const u = ctx.session && ctx.session.user;
  const body = html`
  <section class="page checkout">
    <h1>Checkout</h1>
    <form class="form checkout-form" data-checkout-form novalidate>
      <fieldset>
        <legend>Your details</legend>
        <div class="field"><label for="name">Full name</label><input id="name" name="name" required maxlength="80" autocomplete="name" value="${u ? u.name : ''}"></div>
        <div class="field"><label for="phone">Phone (for delivery)</label><input id="phone" name="phone" type="tel" required maxlength="20" autocomplete="tel" inputmode="tel"></div>
        <div class="field"><label for="email">Email (for your receipt)</label><input id="email" name="email" type="email" required maxlength="120" autocomplete="email" value="${u ? u.email : ''}"></div>
        ${u ? '' : dobField()}
      </fieldset>
      <fieldset>
        <legend>Delivery</legend>
        <div class="field"><label for="address">Delivery address</label><textarea id="address" name="address" required maxlength="300" rows="3" autocomplete="street-address"></textarea></div>
        <p class="hint">Delivery area and charges: ${business.pending.deliveryAreas || pending('delivery areas and fees')}</p>
        <div class="field"><label for="note">Note for the shop (optional)</label><textarea id="note" name="note" maxlength="500" rows="3" placeholder="Colours, a message for the card, a date you need it by..."></textarea></div>
      </fieldset>
      <aside class="summary" aria-labelledby="sum-title">
        <h2 id="sum-title">Order summary</h2>
        <div data-summary><p class="muted">Loading...</p></div>
        <p class="hint">You'll pay with eSewa. We never see your eSewa login.</p>
        <p class="form-error" role="alert" data-form-error></p>
        <button type="submit" class="btn btn-primary btn-block" data-pay-btn>Pay with eSewa</button>
        <p class="hint">By paying you agree to our <a href="/policies/terms">terms of sale</a> and <a href="/policies/refunds">refund policy</a>.</p>
      </aside>
    </form>
  </section>`;
  return layout(ctx, { title: 'Checkout', body, bodyClass: 'page-checkout' });
}

function paymentStatus(ctx, publicId) {
  const body = html`
  <section class="page narrow status-page" data-order-status data-order="${publicId}">
    <h1 data-status-title>Checking your payment</h1>
    <p data-status-text>This takes a few seconds. Please keep this page open.</p>
    <div data-status-detail></div>
    <p><a class="btn btn-ghost" href="/">Back to the shop</a></p>
  </section>`;
  return layout(ctx, { title: 'Order status', body });
}

function message(ctx, { title, text, status = '', actions = [] }) {
  const body = html`
  <section class="page narrow">
    <h1>${title}</h1>
    <p>${text}</p>
    ${status ? html`<p class="muted">${status}</p>` : ''}
    <div class="stack-actions">${actions.map((a) => html`<a class="btn ${a.primary ? 'btn-primary' : 'btn-ghost'}" href="${a.href}">${a.label}</a>`)}</div>
  </section>`;
  return layout(ctx, { title, body });
}

function custom(ctx) {
  const body = html`
  <section class="page narrow prose">
    <h1>Custom orders</h1>
    <p>${business.bio[1]} Tell us what you have in mind: the colours, which flowers, whether you want lights, a plush or a basket, and the date you need it.</p>
    <p>Describe it in words or send pictures straight to us on WhatsApp or Instagram. Uploading pictures here on the website isn't possible.</p>
    <p>How much notice we need: ${business.pending.leadTime || pending('lead time for custom pieces')}</p>
    <div class="stack-actions">
      <a class="btn btn-primary" href="${waLink('Hi! I would like to customise a bouquet.')}" rel="noopener">WhatsApp ${business.whatsapp}</a>
      <a class="btn btn-ghost" href="${business.instagramUrl}" rel="noopener">DM @${business.handle}</a>
    </div>
  </section>`;
  return layout(ctx, { title: 'Custom orders', body });
}

function contact(ctx) {
  const body = html`
  <section class="page narrow prose">
    <h1>Contact</h1>
    <dl class="facts">
      <dt>WhatsApp</dt><dd><a href="${waLink()}" rel="noopener">${business.whatsapp}</a></dd>
      <dt>Instagram</dt><dd><a href="${business.instagramUrl}" rel="noopener">@${business.handle}</a></dd>
      <dt>Location</dt><dd>${business.city}</dd>
      <dt>Email</dt><dd>${business.pending.contactEmail ? html`<a href="mailto:${business.pending.contactEmail}">${business.pending.contactEmail}</a>` : pending('contact email')}</dd>
      <dt>Reply hours</dt><dd>${business.pending.replyHours || pending('reply hours')}</dd>
    </dl>
  </section>`;
  return layout(ctx, { title: 'Contact', body });
}

// ---------- Account ----------
const csrfField = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.session ? ctx.session.csrf : ''}">`;
const powFields = () => html`<input type="hidden" name="pow_challenge" value=""><input type="hidden" name="pow_nonce" value="">`;
const formError = (err) => (err ? html`<p class="form-error" role="alert">${err}</p>` : html`<p class="form-error" role="alert"></p>`);

function login(ctx, { error, email = '', notice } = {}) {
  const body = html`
  <section class="page auth">
    <h1>Log in</h1>
    ${notice ? html`<p class="notice" role="status">${notice}</p>` : ''}
    <form method="post" action="/account/login" class="form" data-pow-form>
      ${csrfField(ctx)}${powFields()}
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" value="${email}"></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password"></div>
      ${formError(error)}
      <button class="btn btn-primary btn-block" type="submit">Log in</button>
    </form>
    <p><a href="/account/forgot">Forgot your password?</a></p>
    <p>New here? <a href="/account/signup">Create an account</a>. You can also check out without one.</p>
  </section>`;
  return layout(ctx, { title: 'Log in', body });
}

function signup(ctx, { error, values = {} } = {}) {
  const body = html`
  <section class="page auth">
    <h1>Create an account</h1>
    <form method="post" action="/account/signup" class="form" data-pow-form>
      ${csrfField(ctx)}${powFields()}
      <div class="field"><label for="name">Name</label><input id="name" name="name" required maxlength="80" autocomplete="name" value="${values.name || ''}"></div>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required maxlength="120" autocomplete="email" value="${values.email || ''}"></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required minlength="10" maxlength="200" autocomplete="new-password" aria-describedby="pw-hint"><p class="hint" id="pw-hint">At least 10 characters.</p></div>
      ${dobField()}
      <div class="check"><input id="marketing" name="marketing" type="checkbox" value="1"><label for="marketing">Email me about new bouquets (optional, unsubscribe any time)</label></div>
      ${formError(error)}
      <button class="btn btn-primary btn-block" type="submit">Create account</button>
      <p class="hint">See our <a href="/policies/privacy">privacy policy</a> for what we store.</p>
    </form>
  </section>`;
  return layout(ctx, { title: 'Create an account', body });
}

function forgot(ctx, { sent } = {}) {
  const body = html`
  <section class="page auth">
    <h1>Reset your password</h1>
    ${sent
      ? html`<p class="notice" role="status">If an account exists for that email, we've sent a reset link. It works once and expires in 30 minutes.</p>`
      : html`
    <form method="post" action="/account/forgot" class="form" data-pow-form>
      ${csrfField(ctx)}${powFields()}
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email"></div>
      ${formError()}
      <button class="btn btn-primary btn-block" type="submit">Send reset link</button>
    </form>`}
  </section>`;
  return layout(ctx, { title: 'Reset password', body });
}

function reset(ctx, { token, error }) {
  const body = html`
  <section class="page auth">
    <h1>Choose a new password</h1>
    <form method="post" action="/account/reset" class="form" data-pow-form>
      ${csrfField(ctx)}${powFields()}
      <input type="hidden" name="token" value="${token}">
      <div class="field"><label for="password">New password</label><input id="password" name="password" type="password" required minlength="10" maxlength="200" autocomplete="new-password"><p class="hint">At least 10 characters.</p></div>
      ${formError(error)}
      <button class="btn btn-primary btn-block" type="submit">Save password</button>
    </form>
  </section>`;
  return layout(ctx, { title: 'New password', body });
}

const STATUS_TEXT = { PENDING: 'Waiting for payment', PAID: 'Paid', FAILED: 'Not paid' };
const FULFIL_TEXT = { NEW: 'Received', PREPARING: 'Being made', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };

function account(ctx, { orders, user }) {
  const body = html`
  <section class="page narrow">
    <h1>Hi, ${user.name}</h1>
    <p class="muted">${user.email}</p>
    <h2>Your orders</h2>
    ${orders.length
      ? html`<ul class="order-list" role="list">${orders.map((o) => html`
        <li class="order-row">
          <a href="/payment-success?order=${o.public_id}">Order ${o.public_id.slice(0, 8).toUpperCase()}</a>
          <span>${new Date(o.created_at).toLocaleDateString('en-GB')}</span>
          <span>${npr(o.amount)}</span>
          <span class="tag tag-${o.status.toLowerCase()}">${STATUS_TEXT[o.status]}${o.status === 'PAID' ? ` · ${FULFIL_TEXT[o.fulfillment]}` : ''}</span>
        </li>`)}</ul>`
      : html`<p>No orders yet. <a href="/#shop">Have a look at the shop</a>.</p>`}
    <div class="account-actions">
      <form method="post" action="/account/logout">${csrfField(ctx)}<button class="btn btn-ghost" type="submit">Log out</button></form>
    </div>
    <details class="danger-zone">
      <summary>Delete my account</summary>
      <p>This deletes your login and personal details. Paid orders stay in the shop's records without being linked to you.</p>
      <form method="post" action="/account/delete">${csrfField(ctx)}<button class="btn btn-danger" type="submit">Delete my account</button></form>
    </details>
  </section>`;
  return layout(ctx, { title: 'Your account', body });
}

// ---------- Admin ----------
function admin(ctx, { orders, filter }) {
  const body = html`
  <section class="page wide">
    <h1>Orders</h1>
    <nav class="filters" aria-label="Filter orders">
      ${['PAID', 'PENDING', 'FAILED', 'ALL'].map((f) => html`<a href="/admin?status=${f}" class="chip ${filter === f ? 'is-active' : ''}" ${filter === f ? raw('aria-current="page"') : ''}>${f === 'ALL' ? 'All' : STATUS_TEXT[f]}</a>`)}
    </nav>
    ${orders.length === 0 ? html`<p>No orders here yet.</p>` : ''}
    <ul class="admin-orders" role="list">
    ${orders.map((o) => html`
      <li class="admin-order">
        <div class="admin-order-head">
          <strong>${o.public_id.slice(0, 8).toUpperCase()}</strong>
          <span>${new Date(o.created_at).toLocaleString('en-GB')}</span>
          <span>${npr(o.amount)}</span>
          <span class="tag tag-${o.status.toLowerCase()}">${STATUS_TEXT[o.status]}</span>
        </div>
        <p>${o.items}</p>
        <p>${o.customer_name} · ${o.phone} · ${o.email}</p>
        <p>${o.address}</p>
        ${o.note ? html`<p class="muted">Note: ${o.note}</p>` : ''}
        ${o.esewa_ref ? html`<p class="muted">eSewa ref: ${o.esewa_ref}</p>` : ''}
        ${o.status === 'PAID' ? html`
        <form method="post" action="/admin/orders/${o.id}/fulfillment" class="inline-form">
          ${csrfField(ctx)}
          <label for="f-${o.id}">Progress</label>
          <select id="f-${o.id}" name="fulfillment">${Object.entries(FULFIL_TEXT).map(([k, v]) => html`<option value="${k}" ${o.fulfillment === k ? raw('selected') : ''}>${v}</option>`)}</select>
          <button class="btn btn-ghost" type="submit">Save</button>
        </form>` : ''}
      </li>`)}
    </ul>
  </section>`;
  return layout(ctx, { title: 'Orders', body });
}

module.exports = { home, product, bag, checkout, paymentStatus, message, custom, contact, login, signup, forgot, reset, account, admin, STATUS_TEXT, FULFIL_TEXT };
