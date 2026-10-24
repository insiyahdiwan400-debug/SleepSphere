/* SleepSphere prototype reporting consent boundary.
 * Isolated module: no network transmission, no sleep-data access, no Motherhood access.
 * Not yet connected to the app UI or a backend.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SleepSpherePrototypeReporting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'sleepsphere:prototype-reporting-consent:v1';
  const ALLOWED = Object.freeze({
    app_open: [],
    routine_started: [],
    routine_completed: [],
    audio_play_error: ['code'],
    notification_error: ['code'],
    feedback_submitted: ['rating']
  });
  const ERROR_CODES = new Set([
    'playback_failed', 'audio_unavailable', 'permission_denied',
    'delivery_failed', 'unknown'
  ]);
  function create(storage) {
    if (!storage || typeof storage.getItem !== 'function' ||
        typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
      throw new TypeError('Persistent consent storage is required');
    }
    // Require fresh consent every page session. A failed storage deletion must
    // never silently re-enable reporting after a reload.
    let activeThisSession = false;
    function consented() {
      if (!activeThisSession) return false;
      try { return storage.getItem(KEY) === '1'; }
      catch (_) { return false; }
    }
    function optIn() {
      try {
        storage.setItem(KEY, '1');
        activeThisSession = storage.getItem(KEY) === '1';
        return activeThisSession;
      } catch (_) { activeThisSession = false; return false; }
    }
    function optOut() {
      // Stop events synchronously even when storage throws or ignores removal.
      activeThisSession = false;
      try {
        storage.removeItem(KEY);
        return storage.getItem(KEY) !== '1';
      } catch (_) { return false; }
    }
    function prepareEvent(name, details = {}) {
      if (!consented() || !Object.prototype.hasOwnProperty.call(ALLOWED, name)) return null;
      if (details === null || typeof details !== 'object' || Array.isArray(details)) return null;
      if (Object.keys(details).some(k => !ALLOWED[name].includes(k))) return null;
      if ((name === 'audio_play_error' || name === 'notification_error') &&
          !Object.prototype.hasOwnProperty.call(details, 'code')) return null;
      if (name === 'feedback_submitted' &&
          !Object.prototype.hasOwnProperty.call(details, 'rating')) return null;
      const event = { type: name, schema: 1 };
      if (Object.prototype.hasOwnProperty.call(details, 'code')) {
        if (typeof details.code !== 'string' || !ERROR_CODES.has(details.code)) return null;
        event.code = details.code;
      }
      if (Object.prototype.hasOwnProperty.call(details, 'rating')) {
        if (!Number.isInteger(details.rating) || details.rating < 1 || details.rating > 5) return null;
        event.rating = details.rating;
      }
      return Object.freeze(event);
    }
    return Object.freeze({ consented, optIn, optOut, prepareEvent });
  }
  return Object.freeze({ create, CONSENT_KEY: KEY });
});
