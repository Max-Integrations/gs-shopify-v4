/*
  ==================================================================
  GS MARQUEE
  ==================================================================
  v3's marqueeTextAutoplay (assets/theme.js), on its own. Sections
  ported from v3 (marquee, collection-carousel's marquee layout,
  video-banner's heading marquee, shapes) mark a scrolling strip with
  [data-marquee] and the repeated node with [data-marque-node]; their
  CSS animates with `animation-duration: var(--marqueeSpeed)` and the
  `marque` keyframes in gs-carousel.css. This computes --marqueeSpeed
  from the strip's width and the data-marquee-speed(-mobile) setting,
  exactly as v3 did, and recomputes on resize across the 768px break.

  Load once from layout/theme.liquid.
  ==================================================================
*/
(function () {
  'use strict';

  if (window.gsMarqueeBound) return;
  window.gsMarqueeBound = true;

  function init(element) {
    var node = element.querySelector('[data-marque-node]');
    if (!node) return;

    var speed = parseInt(element.getAttribute('data-marquee-speed') || '15', 10);
    if (window.innerWidth < 768 && element.hasAttribute('data-marquee-speed-mobile')) {
      speed = parseInt(element.getAttribute('data-marquee-speed-mobile'), 10) || speed;
    }

    var contentWidth = element.clientWidth || 1;
    var nodeWidth = node.clientWidth || contentWidth;
    var slowFactor = 1 + (Math.max(1600, contentWidth) - 375) / (1600 - 375);
    var target = element.parentElement || element;
    target.style.setProperty('--marqueeSpeed', ((speed * slowFactor * nodeWidth) / contentWidth).toFixed(3) + 's');
  }

  function initAll(root) {
    (root || document).querySelectorAll('[data-marquee]').forEach(init);
  }

  var lastBand = null;
  function onResize() {
    var band = window.innerWidth < 768 ? 'mobile' : 'desktop';
    if (band === lastBand) return;
    lastBand = band;
    initAll();
  }

  function start() {
    lastBand = window.innerWidth < 768 ? 'mobile' : 'desktop';
    initAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('load', initAll.bind(null, null));
  document.addEventListener('shopify:section:load', function (evt) { initAll(evt.target); });

  window.gsMarqueeRefresh = initAll;
})();
