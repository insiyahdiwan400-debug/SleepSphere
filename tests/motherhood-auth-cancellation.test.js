'use strict';
// Run from the repository root: node tests/motherhood-auth-cancellation.test.js
// Regression suite: pending authentication must never reopen a locked vault.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('motherhood.js', 'utf8');
const start = source.indexOf('  async function createVault(passcode) {');
const end = source.indexOf('  /* ==================================================================\n     STAGE', start);
assert.ok(start >= 0 && end > start, 'Vault authentication code found');
const factory = new Function('deriveKey', 'sealVault', 'openVault', 'MH', 'document',
  'crypto', 'b64', 'unb64', 'blankVault', 'record',
  'const VAULT_VERSION=1;const KDF_ITERATIONS=1;' +
  'const session={key:null,vault:null};\n' + source.slice(start, end) +
  '\nreturn {createVault,unlock,lock,session};');
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function harness(options = {}) {
  const writes = [], document = { hidden: false };
  const api = factory(options.deriveKey || (async () => 'key'),
    options.sealVault || (async () => ({ data: 'sealed' })),
    options.openVault || (async () => ({ entries: [] })),
    { set: v => writes.push(v) }, document,
    { getRandomValues: arr => arr }, () => 'salt', () => new Uint8Array(16),
    () => ({ entries: [] }), () => ({ kdf: { salt: 's', iter: 1 }, cipher: {} }));
  return { api, writes, document };
}
async function test(name, action) {
  try { await action(); console.log('PASS ' + name); }
  catch (error) { console.error('FAIL ' + name + ': ' + error.message); process.exitCode = 1; }
}
(async () => {
  await test('lock cancels vault creation during key derivation', async () => {
    const key = deferred(), h = harness({ deriveKey: () => key.promise });
    const pending = h.api.createVault('passcode');
    h.api.lock(); key.resolve('key');
    await assert.rejects(pending, /locked/);
    assert.equal(h.writes.length, 0);
    assert.equal(h.api.session.key, null);
  });
  await test('lock cancels vault creation during encryption', async () => {
    const seal = deferred(), started = deferred();
    const h = harness({ sealVault: () => { started.resolve(); return seal.promise; } });
    const pending = h.api.createVault('passcode');
    await started.promise;
    h.api.lock(); seal.resolve({ data: 'sealed' });
    await assert.rejects(pending, /locked/);
    assert.equal(h.writes.length, 0);
    assert.equal(h.api.session.vault, null);
  });
  await test('lock cancels unlock during key derivation', async () => {
    const key = deferred(), h = harness({ deriveKey: () => key.promise });
    const pending = h.api.unlock('passcode');
    h.api.lock(); key.resolve('key');
    await assert.rejects(pending, /locked/);
    assert.equal(h.api.session.key, null);
  });
  await test('lock cancels unlock during decryption', async () => {
    const decrypt = deferred(), started = deferred();
    const h = harness({ openVault: () => { started.resolve(); return decrypt.promise; } });
    const pending = h.api.unlock('passcode');
    await started.promise;
    h.api.lock(); decrypt.resolve({ entries: [] });
    await assert.rejects(pending, /locked/);
    assert.equal(h.api.session.vault, null);
  });
  await test('hidden page cannot finish unlock', async () => {
    const key = deferred(), h = harness({ deriveKey: () => key.promise });
    const pending = h.api.unlock('passcode');
    h.document.hidden = true; key.resolve('key');
    await assert.rejects(pending, /locked/);
    assert.equal(h.api.session.key, null);
  });
  await test('normal vault creation remains functional', async () => {
    const h = harness();
    await h.api.createVault('passcode');
    assert.equal(h.writes.length, 1);
    assert.equal(h.api.session.key, 'key');
  });
  await test('normal unlock remains functional', async () => {
    const h = harness();
    await h.api.unlock('passcode');
    assert.equal(h.api.session.key, 'key');
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
