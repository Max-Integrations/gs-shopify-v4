/*
  ==================================================================
  GS BADGE ROTATOR
  ==================================================================
  Product cards can carry several badges (NEW, SALE, SHIPS NOW, BEST
  SELLER...). With "Rotate badges one at a time" on (theme settings >
  Badges) they are shown one after another with a cross-fade instead of
  side by side.

  gs-card-product renders the wrapper as
    <div class="product-card-badges" data-badge-rotate
         data-badge-interval="3000" data-badge-fade="400">
  and this script, for every wrapper holding two or more badges, adds
  .is-rotating (gs-card-product.css stacks the badges in one grid cell)
  and moves .is-active from badge to badge on a single shared timer, so
  every card on the page rotates in step. The CSS transition does the
  fading.

  Does nothing when the visitor prefers reduced motion (badges stay side
  by side), for wrappers with a single badge, or while the tab is hidden.
  No library. Load once from layout/theme.liquid. AJAX filtering and
  infinite scroll call window.gsBadgeRotatorRefresh() after inserting
  cards.
  ==================================================================
*/
(function () {
  'use strict';

  if (window.gsBadgeRotatorBound) return;
  window.gsBadgeRotatorBound = true;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var rotating = [];
  var timer = null;

  function tick() {
    if (document.hidden) return;
    rotating = rotating.filter(function (entry) { return entry.wrapper.isConnected; });
    if (!rotating.length) {
      window.clearInterval(timer);
      timer = null;
      return;
    }
    rotating.forEach(function (entry) {
      entry.badges[entry.index].classList.remove('is-active');
      entry.index = (entry.index + 1) % entry.badges.length;
      entry.badges[entry.index].classList.add('is-active');
    });
  }

  function start(interval) {
    if (timer) return;
    timer = window.setInterval(tick, interval);
  }

  function init(wrapper) {
    if (wrapper.dataset.badgeRotateInit || reduceMotion.matches) return;
    wrapper.dataset.badgeRotateInit = 'true';

    var badges = Array.prototype.filter.call(wrapper.children, function (el) {
      return el.classList.contains('product-badge');
    });
    if (badges.length < 2) return;

    var interval = parseInt(wrapper.dataset.badgeInterval, 10);
    var fade = parseInt(wrapper.dataset.badgeFade, 10);
    if (!(interval > 0)) interval = 3000;
    if (!(fade >= 0)) fade = 400;

    wrapper.style.setProperty('--gs-badge-fade', fade + 'ms');
    wrapper.classList.add('is-rotating');
    badges[0].classList.add('is-active');

    rotating.push({ wrapper: wrapper, badges: badges, index: 0 });
    start(interval);
  }

  function initAll(root) {
    (root || document).querySelectorAll('[data-badge-rotate]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(); }, { once: true });
  } else {
    initAll();
  }
  document.addEventListener('shopify:section:load', function (evt) { initAll(evt.target); });

  window.gsBadgeRotatorRefresh = initAll;
})();
