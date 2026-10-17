'use strict';
// Run from repository root: node tests/motherhood-pending-unlock-race.test.js
// Regression guard: an in-flight unlock must not restore a locked vault.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = fs.readFileSync('motherhood.js', 'utf8');
const ui = fs.readFileSync('motherhood-ui.js', 'utf8');
assert.match(core, /sessionGeneration/,
  'Auth operations need a generation token invalidated by lock()');
assert.match(core, /generation !== sessionGeneration/,
  'Async auth completion must reject stale operations');
assert.match(ui, /function lockWhenBackgrounded\(\) \{[\s\S]*?M\.lock\(\)/,
  'Backgrounding must invalidate pending authentication');
console.log('Motherhood pending-auth regression guard passed');
