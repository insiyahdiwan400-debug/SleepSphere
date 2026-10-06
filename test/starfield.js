/**
 * The night sky.
 *
 * Everything here is asserted through window.__starProbe rather than by
 * reading pixels, because every star twinkles: the brightest point on the
 * canvas is a different star from one sample to the next, so pixel-chasing
 * measures the twinkle and calls it motion.
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

// Seeded as an enrolled device: without a study block the app opens into
// fieldwork onboarding, which is correct behaviour and would block every
// check below. The seed stays at version 2 on purpose, so each run also
// exercises the v2 -> v3 migration.
const SEED = `(()=>{localStorage.setItem('sleepsphere_state_v2',JSON.stringify({
  version:2, settings:{welcomeSeen:true, openingOff:true, mode:'dark'}, study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}));})()`;

const clockAt = hour => `(()=>{const R=Date;const f=new R(2026,8,9,${hour},30,0);
  class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
  static now(){return f.getTime();}} window.Date=D;})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (hour, viewport, reduced) => {
    const ctx = await b.newContext({ viewport, deviceScaleFactor: 2,
                                     reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(SEED);
    await p.addInitScript(clockAt(hour));
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1200);
    return { ctx, p, errs };
  };

  // Density: the whole point of the change. A field of twenty dots reads as
  // wallpaper, which is what the tiled background did.
  const pick = (probe, id) => probe.fields.find(f => f.id === id);
  const phone = await open(23, { width:390, height:844 });
  const p0 = await phone.p.evaluate(() => window.__starProbe());
  const a = pick(p0, 'starfield');
  check('Hundreds of stars on a phone, not dozens', a.onScreen >= 250, `${a.onScreen} on screen of ${a.count}`);

  // The hero panel is a dark slab at every hour, and it used to carry a
  // regular 74px lattice of dots — the one pattern guaranteed to read as
  // "dots", on the largest surface in the app.
  const panel = pick(p0, 'console-stars');
  /* The panel lives inside the night console, which Today now shows during
     the DAY and EVENING phases and hides at waking and at bedtime. This probe
     runs at 23:00 — the SLEEP phase — so the console is deliberately away and
     its canvas has nothing to measure. What matters here is that the field
     still EXISTS and did not error; it is measured for real in daylight
     further down, where it is the only sky anyone can see. */
  check('The hero panel still has its own field', Boolean(panel),
        panel ? `${panel.onScreen} on the panel (console hidden at this hour)` : 'no panel field');
  check('No dot lattice survives anywhere', await phone.p.evaluate(() =>
    ![...document.styleSheets].some(sheet => {
      try { return [...sheet.cssRules].some(r => /background-size:\s*74px/.test(r.cssText)); }
      catch { return false; }
    })));
  check('The canvas fills the viewport', await phone.p.evaluate(() => {
    const c = document.getElementById('starfield');
    return c.clientWidth === window.innerWidth && c.clientHeight === window.innerHeight;
  }));
  check('No horizontal overflow', await phone.p.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth));

  /* Motion at bedtime is DELIBERATELY about a third of the daytime rate:
     this probe sits at 23:00, which is the SLEEP phase, and the sky settles
     with the person there. The full rate is measured in the evening context
     further down; what matters here is that it is slower and still moving —
     a sky frozen at bedtime would be a broken loop, not a calm one. */
  await phone.p.waitForTimeout(5000);
  const later = await phone.p.evaluate(() => window.__starProbe());
  const settledDrift = (later.spin - p0.spin) * a.radius;
  check('The field still turns at bedtime', settledDrift > 1 && settledDrift < 14,
        `${settledDrift.toFixed(1)}px at the edge over 5s`);

  // Twinkle: individual, so the field shimmers unevenly rather than pulsing.
  const shimmer = await phone.p.evaluate(() => new Promise(res => {
    const c = document.getElementById('starfield'), g = c.getContext('2d');
    const grab = () => g.getImageData(0, 0, c.width, c.height).data;
    const first = grab();
    setTimeout(() => {
      const second = grab();
      let changed = 0, lit = 0;
      for (let i = 3; i < first.length; i += 4) {
        if (first[i] > 40) lit++;
        if (Math.abs(first[i] - second[i]) > 10) changed++;
      }
      res({ changed, lit });
    }, 900);
  }));
  check('Stars twinkle', shimmer.changed > 500, `${shimmer.changed} pixels changed in 0.9s`);
  check('No console errors', phone.errs.length === 0, phone.errs.join(' | '));
  // Kept for the daylight comparison below, before this context is closed.
  const phoneStarsAtNight = await phone.p.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stars')));
  await phone.ctx.close();

  /* The full rate, measured where it applies: the evening, before the app
     starts closing the day. About a couple of pixels a second at the edge of
     the field is the design, and this is the number the bedtime check above
     is slower than. */
  const evening = await open(20, { width:390, height:844 });
  const e0 = await evening.p.evaluate(() => window.__starProbe());
  check('The evening is not a settling phase',
        !['SLEEP'].includes(await evening.p.evaluate(() => document.documentElement.dataset.phase))
        && !(await evening.p.evaluate(() => document.documentElement.dataset.settling)),
        await evening.p.evaluate(() => document.documentElement.dataset.phase));
  await evening.p.waitForTimeout(5000);
  const e1 = await evening.p.evaluate(() => window.__starProbe());
  const drift = (e1.spin - e0.spin) * pick(e0, 'starfield').radius;
  check('The field turns, slowly', drift > 4 && drift < 40,
        `${drift.toFixed(1)}px at the edge over 5s`);
  check('And faster than it does at bedtime', drift > settledDrift * 2,
        `${drift.toFixed(1)}px against ${settledDrift.toFixed(1)}px`);
  check('No console errors in the evening', evening.errs.length === 0, evening.errs.join(' | '));
  await evening.ctx.close();

  /* In daylight the page sky is faint rather than absent. It used to be
     switched off entirely to save the loop; the cost was that opening the
     app at noon showed no sky at all, which is most of when people open it.
     Faint is the compromise: present, and well under the night's brightness
     so it never competes with the text sitting on top of it. */
  const day = await open(13, { width:390, height:844 });
  const dp = await day.p.evaluate(() => window.__starProbe());
  const dayStars = await day.p.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stars')));
  const nightStars = phoneStarsAtNight;
  check('There is still a sky at midday', pick(dp,'starfield').active === true,
        `${pick(dp,'starfield').onScreen} on screen at 13:30`);
  check('But a much fainter one than at night', dayStars > 0 && dayStars < nightStars * 0.35,
        `${dayStars} at 13:30 against ${nightStars} at night`);
  // ...but the panel keeps its stars, because it is dark at every hour, and
  // in daylight it is the only sky anyone can see. Looking at the app at
  // noon and finding no stars at all is what made this look unchanged.
  check('The panel keeps its stars in daylight', pick(dp,'console-stars').active === true,
        `${pick(dp,'console-stars').onScreen} on the panel at 13:30`);
  await day.ctx.close();

  // Reduced motion: still a sky, just a still one.
  const still = await open(23, { width:390, height:844 }, true);
  const s1 = await still.p.evaluate(() => window.__starProbe());
  await still.p.waitForTimeout(2500);
  const s2 = await still.p.evaluate(() => window.__starProbe());
  check('Reduced motion is honoured', s1.spin === s2.spin && s2.reduced,
        `spin held at ${s2.spin}`);
  check('And the stars are still there', pick(s1,'starfield').onScreen >= 250,
        `${pick(s1,'starfield').onScreen} on screen`);
  await still.ctx.close();

  // A wider screen gets more sky, not bigger stars.
  const wide = await open(23, { width:1440, height:900 });
  const wsp = pick(await wide.p.evaluate(() => window.__starProbe()), 'starfield');
  check('Density holds on a large screen', wsp.onScreen > a.onScreen,
        `${wsp.onScreen} vs ${a.onScreen} on the phone`);
  await wide.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
