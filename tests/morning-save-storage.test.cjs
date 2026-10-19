#!/usr/bin/env node
/** SleepSphere morning persistence regression. Run: node tests/morning-save-storage.test.cjs
 * Extracts the actual saveMorning handler from index.html. Uses mocks only.
 * No participant data, network, browser storage, or external dependencies.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const marker = "$('#saveMorning').addEventListener('click', () => {";
const start = html.indexOf(marker);
assert(start >= 0, 'saveMorning handler not found');
const end = html.indexOf('\n    });', start);
assert(end > start && end - start < 12000, 'saveMorning handler end not found');
const handlerCode = html.slice(start, end + '\n    });'.length);

function run({ existing = false, storageWorks = false } = {}) {
  const events = [];
  let click;
  const fields = {
    '#logDate': { value: '2026-10-18' },
    '#actualBed': { value: '23:00' },
    '#actualSleep': { value: '23:15' },
    '#actualWake': { value: '07:00' },
    '#napMinutes': { value: '0' },
    '#morningNote': { value: 'test' },
    '#fajrStatus': { value: 'yes' },
    '#sleepUnknown': { checked: false },
  };
  const old = { id: 'old', date: '2026-10-18', demo: false, rest: 3, experimentId: 'exp1' };
  const state = {
    mornings: existing ? [old] : [], morningRevisions: [],
    lazyNight: { date: '2026-10-18', wakeTime: '07:00' },
    bioCheckins: [], brainDays: {},
    settings: { target: 480, intent: 'restore' }, plan: null,
    activeExperiment: { id: 'exp1', baselineIds: existing ? ['old'] : [] },
    experimentHistory: [],
  };
  const before = JSON.stringify(state);
  const ctx = {
    $: selector => selector === '#saveMorning'
      ? { addEventListener: (event, callback) => { assert.equal(event, 'click'); click = callback; } }
      : (fields[selector] || { value: '' }),
    ratings: { rest: 3, energy: 3, focus: 3, calm: 3 },
    state, selectedFactors: new Set(), supersedeWithoutAsking: false,
    /* finishingQuickWake joined finishingLazyNight in index.html after
       this harness was written, and `with(ctx)` has no fallback for a
       name the context does not carry — so the handler threw on its
       first reference and all three cases failed without ever reaching
       what they were written to check. The app defines it correctly
       (index.html, `let finishingQuickWake = false`); it was only
       missing from the scope this test builds around the handler. */
    finishingLazyNight: false, finishingQuickWake: false,
    window: { confirm: () => true },
    toast: message => events.push('toast:' + message),
    morningEstimate: () => ({ opportunityMinutes: 480, awakeMinutes: 0, sleepMinutes: 450, efficiency: 94 }),
    toMinutes: t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)),
    spanMinutes: () => 15, uid: () => 'new',
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    clone: v => JSON.parse(JSON.stringify(v)),
    archiveMorning: (record, replacement) => {
      state.morningRevisions = [...state.morningRevisions, { ...record, supersededBy: replacement }];
      state.activeExperiment.baselineIds = state.activeExperiment.baselineIds.map(id => id === record.id ? replacement : id);
    },
    saveState: () => { events.push('save:' + storageWorks); return storageWorks; },
    clearMorningForm: () => events.push('clear'),
    renderAll: () => events.push('render'),
  };
  new Function('ctx', 'with(ctx){\n' + handlerCode + '\n}')(ctx);
  assert.equal(typeof click, 'function', 'saveMorning listener not registered');
  click();
  return { state, before, events };
}
const cases = [
  ['failed new record leaves state and form intact', () => {
    const { state, before, events } = run({ storageWorks: false });
    assert.equal(JSON.stringify(state), before, 'failed write mutated participant state');
    assert(!events.includes('clear'), 'failed write cleared the form');
    assert(!events.some(x => /^toast:(?:Morning record saved|Updated\.)/.test(x)), 'failed write claimed success');
  }],
  ['failed correction preserves archive, baseline and unfinished night', () => {
    const { state, before, events } = run({ existing: true, storageWorks: false });
    assert.equal(JSON.stringify(state), before, 'failed correction mutated participant state');
    assert(!events.includes('clear'), 'failed correction cleared the form');
  }],
  ['successful correction saves record, history and acknowledgement', () => {
    const { state, events } = run({ existing: true, storageWorks: true });
    assert.deepEqual(state.mornings.map(x => x.id), ['new']);
    assert.equal(state.morningRevisions.length, 1);
    assert.deepEqual(state.activeExperiment.baselineIds, ['new']);
    assert(events.includes('clear'));
    assert(events.some(x => x.startsWith('toast:Updated.')));
  }],
];
let failed = 0;
for (const [name, test] of cases) {
  try { test(); console.log('PASS', name); }
  catch (error) { failed++; console.error('FAIL', name, '-', error.message); }
}
console.log(`${cases.length - failed}/${cases.length} morning persistence regression cases passed`);
if (failed) process.exitCode = 1;
