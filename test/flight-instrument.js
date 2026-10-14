/**
 * Flight as WORLDS.md §5 specifies it.
 *
 * The world shipped as a photographic sky with a question on it, which
 * is why it was reported as "like the simple module but just a sky". The
 * spec asks for an instrument: a boarding pass with a perforated stub
 * carrying the one number worth anticipating, a route strip drawn to
 * scale from the model's own minutes with Fajr as the single amber tick,
 * and a split-flap board whose live row flips once.
 *
 * The to-scale claim is the one most worth testing, because it is the
 * one most easily faked. Positions are checked against arithmetic.
 *
 * Needs the repository served at :8099.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = 'http://localhost:8099/index.html';

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
};

/* A known night: wind 21:50, sleep 22:35, Fajr 04:45, back 05:10, up 06:30.
   Unwrapped that is 1310, 1355, 1725, 1750, 1830 — a span of 520 minutes. */
const PLAN = {
  mode: 'fajr', fajr: '04:45', returnSleep: '05:10', finalWake: '06:30',
  wakeAnchor: '04:45', savedDate: '2026-10-14', settle: 15, wind: 30,
  windStart: 1310, settleStart: 1340, sleepStart: 1355,
  blockOne: 400, blockTwo: 80, total: 480, target: 480,
  afterFajr: 'return', brainDay: 'hifz',
  obligation: { kind: 'jamea', time: '07:30' }, source: 'build-my-night'
};
const EXPECT = { wind: 0, sleep: 45 / 520, fajr: 415 / 520, return: 440 / 520, wake: 1 };

const SEED = `(()=>{try{localStorage.setItem('sleepsphere_state_v2',JSON.stringify({
 version:3,settings:{welcomeSeen:true,mode:'dark',openingOff:true,
   place:{latitude:25.2048,longitude:55.2708,name:'Dubai'}},
 plan:${JSON.stringify(PLAN)},
 mornings:[],morningRevisions:[],bioCheckins:[],thoughts:[],scans:[],feedback:[],
 experimentHistory:[],trip:null,
 study:{onboarded:true,participantId:'FI',cohort:'jamea-v1',schemaVersion:3,storageMode:'local'}}));
 localStorage.setItem('ss_world','flight');localStorage.setItem('ss_ui','classic');
 localStorage.setItem('ss_concept','off');}catch(e){}})()`;

const clockAt = (h, m) => `(()=>{const R=Date;const f=new R(2026,9,14,${h},${m || 30},0);
 class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
 static now(){return f.getTime();}} window.Date=D;})()`;

