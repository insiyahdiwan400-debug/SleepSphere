'use strict';
// Run: node tests/flight-clock-scenes.test.cjs
// Isolated real-source test; does not verify real MP4 availability or Safari playback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('world-flight.js', 'utf8');
const begin = source.indexOf('  function flightSceneForTime(now) {');
const end = source.indexOf('  /* ── world ─', begin);
assert.ok(begin >= 0 && end > begin, 'Flight scene functions exist');
const snippet = source.slice(begin, end);
let now = new Date(2026, 9, 18, 17, 59);
const calls = [];
const state = { descending: false };
const video = {
  style: { display: 'none' },
  pause() { calls.push('pause'); },
  load() { calls.push('load'); },
  play() { calls.push('play'); return Promise.resolve(); },
  removeAttribute(key) { calls.push('remove:' + key); },
  set src(path) { calls.push('src:' + path); }
};
const footage = {
  daylight: 'assets/flight/daylight.mp4',
  golden: 'assets/flight/golden-hour.mp4',
  sunset: 'assets/flight/sunset.mp4',
  dusk: 'assets/flight/dusk.mp4'
};
const clock = new Function('Date', 'state', 'flightVideo', 'flightScene', 'FLIGHT_FOOTAGE',
  snippet + '\nreturn { flightSceneForTime, updateFlightFootage, scene: () => flightScene };')(
  function FakeDate() { return now; }, state, video, null, footage);
for (const [hour, minute, expected] of [
  [7, 0, 'daylight'], [15, 59, 'daylight'], [16, 0, 'golden'],
  [17, 59, 'golden'], [18, 0, 'sunset'], [19, 29, 'sunset'],
  [19, 30, 'dusk'], [20, 59, 'dusk'], [21, 0, null], [3, 0, null]
]) {
  assert.equal(clock.flightSceneForTime(new Date(2026, 9, 18, hour, minute)),
    expected, 'clock scene at ' + hour + ':' + minute);
}
clock.updateFlightFootage();
assert.equal(clock.scene(), 'golden', 'start at golden hour');
assert.ok(calls.includes('src:' + footage.golden), 'golden footage selected');
now = new Date(2026, 9, 18, 18, 0);
clock.updateFlightFootage();
assert.equal(clock.scene(), 'sunset', 'refresh selects sunset rather than cycling');
assert.ok(calls.includes('src:' + footage.sunset), 'sunset footage selected');
state.descending = true;
clock.updateFlightFootage();
assert.equal(clock.scene(), null, 'Descent removes video layer');
assert.ok(calls.includes('remove:src'), 'canvas fallback receives the scene');
console.log('Flight clock scenes: 17 assertions passed (source-level; no device video verification)');
