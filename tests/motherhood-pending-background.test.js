'use strict';
// Run from the SleepSphere repository root:
// node tests/motherhood-pending-background.test.js
// Regression: backgrounding must cancel an in-flight authentication, even
// before a vault is considered unlocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('motherhood-ui.js', 'utf8');
const start = source.indexOf('  function lockWhenBackgrounded() {');
const end = source.indexOf('  /* A seam for tests', start);
assert.ok(start >= 0 && end > start, 'background-lock handler found');
const block = source.slice(start, end);

function run({ unlocked = false, pending = false, hidden = true, layer = true, event = 'visibilitychange' } = {}) {
  const events = {}, calls = [];
  const M = {
    isUnlocked: () => unlocked,
    isAuthenticating: () => pending,
    lock: () => { calls.push('lock'); unlocked = false; pending = false; }
  };
  const document = {
    hidden,
    addEventListener: (type, fn) => { events[type] = fn; }
  };
  const window = { addEventListener: (type, fn) => { events[type] = fn; } };
  new Function('M', 'layer', 'route', 'document', 'window', block)(
    M, layer ? {} : null, () => calls.push('route'), document, window);
  events[event]();
  return calls;
}

assert.deepEqual(run({ pending: true }), ['lock', 'route'],
  'backgrounding during passcode derivation must cancel authentication');
assert.deepEqual(run({ pending: true, event: 'pagehide' }), ['lock', 'route'],
  'navigation during passcode derivation must cancel authentication');
assert.deepEqual(run({ pending: true, layer: false }), ['lock'],
  'pending authentication must be cancelled even without a visible layer');
assert.deepEqual(run({ pending: true, hidden: false }), [],
  'foreground events must not interrupt authentication');
assert.deepEqual(run({ unlocked: true }), ['lock', 'route'],
  'unlocked vaults must still lock when backgrounded');
assert.deepEqual(run(), [], 'already-locked idle sessions remain untouched');
console.log('6/6 pending-auth background lifecycle checks passed');