async function open(browser, hour, minute, opts) {
  const ctx = await browser.newContext(Object.assign({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  }, opts || {}));
  await ctx.addInitScript(clockAt(hour, minute));
  await ctx.addInitScript(SEED);
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3800);
  return { ctx, p, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });

  /* ================================================================
     1. The boarding pass exists, with its stub.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser, 22);
    const r = await p.evaluate(() => {
      const pass = document.querySelector('.fl-pass');
      const stub = document.querySelector('.fl-stub');
      return {
        pass: !!pass, stub: !!stub,
        total: (document.querySelector('.fl-stub-v') || {}).textContent || '',
        blocks: (document.querySelector('.fl-stub-c') || {}).textContent || '',
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        right: pass ? Math.round(pass.getBoundingClientRect().right) : null
      };
    });
    check('1 · The boarding pass is rendered', r.pass);
    check('1 · It has a stub', r.stub);
    check('1 · The stub carries the night length', r.total === '8h', r.total);
    check('1 · And the shape of the night, not a score',
      r.blocks === 'two blocks', r.blocks);
    check('1 · It fits the phone', r.overflow <= 0 && r.right <= 390,
      'overflow ' + r.overflow + ', right ' + r.right);
    check('1 · No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. The route strip is drawn to scale. Nothing is eyeballed.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 22);
    const ticks = await p.evaluate(() => {
      const strip = document.querySelector('.fl-route');
      if (!strip) return null;
      const w = strip.getBoundingClientRect().width;
      return [...strip.querySelectorAll('.fl-tick')].map(t => ({
        pct: parseFloat(t.style.left) / 100,
        fajr: t.classList.contains('fl-tick-fajr'),
        title: t.getAttribute('title') || ''
      }));
    });
    check('2 · The route strip is drawn', Array.isArray(ticks) && ticks.length === 5,
      ticks ? ticks.length + ' ticks' : 'absent');
    if (ticks && ticks.length === 5) {
      const want = [EXPECT.wind, EXPECT.sleep, EXPECT.fajr, EXPECT.return, EXPECT.wake];
      const worst = Math.max(...ticks.map((t, i) => Math.abs(t.pct - want[i])));
      check('2 · Every tick sits where the minutes put it',
        worst < 0.005,
        ticks.map((t, i) => (t.pct * 100).toFixed(1) + '% vs ' + (want[i] * 100).toFixed(1) + '%').join('  '));
      check('2 · Exactly one amber tick, and it is Fajr',
        ticks.filter(t => t.fajr).length === 1 && /Fajr/.test((ticks.find(t => t.fajr) || {}).title),
        (ticks.find(t => t.fajr) || {}).title);
    }
    await ctx.close();
  }

  /* ================================================================
     3. The split-flap board, and which row is live.

        The model's own `elapsed` is not wrap-corrected, so before this
        was computed independently the board lit Fajr, Back-to-sleep and
        Up all at once at half past ten at night.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 22);
    const rows = await p.evaluate(() => [...document.querySelectorAll('.fl-brow')].map(r => ({
      code: (r.querySelector('.fl-bcode') || {}).textContent,
      label: (r.querySelector('.fl-blabel') || {}).textContent,
      time: (r.querySelector('.fl-btime') || {}).textContent,
      live: r.classList.contains('fl-brow-live')
    })));
    check('3 · Five stages on the board', rows.length === 5, String(rows.length));
    check('3 · Each carries a code', rows.map(r => r.code).join(',') === 'WND,SLP,FJR,RTN,UP',
      rows.map(r => r.code).join(','));
    check('3 · Times are the model\'s own',
      rows.map(r => r.time).join(' ') === '9:50 PM 10:35 PM 4:45 AM 5:10 AM 6:30 AM',
      rows.map(r => r.time).join(' '));
    check('3 · Exactly one row is live', rows.filter(r => r.live).length === 1,
      String(rows.filter(r => r.live).length));
    await ctx.close();
  }

  for (const [hour, minute, want] of [
    [19, 30, null],    /* before wind down — nothing has happened yet */
    [22, 30, 'WND'],
    [23, 30, 'SLP'],
    [5, 30, 'RTN']
  ]) {
    const { ctx, p } = await open(browser, hour, minute);
    const live = await p.evaluate(() => {
      const r = document.querySelector('.fl-brow-live');
      return r ? (r.querySelector('.fl-bcode') || {}).textContent : null;
    });
    check('3 · At ' + hour + ':' + minute + ' the live row is ' + (want || 'none'),
      live === want, String(live));
    await ctx.close();
  }

  /* ================================================================
     4. One flip, and none at all under reduced motion.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 22);
    const n = await p.evaluate(() => document.querySelectorAll('.fl-flip').length);
    check('4 · Only the live row flips', n === 1, String(n));
    await ctx.close();
  }
  {
    const { ctx, p } = await open(browser, 22, 30, { reducedMotion: 'reduce' });
    const r = await p.evaluate(() => ({
      flips: document.querySelectorAll('.fl-flip').length,
      running: document.getAnimations().filter(a => a.playState === 'running').length,
      board: document.querySelectorAll('.fl-brow').length
    }));
    check('4 · Under reduced motion nothing flips', r.flips === 0, String(r.flips));
    check('4 · And the board is still fully there', r.board === 5, String(r.board));
    await ctx.close();
  }

  /* ================================================================
     5. The sky rests on the clock, not on the sleep phase.

        At 22:30 the phase is still EVENING, which used to paint a
        bright orange sunset on a screen someone reads at bedtime.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 22);
    const night = await p.evaluate(() => {
      /* .fl-canvas specifically. Picking "the first big canvas" lands on
         a sprite cache, which reports the same colour at every hour and
         so passes or fails for reasons that have nothing to do with the
         sky. That mistake has now cost two probes. */
      const c = document.querySelector('.fl-canvas');
      if (!c || !c.width) return null;
      const d = c.getContext('2d').getImageData(0, 0, c.width, Math.floor(c.height / 3)).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 31) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return [r / n, g / n, b / n];
    });
    check('5 · At half past ten at night the sky is dark',
      night && (night[0] + night[1] + night[2]) / 3 < 60,
      night ? night.map(v => Math.round(v)).join(',') : 'no canvas');
    check('5 · And is not a sunset',
      night && night[0] < night[2] + 30,
      night ? 'r ' + Math.round(night[0]) + ' vs b ' + Math.round(night[2]) : '');
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
