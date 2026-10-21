/* SleepSphere prototype consent UI — isolated, no network calls.
 * This module is NOT loaded by index.html and cannot collect data by itself.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SleepSpherePrototypeConsentUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function mount(host, reporting) {
    if (!host || !host.ownerDocument || !reporting ||
        typeof reporting.consented !== 'function' ||
        typeof reporting.optIn !== 'function' ||
        typeof reporting.optOut !== 'function') {
      throw new TypeError('A DOM host and consent API are required');
    }
    const doc = host.ownerDocument;
    const section = doc.createElement('section');
    section.className = 'ss-prototype-consent';
    section.setAttribute('aria-label', 'Prototype testing reports');
    const title = doc.createElement('h2');
    title.textContent = 'Help improve SleepSphere';
    const detail = doc.createElement('p');
    detail.textContent = 'Optional prototype diagnostics may include app opens, routine completions, technical errors, and a rating you choose to submit. Your sleep entries, Motherhood records, journals, location, and personal details are never included.';
    const notice = doc.createElement('p');
    notice.textContent = 'Development preview: no reporting service is connected, and this screen does not send information anywhere. You can decline and still use SleepSphere.';
    const status = doc.createElement('p');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const enable = doc.createElement('button');
    enable.type = 'button';
    enable.textContent = 'Allow optional diagnostics for this session';
    const disable = doc.createElement('button');
    disable.type = 'button';
    disable.textContent = 'Withdraw consent';
    const error = doc.createElement('p');
    error.setAttribute('role', 'alert');
    function render() {
      const enabled = reporting.consented();
      status.textContent = enabled ? 'Consent enabled for this session (no reports are being sent).' : 'Reporting is off.';
      enable.hidden = enabled;
      disable.hidden = !enabled;
      return enabled;
    }
    enable.addEventListener('click', () => {
      error.textContent = reporting.optIn() ? '' : 'Could not save consent. Reporting remains off.';
      render();
    });
    disable.addEventListener('click', () => {
      const removed = reporting.optOut();
      error.textContent = removed ? '' : 'Reporting is off for this session. Browser storage may still contain an old consent flag; please clear site data before testing again.';
      render();
    });
    section.append(title, detail, notice, status, enable, disable, error);
    host.appendChild(section);
    render();
    return Object.freeze({ destroy() { section.remove(); }, refresh: render });
  }
  return Object.freeze({ mount });
});
