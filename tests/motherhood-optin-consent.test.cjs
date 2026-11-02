'use strict';
// Run from repository root: node tests/motherhood-optin-consent.test.cjs
// Isolated DOM simulation; does not replace an actual browser/device test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('motherhood-ui.js', 'utf8');
const start = source.indexOf('  function screenIntro() {');
const end = source.indexOf('  /* ==================================================================\n     3 · UNLOCK.', start);
assert.ok(start >= 0 && end > start, 'Motherhood consent and passcode screens exist');
const factory = new Function('M','el','card','input','btn','field','screen','toast',
  'setTimeout','cancelled','screenStage',
  source.slice(start,end) + '\nreturn {screenIntro,screenPasscode};');

function harness() {
  const nodes = [];
  let writes = 0, enabled = false, failWrite = false, stageOpened = false;
  function node(tag, text) {
    const n = {tag, textContent:text || '', children:[], events:{},
      value:'', checked:false, disabled:false,
      appendChild(x) { this.children.push(x); return x; },
      append(...xs) { this.children.push(...xs); },
      focus() { this.focused = true; },
      addEventListener(type, fn) { this.events[type] = fn; }};
    nodes.push(n); return n;
  }
  const el = (tag, cls, text) => node(tag, text);
  const card = parent => { const n=node('section'); parent.appendChild(n); return n; };
  const input = (type, attrs) => Object.assign(node('input'), {type}, attrs || {});
  const btn = (label, cls, fn) => { const n=node('button',label); n.click=fn; return n; };
  const field = (parent, label, n) => { parent.appendChild(n); return n; };
  const screen = title => node('screen', title);
  const M = { async createVault() {
    writes++;
    if (failWrite) throw new Error('storage unavailable');
    enabled = true;
  }};
  const api = factory(M,el,card,input,btn,field,screen,()=>{},()=>0,
    ()=>false,()=>{stageOpened=true;});
  return {api, nodes, find:t=>nodes.find(n=>n.textContent===t),
    get writes(){return writes;}, get enabled(){return enabled;},
    get stageOpened(){return stageOpened;},
    failWrites(){failWrite=true;}};
}
(async () => {
  const h=harness();
  h.api.screenIntro();
  assert.equal(h.writes,0,'intro must not write');
  assert.equal(h.enabled,false,'intro must not opt in');
  h.find('Continue').click();
  assert.equal(h.find('Choose a passcode'),undefined,'consent must be required');
  const consent=h.nodes.find(n=>n.id==='mhConsent');
  assert.ok(consent && !consent.checked,'consent starts unchecked');
  consent.checked=true;
  h.find('Continue').click();
  assert.ok(h.find('Choose a passcode'),'consent advances');
  const pass=h.nodes.filter(n=>n.type==='password');
  assert.equal(pass.length,2,'passcode requires confirmation');
  const create=h.find('Turn on Motherhood');
  pass[0].value='short';pass[1].value='short';
  await create.click();
  assert.equal(h.writes,0,'short passcode must not create vault');
  pass[0].value='longenough';pass[1].value='different';
  await create.click();
  assert.equal(h.writes,0,'mismatch must not create vault');
  pass[1].value='longenough';
  await create.click();
  assert.equal(h.writes,1,'matching passcodes create vault once');
  assert.ok(h.enabled && h.stageOpened,'successful creation advances');
  const failed=harness();
  failed.api.screenIntro();
  failed.nodes.find(n=>n.id==='mhConsent').checked=true;
  failed.find('Continue').click();
  const inputs=failed.nodes.filter(n=>n.type==='password');
  inputs[0].value='secret77';inputs[1].value='secret77';
  failed.failWrites();
  await failed.find('Turn on Motherhood').click();
  assert.equal(failed.writes,1,'failure path attempted one write');
  assert.equal(failed.enabled,false,'failed write must not enable module');
  assert.equal(failed.stageOpened,false,'failed write must not advance');
  console.log('PASS Motherhood consent/passcode: 12 assertions');
})().catch(e=>{console.error(e);process.exitCode=1;});
