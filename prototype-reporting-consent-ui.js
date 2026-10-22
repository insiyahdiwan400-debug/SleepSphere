/* SleepSphere prototype consent UI — isolated, no network calls.
 * Reports are only submitted after explicit session consent and a button click.
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
    notice.textContent = 'Optional reporting requires a configured server. A tester can submit a rating with a chosen ID; sleep entries and Motherhood records are never included. You can decline and still use SleepSphere.';
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
    const idLabel = doc.createElement('label');
    idLabel.textContent = 'Tester name or anonymous ID (letters, numbers, _ or -)';
    const testerId = doc.createElement('input');
    testerId.type = 'text';
    testerId.maxLength = 40;
    testerId.placeholder = 'e.g. Tester_01';
    idLabel.appendChild(testerId);
    const ratingLabel = doc.createElement('label');
    ratingLabel.textContent = 'Overall rating (1 to 5)';
    const rating = doc.createElement('select');
    for (let i = 1; i <= 5; i++) {
      const option = doc.createElement('option');
      option.value = String(i);
      option.textContent = String(i);
      rating.appendChild(option);
    }
    rating.value = '5';
    ratingLabel.appendChild(rating);
    const send = doc.createElement('button');
    send.type = 'button';
    send.textContent = 'Submit tester rating';
    let busy = false;
    send.addEventListener('click', async () => {
      if (busy || !reporting.consented()) return;
      const id = testerId.value.trim();
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) {
        error.textContent = 'Please enter a valid tester ID (1–40 characters).';
        return;
      }
      const prepared = reporting.prepareEvent('feedback_submitted', { rating: Number(rating.value) });
      if (!prepared) { error.textContent = 'Reporting is off or rating is invalid.'; return; }
      busy = true;
      send.disabled = true;
      error.textContent = '';
      try {
        const response = await fetch('/.netlify/functions/prototype-report', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ consent: true, testerId: id, event: prepared })
        });
        if (!response.ok) throw new Error('Reporting unavailable');
        status.textContent = 'Rating submitted successfully.';
      } catch (_) {
        error.textContent = 'Could not send rating. Please try again later; no report was confirmed.';
      } finally { busy = false; send.disabled = !reporting.consented(); }
    });
    function render() {
      const enabled = reporting.consented();
      status.textContent = enabled ? 'Consent enabled for this session. You can submit a rating below.' : 'Reporting is off.';
      enable.hidden = enabled;
      disable.hidden = !enabled;
      send.disabled = !enabled || busy;
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
    section.append(title, detail, notice, status, enable, disable, idLabel, ratingLabel, send, error);
    host.appendChild(section);
    render();
    return Object.freeze({ destroy() { section.remove(); }, refresh: render });
  }
  return Object.freeze({ mount });
});
