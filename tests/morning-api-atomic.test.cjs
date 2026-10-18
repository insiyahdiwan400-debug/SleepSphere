'use strict';
// Run from repository root: node tests/morning-api-atomic.test.cjs
// Source-extracted regression tests. Real-device/browser tests are still needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('index.html', 'utf8');
const between = (start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'source section exists: ' + start.slice(0, 55));
  return source.slice(a, b);
};

const method = between('          recordMorning(answers, options) {',
  '\n\n          /* The journal');
const factory = new Function('flowPicks','finishWake','finishMorning','realMornings',
  'return ({' + method + '}).recordMorning;');
function simulate(quick, outcome, correction) {
  let records = [{id:'old',date: correction ? '2026-10-18' : '2026-10-17'}];
  let calls = 0, selected = null;
  function write(which) {
    calls++; selected = which;
    if (outcome === 'saved') {
      records = correction ? [{id:'new',date:'2026-10-18'}]
        : [...records,{id:'new',date:'2026-10-18'}];
    }
  }
  const fn = factory({},()=>write('quick'),()=>write('full'),()=>records);
  return {result:fn({rest:4,energy:3,focus:5},{quick}),records,calls,selected};
}
let h = simulate(false,'saved',false);
assert.equal(h.result.id,'new','full save returns new record');
assert.equal(h.selected,'full');
h = simulate(true,'saved',false);
assert.equal(h.result.id,'new','quick save returns new record');
assert.equal(h.selected,'quick');
h = simulate(false,'rejected',false);
assert.equal(h.result,null,'rejected save never returns yesterday');
assert.equal(h.records[0].id,'old','rejection preserves history');
h = simulate(true,'failed',false);
assert.equal(h.result,null,'failed quick save never returns yesterday');
h = simulate(false,'saved',true);
assert.equal(h.result.id,'new','correction returns replacement id');
assert.equal(h.records.length,1,'correction does not duplicate authoritative records');

const wakeBody = between('    function finishWake() {',
  '\n    /* One acknowledgement.');
let saveCalls = 0, activeWhileSaving = false;
let flowPicks = {};
let wake = new Function('flowPicks','finishMorning',
  'let finishingQuickWake = false;\n' + wakeBody +
  '\nreturn {finishWake, active:()=>finishingQuickWake};')(
  flowPicks,()=>{saveCalls++;activeWhileSaving=wake.active();});
wake.finishWake();
assert.equal(saveCalls,1,'quick wake invokes one save path');
assert.equal(activeWhileSaving,true,'quick flag is active during save');
assert.equal(wake.active(),false,'quick flag resets afterwards');
assert.equal(flowPicks.calm,'3','temporary calm satisfies shared validation');
const broken = new Function('flowPicks','finishMorning',
  'let finishingQuickWake = false;\n' + wakeBody +
  '\nreturn {finishWake, active:()=>finishingQuickWake};')(
  {},()=>{throw Error('simulated exception');});
assert.throws(()=>broken.finishWake(),/simulated exception/);
assert.equal(broken.active(),false,'quick flag resets even on exception');

const quickWrite = between('      if (finishingQuickWake) Object.assign(record, {',
  '      if (lazyCompletion) Object.assign(record, {');
const annotate = new Function('record','finishingQuickWake',
  quickWrite + '\nreturn record;');
const annotated = annotate({id:'new',calm:3},true);
assert.equal(annotated.calm,null,'unasked calm is not recorded as measured');
assert.equal(annotated.quick,true,'quick provenance saved');
assert.deepEqual(annotated.measured,[],'quick check-in measures no sleep times');
assert.deepEqual(annotated.estimated,
  ['bedTime','sleepTime','wakeTime','awakeMinutes']);
const full = annotate({id:'full',calm:4},false);
assert.equal(full.quick,undefined,'full record stays full');
assert.equal(full.calm,4,'full rating remains untouched');
const handler = between("    $('#saveMorning').addEventListener('click', () => {",
  '\n    /* finishLazyNight drives this same handler');
assert.ok(handler.indexOf('if (finishingQuickWake) Object.assign(record') <
  handler.indexOf('try { saved = saveState(); }'),
  'quick annotation occurs before durable save');
assert.ok(!wakeBody.includes('saveState()'),
  'quick wake does not make a second unprotected write');
console.log('PASS morning API and quick atomic write: 22 assertions');
