/**
 * Storage, and admitting when there isn't any.
 *
 * The failure this guards against is the one that actually happened: the app
 * rendered perfectly, felt like it was working, and saved nothing. A person
 * used it for a night and a morning and came back to an empty app.
 *
 * Reading window.localStorage THROWS — before you touch a key — in Safari
 * Private Browsing, in a browser set to block site data, and in an embedded
 * frame on a browser with cross-site tracking prevention. The last one is how
 * this app is usually first opened, from a shared link inside another app.
 */
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

let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

// Storage that throws on access, like a blocked or partitioned frame.
const THROWS = `Object.defineProperty(window,'localStorage',{configurable:true,
  get(){ throw new DOMException('The operation is insecure.','SecurityError'); }});`;
// Storage that accepts every write and quietly discards it. Worse than
// throwing, because nothing anywhere reports a problem.
const DISCARDS = `(()=>{const m={};Object.defineProperty(window,'localStorage',{configurable:true,
  value:{setItem(){}, getItem(k){return m[k]||null;}, removeItem(){}, clear(){}, key(){return null;}, length:0}});})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (breakage) => {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    if (breakage) await p.addInitScript(breakage);
    await p.addInitScript(DAY_PHASE, AT_MIDDAY);
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1300);
    // Get past the first-run overlays, which are expected when nothing is stored.
    await p.evaluate(() => {
      document.getElementById('opening')?.remove();
      document.getElementById('welcomeOverlay')?.classList.remove('active');
      /* When storage is broken the seed never lands, so the app correctly
         treats this as an unenrolled device and opens fieldwork onboarding —
         which, equally correctly, refuses to let a study begin here. That
         refusal is tested in fieldwork.js; this suite is about whether the
         app itself keeps working in memory, so the overlay is dismissed. */
      document.getElementById('fieldwork')?.classList.remove('active');
    });
    await p.waitForTimeout(200);
    return { ctx, p, errs };
  };
  const bannerUp = p => p.locator('#storageWarning').isVisible();

  // ---- Storage that throws.
  const blocked = await open(THROWS);
  check('It says so, instead of pretending to save', await bannerUp(blocked.p));
  check('The warning names the fix', /own browser tab|Home Screen|Private/i.test(
    await blocked.p.locator('#storageWarning').innerText()));
  check('Nothing throws out of the app', blocked.errs.length === 0, blocked.errs.join(' | '));
  check('The app still renders', await blocked.p.evaluate(() => !!document.querySelector('.view.active')));
  // The session has to keep working — refusing to run would be worse than
  // running without persistence, and the person may want to export.
  /* Today is contextual now: going to bed is the moment's primary action
     during SLEEP and the console button during the day. Take whichever this
     hour offers, so the suite does not depend on when it runs. */
  await blocked.p.evaluate(() => {
    const bed = document.getElementById('lazyStart');
    if (bed && bed.offsetParent !== null) return bed.click();
    return document.getElementById('momentGo').click();
  });
  await blocked.p.waitForTimeout(900);
  /* Going to bed now passes through the dua on both of the screen's routes —
     "too tired" skips the planning, not the ritual — so the walk to the night
     is two taps. Walked in full here rather than seeded around, because the
     point of this check is that the whole path still works when storage is
     refusing to persist anything. */
  if (await blocked.p.locator('#duaVeil').isVisible()) {
    await blocked.p.locator('#duaAmin').click();
    await blocked.p.waitForTimeout(5400);
  }
  check('Lazy mode still works in memory', await blocked.p.locator('#lazyVeil').isVisible());
  check('There is a way to get the data out', await blocked.p.locator('#storageWarningExport').isVisible());
  await blocked.ctx.close();

  // ---- Storage that silently discards. A write that does not read back is
  // the quietest possible data loss, so the probe checks the round trip.
  const silent = await open(DISCARDS);
  check('A write that never reads back is caught too', await bannerUp(silent.p));
  check('Still no thrown errors', silent.errs.length === 0, silent.errs.join(' | '));
  await silent.ctx.close();

  // ---- Working storage: no banner, and data really persists.
  const fine = await open(null);
  check('No banner when storage works', !(await bannerUp(fine.p)));
  await fine.p.evaluate(() => localStorage.setItem('sleepsphere_state_v2', JSON.stringify({
    version:2, settings:{welcomeSeen:true, openingOff:true, mode:'dark', target:480}, study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
    mornings:[{id:'a', date:'2026-09-09', bedTime:'23:30', sleepTime:'23:45', wakeTime:'07:00',
               opportunityMinutes:450, sleepMinutes:420, efficiency:93, rest:4,
               awakeMinutes:12, demo:false, factors:[]}],
    bioCheckins:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
  })));
  await fine.p.reload({ waitUntil:'networkidle' });
  await fine.p.waitForTimeout(1200);
  check('A saved night survives a reload and is shown',
        await fine.p.evaluate(() => document.querySelectorAll('.trend-bar').length) === 1);
  await fine.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
