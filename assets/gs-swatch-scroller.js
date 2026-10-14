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
*/
(function () {
  'use strict';

  var SCROLL_RATIO = 0.8;

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

    var delta = el.clientWidth * SCROLL_RATIO;
    var direction = btn.getAttribute('data-swatch-scroll') === 'next' ? delta : -delta;

    el.scrollBy({ left: direction, behavior: 'smooth' });
  });

  document.addEventListener(
    'scroll',
    function (evt) {
      var el = evt.target;
      if (!el || !el.hasAttribute || !el.hasAttribute('data-swatch-track')) return;

      var scroller = el.closest('[data-swatch-scroller]');
      if (scroller) updateButtons(scroller);
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
