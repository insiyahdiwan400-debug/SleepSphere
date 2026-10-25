/* SleepSphere preview-only consent embed. No network calls or access to sleep/Motherhood data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SleepSpherePrototypeReportingEmbed = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function addShortcut(doc) {
    const actions = doc.querySelector && doc.querySelector('.top-actions');
    if (!actions || doc.getElementById('ss-prototype-privacy-link')) return;
    const link = doc.createElement('a');
    link.id = 'ss-prototype-privacy-link';
    link.className = 'share-button';
    link.textContent = 'Privacy & testing';
    link.setAttribute('aria-label', 'Open optional prototype reporting controls');
    // A real URL works without JavaScript; the app router avoids reloading
    // when it is available, preserving the current in-memory sleep session.
    const target = new URL(doc.defaultView.location.href);
    target.searchParams.set('go', 'test');
    link.href = target.href;
    link.addEventListener('click', function (event) {
      const go = doc.defaultView && doc.defaultView.SleepSphereOpenURL;
      if (typeof go === 'function') {
        event.preventDefault();
        go('test');
      }
    });
    actions.insertBefore(link, actions.firstChild);
  }
  function mount(doc, storage, consentModule, consentUI) {
    const host = doc && doc.getElementById && doc.getElementById('ss-prototype-consent-root');
    if (!host) return false;
    try {
      const consent = consentModule.create(storage);
      consentUI.mount(host, consent);
      // Navigation is a convenience, not a prerequisite for privacy controls.
      try { addShortcut(doc); } catch (_) { /* Deep link remains available. */ }
      return true;
    } catch (_) {
      host.textContent = 'Optional reporting controls are unavailable. Reporting remains off.';
      return false;
    }
  }
  return Object.freeze({ mount });
});
