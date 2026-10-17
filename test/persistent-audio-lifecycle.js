/**
 * SleepSphere persistent-audio source regression.
 * Run: node test/persistent-audio-lifecycle.js
 * Source-level safety net only: this does not verify audible output on iOS.
 */
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'explore.js'), 'utf8');
function section(start, end) {
  const a = src.indexOf(start), b = src.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'Missing section: ' + start);
  return src.slice(a, b);
}
const close = section('function closeLayer() {', "document.addEventListener('visibilitychange'");
assert(!/^\s*stopAudio\s*\(/m.test(close), 'Closing Explore must not stop opted-in soundscapes');
assert(!/\bLIVE\.clear\s*\(/.test(close), 'Closing Explore must not clear the player registry');
console.log('PASS: Closing Explore preserves opted-in sound');
const mixer = section('function soundscape() {', 'function writing(kind) {');
assert(/active\s*=\s*\{\s*stop:\s*\(\)\s*=>\s*\{\s*\}\s*\}/.test(mixer),
  'Mixer teardown must not clear LIVE or stop sound');
console.log('PASS: Closing mixer preserves persistent playback');
const stop = section('function stopEverySound() {', 'function cancelFade() {');
assert(/LIVE\.forEach\(stopLayer\)/.test(stop) && /LIVE\.clear\(\)/.test(stop),
  'Stop all must stop nodes and clear the registry');
console.log('PASS: Explicit Stop all stops and clears sound');
const visibility = section("document.addEventListener('visibilitychange'", 'let ctx = null');
assert(/document\.hidden/.test(visibility) && /suspendAudio\(\)/.test(visibility),
  'Backgrounding must suspend audio');
console.log('PASS: Backgrounding suspends audio');
console.log('4 source-level audio lifecycle checks passed');
