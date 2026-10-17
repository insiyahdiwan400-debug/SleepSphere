/**
 * Preview the storage-guard patch without modifying index.html.
 *
 * node test/storage-guard-patch-preview.js
 *
 * The summary deliberately distinguishes "patch passes in memory" from
 * "patch integrated into the app". A green preview is NOT a deployment.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const original = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const patcher = fs.readFileSync(path.join(root, 'tools/apply-storage-guard.js'), 'utf8');
let html = original;
const integrated = html.includes('loadState.protectedRaw = raw;')
  && html.includes('loadState.unsupportedVersion');
if (!integrated) {
  const rules = [...patcher.matchAll(/change\(\s*`([\s\S]*?)`,\s*`([\s\S]*?)`\s*\);/g)];
  if (rules.length !== 5) throw new Error('Expected five exact patch anchors');
  for (const [, before, after] of rules) {
    const pos = html.indexOf(before);
    if (pos < 0 || html.indexOf(before, pos + 1) !== -1)
      throw new Error('Missing or ambiguous patch anchor: ' + before.slice(0, 50));
    html = html.replace(before, after);
  }
}
function extract(start, end) {
  const i = html.indexOf(start), j = html.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('Missing app function ' + start);
  return html.slice(i, j);
}
const loadFactory = new Function(
  'store','STORAGE_KEY','SCHEMA_VERSION','safeParse','clone','defaults',
  'shapeState','migrateTwoToThree','uid',
  extract('    function loadState() {', '\n    let state = loadState();') + '\nreturn loadState;'
);
const saveFactory = new Function(
  'store','STORAGE_KEY','state','loadState','renderStorageWarning','toast',
  extract('    function saveState() {', '\n    function toast(') + '\nreturn saveState;'
);
const cases = [
  ['normal v3', '{"version":3,"mornings":[{"id":"keep"}]}', false],
  ['corrupt JSON', '{"version":3,', true],
  ['future v4', '{"version":4,"mornings":[{"id":"keep"}]}', true],
  ['unknown schema', '{"mornings":[{"id":"keep"}]}', true],
  ['legacy v2', '{"version":2,"mornings":[{"id":"keep"}]}', false],
  ['unsupported v1', '{"version":1}', true],
  ['empty object', '{}', true],
  ['JSON null', 'null', true],
  ['new install', null, false],
  ['array state', '[{"version":3}]', true],
  ['future v5', '{"version":5,"study":{"participantId":"P014"}}', true],
  ['valid v3 participant', '{"version":3,"study":{"participantId":"P014"},"mornings":[{"id":"sleep1"}]}', false]
];
let passed = 0;
for (const [name, raw, protect] of cases) {
  let saved = raw, writes = 0, warnings = 0;
  const store = {
    get: key => key === 'sleepsphere_state_v2' ? saved : null,
    set: (key, value) => { saved = value; writes++; return true; }
  };
  const defaults = { version: 3, mornings: [], settings: {}, study: {} };
  const clone = value => JSON.parse(JSON.stringify(value));
  const load = loadFactory(store, 'sleepsphere_state_v2', 3,
    (value, fallback) => { try { return value ? JSON.parse(value) : fallback; }
      catch { return fallback; } },
    clone, defaults,
    value => ({ ...clone(defaults), ...value, version: 3 }),
    value => ({ ...clone(defaults), ...value, version: 3 }),
    () => 'test-id');
  const state = load();
  const save = saveFactory(store, 'sleepsphere_state_v2', state, load,
    () => warnings++, () => {});
  const result = save();
  const ok = (protect
    ? result === false && writes === 0 && saved === raw && warnings === 1
    : result === true && writes === 1)
    && (!name.includes('participant') || state.study.participantId === 'P014');
  if (ok) passed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
}
console.log('\n' + passed + '/' + cases.length + ' passed');
console.log(integrated
  ? 'INTEGRATED: tests exercised the current index.html.'
  : 'PREVIEW ONLY: tests exercised an in-memory patch. index.html is still unprotected.');
if (passed !== cases.length) process.exitCode = 1;
