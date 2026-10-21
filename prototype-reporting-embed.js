/* SleepSphere development-only consent embed. No network calls or access to sleep/Motherhood data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SleepSpherePrototypeReportingEmbed = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function mount(doc, storage, consentModule, consentUI) {
    const host = doc && doc.getElementById && doc.getElementById('ss-prototype-consent-root');
    if (!host) return false;
    try {
      const consent = consentModule.create(storage);
      consentUI.mount(host, consent);
      return true;
    } catch (_) {
      host.textContent = 'Optional reporting controls are unavailable. Reporting remains off.';
      return false;
    }
  }
  return Object.freeze({ mount });
});
