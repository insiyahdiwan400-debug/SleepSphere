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
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF',
    relative + ' must be a WebP RIFF file');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP',
    relative + ' must contain WEBP signature');
  /* Dimensions, not bytes.
     This asked for more than 15,000 bytes as a stand-in for "not a
     placeholder", and a byte count cannot tell the difference: a 20KB
     1x1 image passes it, and firstlight.webp failed it at 13,244 bytes
     while being a real 720x1280 frame — a dawn sky is smooth and
     compresses well. Reading the size out of the WebP header tests the
     thing the threshold was reaching for. */
  const kind = bytes.subarray(12, 16).toString('ascii');
  let w = 0, h = 0;
  if (kind === 'VP8X') { w = (bytes.readUIntLE(24, 3) & 0xFFFFFF) + 1; h = (bytes.readUIntLE(27, 3) & 0xFFFFFF) + 1; }
  else if (kind === 'VP8 ') { w = bytes.readUInt16LE(26) & 0x3FFF; h = bytes.readUInt16LE(28) & 0x3FFF; }
  else if (kind === 'VP8L') { const b = bytes.readUInt32LE(21); w = (b & 0x3FFF) + 1; h = ((b >> 14) & 0x3FFF) + 1; }
  assert.ok(w >= 600 && h >= 600,
    relative + ' must be a real scene, not a placeholder (got ' + w + 'x' + h + ')');
  assert.ok(bytes.length > 4000,
    relative + ' is too small to hold an image that size');
  checked += 4;
}
assert.ok(!/url\(\s*['"]?https?:/i.test(css),
  'Motherhood backgrounds must not request third-party images');
checked++;
assert.deepEqual(missing, [], 'Missing Motherhood photography: ' + missing.join(', '));
checked++;
console.log('PASS Motherhood photo release gate: ' + checked + ' checks, 4 local scenes');
