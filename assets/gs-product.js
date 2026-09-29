/*
  GS Product (PDP)
  ==================================================================
  One delegated set of listeners for the whole product page: variant
  selection, price/availability update, gallery sync, quantity, and
  add-to-cart into the cart drawer.

  WHY NO SECTION RE-FETCH. The previous PDP re-rendered the section
  over the network on every option change and swapped two fragments in.
  It cost a round trip, and it could not update the price anyway
  because the price markup read product.price_min. Everything needed is
  in the variant JSON, so the update is local and instant.

  MONEY is never formatted here. window.Shopify.money_format is not
  defined on this store, so a JS formatter guesses and drifts from
  Liquid. The variant JSON carries strings Liquid already rendered.

  ADD TO CART. /cart/add.js is called asking for the cart-drawer and
  cart-icon-bubble sections, and the response is handed to the drawer's
  renderContents(). Dawn's open() alone does NOT refresh the drawer, so
  it would show the cart as it was before the add - the same trap hit
  in club-join-steps. Falls back to a normal navigation if the drawer
  is absent or the request fails, so a customer is never stranded.
  ==================================================================
*/
(function () {
  'use strict';

  function init(root) {
    if (!root || root.gsProductBound) return;
    root.gsProductBound = true;

    var dataEl = root.querySelector('[data-gs-variants]');
    var variants = [];
    try {
      variants = JSON.parse(dataEl.textContent);
    } catch (e) {
      // Leave the radios as plain inputs; the form still posts.
      console.error('[gs-product] variant data unreadable: ' + e.message);
    }

    var gallery = root.querySelector('[data-gs-gallery]');
    var thumbs = root.querySelector('[data-gs-thumbs]');

    /* ---------------- Variant selection ---------------- */
    function selectedOptions() {
      var inputs = root.querySelectorAll('.gs-product__option-input:checked');
      return Array.prototype.map.call(inputs, function (i) { return i.value; });
    }

    function findVariant(values) {
      if (!values.length) return null;
      var key = values.join('~~');
      for (var i = 0; i < variants.length; i++) {
        if (variants[i].options.join('~~') === key) return variants[i];
      }
      return null;
    }

    function showMedia(mediaId) {
      if (!mediaId || !gallery) return;
      var slide = gallery.querySelector('[data-media-id="' + mediaId + '"]');
      if (!slide) return;
      gallery.scrollTo({ left: slide.offsetLeft - gallery.offsetLeft, behavior: 'smooth' });
      setActiveThumb(mediaId);
    }

    function setActiveThumb(mediaId) {
      if (!thumbs) return;
      thumbs.querySelectorAll('[data-thumb-for]').forEach(function (t) {
        t.classList.toggle('is-active', t.getAttribute('data-thumb-for') === String(mediaId));
      });
    }

    function updatePrice(variant) {
      var box = root.querySelector('[data-gs-price]');
      if (!box) return;
      var current = box.querySelector('[data-gs-price-current]');
      var compare = box.querySelector('[data-gs-price-compare]');
      var saving = box.querySelector('[data-gs-price-saving]');
      var savingValue = box.querySelector('[data-gs-saving-value]');
      var onSale = variant.compare_at_price > variant.price;

      if (current) {
        current.textContent = variant.price_money;
        current.classList.toggle('is-sale', onSale);
      }
      if (compare) {
        compare.textContent = variant.compare_money;
        compare.hidden = !onSale;
      }
      if (saving) saving.hidden = !onSale;
      if (savingValue && onSale) {
        savingValue.textContent = box.getAttribute('data-savings-style') === 'amount'
          ? variant.saving_money
          : Math.round((variant.compare_at_price - variant.price) * 100 / variant.compare_at_price) + '%';
      }
    }

    function updateBuy(variant) {
      root.querySelectorAll('[data-gs-variant-id]').forEach(function (input) {
        input.value = variant.id;
        input.disabled = !variant.available;
      });
      var submit = root.querySelector('[data-gs-submit]');
      var text = root.querySelector('[data-gs-submit-text]');
      if (text) {
        text.textContent = variant.available
          ? (submit.getAttribute('data-label-add') || text.getAttribute('data-add') || text.textContent)
          : text.textContent;
      }
      if (submit) submit.setAttribute('aria-disabled', variant.available ? 'false' : 'true');
    }

    function updateLegends() {
      root.querySelectorAll('.gs-product__option-input:checked').forEach(function (input) {
        var pos = input.getAttribute('data-option-position');
        var out = root.querySelector('[data-selected-for="' + pos + '"]');
        if (out) out.textContent = input.value;
      });
    }

    root.addEventListener('change', function (evt) {
      if (!evt.target.classList || !evt.target.classList.contains('gs-product__option-input')) return;
      updateLegends();
      var variant = findVariant(selectedOptions());
      if (!variant) return;
      showMedia(variant.media);
      updatePrice(variant);
      updateBuy(variant);
      var url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url.toString());
    });

    /* ---------------- Gallery ---------------- */
    if (thumbs) {
      thumbs.addEventListener('click', function (evt) {
        var thumb = evt.target.closest('[data-thumb-for]');
        if (thumb) setActiveThumb(thumb.getAttribute('data-thumb-for'));
      });
    }

    /* ---------------- Quantity ---------------- */
    root.addEventListener('click', function (evt) {
      var btn = evt.target.closest('[data-gs-qty]');
      if (!btn) return;
      var input = root.querySelector('.gs-product__qty-input');
      if (!input) return;
      var n = parseInt(input.value, 10) || 1;
      input.value = Math.max(1, btn.getAttribute('data-gs-qty') === 'up' ? n + 1 : n - 1);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    /* ---------------- Add to cart ---------------- */
    root.addEventListener('submit', function (evt) {
      var form = evt.target;
      if (!form.classList || !form.classList.contains('gs-product__form')) return;

      var drawer = document.querySelector('cart-drawer');
      // No drawer: let the browser post normally.
      if (!drawer || typeof drawer.renderContents !== 'function') return;

      evt.preventDefault();
      var submit = root.querySelector('[data-gs-submit]');
      var errorBox = root.querySelector('[data-gs-error]');
      if (errorBox) errorBox.hidden = true;
      if (submit) submit.disabled = true;

      var body = new FormData(form);
      body.append('sections', 'cart-drawer,cart-icon-bubble');
      body.append('sections_url', window.location.pathname);

      fetch('/cart/add.js', { method: 'POST', body: body, headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (j) { throw new Error(j.description || 'Could not add to cart'); });
          return res.json();
        })
        .then(function (added) {
          // renderContents re-renders AND opens; open() alone shows a stale cart.
          if (added.sections) drawer.renderContents(added);
          else drawer.open();
        })
        .catch(function (err) {
          console.error('[gs-product] ' + err.message);
          if (errorBox) {
            errorBox.textContent = err.message;
            errorBox.hidden = false;
          }
        })
        .then(function () {
          if (submit) submit.disabled = false;
        });
    });
  }

  function bindAll() {
    document.querySelectorAll('[data-gs-product]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAll);
  } else {
    bindAll();
  }
  document.addEventListener('shopify:section:load', bindAll);
})();
