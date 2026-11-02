// Guard the Goodnight storage fallback without changing participant data.
// Run: node tests/bedtime-storage-fallback.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf("function startLazyNight(source = 'goodnight')");
const end = html.indexOf('/** Offer the one-tap morning', start);
assert(start >= 0 && end > start, 'Goodnight implementation missing');
const body = html.slice(start, end);
assert.match(body, /if \(previousNight\?\.startedAt\)/, 'must preserve an open night');
assert.match(body, /const persisted = saveState\(\)/, 'must check save result');
assert.match(body, /NOT saved/, 'must warn when a night is only in memory');
assert.match(body, /return persisted;/, 'must report actual persistence');
assert.doesNotMatch(body, /state\.lazyNight = previousNight;/, 'must not discard in-memory night on failed save');
console.log('PASS Goodnight storage fallback source guards (5)');
