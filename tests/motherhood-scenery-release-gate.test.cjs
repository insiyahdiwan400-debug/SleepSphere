'use strict';
// Self-contained regression tests for the REAL repository release gate.
// These synthetic fixtures never constitute approval of production photographs.
// Run: node tests/motherhood-scenery-release-gate.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const source = path.resolve(__dirname, '../test/motherhood-scenery-assets.cjs');
const scenes = ['aurora', 'starlake', 'firstlight', 'moonmeadow'];
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sleepsphere-motherhood-gate-'));
const assets = path.join(root, 'media', 'motherhood');
const manifestFile = path.join(assets, 'scenery-approvals.json');
fs.mkdirSync(path.join(root, 'test'), { recursive: true });
fs.mkdirSync(assets, { recursive: true });
fs.copyFileSync(source, path.join(root, 'test', 'motherhood-scenery-assets.cjs'));

function fixture() {
  const manifest = { scenes: {} };
  fs.writeFileSync(path.join(root, 'motherhood.css'),
    scenes.map(scene => `background-image:url('./media/motherhood/${scene}.webp')`).join('\n'));
  for (const scene of scenes) {
    // Signature-level fixture only: current gate does not decode WebP.
    const bytes = Buffer.alloc(2048, 0);
    bytes.write('RIFF', 0, 'ascii');
    bytes.write('WEBP', 8, 'ascii');
    fs.writeFileSync(path.join(assets, `${scene}.webp`), bytes);
    manifest.scenes[scene] = {
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      visualApproval: { approved: true, noAircraft: true, photographic: true, reviewer: 'fixture-reviewer' },
      rights: { cleared: true, source: 'synthetic fixture', license: 'test-only' }
    };
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  return manifest;
}
function run() {
  const r = spawnSync(process.execPath, [path.join(root, 'test', 'motherhood-scenery-assets.cjs')],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.error, undefined, 'release gate must execute');
  return r;
}
function expectStatus(label, expected) {
  const result = run();
  assert.equal(result.status, expected, `${label}: ${result.stdout}\n${result.stderr}`);
  console.log(`PASS ${label}`);
}
function mutateManifest(fn) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  fn(manifest);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
}
try {
  fixture(); expectStatus('all required approvals accepted (synthetic fixture)', 0);
  fixture(); fs.unlinkSync(manifestFile); expectStatus('missing approval manifest rejected', 1);
  fixture(); fs.unlinkSync(path.join(assets, 'starlake.webp')); expectStatus('missing scene rejected', 1);
  fixture(); fs.appendFileSync(path.join(assets, 'aurora.webp'), 'tampered'); expectStatus('modified scene hash rejected', 1);
  fixture(); mutateManifest(m => { m.scenes.aurora.visualApproval.noAircraft = false; }); expectStatus('aircraft review not approved rejected', 1);
  fixture(); mutateManifest(m => { m.scenes.aurora.visualApproval.photographic = false; }); expectStatus('non-photographic review rejected', 1);
  fixture(); mutateManifest(m => { m.scenes.aurora.rights.cleared = false; }); expectStatus('uncleared rights rejected', 1);
  fixture(); mutateManifest(m => { m.scenes.aurora.visualApproval.reviewer = ''; }); expectStatus('missing reviewer rejected', 1);
  fixture(); fs.writeFileSync(path.join(root, 'motherhood.css'), '/* no scene references */'); expectStatus('missing CSS scene mapping rejected', 1);
  fixture(); fs.writeFileSync(path.join(assets, 'moonmeadow.webp'), Buffer.alloc(2048, 0)); expectStatus('invalid WebP signature rejected', 1);
  console.log('PASS 10/10 Motherhood scenery release-gate regression scenarios');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
