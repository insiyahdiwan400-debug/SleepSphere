'use strict';
// Regression guard for SleepSphere's Erase Everything button.
// Run: node tests/motherhood-erase-lock-order.test.js
// This test should fail until the handler locks the private vault before
// clearing its storage, preventing pending encrypted writes from restoring it.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const main = fs.readFileSync('index.html', 'utf8');
const source = fs.readFileSync('motherhood.js', 'utf8');
const handler = main.match(/\$\('#eraseData'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n    \}\);/);
assert.ok(handler, 'Erase Everything handler must exist');

const body = handler[1];
const lock = body.indexOf('window.SSMotherhood.lock()');
const remove = body.indexOf('STORAGE_KEY,MOTHERHOOD_KEY].forEach(key => store.remove(key))');
assert.ok(remove >= 0, 'Erasure must include Motherhood storage');
assert.ok(lock >= 0 && lock < remove,
  'Erasure must lock Motherhood before removing stored data');

const persistStart = source.indexOf('  async function persist() {');
const persistEnd = source.indexOf('  async function createVault(', persistStart);
assert.ok(persistStart >= 0 && persistEnd > persistStart, 'Vault persistence must exist');
const persist = source.slice(persistStart, persistEnd);
assert.match(persist, /session\.key\s*!==\s*key/,
  'Async persistence must reject a session that was locked while sealing');
assert.match(persist, /!existing\s*\|\|\s*!existing\.kdf/,
  'Async persistence must not recreate a deleted vault');

console.log('PASS Motherhood erase and async persist guards');
