'use strict';
const { html } = require('./html');
const business = require('../../content/business.json');

const npr = (n) => `Rs. ${Number(n).toLocaleString('en-IN')}`;
const waLink = (text) => `https://wa.me/${business.whatsappIntl}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

// Shown wherever a fact is still waiting on the owner. Production refuses to boot while required ones are missing.
const pending = (label) => html`<span class="pending">To confirm with the owner: ${label}</span>`;

function header(ctx) {
  const user = ctx.session && ctx.session.user;
  return html`
  <header class="site-header">
    <a class="brand" href="/">
      <img src="/img/logo.webp" alt="" width="48" height="48">
      <span class="brand-text"><span class="brand-name">${business.name}</span><span class="brand-tag">${business.tagline}</span></span>
    </a>
    <nav class="nav" aria-label="Main">
      <a href="/#shop" class="nav-link">Shop</a>
      <a href="/custom" class="nav-link">Custom orders</a>
      <a href="/contact" class="nav-link">Contact</a>
      <a href="${user ? '/account' : '/account/login'}" class="nav-link">${user ? 'Account' : 'Log in'}</a>
      <a href="/bag" class="nav-bag">Bag <span class="bag-count" data-bag-count aria-label="items in bag">0</span></a>
    </nav>
  </header>`;
}

function footer() {
  return html`
  <footer class="site-footer">
    <div class="footer-brand">
      <p class="footer-name">${business.name}</p>
      <p>${business.bio[0]}. ${business.category}, ${business.city}.</p>
      <p><a href="${business.instagramUrl}" rel="noopener">@${business.handle} on Instagram</a> · <a href="${waLink()}" rel="noopener">WhatsApp ${business.whatsapp}</a></p>
    </div>
    <nav class="footer-links" aria-label="Policies">
      <a href="/policies/terms">Terms of sale</a>
      <a href="/policies/refunds">Refunds and returns</a>
      <a href="/policies/privacy">Privacy</a>
      <a href="/policies/cookies">Cookies</a>
      <a href="/policies/images">About our photos</a>
    </nav>
    <p class="footer-note">All product photos belong to ${business.name} and come from its Instagram page.</p>
  </footer>`;
}

function layout(ctx, { title, body, description, bodyClass = '' }) {
  const csrf = ctx.session ? ctx.session.csrf : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html`${title ? `${title} | ` : ''}${business.name}`}</title>
<meta name="description" content="${html`${description || `${business.bio[0]}. ${business.bio[1]} ${business.city}.`}`}">
<meta name="csrf-token" content="${html`${csrf}`}">
<meta name="theme-color" content="#fbf7f1">
<link rel="icon" href="/img/logo.webp" type="image/webp">
<link rel="preload" href="/fonts/fraunces-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/site.css">
<script src="/js/app.js" defer></script>
</head>
<body class="${html`${bodyClass}`}">
<a class="skip" href="#main">Skip to content</a>
${header(ctx)}
<main id="main">
${body}
</main>
${footer()}
</body>
</html>`;
}

module.exports = { layout, npr, waLink, pending, business };
