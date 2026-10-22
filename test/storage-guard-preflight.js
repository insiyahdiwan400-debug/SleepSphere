/**
 * Storage guard preflight: checks real loadState/saveState in index.html.
 * Run after applying tools/apply-storage-guard.js:
 *   node test/storage-guard-preflight.js
 * No browser, user data, or dependencies required.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(start,end) {
  const a=html.indexOf(start),b=html.indexOf(end,a);
  if(a<0||b<0)throw Error('Missing function '+start);
  return html.slice(a,b);
}
const loadCode=extract('    function loadState() {','\n    let state = loadState();');
const saveCode=extract('    function saveState() {','\n    function toast(');
const loadFactory=new Function('store','STORAGE_KEY','SCHEMA_VERSION','safeParse','clone','defaults','shapeState','migrateTwoToThree','uid',loadCode+'\nreturn loadState;');
const saveFactory=new Function('store','STORAGE_KEY','state','loadState','renderStorageWarning','toast',saveCode+'\nreturn saveState;');
const cases=[
 ['normal v3','{"version":3,"mornings":[{"id":"keep"}]}',false],
 ['corrupt','{"version":3,',true],
 ['future v4','{"version":4,"mornings":[{"id":"keep"}]}',true],
 ['unknown schema','{"mornings":[{"id":"keep"}]}',true],
 ['legacy v2','{"version":2,"mornings":[{"id":"keep"}]}',false],
 ['unsupported v1','{"version":1}',true],
 ['empty object','{}',true],
 ['JSON null','null',true],
 ['new install',null,false]
];
let passed=0;
for(const [name,raw,protect] of cases){
  let saved=raw,writes=0,warnings=0;
  const store={get:()=>saved,set:(key,value)=>{saved=value;writes++;return true;}};
  const defaults={version:3,mornings:[],settings:{},study:{}};
  const clone=x=>JSON.parse(JSON.stringify(x));
  const load=loadFactory(store,'sleepsphere_state_v2',3,
    (x,f)=>{try{return x?JSON.parse(x):f;}catch{return f;}},
    clone,defaults,
    x=>({...clone(defaults),...x,version:3}),
    x=>({...clone(defaults),...x,version:3}),
    ()=>'test-id');
  const state=load();
  const save=saveFactory(store,'sleepsphere_state_v2',state,load,
    ()=>warnings++,()=>{});
  const result=save();
  const ok=protect
    ? result===false&&writes===0&&saved===raw&&warnings===1
    : result===true&&writes===1;
  if(ok)passed++;
  console.log((ok?'PASS ':'FAIL ')+name);
}
console.log(passed+'/'+cases.length+' passed');
if(passed!==cases.length)process.exitCode=1;
