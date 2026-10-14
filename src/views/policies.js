'use strict';
// Policies contain only facts about how this site works plus owner-confirmed facts.
// Anything not yet confirmed renders as a visible "to confirm" marker. Not legal advice:
// the owner should have a Nepali lawyer review these before launch.
const { html } = require('./html');
const { layout, pending, business, waLink } = require('./layout');

const P = business.pending;
const owner = () => P.legalOwnerName || pending('legal name of the business owner');
const contactLine = () => html`WhatsApp <a href="${waLink()}" rel="noopener">${business.whatsapp}</a>, Instagram <a href="${business.instagramUrl}" rel="noopener">@${business.handle}</a>${P.contactEmail ? html`, or email <a href="mailto:${P.contactEmail}">${P.contactEmail}</a>` : ''}`;

const UPDATED = '13 October 2026';

const pages = {
  privacy: {
    title: 'Privacy policy',
    body: () => html`
      <p>This site is run by ${owner()}, trading as ${business.name}, ${business.city}. Questions about your data: ${contactLine()}.</p>
      <h2>What we collect and why</h2>
      <ul>
        <li><strong>When you order:</strong> your name, phone number, email, delivery address and any note you write. We use these to make and deliver your order and to send your receipt.</li>
        <li><strong>Date of birth:</strong> checked once to confirm you are 13 or older, then thrown away. We do not store it.</li>
        <li><strong>If you create an account:</strong> your name, email and a scrambled (hashed) version of your password. We can't read your password.</li>
        <li><strong>Marketing emails:</strong> only if you tick the box. Every one has an unsubscribe link, and unsubscribing takes effect straight away.</li>
      </ul>
      <h2>Payments</h2>
      <p>Payments are handled by eSewa. You log in to eSewa on eSewa's own site. We receive the payment result and a transaction reference, never your eSewa ID, password, MPIN or OTP.</p>
      <h2>Children</h2>
      <p>We don't take orders or create accounts for anyone under 13, and we don't keep personal data from them.</p>
      <h2>What we don't do</h2>
      <ul>
        <li>No advertising or tracking cookies, no analytics, and no session recording or keystroke logging.</li>
        <li>Fonts and images load from this site only, so your IP address is not sent to font or image services.</li>
        <li>We don't sell your data.</li>
      </ul>
      <h2>Who else sees your data</h2>
      <p>eSewa (payment), our hosting and database provider, and our email provider, only as needed to run the shop.</p>
      <h2>How long we keep it</h2>
      <p>${P.dataRetention || pending('how long order records are kept')}</p>
      <h2>Your choices</h2>
      <p>You can delete your account from your account page at any time. To ask for a copy or correction of your data, contact us using the details above.</p>
      <p class="muted">Last updated ${UPDATED}.</p>`,
  },
  terms: {
    title: 'Terms of sale',
    body: () => html`
      <p>These terms cover orders placed on this website with ${owner()}, trading as ${business.name}, ${business.city}.</p>
      <h2>Prices and payment</h2>
      <p>Prices are in Nepali rupees (NPR). The total is calculated by our system at checkout, and you pay it in full through eSewa. Your order is confirmed once eSewa confirms the payment.</p>
      <h2>Made-to-order pieces</h2>
      <p>Some pieces are made to order and have no price online. Message us on WhatsApp or Instagram to agree on the design and price first.</p>
      <h2>Delivery</h2>
      <p>Areas: ${P.deliveryAreas || pending('delivery areas')}</p>
      <p>Charges: ${P.deliveryFees || pending('delivery fees')}</p>
      <p>Timing: ${P.leadTime || pending('how long orders take')}</p>
      <h2>Cancellations</h2>
      <p>${P.cancellationPolicy || pending('cancellation rules')}</p>
      <h2>Contact</h2>
      <p>${contactLine()}.</p>
      <p class="muted">Last updated ${UPDATED}.</p>`,
  },
  refunds: {
    title: 'Refunds and returns',
    body: () => html`
      <p>${P.refundPolicy || pending('refund and return policy, including custom pieces')}</p>
      <p>If there is a problem with your order, contact us: ${contactLine()}.</p>
      <p>Approved refunds for eSewa payments are made through eSewa.</p>
      <p class="muted">Last updated ${UPDATED}.</p>`,
  },
  cookies: {
    title: 'Cookies',
    body: () => html`
      <p>This site sets one cookie, and it is strictly necessary:</p>
      <ul>
        <li><strong>Session cookie</strong> (named __Host-sid). It keeps you logged in, protects forms from forgery, and lasts at most 12 hours. Logged-in sessions end after 30 minutes without activity.</li>
      </ul>
      <p>Your bag is saved in your own browser's storage, not in a cookie, and is never sent to us until you check out.</p>
      <p>No advertising, analytics or tracking cookies are used, so there is nothing to opt in or out of.</p>
      <p class="muted">Last updated ${UPDATED}.</p>`,
  },
  images: {
    title: 'About our photos',
    body: () => html`
      <p>All product photos on this site belong to ${business.name} and come from its Instagram page, <a href="${business.instagramUrl}" rel="noopener">@${business.handle}</a>. Please don't reuse them without permission.</p>
      <p>Customers can't upload images or files to this website. For custom orders, send reference pictures to us directly on WhatsApp or Instagram.</p>
      <p class="muted">Last updated ${UPDATED}.</p>`,
  },
};

function policy(ctx, key) {
  const p = pages[key];
  if (!p) return null;
  return layout(ctx, { title: p.title, body: html`<article class="page narrow prose"><h1>${p.title}</h1>${p.body()}</article>` });
}

module.exports = { policy, keys: Object.keys(pages) };
