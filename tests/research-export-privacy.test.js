'use strict';
// Regression tests for the research CSV privacy boundary.
// Run: node tests/research-export-privacy.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('index.html','utf8');
const helper = source.match(/function researchExperimentName\(experiment\) \{[\s\S]*?\n    \}/);
assert.ok(helper, 'researchExperimentName must exist in the shipped app');
assert.match(source,/cell\(record\?\.experimentId\), cell\(researchExperimentName\(experiment\)\)/,
  'Study export must use the privacy helper rather than experiment.name');
const catalog = {phone:{name:'Phone parking'},room:{name:'One-factor room reset'}};
const name = new Function('experimentCatalog',helper[0]+'; return researchExperimentName;')(catalog);
const cases = [
  [null,''],
  [{catalogKey:'custom',name:'My address and name'},'custom'],
  [{catalogKey:'phone',name:'Participant name'},'Phone parking'],
  [{catalogKey:'room',name:'Private notes'},'One-factor room reset'],
  [{catalogKey:'unknown',name:'Private information'},'']
];
for (const [value,expected] of cases) assert.equal(name(value),expected);
console.log('Research export privacy: '+cases.length+' cases passed.');
