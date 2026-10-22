'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('research-dashboard-safe.html', 'utf8');
function section(name, next) {
 const start = html.indexOf('function ' + name + '(');
 const end = html.indexOf(next, start);
 assert.ok(start >= 0 && end > start, 'missing ' + name);
 return html.slice(start, end);
}
const snippets = section('parseCSV', 'const byDay=') +
 section('studyRows', '/* Check a whole import') +
 section('mergeStudyRows', 'function render()');
const {studyRows, mergeStudyRows} = new Function(snippets +
 '\nreturn {studyRows,mergeStudyRows};')();
const header = 'participant_id,study_day,date,completed,sleep_minutes\n';
const row = (date, minutes) => 'P123,1,' + date + ',1,' + minutes + '\n';
const base = studyRows(header + row('2026-10-16',420));
const existing = new Map(mergeStudyRows(base,new Map()));
assert.equal(existing.size,1);
assert.equal(mergeStudyRows(base,existing).size,1);
assert.throws(() => mergeStudyRows(studyRows(header + row('2026-10-16',400)),existing),/Conflicting record/);
assert.equal(existing.get('P123|2026-10-16').sleep_minutes,'420');
assert.throws(() => studyRows(header + row('2026-02-30',420)),/Invalid calendar date/);
assert.throws(() => studyRows(header + row('2026-13-01',420)),/Invalid calendar date/);
assert.equal(studyRows(header + row('2028-02-29',420)).length,1);
assert.throws(() => mergeStudyRows(studyRows(header + row('2026-10-16',420) + row('2026-10-16',400)),new Map()),/Conflicting record/);
console.log('8/8 CSV import integrity checks passed');
