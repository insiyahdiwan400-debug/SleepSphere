'use strict';
// Run from repository root: node tests/motherhood-background-lock.test.js
// Simulated lifecycle checks; real iPad background/resume remains unverified.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('motherhood-ui.js', 'utf8');
const begin = source.indexOf('  function lockWhenBackgrounded() {');
const end = source.indexOf('  /* A seam for tests', begin);
assert.ok(begin >= 0 && end > begin, 'Background lock handler must exist');
const block = source.slice(begin, end);
function harness(unlocked, hasLayer) {
  const events = {}, calls = [];
  const M = {
    isUnlocked: () => unlocked,
    lock: () => { calls.push('lock'); unlocked = false; }
  };
  const document = { hidden: false, addEventListener: (event, fn) => { events[event] = fn; } };
  const window = { addEventListener: (event, fn) => { events[event] = fn; } };
  const route = () => calls.push('route');
  new Function('M', 'layer', 'route', 'document', 'window', block)(
    M, hasLayer ? {} : null, route, document, window);
  return { events, calls, document };
}
let n = 0;
{
  const h = harness(true, true);
  h.events.visibilitychange(); // visible: leave the active form alone
  assert.deepEqual(h.calls, []); n++;
  h.document.hidden = true;
  h.events.visibilitychange(); // background: lock and clear via route
  assert.deepEqual(h.calls, ['lock', 'route']); n++;
  h.events.visibilitychange(); // already locked: no redundant work
  assert.deepEqual(h.calls, ['lock', 'route']); n++;
}
{
  const h = harness(true, true);
  h.events.pagehide(); // navigation must lock too
  assert.deepEqual(h.calls, ['lock', 'route']); n++;
}
{
  const h = harness(true, false);
  h.events.pagehide(); // no visible layer: still clear the key
  assert.deepEqual(h.calls, ['lock']); n++;
}
{
  const h = harness(false, true);
  h.document.hidden = true;
  h.events.visibilitychange(); // never unlocked: do not reveal state
  assert.deepEqual(h.calls, []); n++;
}
console.log(n + '/6 Motherhood background-lock checks passed');
