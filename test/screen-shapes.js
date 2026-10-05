/**
 * Every screen shape, including the fold.
 *
 * The invariant is simple and absolute: the app must never scroll sideways.
 * A page that can be dragged left and right feels broken in a way people
 * rarely report and always notice.
 *
 * It was being broken at 320px by a flexbox default — a flex item is
 * min-width:auto, so the page heading refused to shrink below its own title
 * and pushed the topbar wider than the screen. Four views could be dragged
 * sideways on an iPhone SE and nothing in the layout looked wrong.
 *
 * The fold cases matter because the iPhone Duo changes viewport size while
 * the app is running: the layout has to survive a resize mid-session, the
 * starfield has to rebuild at the new size, and whatever the person was
 * doing has to still be there afterwards.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

// Seeded as an enrolled device: without a study block the app opens into
// fieldwork onboarding, which is correct behaviour and would block every
// check below. The seed stays at version 2 on purpose, so each run also
// exercises the v2 -> v3 migration.
const SEED = `(()=>{localStorage.setItem('sleepsphere_state_v2', JSON.stringify({
  version:2, settings:{welcomeSeen:true, openingOff:true, mode:'dark'}, study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}));})()`;

const VIEWS = ['today','bio','plan','travel','unload','morning',
               'twin','compass','experiment','learn','data','test'];

// The smallest phones still in daily use, through to a laptop.
const SIZES = [
  ['iPhone SE',        320,  568],
  ['iPhone 13 mini',   375,  812],
  ['iPhone 15/16',     393,  852],
  ['iPhone Pro Max',   430,  932],
  ['iPad portrait',    820, 1180],
  ['iPad landscape',  1180,  820],
  ['MacBook',         1440,  900],
  // Below anything Apple ships, as a margin of safety.
  ['narrower than any phone', 280, 650]
];

// iPhone Duo. Apple states the aspect ratio is the same on both displays,
// so unfolding scales rather than reshapes — but the viewport still changes
// while the app is running, which is the part that breaks things.
const OUTER = { width: 372, height:  806 };   // 5.4in, closed
const INNER = { width: 524, height: 1135 };   // 7.6in, open
const SPLIT = { width: 262, height: 1135 };   // Split View, half the inner
const TENT  = { width:1135, height:  524 };   // tent / landscape

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });

  const sweep = async (p) => {
    let worst = 0;
    for (const view of VIEWS) {
      await p.evaluate(v => document.querySelector(`.nav button[data-view="${v}"]`)?.click(), view);
      await p.waitForTimeout(140);
      worst = Math.max(worst, await p.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth));
    }
    return worst;
  };

  // ---- Fixed sizes.
  for (const [name, width, height] of SIZES) {
    const ctx = await b.newContext({ viewport:{ width, height }, deviceScaleFactor:2 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(SEED);
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(800);
    const over = await sweep(p);
    check(`${name} never scrolls sideways`, over <= 1, `${over}px on the worst view`);
    check(`${name} runs clean`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---- The fold, as a sequence rather than as separate sizes.
  const ctx = await b.newContext({ viewport: OUTER, deviceScaleFactor: 3 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(SEED);
  await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
  await p.waitForTimeout(900);

  // Start something, so the unfold has state to lose.
  await p.locator('#lazyStart').click();
  await p.waitForTimeout(400);
  await p.evaluate(() => { document.getElementById('lazyVeil').hidden = true; });
  const before = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('sleepsphere_state_v2')).lazyNight);

  const pose = async (label, size) => {
    await p.setViewportSize(size);
    await p.waitForTimeout(900);
    const over = await sweep(p);
    const stars = await p.evaluate(() =>
      window.__starProbe().fields.find(f => f.id === 'starfield').onScreen);
    check(`${label} never scrolls sideways`, over <= 1, `${over}px`);
    return stars;
  };

  const closed  = await pose('Folded (5.4in)', OUTER);
  const open    = await pose('Unfolded (7.6in)', INNER);
  const split   = await pose('Split View', SPLIT);
  await pose('Tent / landscape', TENT);
  await pose('Folded again', OUTER);

  // Unfolding must not cost the person what they were doing.
  const after = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('sleepsphere_state_v2')).lazyNight);
  check('An open night survives the fold', after && after.bedTime === before.bedTime,
        `${before?.bedTime} then ${after?.bedTime}`);

  // A bigger screen should get more sky, not the same stars stretched — which
  // is what happens if the canvas resizes without rebuilding its field.
  check('The sky rebuilds for the new screen', open > closed && split < closed,
        `${closed} folded, ${open} open, ${split} in Split View`);
  check('No errors through the whole sequence', errs.length === 0, errs.join(' | '));
  await ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
