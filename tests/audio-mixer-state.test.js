'use strict';
/* Regression for iOS AudioContext startup cancellation in the actual mixer.
   Run from repository root: node tests/audio-mixer-state.test.js
   Simulated UI only; cannot prove audible sound on a real iPad. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('explore.js','utf8');
const handler=source.match(/const on = btn\(spec\.label, 'ex-toggle', async \(\) => \{([\s\S]*?)\n      \}\);/)?.[1];
assert.ok(handler,'Sound mixer handler must be present');
const create=new Function('startSoundOrThrow','layerOn','on','slider','spec','stopSound','card','el',
  'return async function(){'+handler+'}');
async function check(label,started,live,expected){
 const classes=new Set(),attrs={};let lookups=0;
 const on={disabled:false,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},
   setAttribute:(k,v)=>{attrs[k]=v}};
 const slider={value:'60',disabled:true};
 const layerOn=()=>++lookups===1?false:live;
 const run=create(async()=>started,layerOn,on,slider,{id:'rain'},()=>{},
   {querySelector:()=>null,appendChild:()=>{}},()=>({dataset:{},setAttribute(){}}));
 await run();
 assert.equal(classes.has('on'),expected,label+' class');
 assert.equal(attrs['aria-pressed'],String(expected),label+' ARIA state');
 assert.equal(slider.disabled,!expected,label+' volume control');
 assert.equal(on.disabled,false,label+' button re-enabled');
}
(async()=>{
 await check('cancelled iOS resume',false,false,false);
 await check('success without live node',true,false,false);
 await check('genuine active sound',true,true,true);
 console.log('3/3 mixer state regression tests passed (simulated UI)');
})().catch(err=>{console.error(err);process.exitCode=1});
