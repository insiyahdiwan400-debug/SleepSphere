'use strict';
// Run from the repository root: node tests/research-dashboard-csv-hardening.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('research-dashboard-safe.html', 'utf8');
const start = html.indexOf('function parseCSV(text) {');
const end = html.indexOf('\nconst byDay=', start);
assert.ok(start >= 0 && end > start, 'Dashboard CSV parser must exist');
const parseCSV = new Function(html.slice(start, end) + '\nreturn parseCSV;')();
let checks = 0;
function accepts(csv, expected) {
  assert.deepEqual(parseCSV(csv), expected);
  checks++;
}
function rejects(csv) {
  assert.throws(() => parseCSV(csv), /Malformed CSV field|Unclosed quoted field/);
  checks++;
}
accepts('a,b\n1,2\n', [['a','b'],['1','2']]);
accepts('a,b\r\n1,2\r\n', [['a','b'],['1','2']]);
accepts('a,b\n"hello, world",x', [['a','b'],['hello, world','x']]);
accepts('a,b\n"say ""hi""",x', [['a','b'],['say "hi"','x']]);
accepts('a,b\n"line1\nline2",x', [['a','b'],['line1\nline2','x']]);
accepts('a,b\n"line1\r\nline2",x', [['a','b'],['line1\r\nline2','x']]);
accepts('a,b\n\n1,2', [['a','b'],['1','2']]);
rejects('a,b\n"unterminated');
rejects('a,b\n"ok"x,y');
rejects('a,b\n"x" "y",z');
rejects('a,b\nx"y,z');
rejects('a,b\n"ok"\0,z');
rejects('a,b\nx\0,z');
rejects('a,b\n"x"z,y');
console.log(checks + '/14 research CSV hardening checks passed');
