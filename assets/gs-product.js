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

    placeBadge(root);
    bindDialogs(root);
    bindLocator(root);
    loadComplementary(root);
  }

  /* ---------------- Badge ----------------
     block--product-badge renders in the buy box (a theme block can only
     render there). The first one moves over the gallery; the rest go.
     A section-rendered override badge already in the media column
     wins, so block badges are simply removed then. */
  function placeBadge(root) {
    var badges = root.querySelectorAll('.gs-product__info [data-gs-badge]');
    if (!badges.length) return;
    var media = root.querySelector('.gs-product__media');
    var already = media && media.querySelector('.gs-product__badge');
    badges.forEach(function (img, i) {
      if (i === 0 && media && !already) media.insertBefore(img, media.firstChild);
      else img.remove();
    });
  }

  /* ---------------- Dialogs (size guide, store locator) ----------------
     Native <dialog>: showModal() gives focus trapping, Escape and the
     backdrop for free. A click on the backdrop lands on the <dialog>
     itself, not on its box, which is how it closes. */
  function bindDialogs(root) {
    root.addEventListener('click', function (evt) {
      var opener = evt.target.closest('[data-gs-dialog-open]');
      if (opener) {
        var dlg = document.getElementById(opener.getAttribute('data-gs-dialog-open'));
        if (dlg && typeof dlg.showModal === 'function') {
          evt.preventDefault();
          dlg.showModal();
        }
        return;
      }
      var closer = evt.target.closest('[data-gs-dialog-close]');
      if (closer) {
        var open = closer.closest('dialog');
        if (open) open.close();
        return;
      }
      if (evt.target.tagName === 'DIALOG' && evt.target.classList.contains('gs-product__dialog')) {
        evt.target.close();
      }
    });
  }

  /* ---------------- Store locator ----------------
     Keyless geocoding: a 5-digit ZIP goes to zippopotam.us, anything
     else to Nominatim (OpenStreetMap), and "use current location" is
     the browser's geolocation. Distances are haversine miles, as v3. */
  function bindLocator(root) {
    var box = root.querySelector('[data-gs-locator]');
    if (!box) return;
    var stores = [];
    try {
      stores = JSON.parse(box.querySelector('[data-gs-stores]').textContent);
    } catch (e) {
      return;
    }
    var radius = parseFloat(box.getAttribute('data-radius')) || 50;
    var allUrl = box.getAttribute('data-all-url') || '';
    var form = box.querySelector('[data-gs-locator-form]');
    var geoBtn = box.querySelector('[data-gs-locator-geo]');
    var status = box.querySelector('[data-gs-locator-status]');
    var list = box.querySelector('[data-gs-locator-list]');

    function say(msg) {
      status.textContent = msg;
      status.hidden = !msg;
    }

    function miles(lat1, lon1, lat2, lon2) {
      var toRad = Math.PI / 180;
      var dLat = (lat2 - lat1) * toRad;
      var dLon = (lon2 - lon1) * toRad;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 3959 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function geocode(q) {
      q = q.trim();
      if (/^\d{5}$/.test(q)) {
        return fetch('https://api.zippopotam.us/us/' + q)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            var pl = j && j.places && j.places[0];
            return pl ? { lat: parseFloat(pl.latitude), lng: parseFloat(pl.longitude) } : null;
          });
      }
      var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q);
      return fetch(url, { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          return j && j[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) } : null;
        });
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function show(origin, where) {
      var near = [];
      stores.forEach(function (st) {
        var ll = String(st.ll || '').split(',');
        if (ll.length < 2) return;
        var d = miles(origin.lat, origin.lng, parseFloat(ll[0]), parseFloat(ll[1]));
        if (d <= radius) near.push({ name: st.name, url: st.url, d: d });
      });
      near.sort(function (a, b) { return a.d - b.d; });
      var html = '';
      if (near.length) {
        near.forEach(function (st) {
          html += '<div class="gs-product__locator-store"><div><p>' + escapeHtml(st.name) + '</p>' +
            (st.url ? '<a href="' + escapeHtml(st.url) + '">Store details</a>' : '') +
            '</div><p class="gs-product__locator-distance">' + st.d.toFixed(1) + ' mi</p></div>';
        });
      } else {
        html += '<p class="gs-product__locator-all">No Grunt Style retail stores found within ' + radius + ' miles of ' + where + '.</p>';
      }
      if (allUrl) html += '<div class="gs-product__locator-all"><a href="' + escapeHtml(allUrl) + '">View all locations</a></div>';
      list.innerHTML = html;
      list.hidden = false;
      say('');
    }

    if (form) {
      form.addEventListener('submit', function (evt) {
        evt.preventDefault();
        var q = form.querySelector('input[name="q"]').value;
        if (!q.trim()) return;
        say('Searching...');
        geocode(q)
          .then(function (origin) {
            if (!origin) {
              list.hidden = true;
              say('Could not find that location. Try a 5-digit ZIP code.');
              return;
            }
            show(origin, 'the location entered');
          })
          .catch(function () {
            list.hidden = true;
            say('Location search is unavailable right now.');
          });
      });
    }

    if (geoBtn) {
      geoBtn.addEventListener('click', function () {
        if (!navigator.geolocation) {
          say('Your browser does not share location.');
          return;
        }
        say('Finding you...');
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            show({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'your location');
          },
          function () {
            list.hidden = true;
            say('Unable to retrieve your location. Please enable location services and try again.');
          }
        );
      });
    }
  }

  /* ---------------- Complementary products ("LOAD UP") ----------------
     The recommendations object only exists on a Section Rendering API
     fetch with intent=complementary, so the block renders empty on the
     page and is filled from a fetch of this same section. */
  function loadComplementary(root) {
    var box = root.querySelector('[data-gs-complementary]');
    if (!box || box.hasAttribute('data-loaded')) return;
    var sectionId = root.getAttribute('data-section-id');
    var url = box.getAttribute('data-url') + '?section_id=' + encodeURIComponent(sectionId) +
      '&product_id=' + encodeURIComponent(box.getAttribute('data-product-id')) +
      '&limit=' + encodeURIComponent(box.getAttribute('data-limit') || '6') +
      '&intent=complementary';
    fetch(url)
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (html) {
        if (!html) return;
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var fresh = doc.querySelector('[data-gs-complementary]');
        if (!fresh || !fresh.querySelector('[data-swatch-track]')) {
          box.innerHTML = '';
          return;
        }
        box.innerHTML = fresh.innerHTML;
        box.setAttribute('data-loaded', '');
        if (typeof window.gsSwatchScrollerRefresh === 'function') window.gsSwatchScrollerRefresh();
      })
      .catch(function () { /* leave it empty */ });
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
