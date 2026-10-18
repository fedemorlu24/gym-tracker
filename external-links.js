// Optional donations use a plain browser navigation: no widget, payment SDK,
// preconnect, account identifier, workout data or tracking parameters.
(() => {
  'use strict';
  const donationURL = 'https://buymeacoffee.com/fedemorlu24';
  Object.defineProperty(window, 'GymExternalLinks', {
    value: Object.freeze({donationURL}), writable: false, configurable: false
  });

  function protectDonationLink(event) {
    const link = event.target instanceof Element
      ? event.target.closest('a.donation-button') : null;
    if (!link) return;
    // Restore the exact destination instead of trusting DOM-supplied URLs. This
    // also covers keyboard/middle-click and context-menu navigation. It is a
    // guard against changed attributes, not a defence against executing XSS.
    link.setAttribute('href', donationURL);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('referrerpolicy', 'no-referrer');
    link.removeAttribute('ping');
    link.removeAttribute('attributionsrc');
    link.removeAttribute('download');
  }
  for (const type of ['pointerdown', 'keydown', 'contextmenu', 'click', 'auxclick']) {
    document.addEventListener(type, protectDonationLink, true);
  }
})();
