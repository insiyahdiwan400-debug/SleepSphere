/**
 * The night sky.
 *
 * Everything here is asserted through window.__starProbe rather than by
 * reading pixels, because every star twinkles: the brightest point on the
 * canvas is a different star from one sample to the next, so pixel-chasing
 * measures the twinkle and calls it motion.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const SEED = `(()=>{localStorage.setItem('sleepsphere_state_v2',JSON.stringify({
  version:2, settings:{welcomeSeen:true, openingOff:true, mode:'dark'},
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
  const phone = await open(23, { width:390, height:844 });
  const a = await phone.p.evaluate(() => window.__starProbe());
  check('Hundreds of stars on a phone, not dozens', a.onScreen >= 250, `${a.onScreen} on screen of ${a.count}`);
  check('The canvas fills the viewport', await phone.p.evaluate(() => {
    const c = document.getElementById('starfield');
    return c.clientWidth === window.innerWidth && c.clientHeight === window.innerHeight;
  }));
  check('No horizontal overflow', await phone.p.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth));

  // Motion: slow, but genuinely moving. The numbers are the design — about a
  // couple of pixels a second at the edge of the field.
  await phone.p.waitForTimeout(5000);
  const later = await phone.p.evaluate(() => window.__starProbe());
  const drift = (later.spin - a.spin) * later.radius;
  check('The field turns, slowly', drift > 4 && drift < 40, `${drift.toFixed(1)}px at the edge over 5s`);

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
  await phone.ctx.close();

  // The loop must not run through the day, when the canvas is invisible
  // anyway. This is the difference between a nice background and a battery
  // complaint.
  const day = await open(13, { width:390, height:844 });
  const d = await day.p.evaluate(() => window.__starProbe());
  check('Paused in daylight', d.running === false, `--stars is 0 at 13:30`);
  await day.ctx.close();

  // Reduced motion: still a sky, just a still one.
  const still = await open(23, { width:390, height:844 }, true);
  const s1 = await still.p.evaluate(() => window.__starProbe());
  await still.p.waitForTimeout(2500);
  const s2 = await still.p.evaluate(() => window.__starProbe());
  check('Reduced motion is honoured', s1.spin === s2.spin && s2.reduced,
        `spin held at ${s2.spin}`);
  check('And the stars are still there', s1.onScreen >= 250, `${s1.onScreen} on screen`);
  await still.ctx.close();

  // A wider screen gets more sky, not bigger stars.
  const wide = await open(23, { width:1440, height:900 });
  const wsp = await wide.p.evaluate(() => window.__starProbe());
  check('Density holds on a large screen', wsp.onScreen > a.onScreen,
        `${wsp.onScreen} vs ${a.onScreen} on the phone`);
  await wide.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
