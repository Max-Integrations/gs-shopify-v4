/*
  ==================================================================
  GS SLIDESHOW
  ==================================================================
  Stand-in for the Flickity carousels v3's theme.js built from
  [data-slideshow] (slideshow, collection-carousel, spotlight,
  product-short-videos). No library: the container becomes a native
  horizontal scroller with scroll-snap (gs-carousel.css adds the
  layout), the section's own arrow buttons
  ([data-slideshow-navigation-button].previous/.next) scroll by one
  slide, autoplay honours the `autoPlay` option (ms) v3 passed to
  Flickity, `wrapAround` loops from the last slide to the first, and
  the v3 arrow-state classes (left-arrow-disabled, right-arrow-disabled,
  disable-arrows) are kept so the ported CSS still applies.

  v3 options read from the data-slideshow JSON: autoPlay, wrapAround,
  mobileCarousel (false = plain stacked layout under 768px: the
  gs-slideshow--stacked class, which gs-carousel.css handles).

  Load once from layout/theme.liquid.
  ==================================================================
*/
(function () {
  'use strict';

  if (window.gsSlideshowBound) return;
  window.gsSlideshowBound = true;

  function slides(el) {
    return Array.prototype.filter.call(el.children, function (c) {
      return !c.hasAttribute('data-slideshow-navigation-button') && !c.classList.contains('slider-pagination');
    });
  }

  function updateArrows(el) {
    var atStart = el.scrollLeft <= 1;
    var atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    var overflowing = el.scrollWidth > el.clientWidth + 1;
    var host = el.closest('[data-gs-slideshow-host]') || el.parentElement || el;
    host.classList.toggle('disable-arrows', !overflowing);
    if (!el.gsOptions.wrapAround) {
      host.classList.toggle('left-arrow-disabled', atStart);
      host.classList.toggle('right-arrow-disabled', atEnd);
    }
    var counter = host.querySelector('.slider-pagination .current-slide');
    if (counter) {
      var all = slides(el);
      var index = 0;
      for (var i = 0; i < all.length; i++) {
        if (all[i].offsetLeft - el.offsetLeft <= el.scrollLeft + 2) index = i;
      }
      counter.textContent = index + 1;
    }
  }

  function step(el, direction) {
    var all = slides(el);
    if (!all.length) return;
    var width = all[0].getBoundingClientRect().width || el.clientWidth;
    var atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    var atStart = el.scrollLeft <= 1;
    if (direction > 0 && atEnd && el.gsOptions.wrapAround) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (direction < 0 && atStart && el.gsOptions.wrapAround) {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    } else {
      el.scrollBy({ left: direction * width, behavior: 'smooth' });
    }
  }

  function init(el) {
    if (el.gsOptions) return;
    var options = {};
    try { options = JSON.parse(el.getAttribute('data-slideshow') || '{}') || {}; } catch (e) { options = {}; }
    el.gsOptions = options;
    el.classList.add('gs-slideshow');
    if (options.mobileCarousel === false) el.classList.add('gs-slideshow--stacked');

    // Arrows live inside the same section, usually as siblings of the
    // scroller or inside it (v3 placed them both ways).
    var host = el.parentElement;
    while (host && !host.querySelector('[data-slideshow-navigation-button]') && host !== document.body) host = host.parentElement;
    if (host && host !== document.body) host.setAttribute('data-gs-slideshow-host', '');
    var scope = host && host !== document.body ? host : el;
    scope.querySelectorAll('[data-slideshow-navigation-button]').forEach(function (btn) {
      if (btn.gsBound) return;
      btn.gsBound = true;
      btn.addEventListener('click', function (evt) {
        evt.preventDefault();
        step(el, btn.classList.contains('previous') ? -1 : 1);
      });
    });

    el.addEventListener('scroll', function () {
      window.requestAnimationFrame(function () { updateArrows(el); });
    }, { passive: true });
    updateArrows(el);

    var delay = typeof options.autoPlay === 'number' ? options.autoPlay : (options.autoPlay === true ? 3000 : 0);
    if (delay > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var timer = window.setInterval(function () {
        if (document.hidden) return;
        var atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
        if (atEnd) el.scrollTo({ left: 0, behavior: 'smooth' });
        else step(el, 1);
      }, delay);
      el.addEventListener('pointerenter', function () { window.clearInterval(timer); timer = null; }, { once: true });
    }
  }

  function initAll(root) {
    (root || document).querySelectorAll('[data-slideshow]').forEach(init);
    (root || document).querySelectorAll('.gs-slideshow').forEach(updateArrows);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(); }, { once: true });
  } else {
    initAll();
  }
  window.addEventListener('resize', function () { initAll(); });
  document.addEventListener('shopify:section:load', function (evt) { initAll(evt.target); });

  window.gsSlideshowRefresh = initAll;
})();
