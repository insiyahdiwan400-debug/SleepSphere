'use strict';
// Research CSV parser regression suite. Run: node tests/research-dashboard-csv.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('research-dashboard.html','utf8');
const helper = source.match(/function parseCSV\(text\) \{[\s\S]*?\n\}/);
assert.ok(helper,'Dashboard CSV parser must be present');
const parseCSV = new Function(helper[0]+';return parseCSV;')();
assert.deepEqual(parseCSV('a,b\n1,2\n'),[['a','b'],['1','2']]);
assert.equal(parseCSV('a,b\n"one,two",3\n')[1][0],'one,two');
assert.equal(parseCSV('a\n"hello ""world"""\n')[1][0],'hello "world"');
assert.equal(parseCSV('a,b\r\n1,2\r\n').length,2);
assert.equal(parseCSV('a,b\n"one\ntwo",3\n')[1][0],'one\ntwo');
assert.throws(()=>parseCSV('a\n"unterminated'),/Unclosed quoted field/);
assert.throws(()=>parseCSV('x'.repeat(300001)),/File too large/);
console.log('Research dashboard CSV parser: 7 cases passed.');
