'use strict';
// Regression tests for the actual SleepSphere index.html storage boundary.
// Run from the repository root: node --test test/motherhood-durable-storage.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function section(from, until) {
  const start = html.indexOf(from);
  const end = html.indexOf(until, start);
  assert.ok(start >= 0 && end > start, 'Expected storage boundary missing from index.html');
  return html.slice(start, end);
}

const storeSource = section('const store = (() => {', '    if (!store.healthy)');
const motherhoodSource = section('const motherhood = (() => {', '    /* The one function every export');

function harness(mode, existing = null) {
  const disk = new Map();
  const key = 'sleepsphere_motherhood_v1';
  if (existing) disk.set(key, JSON.stringify(existing));
  const storage = {
    setItem(k, v) {
      if (mode === 'unavailable') throw Error('Storage disabled');
      if (mode === 'revoked' && k === key) throw Error('Storage revoked');
      if (mode === 'discard' && k === key) return;
      disk.set(k, String(v));
    },
    getItem(k) { return disk.has(k) ? disk.get(k) : null; },
    removeItem(k) { disk.delete(k); }
  };
  const context = vm.createContext({
    window: { localStorage: storage },
    document: { documentElement: { dataset: {} } },
    Map, JSON
  });
  vm.runInContext(storeSource + '\nconst MOTHERHOOD_KEY = ' + JSON.stringify(key) +
    ';\n' + motherhoodSource + '\nglobalThis.subject = motherhood;', context);
  return { subject: context.subject, disk, key };
}

const sample = { enabled: true, kdf: { salt: 'example' }, cipher: { data: 'encrypted' } };

test('normal storage persists Motherhood ciphertext', () => {
  const { subject, disk, key } = harness('normal');
  subject.set(sample);
  assert.deepEqual(JSON.parse(disk.get(key)), sample);
});

for (const mode of ['unavailable', 'discard', 'revoked']) {
  test('Motherhood refuses a falsely successful save: ' + mode, () => {
    const { subject, disk, key } = harness(mode);
    assert.throws(() => subject.set(sample), /stor|persist|sav|retain|writ/i);
    assert.equal(disk.has(key), false);
    assert.equal(subject.get(), null, 'failed save must not become a memory-only vault');
  });
}

test('failed replacement retains previously persisted encrypted vault', () => {
  const previous = { enabled: true, cipher: { data: 'original' } };
  const { subject, disk, key } = harness('discard', previous);
  assert.throws(() => subject.set({ cipher: { data: 'replacement' } }), /stor|persist|sav|retain|writ/i);
  assert.deepEqual(JSON.parse(disk.get(key)), previous);
});
