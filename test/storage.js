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
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1300);
    // Get past the first-run overlays, which are expected when nothing is stored.
    await p.evaluate(() => {
      document.getElementById('opening')?.remove();
      document.getElementById('welcomeOverlay')?.classList.remove('active');
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
  await blocked.p.locator('#lazyStart').click();
  await blocked.p.waitForTimeout(400);
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
    version:2, settings:{welcomeSeen:true, openingOff:true, mode:'dark', target:480},
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
