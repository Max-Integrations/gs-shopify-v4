/*
  ==================================================================
  GS COLLECTION FILTER
  ==================================================================
  AJAX filtering, sorting, price-range slider, and load-more /
  infinite scroll. Used by main-collection AND main-search.

  WRITTEN FRESH, NOT PORTED. v3's assets/collection-filter.js is 12.3 KB
  and predates the Section Rendering API. This uses it, so the server
  renders the filtered grid and the browser swaps it in - no client-side
  product templating, no duplicated markup between Liquid and JS.

  PROGRESSIVE ENHANCEMENT. Everything here improves on markup that
  already works: the filter form is a real GET form, sort radios post to
  it via form="FiltersForm", pagination links are real links. With JS
  off, or if this file throws, the page still filters and paginates with
  full reloads. v3 shipped the submit button `disabled` and relied on JS
  to enable it, so a script error left the page unusable.

  ------------------------------------------------------------------
  REVISION 2026-08-12 - SELF-REVIEW, THREE FIXES
  ------------------------------------------------------------------
  1. THE MOBILE DRAWER CLOSED ON EVERY FILTER.
     Swapping .gs-collection__sidebar innerHTML destroys .gs-filters and
     with it the .is-open class, so applying one filter shut the drawer
     and you had to reopen it for the next. Open state is now captured
     before the swap and restored after.

  2. FILTERING ON /search DROPPED THE SEARCH TERM.
     urlFromForm rebuilt the URL from pathname plus form fields, and the
     `q` hidden input only renders when collection.terms exists. On the
     search page there is no collection, so `q` vanished and the customer
     got unfiltered results for an empty query. Query params that belong
     to the page rather than the filter form are now carried over.

  3. IT SCROLLED ON EVERY FILTER CHANGE.
     Fine on mobile where the drawer covers the page; jarring on desktop
     where the sidebar sits beside results that are already in view. Now
     only scrolls when the results are actually off screen.

  Load once. Binds delegated listeners at document level and does nothing
  on pages with no [data-collection-products].
  ==================================================================
*/
(function () {
  'use strict';

  var DEBOUNCE_MS = 400;
  var loading = false;

  // Params owned by the page, not the filter form. These must survive a
  // rebuild of the URL or the page loses its own context.
  var CARRIED_PARAMS = ['q', 'options[prefix]', 'type', 'view'];

  function sectionId() {
    var el = document.querySelector('[data-collection-products]');
    if (!el) return null;
    var wrapper = el.closest('[id^="GsCollection-"]');
    return wrapper ? wrapper.id.replace('GsCollection-', '') : null;
  }

  function setBusy(state) {
    loading = state;
    var results = document.querySelector('[data-collection-products]');
    if (results) results.setAttribute('aria-busy', state ? 'true' : 'false');
  }

  function swap(parsedDoc, selector) {
    var incoming = parsedDoc.querySelector(selector);
    var current = document.querySelector(selector);
    if (incoming && current) current.innerHTML = incoming.innerHTML;
  }

  /* ----------------------------------------------------------------
     Fetch a filtered/sorted result set and swap in the new markup.
     ---------------------------------------------------------------- */
  function renderFromUrl(url, options) {
    var opts = options || {};
    var id = sectionId();
    if (!id) return;

    setBusy(true);

    // Capture drawer state before the sidebar is replaced.
    var openDrawer = document.querySelector('[data-side-drawer].is-open');
    var drawerWasOpen = Boolean(openDrawer);

    var fetchUrl = url + (url.indexOf('?') === -1 ? '?' : '&') + 'section_id=' + id;

    fetch(fetchUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('Filter request failed: ' + res.status);
        return res.text();
      })
      .then(function (markup) {
        var parsed = new DOMParser().parseFromString(markup, 'text/html');

        // Results and sidebar swap independently - filter counts and
        // availability change with the selection.
        swap(parsed, '[data-collection-products]');
        swap(parsed, '.gs-collection__sidebar');

        // Restore the drawer. Without this, one filter closed it.
        if (drawerWasOpen) {
          var drawer = document.querySelector('[data-side-drawer]');
          if (drawer) {
            drawer.classList.add('is-open');
            document.documentElement.classList.add('gs-drawer-open');
          }
        }

        if (!opts.replaceState) {
          window.history.pushState({ gsFilter: true }, '', url);
        }

        if (opts.scrollToTop !== false) scrollToResultsIfNeeded();

        if (typeof window.gsSwatchScrollerRefresh === 'function') {
          window.gsSwatchScrollerRefresh();
        }
      })
      .catch(function (err) {
        // Navigate rather than leave stale results on screen.
        console.error('[gs-collection-filter] ' + err.message);
        window.location.href = url;
      })
      .then(function () {
        setBusy(false);
      });
  }

  // Only scroll when the results are actually out of view. Scrolling on
  // every filter is disorienting on desktop.
  function scrollToResultsIfNeeded() {
    var anchor = document.querySelector('[data-collection-products]');
    if (!anchor) return;

    var rect = anchor.getBoundingClientRect();
    var alreadyVisible = rect.top >= 0 && rect.top < window.innerHeight * 0.5;
    if (alreadyVisible) return;

    window.scrollTo({ top: rect.top + window.scrollY - 100, behavior: 'smooth' });
  }

  function urlFromForm(form) {
    var cleaned = new URLSearchParams();

    // Carry the page's own params first - on /search the term lives in
    // the URL, not the filter form.
    var existing = new URLSearchParams(window.location.search);
    CARRIED_PARAMS.forEach(function (key) {
      var value = existing.get(key);
      if (value) cleaned.append(key, value);
    });

    new URLSearchParams(new FormData(form)).forEach(function (value, key) {
      if (value === '') return; // Drop empty price inputs.
      if (cleaned.has(key)) return; // Do not duplicate a carried param.
      cleaned.append(key, value);
    });

    var qs = cleaned.toString();
    return qs ? window.location.pathname + '?' + qs : window.location.pathname;
  }

  /* ----------------------------------------------------------------
     Filter + sort changes
     ---------------------------------------------------------------- */
  var debounceTimer;

  function scheduleFromForm(form, delay) {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(function () {
      renderFromUrl(urlFromForm(form));
    }, delay);
  }

  document.addEventListener('change', function (evt) {
    var target = evt.target;
    if (!target || !target.form || target.form.id !== 'FiltersForm') return;

    var isPriceField = target.classList && target.classList.contains('gs-filters__field-input');
    scheduleFromForm(target.form, isPriceField ? DEBOUNCE_MS : 0);
  });

  // Price number fields fire `input` while typing.
  document.addEventListener('input', function (evt) {
    var target = evt.target;
    if (!target || !target.classList) return;
    if (!target.classList.contains('gs-filters__field-input')) return;
    if (!target.form || target.form.id !== 'FiltersForm') return;

    scheduleFromForm(target.form, DEBOUNCE_MS);
  });

  document.addEventListener('submit', function (evt) {
    var form = evt.target;
    if (!form || form.id !== 'FiltersForm') return;
    evt.preventDefault();
    renderFromUrl(urlFromForm(form));
  });

  /* ----------------------------------------------------------------
     Applied-filter pills, Clear all, Load more
     ---------------------------------------------------------------- */
  document.addEventListener('click', function (evt) {
    if (!evt.target || !evt.target.closest) return;

    var pill = evt.target.closest('.gs-collection__applied-link');
    if (pill && pill.getAttribute('href')) {
      evt.preventDefault();
      renderFromUrl(pill.getAttribute('href'));
      return;
    }

    var clear = evt.target.closest('.gs-filters__clear');
    if (clear && clear.getAttribute('href')) {
      evt.preventDefault();
      renderFromUrl(clear.getAttribute('href'));
      return;
    }

    var loadMore = evt.target.closest('[data-products-load]');
    if (loadMore && loadMore.getAttribute('href')) {
      evt.preventDefault();
      appendNextPage(loadMore.getAttribute('href'));
    }
  });

  /* ----------------------------------------------------------------
     Load more / infinite scroll - appends rather than replaces.
     ---------------------------------------------------------------- */
  function appendNextPage(url) {
    if (loading) return;
    var id = sectionId();
    if (!id) return;

    setBusy(true);
    showSpinner(true);

    fetch(url + (url.indexOf('?') === -1 ? '?' : '&') + 'section_id=' + id)
      .then(function (res) {
        if (!res.ok) throw new Error('Load more failed: ' + res.status);
        return res.text();
      })
      .then(function (markup) {
        var parsed = new DOMParser().parseFromString(markup, 'text/html');

        var incomingGrid = parsed.querySelector('.gs-collection__grid');
        var currentGrid = document.querySelector('.gs-collection__grid');
        if (incomingGrid && currentGrid) {
          while (incomingGrid.firstElementChild) {
            currentGrid.appendChild(incomingGrid.firstElementChild);
          }
        }

        var incomingMore = parsed.querySelector('.gs-collection__more');
        var currentMore = document.querySelector('.gs-collection__more');
        if (currentMore) {
          if (incomingMore) {
            currentMore.replaceWith(incomingMore);
          } else {
            currentMore.remove();
          }
        }

        window.history.replaceState({ gsFilter: true }, '', url);

        if (typeof window.gsSwatchScrollerRefresh === 'function') {
          window.gsSwatchScrollerRefresh();
        }
      })
      .catch(function (err) {
        console.error('[gs-collection-filter] ' + err.message);
        window.location.href = url;
      })
      .then(function () {
        setBusy(false);
        showSpinner(false);
        watchInfinite();
      });
  }

  function showSpinner(state) {
    var spinner = document.querySelector('.gs-collection__spinner');
    if (spinner) spinner.classList.toggle('hidden', !state);
  }

  // One observer for the page, re-targeted after each append.
  var infiniteObserver = null;

  function watchInfinite() {
    if (!('IntersectionObserver' in window)) return;

    var sentinel = document.querySelector('[data-scroll] a[href]');
    if (!sentinel) return;

    if (!infiniteObserver) {
      infiniteObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting || loading) return;
            var href = entry.target.getAttribute('href');
            infiniteObserver.unobserve(entry.target);
            appendNextPage(href);
          });
        },
        { rootMargin: '400px 0px' }
      );
    }

    infiniteObserver.observe(sentinel);
  }

  /* ----------------------------------------------------------------
     Price range slider
     ---------------------------------------------------------------- */
  function syncPriceUi(scope) {
    var root = scope || document;
    root.querySelectorAll('.gs-filters__price').forEach(function (block) {
      var min = block.querySelector('.gs-filters__range-input--min');
      var max = block.querySelector('.gs-filters__range-input--max');
      var fill = block.querySelector('.gs-filters__slider-progress');
      if (!min || !max || !fill) return;

      var lo = parseInt(min.value, 10);
      var hi = parseInt(max.value, 10);
      var ceiling = parseInt(max.max, 10) || 1;

      fill.style.left = (lo / ceiling) * 100 + '%';
      fill.style.right = 100 - (hi / ceiling) * 100 + '%';
    });
  }

  document.addEventListener('input', function (evt) {
    var target = evt.target;
    if (!target || !target.classList) return;
    if (!target.classList.contains('gs-filters__range-input')) return;

    var block = target.closest('.gs-filters__price');
    if (!block) return;

    var min = block.querySelector('.gs-filters__range-input--min');
    var max = block.querySelector('.gs-filters__range-input--max');
    var lo = parseInt(min.value, 10);
    var hi = parseInt(max.value, 10);

    // Handles must not cross.
    if (lo > hi) {
      if (target === min) {
        min.value = hi;
        lo = hi;
      } else {
        max.value = lo;
        hi = lo;
      }
    }

    var gte = block.querySelector('input[name$="price.gte"]');
    var lte = block.querySelector('input[name$="price.lte"]');
    if (gte) gte.value = lo;
    if (lte) lte.value = hi;

    syncPriceUi(block);
  });

  // Committing a drag triggers the fetch.
  document.addEventListener('change', function (evt) {
    var target = evt.target;
    if (!target || !target.classList) return;
    if (!target.classList.contains('gs-filters__range-input')) return;

    var form = document.getElementById('FiltersForm');
    if (form) renderFromUrl(urlFromForm(form));
  });

  /* ----------------------------------------------------------------
     Back / forward
     ---------------------------------------------------------------- */
  window.addEventListener('popstate', function () {
    renderFromUrl(window.location.href, { replaceState: true, scrollToTop: false });
  });

  /* ---------------------------------------------------------------- */
  function init() {
    if (!document.querySelector('[data-collection-products]')) return;
    syncPriceUi();
    watchInfinite();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', init);

  window.gsCollectionFilterRefresh = init;
})();
