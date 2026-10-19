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

    function slides() {
      return gallery ? gallery.children : [];
    }

    function currentIndex() {
      if (!gallery || !gallery.clientWidth) return 0;
      return Math.round(gallery.scrollLeft / gallery.clientWidth);
    }

    function goTo(i) {
      if (!gallery) return;
      var max = slides().length - 1;
      i = Math.max(0, Math.min(max, i));
      gallery.scrollTo({ left: i * gallery.clientWidth, behavior: 'smooth' });
    }

    function showMedia(mediaId) {
      if (!mediaId || !gallery) return;
      var slide = gallery.querySelector('[data-media-id="' + mediaId + '"]');
      if (!slide) return;
      goTo(Array.prototype.indexOf.call(slides(), slide));
      setActiveThumb(mediaId);
      var stickyImg = root.querySelector('[data-gs-atc-image]');
      var slideImg = slide.querySelector('img');
      if (stickyImg && slideImg) stickyImg.src = slideImg.currentSrc || slideImg.src;
    }

    function setActiveThumb(mediaId) {
      if (!thumbs) return;
      thumbs.querySelectorAll('[data-thumb-for]').forEach(function (t) {
        var on = t.getAttribute('data-thumb-for') === String(mediaId);
        t.classList.toggle('is-active', on);
        // Keep the active thumb inside the rail without scrolling the page.
        if (on && t.offsetParent) {
          var tb = t.getBoundingClientRect();
          var rb = thumbs.getBoundingClientRect();
          if (tb.top < rb.top || tb.bottom > rb.bottom || tb.left < rb.left || tb.right > rb.right) {
            thumbs.scrollTop += tb.top - rb.top;
            thumbs.scrollLeft += tb.left - rb.left;
          }
        }
      });
    }

    // Arrows reflect where the gallery actually is, so a swipe updates them too.
    function updateNav() {
      var i = currentIndex();
      var max = slides().length - 1;
      root.querySelectorAll('[data-gs-nav]').forEach(function (b) {
        b.disabled = b.getAttribute('data-gs-nav') === 'prev' ? i <= 0 : i >= max;
      });
      var slide = slides()[i];
      if (slide) setActiveThumb(slide.getAttribute('data-media-id'));
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
      var stickyPrice = root.querySelector('[data-gs-atc-price]');
      if (stickyPrice) stickyPrice.textContent = variant.price_money;
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
      if (submit) {
        // Back in Stock: the app opens its form for any .BIS_trigger
        // click, on the variant in data-variant-id, so this follows the
        // selected size. DNR products and the "disable when sold out"
        // setting keep a plain disabled Sold out button instead.
        var blocked = submit.hasAttribute('data-dnr') || submit.hasAttribute('data-sold-out-disables');
        var notify = !variant.available && !blocked;
        submit.setAttribute('data-variant-id', variant.id);
        submit.classList.toggle('BIS_trigger', notify);
        submit.disabled = !variant.available && blocked;
        submit.setAttribute('aria-disabled', variant.available || notify ? 'false' : 'true');
        if (text) {
          text.textContent = variant.available
            ? submit.getAttribute('data-label-add') || text.textContent
            : submit.getAttribute('data-label-sold-out') || text.textContent;
        }
      }
      var sticky = root.querySelector('[data-gs-atc-submit]');
      if (sticky) {
        sticky.setAttribute('aria-disabled', variant.available ? 'false' : 'true');
        sticky.textContent = variant.available ? 'Add to cart' : 'Sold out';
      }
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
    if (gallery) {
      var scrollTick = false;
      gallery.addEventListener('scroll', function () {
        if (scrollTick) return;
        scrollTick = true;
        window.requestAnimationFrame(function () { scrollTick = false; updateNav(); });
      }, { passive: true });
      updateNav();
    }

    if (thumbs) {
      // The thumbs are real anchors so they work without JavaScript, but a
      // plain #hash jump scrolls the whole page. Move the gallery instead.
      thumbs.addEventListener('click', function (evt) {
        var thumb = evt.target.closest('[data-thumb-for]');
        if (!thumb) return;
        evt.preventDefault();
        showMedia(thumb.getAttribute('data-thumb-for'));
      });
    }

    root.addEventListener('click', function (evt) {
      var nav = evt.target.closest('[data-gs-nav]');
      if (nav) {
        goTo(currentIndex() + (nav.getAttribute('data-gs-nav') === 'prev' ? -1 : 1));
        return;
      }
      var rail = evt.target.closest('[data-gs-rail]');
      if (rail && thumbs) {
        var vertical = thumbs.scrollHeight > thumbs.clientHeight + 1;
        var step = (vertical ? thumbs.clientHeight : thumbs.clientWidth) * 0.6;
        if (rail.getAttribute('data-gs-rail') === 'up') step = -step;
        if (vertical) thumbs.scrollTop += step;
        else thumbs.scrollLeft += step;
      }
    });

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

      var submit = root.querySelector('[data-gs-submit]');
      // A sold-out size is the Back in Stock app's button (it cancels the
      // click itself). If a submit gets here anyway, e.g. Enter in the
      // quantity field, do not post a doomed add to cart.
      if (submit && submit.classList.contains('BIS_trigger')) {
        evt.preventDefault();
        return;
      }

      var drawer = document.querySelector('cart-drawer');
      // No drawer: let the browser post normally.
      if (!drawer || typeof drawer.renderContents !== 'function') return;

      evt.preventDefault();
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
    bindZoom(root, gallery);
    bindSticky(root);
    bindDialogs(root);
    bindLocator(root);
    loadComplementary(root);
  }

  /* ---------------- Zoom ----------------
     Tap a slide, open the zoom dialog at that image. The dialog lists
     every image, so scrolling on from there works as in Dawn. */
  function bindZoom(root, gallery) {
    var dialog = root.querySelector('[data-gs-zoom-dialog]');
    if (!dialog || !gallery) return;
    function openZoom(index) {
      if (typeof dialog.showModal !== 'function') return;
      dialog.showModal();
      var target = dialog.querySelector('[data-zoom-index="' + index + '"]');
      if (target) target.scrollIntoView({ block: 'start' });
    }
    gallery.addEventListener('click', function (evt) {
      var btn = evt.target.closest('[data-gs-zoom]');
      if (!btn) return;
      evt.preventDefault();
      openZoom(btn.getAttribute('data-gs-zoom'));
    });
    var zoomBtn = root.querySelector('[data-gs-zoom-current]');
    if (zoomBtn) zoomBtn.addEventListener('click', function () { openZoom(currentIndex()); });
  }

  /* ---------------- Sticky add to cart (mobile) ----------------
     Visible while the real add-to-cart button is above the viewport.
     Its button submits the real form (form= attribute), so the add
     goes through the same AJAX handler. When the selection cannot be
     bought, it scrolls to the picker instead of submitting. */
  function bindSticky(root) {
    var bar = root.querySelector('[data-gs-atc-bar]');
    var submit = root.querySelector('[data-gs-submit]');
    if (!bar || !submit) return;
    bar.hidden = false;
    // Scroll-driven rather than IntersectionObserver: the bar should
    // show once the real button has scrolled ABOVE the viewport, and a
    // rAF-throttled scroll listener is the simplest thing that is right
    // on every browser (IO did not re-fire under mobile emulation).
    var ticking = false;
    function update() {
      ticking = false;
      var above = submit.getBoundingClientRect().bottom < 0;
      bar.classList.toggle('is-visible', above);
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });
    update();
    var btn = bar.querySelector('[data-gs-atc-submit]');
    if (btn) {
      btn.addEventListener('click', function (evt) {
        // Sold-out size with Back in Stock: open its form via the main
        // button, which carries the class and variant id.
        if (submit.classList.contains('BIS_trigger')) {
          evt.preventDefault();
          submit.click();
          return;
        }
        if (btn.getAttribute('aria-disabled') !== 'true' && !submit.disabled) return;
        evt.preventDefault();
        var picker = root.querySelector('.gs-product__options') || submit;
        picker.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var first = picker.querySelector('.gs-product__option-input');
        if (first) first.focus({ preventScroll: true });
      });
    }
  }

  /* ---------------- Badge ----------------
     block--product-badge renders in the buy box (a theme block can only
     render there). The first one moves over the gallery; the rest go.
     A section-rendered override badge already in the media column
     wins, so block badges are simply removed then. */
  function placeBadge(root) {
    var badges = root.querySelectorAll('.gs-product__info [data-gs-badge]');
    if (!badges.length) return;
    var media = root.querySelector('.gs-product__stage');
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
