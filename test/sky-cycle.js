/**
 * The Flight sky cycle.
 *
 * Two defects this exists to stop coming back, both reported from a real
 * phone as "it was morning and then the sun dropped and it became night":
 *
 *   1. There was no daytime sky. Daytime resolved to t=0.08, which is the
 *      EVENING keyframe, so the app showed a sunset at noon.
 *   2. The scale was treated as a line rather than a cycle. Easing from
 *      morning (2.72) to daytime (0.08) walked BACKWARDS through night
 *      (2.0) and twilight (1.0), so night was genuinely drawn on the way
 *      from morning to midday.
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

const SEED = `(()=>{try{localStorage.setItem('sleepsphere_state_v2',JSON.stringify({
 version:3,settings:{welcomeSeen:true,mode:'dark',openingOff:true},mornings:[],morningRevisions:[],
 bioCheckins:[],thoughts:[],scans:[],feedback:[],experimentHistory:[],trip:null,
 study:{onboarded:true,participantId:'SKY',cohort:'jamea-v1',schemaVersion:3,storageMode:'local'}}));
 localStorage.setItem('ss_world','flight');localStorage.setItem('ss_ui','classic');
 localStorage.setItem('ss_concept','off');}catch(e){}})()`;

const clockAt = h => `(()=>{const R=Date;const f=new R(2026,9,13,${h},30,0);
 class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
 static now(){return f.getTime();}} window.Date=D;})()`;

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });

  /* ================================================================
     1. The keyframes, read straight from the module.
     ================================================================ */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(SEED);
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2000);

    const sky = await p.evaluate(() => {
      if (typeof window.SSSkyAt !== 'function') return { missing: true };
      const zenith = t => window.SSSkyAt(t).stops[0].slice(1);
      const blueish = c => c[2] > c[0] + 25;
      const dark = c => (c[0] + c[1] + c[2]) / 3 < 30;
      return {
        missing: false,
        evening: zenith(0), night: zenith(2), morning: zenith(3), day: zenith(4),
        dayIsBlue: blueish(zenith(4)),
        nightIsDark: dark(zenith(2)),
        /* Day must not be the evening sky, which is exactly what the bug
           was: two different times of day drawing one keyframe. */
        dayDiffersFromEvening: JSON.stringify(zenith(4)) !== JSON.stringify(zenith(0)),
        /* And it must be its own keyframe, not the last one clamped.
           Before the fix there were four skies, so asking for t=4 handed
           back MORNING — which is also blue, so a naive "is it blue?"
           check passed while the bug was still there. */
        dayIsNotMorning: JSON.stringify(zenith(4)) !== JSON.stringify(zenith(3)),
        count: (() => { let n = 0; while (n < 12 &&
          JSON.stringify(zenith(n)) !== JSON.stringify(zenith(n + 1))) n++; return n + 1; })(),
        /* Past the end it wraps to the start instead of clamping. */
        wrapsRound: JSON.stringify(zenith(5)) === JSON.stringify(zenith(0)),
        wrapsNegative: JSON.stringify(zenith(-1)) === JSON.stringify(zenith(4))
      };
    });

    check('1 · The sky module is reachable', !sky.missing);
    if (!sky.missing) {
      check('1 · A daytime sky exists and is blue',
        sky.dayIsBlue, 'zenith rgb(' + sky.day.join(',') + ')');
      check('1 · Daytime is not the evening keyframe', sky.dayDiffersFromEvening,
        'day ' + sky.day.join(',') + ' vs evening ' + sky.evening.join(','));
      check('1 · Daytime is its own keyframe, not the last one clamped',
        sky.dayIsNotMorning,
        'day ' + sky.day.join(',') + ' vs morning ' + sky.morning.join(','));
      check('1 · Night is actually dark', sky.nightIsDark,
        'zenith rgb(' + sky.night.join(',') + ')');
      check('1 · The scale wraps forward past the last sky', sky.wrapsRound);
      check('1 · And wraps backward before the first', sky.wrapsNegative);
    }
    await ctx.close();
  }

  /* ================================================================
     2. Moving between times of day never passes through night.

     The scene eases toward its target one frame at a time, so the whole
     path is sampled rather than just the destination. Night sits at 2;
     a move from morning to day must never put a frame near it.
     ================================================================ */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(SEED);
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2000);

    const walk = await p.evaluate(() => {
      const Scene = window.SSSky;
      if (typeof Scene !== 'function') return { missing: true };
      const canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 160;
      const scene = new Scene(canvas, { t: 3.15 });      /* just past sunrise */
      scene.stop();                                       /* drive it by hand */
      scene.target = 4.0;                                 /* daytime */
      const path = [];
      for (let i = 0; i < 400; i++) {
        scene.step(16, i * 16);
        path.push(+scene.t.toFixed(3));
        if (Math.abs(scene.t - 4.0) < 0.002) break;
      }
      scene.destroy();
      const near = v => path.filter(x => Math.abs(x - v) < 0.35).length;
      return {
        missing: false, frames: path.length,
        end: path[path.length - 1],
        throughNight: near(2.0),       /* night */
        throughTwilight: near(1.0),    /* twilight */
        min: Math.min(...path), max: Math.max(...path)
      };
    });

    check('2 · The scene is drivable', !walk.missing);
    if (!walk.missing) {
      check('2 · Morning reaches daytime', Math.abs(walk.end - 4.0) < 0.01, String(walk.end));
      check('2 · And never passes through night on the way',
        walk.throughNight === 0, walk.throughNight + ' frames near t=2');
      check('2 · Nor back through twilight',
        walk.throughTwilight === 0, walk.throughTwilight + ' frames near t=1');
      check('2 · The whole path stays between morning and day',
        walk.min >= 3.0 && walk.max <= 4.05,
        'range ' + walk.min + '..' + walk.max);
    }
    await ctx.close();
  }

  /* ================================================================
     3. Day into evening takes the short way round the cycle.
     ================================================================ */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(SEED);
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2000);
    const wrapWalk = await p.evaluate(() => {
      const Scene = window.SSSky;
      const canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 160;
      const scene = new Scene(canvas, { t: 4.0 });     /* day */
      scene.stop();
      scene.target = 0.30;                             /* evening */
      const path = [];
      for (let i = 0; i < 400; i++) {
        scene.step(16, i * 16);
        path.push(+scene.t.toFixed(3));
        const d = Math.abs(scene.t - 0.30);
        if (Math.min(d, 5 - d) < 0.01) break;
      }
      scene.destroy();
      return {
        frames: path.length,
        throughNight: path.filter(x => Math.abs(x - 2.0) < 0.35).length,
        throughMorning: path.filter(x => Math.abs(x - 3.0) < 0.35).length
      };
    });
    check('3 · Day settles into evening',
      wrapWalk.frames > 0 && wrapWalk.frames < 400, wrapWalk.frames + ' frames');
    check('3 · Going round the end, not back through morning',
      wrapWalk.throughMorning === 0, wrapWalk.throughMorning + ' frames near t=3');
    check('3 · And not through night', wrapWalk.throughNight === 0,
      wrapWalk.throughNight + ' frames near t=2');
    await ctx.close();
  }

  /* ================================================================
     4. On a real clock, the four times of day actually differ.
     ================================================================ */
  {
    const seen = {};
    for (const [name, hour] of [['morning', 8], ['day', 13], ['evening', 18], ['night', 23]]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await ctx.addInitScript(clockAt(hour));
      await ctx.addInitScript(SEED);
      const p = await ctx.newPage();
      await p.goto(BASE, { waitUntil: 'networkidle' });
      await p.waitForTimeout(4200);          /* let the ease settle */
      seen[name] = await p.evaluate(() => {
        const root = document.getElementById('world') || document.body;
        const canvas = root.querySelector('canvas') || document.querySelector('canvas');
        if (!canvas || !canvas.width) return null;
        const g = canvas.getContext('2d');
        let data;
        try { data = g.getImageData(0, 0, canvas.width, Math.floor(canvas.height / 4)).data; }
        catch (e) { return null; }
        let r = 0, gr = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4 * 29) { r += data[i]; gr += data[i + 1]; b += data[i + 2]; n++; }
        return [Math.round(r / n), Math.round(gr / n), Math.round(b / n)];
      });
      await ctx.close();
    }
    const got = Object.entries(seen).filter(([, v]) => v);
    check('4 · The sky canvas can be sampled at every time of day',
      got.length === 4, got.map(([k, v]) => k + '=' + (v || []).join(',')).join(' '));
    if (got.length === 4) {
      const key = v => v.join(',');
      const unique = new Set(got.map(([, v]) => key(v)));
      check('4 · The four times of day are not all one picture',
        unique.size >= 3, [...unique].join(' | '));
      const night = seen.night, day = seen.day;
      check('4 · Night is darker than day',
        (night[0] + night[1] + night[2]) < (day[0] + day[1] + day[2]),
        'night ' + night.join(',') + ' vs day ' + day.join(','));
    }
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
