const { chromium } = require('/opt/node22/lib/node_modules/playwright');
/* Pinned to the middle of the afternoon. Today is contextual now: the night
   console — which holds #lazyStart and the hero starfield — belongs to the
   DAY and EVENING phases and is hidden at waking and at bedtime. Without a
   fixed clock these suites pass or fail depending on what time of day they
   happen to run, which is worse than either outcome. */
const DAY_PHASE = fixed => {
  const Real = Date; const held = new Real(fixed);
  window.Date = class extends Real {
    constructor(...a){ return a.length ? new Real(...a) : new Real(held); }
    static now(){ return held.getTime(); }
  };
};
/* Stated in UTC on purpose. These suites do not pin a timezone, so an offset
   like +04:00 lands at 09:00 for the browser — which is the WAKE phase, not
   the afternoon, and the console these checks need is hidden there. */
const AT_MIDDAY = '2026-10-06T13:00:00Z';

const SS='/tmp/claude-0/-home-user-SleepSphere/9483097f-d154-5857-9fe7-4e2fdcbbaab8/scratchpad/prayer';
require('fs').mkdirSync(SS,{recursive:true});
let fails=0; const check=(n,ok,x='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`);if(!ok)fails++;};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Europe/London'});
 const p=await ctx.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push('pageerror: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 await p.addInitScript(()=>{const R=Date;const f=new R(2026,11,15,21,0,0);class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}static now(){return f.getTime();}}window.Date=D;});
 await p.addInitScript(() => { window.goPlan = () => {
   document.querySelector('.nav button[data-view="data"]').click();
   document.querySelector('#data [data-go="plan"]').click(); }; });
 await p.goto('http://localhost:8099/index.html',{waitUntil:'networkidle'});
 await p.waitForTimeout(700);
 /* A genuinely fresh device now meets fieldwork onboarding first, so this
    test walks through it rather than seeding around it — which also keeps one
    suite exercising the real first-run path end to end. */
 await p.locator('[data-fw="1"] [data-fw-next]').click();
 await p.locator('#fwConsent').check();
 await p.locator('#fwConsentNext').click();
 await p.locator('#fwId').fill('P001');
 await p.locator('#fwIdNext').click(); await p.waitForTimeout(500);
 await p.locator('#fwStorageNext').click();
 await p.locator('#fwDone').click(); await p.waitForTimeout(400);
 await p.evaluate(()=>goPlan());
 await p.waitForTimeout(500);

 check('Prayer card asks for a location first', await p.locator('#prayerSetup').isVisible());
 check('Times are hidden until set', !(await p.locator('#prayerTimes').isVisible()));

 await p.locator('#enterLocation').click(); await p.waitForTimeout(250);
 await p.locator('#placeLat').fill('51.5074');
 await p.locator('#placeLon').fill('-0.1278');
 await p.locator('#placeName').fill('London');
 await p.locator('#savePlace').click(); await p.waitForTimeout(600);

 check('Times appear once located', await p.locator('#prayerTimes').isVisible());
 const times = await p.locator('.prayer-time').allInnerTexts();
 check('Fatimi view shows the combined structure', times.length===5 && /with Asr/.test(times.join(' ')) && /with Isha/.test(times.join(' ')) && /Nisf al-layl/i.test(times.join(' ')), times.map(t=>t.replace(/\n/g,' ')).join(' · '));
 check('Local timetable named as the authority', /your local timetable is the authority/.test(await p.locator('#prayerNote').innerText()));
 check('Headline names the place', /London/.test(await p.locator('#prayerHeadline').innerText()));

 // The plan must be built around TOMORROW's Fajr.
 const fajrField = await p.locator('#fajrTime').inputValue();
 const expected = await p.evaluate(()=>window.__prayerProbe(51.5074,-0.1278,2026,12,16,'seventh').fajr);
 check('Night plan auto-fills tomorrow morning’s Fajr', fajrField===expected, `field ${fajrField} vs tomorrow ${expected}`);
 check('Source is disclosed', /Calculated/.test(await p.locator('#fajrSource').innerText()));
 await p.screenshot({path:`${SS}/prayer_set.png`});

 // There is no method picker any more, by design: one community, one
 // convention, nothing to get wrong.
 check('No calculation-method picker is offered', (await p.locator('#prayerMethod').count())===0);
 check('No madhab or Hanafi option anywhere',
   !/hanafi|sunni|madhab|Muslim World League|ISNA/i.test(await p.locator('#plan').innerText()));
 // Fatimi Maghrib IS sunset — the Ithna-Ashari 4-degree rule is a quarter
 // of an hour late, which is what a Dawat timetable caught.
 check('Maghrib is sunset', await p.evaluate(()=>{
   const t = window.__prayerProbe(51.5074,-0.1278,2026,12,16,'seventh');
   return t.maghrib === t.sunset;
 }));
 check('Nisf al-layl halves sunset to sunrise', await p.evaluate(()=>{
   const t = window.__prayerProbe(51.5074,-0.1278,2026,12,16,'seventh');
   const m=x=>{const[h,n]=x.split(':').map(Number);return h*60+n;};
   const sp=(a,b)=>((m(b)-m(a))%1440+1440)%1440;
   return Math.abs(sp(t.sunset,t.nisf)*2 - sp(t.sunset,t.sunrise)) <= 2;
 }));

 // The Fajr field lives in Fajr Bridge mode, which is the whole point of it.
 await p.locator('#planMode button[data-mode="fajr"]').click();
 await p.waitForTimeout(400);
 check('Fajr Bridge mode reveals the Fajr field', await p.locator('#fajrTime').isVisible());
 check('Auto-filled value is there when it matters', (await p.locator('#fajrTime').inputValue()).length===5);

 // A hand-typed Fajr must not be overwritten.
 await p.locator('#fajrTime').fill('05:00');
 await p.waitForTimeout(300);
 await p.evaluate(()=>document.querySelector('.nav button[data-view="today"]').click());
 await p.waitForTimeout(300);
 await p.evaluate(()=>goPlan());
 await p.waitForTimeout(500);
 check('A hand-typed Fajr is respected', (await p.locator('#fajrTime').inputValue())==='05:00');
 check('And says so', /Set by you/.test(await p.locator('#fajrSource').innerText()));

 // Persistence
 await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(800);
 await p.evaluate(()=>goPlan());
 await p.waitForTimeout(500);
 await p.locator('#planMode button[data-mode="fajr"]').click();
 await p.waitForTimeout(300);
 check('Location survives a reload', /London/.test(await p.locator('#prayerHeadline').innerText()));

 console.log('\nCONSOLE ERRORS:', errs.length?JSON.stringify(errs):'none');
 if(errs.length) fails++;
 console.log(fails===0?'\nALL CHECKS PASSED':`\n${fails} FAILED`);
 await b.close(); process.exit(fails?1:0);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
