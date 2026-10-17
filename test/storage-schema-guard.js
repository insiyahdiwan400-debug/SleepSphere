/**
 * Data integrity regression: do not overwrite a state we cannot safely read.
 * Run from repository root: node test/storage-schema-guard.js
 *
 * This test intentionally fails until the app blocks writes when
 * loadState.corrupt or loadState.futureVersion is set. No user data is used.
 * Uses only Node built-ins and evaluates the two real functions from index.html.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function between(a, b) {
  const start = html.indexOf(a);
  const end = html.indexOf(b, start);
  if (start < 0 || end < 0) throw new Error('App function missing: ' + a);
  return html.slice(start, end);
}
const loadCode = between('    function loadState() {', '\n    let state = loadState();');
const saveCode = between('    function saveState() {', '\n    function toast(');
/* SCHEMA_VERSION joined the injected scope when the guard stopped
   hard-coding 3 in the future-version comparison. Without it the eval
   throws on the first case and the whole file reports as a crash rather
   than as a result. */
const loadFactory = new Function('store','STORAGE_KEY','safeParse','clone','defaults',
  'shapeState','migrateTwoToThree','uid','SCHEMA_VERSION',
  loadCode + '\nreturn loadState;');
const saveFactory = new Function('store','STORAGE_KEY','state','loadState',
  'renderStorageWarning','toast', saveCode + '\nreturn saveState;');

function runCase(name, raw, shouldPreserve) {
  let saved = raw, writes = 0;
  const store = {
    get: () => saved,
    set: (key, value) => { writes++; saved = value; return true; }
  };
  const defaults = { version: 3, mornings: [], thoughts: [], settings: {}, study: {} };
  const clone = x => JSON.parse(JSON.stringify(x));
  const load = loadFactory(store, 'sleepsphere_state_v2',
    (value, fallback) => { try { return value ? JSON.parse(value) : fallback; }
      catch { return fallback; } },
    clone, defaults,
    value => ({ ...clone(defaults), ...value, version: 3 }),
    value => ({ ...clone(defaults), ...value, version: 3 }), () => 'test-id', 3);
  const state = load();
  const save = saveFactory(store, 'sleepsphere_state_v2', state, load, () => {}, () => {});
  const result = save();
  const pass = shouldPreserve ? saved === raw && writes === 0 && result === false
    : writes === 1 && result === true;
  console.log((pass ? 'PASS ' : 'FAIL ') + name +
    ': writes=' + writes + ', original preserved=' + (saved === raw));
  return pass;
}
const cases = [
  ['normal v3 save', JSON.stringify({version:3,mornings:[{id:'keep'}],thoughts:[],settings:{}}), false],
  ['unreadable state must not be overwritten', '{"version":3,"mornings":', true],
  ['future v4 state must not be downgraded', JSON.stringify({version:4,mornings:[{id:'future'}],thoughts:[],settings:{}}), true],
  ['unrecognized schema must not be overwritten', JSON.stringify({mornings:[{id:'unknown'}]}), true],
  ['v2 migration can save', JSON.stringify({version:2,mornings:[{id:'old'}],thoughts:[],settings:{}}), false]
];
const passed = cases.filter(c => runCase(...c)).length;
console.log(passed + '/' + cases.length + ' passed');
if (passed !== cases.length) process.exitCode = 1;
