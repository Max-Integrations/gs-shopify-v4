/*
  ==================================================================
  GS QUICK VIEW
  ==================================================================
  Opens a product in a native <dialog> from a product card, fetching
  sections/gs-quick-view.liquid through the Section Rendering API.

  PROGRESSIVE ENHANCEMENT. The card's QUICK VIEW is a real <a href> to
  the product page. This intercepts the click; if anything fails - fetch
  error, no dialog support - the link navigates normally, so the customer
  always reaches the product.

  Native <dialog> gives focus trapping, Escape to close, an inert
  background and correct semantics for free. v3 hand-built its modal.

  Load once, globally.
  ==================================================================
*/
(function () {
  'use strict';

  if (window.gsQuickViewBound) return;
  window.gsQuickViewBound = true;

  var dialog = null;
  var lastTrigger = null;

  function supported() {
    return typeof HTMLDialogElement === 'function' && 'showModal' in HTMLDialogElement.prototype;
  }

  function svgIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M6 6 L18 18 M18 6 L6 18');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');

    svg.appendChild(path);
    return svg;
  }

  function getDialog() {
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.className = 'gs-qv-dialog';
    dialog.setAttribute('aria-label', 'Quick view');

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gs-qv-dialog__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.setAttribute('data-qv-close', '');
    closeBtn.appendChild(svgIcon());

    var body = document.createElement('div');
    body.className = 'gs-qv-dialog__body';
    body.setAttribute('data-qv-body', '');

    dialog.appendChild(closeBtn);
    dialog.appendChild(body);
    document.body.appendChild(dialog);

    // Clicking the backdrop closes. A click landing on the dialog element
    // itself rather than its contents means the backdrop was hit.
    dialog.addEventListener('click', function (evt) {
      if (evt.target === dialog) close();
    });

    dialog.addEventListener('close', function () {
      document.documentElement.classList.remove('gs-qv-open');
      if (lastTrigger) lastTrigger.focus();
    });

    return dialog;
  }

  function close() {
    if (dialog && dialog.open) dialog.close();
  }

  function open(handle, trigger) {
    var d = getDialog();
    var body = d.querySelector('[data-qv-body]');

    lastTrigger = trigger;

    var loading = document.createElement('div');
    loading.className = 'gs-qv-dialog__loading';
    loading.setAttribute('role', 'status');
    loading.textContent = 'Loading';

    body.innerHTML = '';
    body.appendChild(loading);

    d.showModal();
    document.documentElement.classList.add('gs-qv-open');

    fetch('/products/' + handle + '?section_id=gs-quick-view')
      .then(function (res) {
        if (!res.ok) throw new Error('Quick view fetch failed: ' + res.status);
        return res.text();
      })
      .then(function (markup) {
        var parsed = new DOMParser().parseFromString(markup, 'text/html');
        var content = parsed.querySelector('[data-quick-view-content]');
        if (!content) throw new Error('Quick view content missing');

        body.innerHTML = '';
        body.appendChild(content);

        var focusable = body.querySelector('a, button, input');
        if (focusable) focusable.focus();
      })
      .catch(function (err) {
        console.error('[gs-quick-view] ' + err.message);
        close();
        // Fall back to the product page rather than leaving a dead modal.
        var href = trigger ? trigger.getAttribute('href') : null;
        if (href) window.location.href = href;
      });
  }

  /* ----------------------------------------------------------------
     Open / close
     ---------------------------------------------------------------- */
  document.addEventListener('click', function (evt) {
    if (!evt.target || !evt.target.closest) return;

    if (evt.target.closest('[data-qv-close]')) {
      close();
      return;
    }

    var trigger = evt.target.closest('[data-quick-view]');
    if (!trigger) return;

    var handle = trigger.getAttribute('data-quick-view');
    if (!handle || !supported()) return; // Let the link navigate.

    evt.preventDefault();
    open(handle, trigger);
  });

  /* ----------------------------------------------------------------
     Variant selection inside the dialog
     ---------------------------------------------------------------- */
  document.addEventListener('change', function (evt) {
    var input = evt.target;
    if (!input.dataset || input.dataset.qvOption === undefined) return;

    var root = input.closest('[data-quick-view-content]');
    if (!root) return;

    var dataEl = root.querySelector('[data-qv-variants]');
    var variants = [];
    try {
      variants = JSON.parse(dataEl.textContent);
    } catch (e) {
      return;
    }

    var selected = Array.prototype.map.call(
      root.querySelectorAll('[data-qv-option]:checked'),
      function (i) { return i.value; }
    );

    var match = null;
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].options.join('~~') === selected.join('~~')) {
        match = variants[i];
        break;
      }
    }

    root.querySelectorAll('[data-qv-selected]').forEach(function (el, idx) {
      if (selected[idx]) el.textContent = selected[idx];
    });

    var idField = root.querySelector('[data-qv-variant-id]');
    var submit = root.querySelector('[data-qv-submit]');
    var submitText = root.querySelector('[data-qv-submit-text]');

    if (!match) {
      if (submit) submit.disabled = true;
      if (submitText) submitText.textContent = 'Unavailable';
      return;
    }

    if (idField) idField.value = match.id;
    if (submit) submit.disabled = !match.available;
    if (submitText) submitText.textContent = match.available ? 'Add to cart' : 'Sold out';
  });

  /* ----------------------------------------------------------------
     Add to cart
     ---------------------------------------------------------------- */
  document.addEventListener('submit', function (evt) {
    var form = evt.target;
    if (!form.classList || !form.classList.contains('gs-qv__form')) return;

    evt.preventDefault();

    var root = form.closest('[data-quick-view-content]');
    var submit = form.querySelector('[data-qv-submit]');
    var errorBox = root ? root.querySelector('[data-qv-error]') : null;

    if (errorBox) errorBox.hidden = true;
    if (submit) submit.disabled = true;

    fetch('/cart/add.js', {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Could not add to cart');
        return res.json();
      })
      .then(function () {
        close();
        var drawer = document.querySelector('cart-drawer');
        if (drawer && typeof drawer.open === 'function') {
          drawer.open();
        } else {
          window.location.reload();
        }
      })
      .catch(function (err) {
        console.error('[gs-quick-view] ' + err.message);
        if (errorBox) {
          errorBox.textContent = 'Sorry, that could not be added. Please try again.';
          errorBox.hidden = false;
        }
      })
      .then(function () {
        if (submit) submit.disabled = false;
      });
  });
})();
