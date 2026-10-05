/*
  ==================================================================
  GS QUICK ADD
  ==================================================================
  Adds a product to the cart straight from a product card.

  Markup comes from snippets/gs-card-product.liquid when a caller passes
  enableQuickAdd:
    [data-quick-add-variants] > [data-qa-size][data-variant-id]   sizes
    [data-quick-add][data-variant-id?]                            button

  Flow: pick a size (sets the button's variant id), press QUICK ADD,
  POST /cart/add.js with the sections Dawn's cart drawer re-renders,
  hand the response to <cart-drawer>.renderContents so the drawer opens
  with the new line. A single-variant product skips the size step. With
  no size chosen the button reveals the picker instead of adding.

  The size strip is the design the client had with Nosto: a translucent
  band over the bottom of the image. On touch screens it is always shown
  (no hover to reveal it); on pointer devices it slides up on hover.

  Load once, globally (layout/theme.liquid).
  ==================================================================
*/
(function () {
  'use strict';

  if (window.gsQuickAddBound) return;
  window.gsQuickAddBound = true;

  var strings = (window.gsQuickAddStrings) || {};
  var ADDING = strings.adding || 'Adding';
  var ADDED = strings.added || 'Added';
  var RETRY = strings.retry || 'Try again';
  var PICK = strings.pick || 'Select a size';

  function card(el) {
    return el.closest('.product-card');
  }

  function selectSize(sizeBtn) {
    if (sizeBtn.disabled) return;
    var c = card(sizeBtn);
    if (!c) return;

    c.querySelectorAll('[data-qa-size]').forEach(function (b) {
      var on = b === sizeBtn;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var btn = c.querySelector('[data-quick-add]');
    if (btn) {
      btn.dataset.variantId = sizeBtn.dataset.variantId;
      btn.classList.remove('needs-size');
      var label = btn.querySelector('[data-quick-add-label]');
      if (label && label.dataset.original) label.textContent = label.dataset.original;
    }
  }

  function revealSizes(btn) {
    var c = card(btn);
    var strip = c ? c.querySelector('[data-quick-add-variants]') : null;
    if (!strip) {
      // No sizes to pick from and no variant id: go to the product.
      var url = btn.getAttribute('data-product-url');
      if (url) window.location.href = url;
      return;
    }
    strip.classList.add('active');
    btn.classList.add('needs-size');

    var label = btn.querySelector('[data-quick-add-label]');
    if (label) {
      if (!label.dataset.original) label.dataset.original = label.textContent.trim();
      label.textContent = PICK;
    }

    var first = strip.querySelector('[data-qa-size]:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  }

  function openDrawer(json) {
    var drawer = document.querySelector('cart-drawer');
    if (drawer && typeof drawer.renderContents === 'function' && json && json.sections) {
      drawer.renderContents(json);
      return;
    }
    if (drawer && typeof drawer.open === 'function') {
      drawer.open();
      return;
    }
    window.location.href = '/cart';
  }

  function add(btn, variantId) {
    var label = btn.querySelector('[data-quick-add-label]');
    var original = label ? (label.dataset.original || label.textContent.trim()) : '';
    if (label) label.dataset.original = original;

    btn.disabled = true;
    btn.classList.add('is-loading');
    if (label) label.textContent = ADDING;

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        items: [{ id: Number(variantId), quantity: 1 }],
        sections: 'cart-drawer,cart-icon-bubble',
        sections_url: window.location.pathname
      })
    })
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok || json.status) {
            throw new Error(json.description || json.message || ('Add failed: ' + res.status));
          }
          return json;
        });
      })
      .then(function (json) {
        if (label) label.textContent = ADDED;
        openDrawer(json);
        document.dispatchEvent(new CustomEvent('gs:quick-add', { detail: { variantId: variantId } }));
      })
      .catch(function (err) {
        console.error('[gs-quick-add] ' + err.message);
        if (label) label.textContent = RETRY;
      })
      .then(function () {
        btn.disabled = false;
        btn.classList.remove('is-loading');
        window.setTimeout(function () {
          if (label) label.textContent = original;
        }, 1500);
      });
  }

  document.addEventListener('click', function (evt) {
    if (!evt.target || !evt.target.closest) return;

    var size = evt.target.closest('[data-qa-size]');
    if (size) {
      evt.preventDefault();
      selectSize(size);
      return;
    }

    var btn = evt.target.closest('[data-quick-add]');
    if (!btn || btn.disabled) return;
    evt.preventDefault();

    var variantId = btn.dataset.variantId;
    if (!variantId) {
      revealSizes(btn);
      return;
    }
    add(btn, variantId);
  });
})();
