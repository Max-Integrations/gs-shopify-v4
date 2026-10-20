/*
  GS Swatch Scroller

  ONE set of delegated listeners for the whole page.

  This replaces the per-card script block in gs-shopify-v3's
  product-colors-option.liquid, which attached a MutationObserver to
  document.body with subtree:true once per product card. A 28-product
  collection page ran 28 of them, and infinite scroll kept adding more.

  Load ONCE, from a section or from layout/theme.liquid:
    <script src="{{ 'gs-swatch-scroller.js' | asset_url }}" defer></script>

  Safe on pages with no swatches: it does nothing until a
  [data-swatch-scroller] element exists.

  After injecting cards via AJAX or infinite scroll, call
  window.gsSwatchScrollerRefresh() to re-evaluate arrow visibility.

  LANDING ON AN ITEM (2026-10-19). Client report: product carousels
  sometimes stopped between two products, half of each showing (iPhone).
  The arrows scrolled by 80% of the width and relied on CSS
  scroll-snap to correct the landing, and iOS Safari does not always
  re-snap after a scripted smooth scroll or an interrupted swipe. Now:
  - the arrows scroll to an exact item edge (a page of items at a time:
    next brings the first partly hidden item to the left edge, prev the
    page before), and
  - on tracks with mandatory snapping, a scroll that comes to rest off an
    item edge glides to the nearest one once the finger is up.
*/
(function () {
  'use strict';

  var SCROLL_RATIO = 0.8;

  function behavior() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  function getTrack(scroller) {
    return scroller.querySelector('[data-swatch-track]');
  }

  function updateButtons(scroller) {
    var el = getTrack(scroller);
    if (!el) return;

    var overflowing = el.scrollWidth > el.clientWidth + 1;
    var atStart = el.scrollLeft <= 1;
    var atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    var buttons = scroller.querySelectorAll('[data-swatch-scroll]');

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.hidden = !overflowing;
      btn.disabled = btn.getAttribute('data-swatch-scroll') === 'prev' ? atStart : atEnd;
    }
  }

  function updateAll() {
    var scrollers = document.querySelectorAll('[data-swatch-scroller]');
    for (var i = 0; i < scrollers.length; i++) {
      updateButtons(scrollers[i]);
    }
  }

  document.addEventListener('click', function (evt) {
    if (!evt.target || !evt.target.closest) return;

    var btn = evt.target.closest('[data-swatch-scroll]');
    if (!btn) return;

    var scroller = btn.closest('[data-swatch-scroller]');
    var el = scroller ? getTrack(scroller) : null;
    if (!el) return;

    var target = pageTarget(el, btn.getAttribute('data-swatch-scroll') === 'next');
    if (target === null) {
      var delta = el.clientWidth * SCROLL_RATIO;
      el.scrollBy({ left: btn.getAttribute('data-swatch-scroll') === 'next' ? delta : -delta, behavior: behavior() });
      return;
    }
    el.scrollTo({ left: target, behavior: behavior() });
  });

  /* ---------------- Item positions ----------------
     Each visible item's left and right edge in the track's scroll
     coordinates (items snap to their start edge). */
  function itemEdges(el) {
    var box = el.getBoundingClientRect();
    var out = [];
    for (var i = 0; i < el.children.length; i++) {
      var r = el.children[i].getBoundingClientRect();
      if (!r.width) continue;
      var left = r.left - box.left + el.scrollLeft;
      out.push({ left: left, right: left + r.width });
    }
    return out;
  }

  function maxScroll(el) {
    return Math.max(0, el.scrollWidth - el.clientWidth);
  }

  // Where an arrow press should land, or null if there are no items.
  function pageTarget(el, forward) {
    var items = itemEdges(el);
    if (!items.length) return null;
    var cur = el.scrollLeft;
    var view = el.clientWidth;
    var max = maxScroll(el);
    var i;

    if (forward) {
      // The first item not fully in view goes to the left edge.
      for (i = 0; i < items.length; i++) {
        if (items[i].left > cur + 2 && items[i].right > cur + view + 2) {
          return Math.min(items[i].left, max);
        }
      }
      return max;
    }

    // Back a page: the item just left of the view ends up fully visible
    // at the right, starting from the earliest item that allows that.
    var prevRight = null;
    for (i = items.length - 1; i >= 0; i--) {
      if (items[i].left < cur - 2) {
        prevRight = items[i].right;
        break;
      }
    }
    if (prevRight === null) return 0;
    for (i = 0; i < items.length; i++) {
      if (items[i].left >= prevRight - view - 2) return Math.max(0, items[i].left);
    }
    return 0;
  }

  /* ---------------- Settle on an item ----------------
     Mandatory-snap tracks only. Waits until the finger is up and the
     scroll has been idle briefly (or the browser's scrollend fires),
     then glides to the nearest item edge if it stopped between two. */
  var touching = null;
  var settleTimers = typeof WeakMap === 'function' ? new WeakMap() : null;

  function isMandatory(el) {
    var type = window.getComputedStyle(el).scrollSnapType || '';
    return type.indexOf('mandatory') !== -1;
  }

  function settle(el) {
    if (touching === el || !isMandatory(el)) return;
    var cur = el.scrollLeft;
    var max = maxScroll(el);
    if (cur >= max - 2) return; // The end of the track is a valid stop.
    var items = itemEdges(el);
    var best = null;
    for (var i = 0; i < items.length; i++) {
      var p = Math.min(items[i].left, max);
      if (best === null || Math.abs(p - cur) < Math.abs(best - cur)) best = p;
    }
    if (best !== null && Math.abs(best - cur) > 2) {
      el.scrollTo({ left: best, behavior: behavior() });
    }
  }

  function scheduleSettle(el) {
    if (!settleTimers) return;
    clearTimeout(settleTimers.get(el));
    settleTimers.set(el, setTimeout(function () { settle(el); }, 160));
  }

  function trackFrom(evt) {
    var t = evt.target;
    return t && t.closest ? t.closest('[data-swatch-track]') : null;
  }

  document.addEventListener('touchstart', function (evt) {
    touching = trackFrom(evt);
  }, { passive: true });

  document.addEventListener('touchend', function (evt) {
    var el = touching || trackFrom(evt);
    touching = null;
    if (el) scheduleSettle(el);
  }, { passive: true });

  document.addEventListener('touchcancel', function () {
    touching = null;
  }, { passive: true });

  document.addEventListener('scrollend', function (evt) {
    var el = evt.target;
    if (el && el.hasAttribute && el.hasAttribute('data-swatch-track')) scheduleSettle(el);
  }, true);

  document.addEventListener(
    'scroll',
    function (evt) {
      var el = evt.target;
      if (!el || !el.hasAttribute || !el.hasAttribute('data-swatch-track')) return;

      var scroller = el.closest('[data-swatch-scroller]');
      if (scroller) updateButtons(scroller);
      // Browsers without scrollend: settle once scrolling goes quiet.
      if (!('onscrollend' in window)) scheduleSettle(el);
    },
    true
  );

  // Coalesce bursts of observer callbacks into one pass. A timeout
  // rather than requestAnimationFrame so it still runs in a background
  // tab (the PDP recommendations can arrive while the tab is hidden).
  var scheduled = false;
  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      updateAll();
    }, 0);
  }

  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(scheduleUpdate);
    ro.observe(document.documentElement);
    // <html> can be viewport-sized (it is on the PDP), so content that
    // arrives later does not resize it. <body> does grow.
    if (document.body) ro.observe(document.body);
  } else {
    window.addEventListener('resize', updateAll);
  }

  // Scrollers injected after load (Dawn's <product-recommendations> on
  // the PDP swaps in the featured-collections carousel when scrolled
  // near; infinite scroll adds cards) start with their arrows hidden and
  // nothing else re-evaluates them. One observer for the whole page,
  // childList only, so it is cheap.
  if ('MutationObserver' in window && document.body) {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.hasAttribute('data-swatch-scroller') || node.querySelector('[data-swatch-scroller]')) {
            scheduleUpdate();
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateAll, { once: true });
  } else {
    updateAll();
  }

  document.addEventListener('shopify:section:load', updateAll);

  window.gsSwatchScrollerRefresh = updateAll;
})();
