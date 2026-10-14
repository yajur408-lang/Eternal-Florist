'use strict';
// oohflorist client script. The bag lives in this browser only; the server recalculates every price.
(function () {
  var BAG_KEY = 'oohflorist.bag';
  var memoryBag = [];
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  function readBag() {
    try {
      var v = JSON.parse(localStorage.getItem(BAG_KEY) || '[]');
      return Array.isArray(v) ? v.filter(function (i) { return i && typeof i.id === 'string' && i.qty > 0; }) : [];
    } catch (e) { return memoryBag; }
  }
  function writeBag(items) {
    memoryBag = items;
    try { localStorage.setItem(BAG_KEY, JSON.stringify(items)); } catch (e) { /* private mode: keep in memory */ }
    renderCount(true);
  }
  function addToBag(id, qty) {
    var items = readBag();
    var found = items.find(function (i) { return i.id === id; });
    if (found) found.qty = Math.min(20, found.qty + qty); else items.push({ id: id, qty: qty });
    writeBag(items);
  }
  function setQty(id, qty) {
    var items = readBag().map(function (i) { return i.id === id ? { id: i.id, qty: Math.max(0, Math.min(20, qty)) } : i; });
    writeBag(items.filter(function (i) { return i.qty > 0; }));
  }
  function renderCount(bump) {
    var n = readBag().reduce(function (s, i) { return s + i.qty; }, 0);
    document.querySelectorAll('[data-bag-count]').forEach(function (el) {
      el.textContent = String(n);
      if (bump) { el.classList.remove('is-bumped'); void el.offsetWidth; el.classList.add('is-bumped'); }
    });
  }
  var npr = function (n) { return 'Rs. ' + Number(n).toLocaleString('en-IN'); };
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong. Please refresh and try again.'); return j; });
    });
  }

  // ---------- Product page ----------
  var addForm = document.querySelector('[data-add-form]');
  if (addForm) {
    var qtyInput = addForm.querySelector('input[name="qty"]');
    addForm.querySelectorAll('[data-qty-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = Math.max(1, Math.min(20, (parseInt(qtyInput.value, 10) || 1) + Number(b.dataset.qtyStep)));
        qtyInput.value = String(v);
      });
    });
    addForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var qty = Math.max(1, Math.min(20, parseInt(qtyInput.value, 10) || 1));
      addToBag(addForm.dataset.id, qty);
      var btn = addForm.querySelector('[data-add-btn]');
      var status = addForm.querySelector('.add-status');
      btn.textContent = 'Added';
      btn.classList.add('is-added');
      status.textContent = '';
      status.appendChild(document.createTextNode('In your bag. '));
      status.appendChild(el('a', { href: '/bag', text: 'View bag' }));
      setTimeout(function () { btn.textContent = 'Add to bag'; btn.classList.remove('is-added'); }, 1600);
    });
  }

  // ---------- Bag page ----------
  var bagView = document.querySelector('[data-bag-view]');
  function renderBag() {
    var items = readBag();
    bagView.textContent = '';
    if (!items.length) {
      bagView.appendChild(el('p', { text: 'Your bag is empty.' }));
      bagView.appendChild(el('a', { class: 'btn btn-primary', href: '/#shop', text: 'Browse bouquets' }));
      return;
    }
    post('/api/quote', { items: items }).then(function (q) {
      var list = el('ul', { class: 'bag-lines', role: 'list' });
      q.lines.forEach(function (l) {
        var minus = el('button', { type: 'button', class: 'qty-btn', 'aria-label': 'One less ' + l.name, text: '−' });
        var plus = el('button', { type: 'button', class: 'qty-btn', 'aria-label': 'One more ' + l.name, text: '+' });
        var remove = el('button', { type: 'button', class: 'link-btn', text: 'Remove' });
        minus.addEventListener('click', function () { setQty(l.id, l.qty - 1); renderBag(); });
        plus.addEventListener('click', function () { setQty(l.id, l.qty + 1); renderBag(); });
        remove.addEventListener('click', function () { setQty(l.id, 0); renderBag(); });
        list.appendChild(el('li', { class: 'bag-line' }, [
          el('img', { src: '/img/' + l.image, alt: '', width: '72', height: '72' }),
          el('div', {}, [
            el('a', { class: 'bag-line-name', href: '/p/' + l.id, text: l.name }),
            el('div', { class: 'muted', text: npr(l.unitPrice) + ' each' }),
            el('div', { class: 'bag-line-actions' }, [el('div', { class: 'qty' }, [minus, el('span', { 'aria-live': 'polite', text: String(l.qty) }), plus]), remove]),
          ]),
          el('strong', { text: npr(l.lineTotal) }),
        ]));
      });
      bagView.appendChild(list);
      bagView.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Total' }), el('span', { text: npr(q.total) })]));
      bagView.appendChild(el('a', { class: 'btn btn-primary btn-block', href: '/checkout', text: 'Go to checkout' }));
    }).catch(function (err) {
      bagView.appendChild(el('p', { class: 'form-error', role: 'alert', text: err.message }));
      var clear = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Empty my bag' });
      clear.addEventListener('click', function () { writeBag([]); renderBag(); });
      bagView.appendChild(clear);
    });
  }
  if (bagView) renderBag();

  // ---------- Checkout ----------
  var checkoutForm = document.querySelector('[data-checkout-form]');
  if (checkoutForm) {
    var summary = checkoutForm.querySelector('[data-summary]');
    var errorBox = checkoutForm.querySelector('[data-form-error]');
    var payBtn = checkoutForm.querySelector('[data-pay-btn]');
    var items = readBag();
    if (!items.length) {
      summary.textContent = '';
      summary.appendChild(el('p', { text: 'Your bag is empty.' }));
      payBtn.disabled = true;
    } else {
      post('/api/quote', { items: items }).then(function (q) {
        summary.textContent = '';
        q.lines.forEach(function (l) {
          summary.appendChild(el('div', { class: 'summary-line' }, [el('span', { text: l.qty + ' x ' + l.name }), el('span', { text: npr(l.lineTotal) })]));
        });
        summary.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Total' }), el('span', { text: npr(q.total) })]));
      }).catch(function (err) { errorBox.textContent = err.message; payBtn.disabled = true; });
    }
    checkoutForm.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.textContent = '';
      if (!checkoutForm.reportValidity()) return;
      var fd = new FormData(checkoutForm);
      var body = { items: readBag() };
      ['name', 'phone', 'email', 'address', 'note', 'dob'].forEach(function (k) { if (fd.has(k)) body[k] = fd.get(k); });
      payBtn.disabled = true;
      payBtn.textContent = 'Taking you to eSewa...';
      post('/api/checkout/initiate', body).then(function (res) {
        // Build a hidden form from the server's signed fields and submit it to eSewa.
        var f = el('form', { method: 'POST', action: res.url });
        Object.keys(res.fields).forEach(function (k) { f.appendChild(el('input', { type: 'hidden', name: k, value: res.fields[k] })); });
        document.body.appendChild(f);
        f.submit();
      }).catch(function (err) {
        errorBox.textContent = err.message;
        payBtn.disabled = false;
        payBtn.textContent = 'Pay with eSewa';
      });
    });
  }

  // ---------- Payment status: poll every 2s, up to 10 tries ----------
  var statusPage = document.querySelector('[data-order-status]');
  if (statusPage) {
    var title = statusPage.querySelector('[data-status-title]');
    var text = statusPage.querySelector('[data-status-text]');
    var detail = statusPage.querySelector('[data-status-detail]');
    var tries = 0;
    var poll = function () {
      tries++;
      fetch('/api/order/' + encodeURIComponent(statusPage.dataset.order), { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('not found'); return r.json(); })
        .then(function (o) {
          if (o.status === 'PAID') {
            statusPage.dataset.state = 'paid';
            title.textContent = 'Thank you, your order is confirmed';
            text.textContent = "We've emailed your receipt. We'll message you about delivery.";
            detail.textContent = '';
            var ul = el('ul', {});
            o.items.forEach(function (i) { ul.appendChild(el('li', { text: i.qty + ' x ' + i.name })); });
            detail.appendChild(ul);
            detail.appendChild(el('p', { class: 'total-row' }, [el('span', { text: 'Paid' }), el('span', { text: npr(o.amount) })]));
            writeBag([]);
            return;
          }
          if (o.status === 'FAILED') {
            statusPage.dataset.state = 'failed';
            title.textContent = 'Payment not completed';
            text.textContent = "Your eSewa payment didn't go through, so you haven't been charged. Your bag is still saved.";
            return;
          }
          if (tries < 10) setTimeout(poll, 2000);
          else {
            title.textContent = 'Still waiting for eSewa';
            text.textContent = "This is taking longer than usual. You don't need to pay again: we keep checking with eSewa and will email you once it's confirmed.";
          }
        })
        .catch(function () {
          title.textContent = 'Order not found';
          text.textContent = 'Please check the link, or contact us.';
        });
    };
    poll();
  }

  // ---------- Proof-of-work bot check on auth forms ----------
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function solve(salt, difficulty) {
    var prefix = '0'.repeat(difficulty);
    var enc = new TextEncoder();
    for (var n = 0; n < 5e7; n++) {
      var h = hex(await crypto.subtle.digest('SHA-256', enc.encode(salt + ':' + n)));
      if (h.startsWith(prefix)) return String(n);
    }
    throw new Error('Could not finish the security check.');
  }
  document.querySelectorAll('[data-pow-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (form.dataset.powDone === '1') return;
      e.preventDefault();
      if (!form.reportValidity()) return;
      var btn = form.querySelector('button[type="submit"]');
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Checking...';
      fetch('/api/pow', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (c) {
          return solve(c.salt, c.difficulty).then(function (nonce) {
            form.querySelector('[name="pow_challenge"]').value = c.challenge;
            form.querySelector('[name="pow_nonce"]').value = nonce;
            form.dataset.powDone = '1';
            form.submit();
          });
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = label;
          var box = form.querySelector('.form-error');
          if (box) box.textContent = err.message || 'Something went wrong. Please try again.';
        });
    });
  });

  renderCount(false);
})();
