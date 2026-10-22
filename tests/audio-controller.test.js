'use strict';
/* Dependency-free regression suite for SleepSphere's actual explore.js audio controller.
   Run from the repository root: node tests/audio-controller.test.js
   Simulated AudioContext only; passing does NOT establish audible iPad playback. */
async function runAudioControllerTests(source) {
  const begin = source.indexOf('  const LIVE = new Map();');
  const end = source.indexOf('  /* The sleep timer fades', begin);
  if (begin < 0 || end < 0) throw new Error('Audio controller boundaries changed; update the test');
  const controller = source.slice(begin, end);
  const make = new Function('state', `
    let ctx = {state, resume: () => new Promise((resolve, reject) => {
      resumeOK = () => { ctx.state = 'running'; resolve(); };
      resumeFail = () => reject(new Error('resume failed'));
    })};
    let resumeOK, resumeFail;
    let nodes = [], created = [];
    const document = {hidden:false, getElementById:()=>null};
    const LAYERS = [{id:'rain'}, {id:'wind'}];
    const ensureContext = () => true;
    const startLayer = () => {
      const node = {stopped:false,src:{stop(){}},lfo:{stop(){}}};
      nodes.push(node); created.push(node); return node;
    };
    const stopLayer = node => {node.stopped=true;nodes=nodes.filter(n=>n!==node)};
    const renderPlayer = () => {};
    const el = () => ({setAttribute(){},textContent:''});
    ` + controller + `
    return {startSoundOrThrow,stopSound,stopEverySound,toggleSound,document,
      release:()=>resumeOK(),reject:()=>resumeFail(),
      stats:()=>({live:LIVE.size,pending:PENDING.size,created:created.length,
        stopped:created.filter(n=>n.stopped).length})};
  `);
  const check = (condition, message) => {if(!condition) throw new Error(message)};
  const results = [];
  async function test(name, fn) {await fn();results.push(name)}
  await test('normal suspended-context startup', async () => {
    const a=make('suspended'), p=a.startSoundOrThrow('rain');a.release();
    check(await p === true && a.stats().live===1,'normal startup failed');
  });
  await test('double tap reserves one pending generator', async () => {
    const a=make('suspended'), p=a.startSoundOrThrow('rain');
    check(await a.startSoundOrThrow('rain')===false,'second tap not rejected');
    check(a.stats().created===1 && a.stats().pending===1,'duplicate generator created');
    a.release();await p;
  });
  await test('Stop All cancels pending startup', async () => {
    const a=make('suspended'), p=a.startSoundOrThrow('rain');
    a.stopEverySound();a.release();
    check(await p===false && a.stats().live===0 && a.stats().pending===0,'cancel failed');
  });
  await test('toggle cancels pending sound', async () => {
    const a=make('suspended'),p=a.startSoundOrThrow('rain');
    check(await a.toggleSound('rain')===false,'toggle did not cancel');
    a.release();check(await p===false && a.stats().live===0,'cancelled sound restarted');
  });
  await test('backgrounding cancels startup', async () => {
    const a=make('suspended'),p=a.startSoundOrThrow('rain');
    a.document.hidden=true;a.release();
    check(await p===false && a.stats().live===0,'hidden document started audio');
  });
  await test('resume failure releases pending reservation', async () => {
    const a=make('suspended'),p=a.startSoundOrThrow('rain');
    a.reject();let failed=false;try{await p}catch{failed=true}
    check(failed && a.stats().pending===0 && a.stats().live===0,'failed resume leaked state');
  });
  await test('stop active sound clears registry', async () => {
    const a=make('suspended'),p=a.startSoundOrThrow('rain');a.release();await p;
    a.stopSound('rain');check(a.stats().live===0 && a.stats().stopped===1,'active stop failed');
  });
  await test('new startup works after cancellation', async () => {
    const a=make('suspended'),p=a.startSoundOrThrow('rain');a.stopEverySound();a.release();await p;
    const next=await a.startSoundOrThrow('rain');
    check(next===true && a.stats().live===1 && a.stats().created===2,'restart failed');
  });
  return results;
}
if (typeof require === 'function' && typeof module !== 'undefined' && require.main === module) {
  const fs=require('node:fs');
  const path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'..','explore.js'),'utf8');
  runAudioControllerTests(source).then(results=>{
    for(const name of results) console.log('PASS '+name);
    console.log(results.length+'/'+results.length+' audio regression tests passed');
  }).catch(error=>{console.error(error);process.exitCode=1});
}
