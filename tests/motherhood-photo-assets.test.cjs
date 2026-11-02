'use strict';
// Run from repository root: node tests/motherhood-photo-assets.test.cjs
// Release gate: CSS must point to actual same-origin photographs, not
// empty paths, remote trackers, illustrations or Flight Mode imagery.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const css = fs.readFileSync('motherhood.css', 'utf8');
const scenes = ['aurora', 'starlake', 'firstlight', 'moonmeadow'];
const missing = [];
let checked = 0;

for (const scene of scenes) {
  const relative = 'media/motherhood/' + scene + '.webp';
  assert.ok(css.includes(relative), 'CSS must reference ' + relative);
  checked++;
  const file = path.resolve(relative);
  if (!fs.existsSync(file)) { missing.push(relative); continue; }
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.length > 15_000, relative + ' must not be a tiny placeholder');
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF',
    relative + ' must be a WebP RIFF file');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP',
    relative + ' must contain WEBP signature');
  checked += 3;
}
assert.ok(!/url\(\s*['"]?https?:/i.test(css),
  'Motherhood backgrounds must not request third-party images');
checked++;
assert.deepEqual(missing, [], 'Missing Motherhood photography: ' + missing.join(', '));
checked++;
console.log('PASS Motherhood photo release gate: ' + checked + ' checks, 4 local scenes');
