/* Run with: node tests/rhythm-planner.test.js
 * No packages or production data needed.
 */
'use strict';
const assert=require('node:assert/strict');
const {planDay}=require('../rhythm-planner.js');
const windows=[{start:540,end:660,energy:'high'},{start:780,end:900,energy:'low'}];
const p=planDay({windows,tasks:[{title:'Study',minutes:60,kind:'deep'},{title:'Walk',minutes:30,kind:'rest'}],busy:[{start:540,end:570}]});
assert.deepEqual(p.scheduled.map(x=>[x.title,x.start,x.end]),[['Study',570,630],['Walk',780,810]]);
assert.equal(p.unscheduled.length,0);
const full=planDay({windows:[{start:600,end:630,energy:'high'}],tasks:[{title:'Long task',minutes:60,kind:'deep'}]});
assert.equal(full.unscheduled.length,1);
assert.throws(()=>planDay({windows:[{start:500,end:600,energy:'high'},{start:550,end:650,energy:'low'}],tasks:[]}),/Overlapping/);
assert.throws(()=>planDay({windows,tasks:[{title:'',minutes:20,kind:'deep'}]}),/Invalid task/);
assert.throws(()=>planDay({windows,tasks:[],busy:[{start:700,end:600}]}),/Invalid busy/);
console.log('Rhythm planner tests passed');
