'use strict';
// Run: node tests/motherhood-unlock-lock-race.test.js
// Uses the real auth functions with a controlled, delayed key derivation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('motherhood.js', 'utf8');
const start = source.indexOf('  async function unlock(passcode) {');
const end = source.indexOf('  /* ==================================================================\n     STAGE', start);
assert.ok(start >= 0 && end > start, 'Motherhood auth functions exist');
const make = new Function('deriveKey','openVault','record','unb64','document',
  'const session={key:null,vault:null};const KDF_ITERATIONS=1;\n'+
  source.slice(start,end)+'\nreturn {unlock,lock,session};');
(async () => {
  let finish;
  const pendingKey = new Promise(resolve => { finish = resolve; });
  const vault = make(
    () => pendingKey,
    async () => ({stage:'pregnancy'}),
    () => ({kdf:{salt:'s',iter:1},cipher:{iv:'i',data:'d'}}),
    () => new Uint8Array(16),
    {hidden:false}
  );
  const pendingUnlock = vault.unlock('correct');
  vault.lock(); // User backgrounds the app before key derivation finishes.
  finish('derived-key');
  try { await pendingUnlock; } catch (err) {
    assert.match(String(err.message), /locked/);
  }
  assert.equal(vault.session.key, null,
    'A pending unlock must NEVER restore the key after lock()');
  assert.equal(vault.session.vault, null,
    'A pending unlock must NEVER restore decrypted records after lock()');
  console.log('Motherhood pending unlock stays locked: PASS');
})().catch(err => { console.error(err); process.exitCode = 1; });
