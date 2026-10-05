/*
  ==================================================================
  GS ACCESSIBE
  ==================================================================
  Loads the accessiBe widget the way v3 did (assets/theme.js
  loadAccessibe, called from its DOMContentLoaded handler) with the
  same options, verbatim. hideTrigger: true hides accessiBe's floating
  button; the header's accessibility icon carries class="acsb-trigger",
  which accessiBe binds as its opener, so the panel opens from the
  header as it does on the live site.

  Loaded from layout/theme.liquid behind settings.enable_accessibe.
  ==================================================================
*/
(function () {
  'use strict';

  if (window.gsAccessibeBound) return;
  window.gsAccessibeBound = true;

  function load() {
    if (window.acsbJS || document.querySelector('script[src*="acsbapp.com"]')) return;

    var script = document.createElement('script');
    script.src = 'https://acsbapp.com/apps/app/dist/js/app.js';
    script.async = true;
    script.onload = function () {
      if (!window.acsbJS) return;
      window.acsbJS.init({
        statementLink: '',
        footerHtml: '',
        hideMobile: false,
        hideTrigger: true,
        disableBgProcess: false,
        language: 'en',
        position: 'left',
        leadColor: '#202020',
        triggerColor: '#000',
        triggerRadius: '50%',
        triggerPositionX: 'left',
        triggerPositionY: 'bottom',
        triggerIcon: 'wheels',
        triggerSize: 'medium',
        triggerOffsetX: 20,
        triggerOffsetY: 40,
        mobile: {
          triggerSize: 'medium',
          triggerPositionX: 'left',
          triggerPositionY: 'bottom',
          triggerOffsetX: 10,
          triggerOffsetY: 35,
          triggerRadius: '50%'
        }
      });
    };
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();
