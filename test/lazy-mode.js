/**
 * Lazy mode: one tap at night, one tap in the morning, no questions between.
 *
 * The thing worth protecting here is that a lazy night is a REAL record, not
 * a placeholder — a complete morning with measured times, so it can sit in
 * the pattern, the week strip and an experiment alongside a hand-filled one.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const KEY = 'sleepsphere_state_v2';
const seed = extra => `(()=>{localStorage.setItem('${KEY}', JSON.stringify(Object.assign({
  version:2, settings:{welcomeSeen:true, openingOff:true, mode:'dark', target:480}, study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}, ${JSON.stringify(extra || {})})));})()`;

const clockAt = (y,mo,d,h,mi) => `(()=>{const R=Date;const f=new R(${y},${mo},${d},${h},${mi},0);
  class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
  static now(){return f.getTime();}} window.Date=D;})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (state, clock) => {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
                                     isMobile:true, hasTouch:true });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(seed(state));
    await p.addInitScript(clock);
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1100);
    return { ctx, p, errs };
  };
  const read = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

  // ---- Night: one tap, and it must not ask anything.
  const night = await open(null, clockAt(2026,8,9,23,40));
  check('The way out is on the first screen', await night.p.locator('#lazyStart').isVisible());
  await night.p.locator('#lazyStart').click();
  await night.p.waitForTimeout(400);
  check('Going to bed takes one tap', await night.p.locator('#lazyVeil').isVisible());
  const stored = (await read(night.p)).lazyNight;
  check('Bed time is stamped, not asked for', stored && stored.bedTime === '23:40', JSON.stringify(stored));
  check('Nothing else is asked', await night.p.evaluate(() =>
    document.querySelectorAll('#lazyVeil input, #lazyVeil select, #lazyVeil textarea').length === 0));
  check('No console errors', night.errs.length === 0, night.errs.join(' | '));
  await night.ctx.close();

  // ---- Morning: opening the app IS the wake stamp.
  const openNight = { lazyNight: { startedAt: new Date(2026,8,9,23,40,0).toISOString(), bedTime:'23:40' } };
  const morning = await open(openNight, clockAt(2026,8,10,7,12));
  check('The morning asks by itself', await morning.p.locator('#lazyMorningVeil').isVisible());
  check('Exactly three choices, nothing to type', await morning.p.evaluate(() =>
    document.querySelectorAll('[data-lazy-rate]').length === 3 &&
    document.querySelectorAll('#lazyMorningVeil input, #lazyMorningVeil select').length === 0));
  await morning.p.locator('[data-lazy-rate="3"]').click();
  await morning.p.waitForTimeout(700);
  const after = await read(morning.p);
  const rec = after.mornings.find(m => !m.demo);

  check('The night closes itself', after.lazyNight === null);
  check('It produces a real morning record', Boolean(rec), rec ? rec.date : 'none');
  // Measured, not recalled — the whole argument for this mode.
  check('Bed and wake times are the measured ones',
        rec.bedTime === '23:40' && rec.wakeTime === '07:12', `${rec.bedTime} to ${rec.wakeTime}`);
  check('Sleep maths is complete',
        rec.opportunityMinutes > 0 && rec.sleepMinutes > 0 && rec.efficiency > 0,
        `${rec.opportunityMinutes}m window, ${rec.sleepMinutes}m asleep, ${rec.efficiency}%`);
  // One answer is one answer. "How was it" is the restoration question, so
  // that is the only rating recorded — putting the same number into energy,
  // focus and calm would place three judgements nobody made into the compass
  // and the CSV export, indistinguishable from real ones.
  check('Only the rating actually given is stored', rec.rest === 3, `rest ${rec.rest}`);
  check('No judgements nobody made', rec.energy === null && rec.focus === null && rec.calm === null,
        `energy ${rec.energy}, focus ${rec.focus}, calm ${rec.calm}`);
  check('The record admits it came from one tap', rec.lazy === true);
  // Measured and estimated values must not sit in the record looking alike.
  check('It separates what was measured from what was inferred',
        rec.measured.includes('bedTime') && rec.measured.includes('wakeTime') &&
        rec.estimated.includes('sleepTime') && rec.estimated.includes('awakeMinutes'),
        `measured ${rec.measured} / estimated ${rec.estimated}`);
  // Assuming a perfect night would flatter every lazy record against the
  // hand-filled ones, purely because of how it was recorded.
  check('Efficiency is not assumed perfect', rec.efficiency < 100 && rec.awakeMinutes > 0,
        `${rec.efficiency}% with ${rec.awakeMinutes}m awake`);
  check('No console errors in the morning', morning.errs.length === 0, morning.errs.join(' | '));
  await morning.ctx.close();

  // ---- A nap is not a night.
  const nap = await open({ lazyNight: { startedAt: new Date(2026,8,10,6,30,0).toISOString(), bedTime:'06:30' } },
                         clockAt(2026,8,10,7,20));
  check('Fifty minutes is not treated as a night',
        !(await nap.p.locator('#lazyMorningVeil').isVisible()));
  check('And the night stays open', (await read(nap.p)).lazyNight !== null);
  await nap.ctx.close();

  // ---- Forgot to open the app for a day: "now" is no longer evidence.
  const stale = await open({ lazyNight: { startedAt: new Date(2026,8,9,23,40,0).toISOString(), bedTime:'23:40' } },
                           clockAt(2026,8,11,18,0));
  check('A day later it does not invent a 42-hour night',
        await stale.p.locator('#lazyMorningVeil').isVisible());
  const staleNight = (await read(stale.p)).lazyNight;
  check('It falls back to the planned wake and says so',
        staleNight.stale === true && staleNight.wakeTime !== '18:00', JSON.stringify(staleNight));
  check('And the screen admits the estimate',
        /estimated/i.test(await stale.p.locator('#lazyMorningTimes').innerText()));
  await stale.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
