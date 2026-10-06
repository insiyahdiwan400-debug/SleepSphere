/**
 * The night: the Arabic face, and the evening drawing in.
 *
 * Two things that are easy to believe are working when they are not.
 *
 * 1. THE FACE. A webfont that fails to load falls back silently and the
 *    screen still looks fine — just set in whatever Arabic the device
 *    happens to ship, which is the situation this change exists to end. So
 *    the checks below do not ask what font-family says; they ask the browser
 *    which font it actually USED to draw the dua, and measure the glyphs to
 *    prove the file arrived.
 *
 * 2. THE RAMP. --dusk is meant to slide from the start of the evening to the
 *    planned sleep time so nothing ever steps at a phase boundary. A ramp
 *    that is secretly a switch looks identical in a screenshot, so it is
 *    sampled across a whole evening and checked for monotonicity, for the
 *    boundary being invisible, and for the chrome and the sky following it.
 *
 * And the brief's two remaining promises: that nothing is ever taken away as
 * the evening deepens, and that none of it costs battery.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const KEY = 'sleepsphere_state_v2';
const DEFAULT_SETTINGS = { welcomeSeen:true, openingOff:true, mode:'dark', target:480, faith:'on' };
const seed = extra => `(()=>{localStorage.setItem('${KEY}', JSON.stringify(Object.assign({
  version:2,
  settings:${JSON.stringify(DEFAULT_SETTINGS)},
  study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}, ${JSON.stringify(extra || {})})));})()`;

const clockAt = (h, mi) => `(()=>{const R=Date;const f=new R(2026,8,9,${h},${mi},0);
  class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
  static now(){return f.getTime();}} window.Date=D;})()`;

/* Wind-down 22:00, settle 23:00, up at 06:30. The evening therefore begins
   at 20:30 (EVENING_LEAD is 90 minutes) and the ramp runs 20:30 → 23:00. */
const PLAN = { plan: { mode:'continuous', wake:'06:30', savedDate:'2026-09-09',
                       windStart:1320, sleepStart:1380, brainDay:null } };

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (opts = {}) => {
    const ctx = await b.newContext({
      viewport: opts.viewport || { width:390, height:844 }, deviceScaleFactor:2,
      isMobile: !opts.viewport, hasTouch:true,
      reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
    const p = await ctx.newPage();
    const errs = [], missing = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('response', r => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
    if (opts.blockFont) await p.route('**/fonts/*.woff2', route => route.abort());
    await p.addInitScript(seed(opts.state || PLAN));
    await p.addInitScript(clockAt(opts.hour ?? 23, opts.minute ?? 30));
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1100);
    return { ctx, p, errs, missing };
  };

  /* ================================================================
     THE ARABIC FACE
     ================================================================ */
  const night = await open();
  check('Nothing 404s', night.missing.length === 0, night.missing.join(' | '));
  check('The font file is actually fetched', await night.p.evaluate(() =>
    performance.getEntriesByType('resource').some(r => /amiri-naskh[\w-]*\.woff2$/.test(r.name))));
  check('And it is small enough to ship at bedtime', await night.p.evaluate(() => {
    const r = performance.getEntriesByType('resource').find(x => /amiri-naskh[\w-]*\.woff2$/.test(x.name));
    return r && (r.encodedBodySize === 0 || r.encodedBodySize < 70000);
  }));
  check('The face is loaded, not merely requested',
        await night.p.evaluate(() => document.fonts.check('30px "Amiri Naskh"')));

  await night.p.locator('#momentGo').click();
  await night.p.waitForTimeout(1000);

  /* What the browser actually drew with. font-family is a wish; this is the
     answer, and it is the only check here that would fail if the file were
     missing, misnamed, blocked by the CSP, or corrupt. */
  const used = await night.p.evaluate(async () => {
    const el = document.getElementById('duaLine1');
    const fonts = await document.fonts.ready.then(() => [...document.fonts]
      .filter(f => f.family === 'Amiri Naskh').map(f => f.status));
    return { loaded: fonts, family: getComputedStyle(el).fontFamily,
             weight: getComputedStyle(el).fontWeight,
             spacing: getComputedStyle(el).letterSpacing };
  });
  check('The dua is set in Amiri', used.loaded.includes('loaded'), JSON.stringify(used.loaded));
  check('Named first, with the old system stack still behind it',
        /^"?Amiri Naskh"?,/.test(used.family) && /Geeza Pro/.test(used.family), used.family);
  /* Synthetic bold on a Naskh smears the joins and lands the marks wrong,
     and Amiri ships here in one weight, so nothing may ask for bold. */
  check('Nothing asks the Arabic for a weight it does not have',
        used.weight === '400', used.weight);
  /* letter-spacing is inserted between glyphs. In a cursive script that is a
     gap in the middle of a word. */
  check('No letter-spacing on the dua',
        used.spacing === 'normal' || parseFloat(used.spacing) === 0, used.spacing);

  const headingSpacing = await night.p.evaluate(() =>
    getComputedStyle(document.getElementById('duaHeading')).letterSpacing);
  check('Nor on the heading above it',
        headingSpacing === 'normal' || parseFloat(headingSpacing) === 0, headingSpacing);

  /* Shaping: that the subset kept the Arabic layout features. If init/medi/
     fina had been dropped the text would render as disconnected letters,
     which is far wider than the shaped form. Measured against the same
     string with shaping suppressed. */
  const shaped = await night.p.evaluate(() => {
    const make = (text, extra) => {
      const el = document.createElement('span');
      el.setAttribute('lang','ar'); el.dir = 'rtl';
      el.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;
        font-family:"Amiri Naskh";font-size:40px;${extra || ''}`;
      el.textContent = text; document.body.appendChild(el);
      const w = el.getBoundingClientRect().width; el.remove(); return w;
    };
    const joined = make('اللهم');
    // Zero-width non-joiners between every letter force the isolated forms.
    const broken = make('ا‌ل‌ل‌ه‌م');
    return { joined, broken };
  });
  check('Arabic letters join: the subset kept its shaping tables',
        shaped.joined > 0 && shaped.joined < shaped.broken * 0.8,
        `${shaped.joined.toFixed(0)}px joined vs ${shaped.broken.toFixed(0)}px unjoined`);

  /* Tashkeel. The verse on Learn carries full diacritics, and a subset that
     lost its mark positioning renders them stacked wrongly rather than
     failing outright.

     The first version of this check asserted that marks take NO horizontal
     room, on the reasoning that attached marks have zero advance. It failed:
     pointed 75.5px against bare 64.7px. The font is right and the assertion
     was wrong — Amiri substitutes wider contextual forms to make room for
     the marks it is about to place, which is why an 61-codepoint subset
     still carries 878 glyphs. (`fonttools` on the subset confirms GDEF plus
     GPOS mark, mkmk, curs and kern are all present; see fonts/README.md.)

     So what is checked here is the thing that would actually be visible: the
     marks cost a little width, not a glyph's worth each, and the pointed
     verse still fits where it has to. */
  const marks = await night.p.evaluate(() => {
    const make = text => {
      const el = document.createElement('span');
      el.setAttribute('lang','ar'); el.dir = 'rtl';
      el.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-family:"Amiri Naskh";font-size:40px';
      el.textContent = text; document.body.appendChild(el);
      const r = el.getBoundingClientRect(); el.remove(); return r;
    };
    const pointed = make('نَوْمَكُمْ'), bare = make('نومكم');
    return { pointed: pointed.width, bare: bare.width,
             taller: pointed.height >= bare.height };
  });
  check('Tashkeel is placed, not spaced out beside the letters',
        marks.pointed > marks.bare && marks.pointed < marks.bare * 1.35,
        `${marks.pointed.toFixed(1)}px pointed vs ${marks.bare.toFixed(1)}px bare`);

  check('The dua still fits the phone', await night.p.evaluate(() => {
    const r = document.getElementById('duaLine1').getBoundingClientRect();
    return r.left >= -0.5 && r.right <= window.innerWidth + 0.5
           && document.documentElement.scrollWidth <= window.innerWidth;
  }));
  check('No console errors', night.errs.length === 0, night.errs.join(' | '));
  await night.ctx.close();

  /* The one failure mode that matters: a participant whose device never gets
     the file must see what they saw before, not invisible text. */
  const noFont = await open({ blockFont: true });
  await noFont.p.locator('#momentGo').click();
  await noFont.p.waitForTimeout(900);
  const fallback = await noFont.p.evaluate(() => {
    const el = document.getElementById('duaLine1');
    const r = el.getBoundingClientRect();
    return { visible: r.width > 50 && r.height > 20,
             text: el.textContent.length,
             loaded: document.fonts.check('30px "Amiri Naskh"') };
  });
  check('Without the font the dua is still drawn, in the system Naskh',
        fallback.visible && fallback.text > 40 && !fallback.loaded,
        JSON.stringify(fallback));
  await noFont.ctx.close();

  /* ================================================================
     THE EVENING DRAWING IN
     ================================================================ */
  const ramp = await open({ hour: 21, minute: 0 });
  const at = (h, mi) => ramp.p.evaluate(([h, mi]) =>
    window.__dusk(new Date(2026, 8, 9, h, mi, 0).toISOString()), [h, mi]);

  check('Midday is not dusk at all', await at(13, 0) === 0);
  check('The ramp starts at zero where the evening starts', await at(20, 30) === 0,
        String(await at(20, 30)));
  check('And reaches full night at the planned sleep time', await at(23, 0) === 1,
        String(await at(23, 0)));
  check('Bedtime stays at full night', await at(1, 0) === 1, String(await at(1, 0)));

  /* Monotonic, and with no step anywhere: the phase boundary between EVENING
     and SLEEP must be invisible, which is the whole point. */
  const series = [];
  for (let m = 20 * 60; m <= 23 * 60 + 30; m += 5) {
    series.push([m, await at(Math.floor(m / 60) % 24, m % 60)]);
  }
  const values = series.map(s => s[1]);
  check('Dusk never goes backwards',
        values.every((v, i) => i === 0 || v >= values[i - 1] - 1e-9));
  const steps = values.map((v, i) => i === 0 ? 0 : v - values[i - 1]);
  const biggest = Math.max(...steps);
  check('And never jumps: no visible step at the phase boundary',
        biggest < 0.06, `largest five-minute change ${biggest.toFixed(4)}`);
  check('It is genuinely a ramp, not two values',
        new Set(values.map(v => v.toFixed(3))).size > 20,
        `${new Set(values.map(v => v.toFixed(3))).size} distinct levels`);
  check('Halfway through the evening it is halfway down',
        Math.abs(await at(21, 45) - 0.5) < 0.02, String(await at(21, 45)));

  /* The chrome follows it — faded, never removed. The brief is explicit that
     the interface settles rather than disappearing, and a control that went
     away would be a boundary again. */
  const chrome = await ramp.p.evaluate(() => {
    const el = document.documentElement;
    /* These properties are transitioned over seconds, so reading them the
       instant after setting --dusk measures the crossfade rather than the
       value. Suppressing transitions for the sample is the point of this
       style block — a first attempt at this check read 0.89 three times and
       looked like the ramp was doing nothing. */
    const hold = document.createElement('style');
    hold.textContent = '*,*::before,*::after{transition:none !important}';
    document.head.appendChild(hold);
    const read = () => {
      const bar = document.querySelector('.topbar'), nav = document.querySelector('.sidebar');
      const veil = document.querySelector('.dusk-veil');
      const cs = n => getComputedStyle(n);
      return { bar: parseFloat(cs(bar).opacity), nav: parseFloat(cs(nav).opacity),
               barThere: bar.getBoundingClientRect().height > 0,
               navDisplay: cs(nav).display,
               ground: parseFloat(cs(veil).opacity),
               // The film grain must survive the darkening: an earlier
               // version of this put the dusk on body::after and silently
               // replaced it.
               grain: parseFloat(getComputedStyle(document.body, '::after').opacity) };
    };
    const out = {};
    for (const d of [0, 0.5, 1]) { el.style.setProperty('--dusk', d); void el.offsetHeight; out[d] = read(); }
    hold.remove();
    return out;
  });
  check('The top bar fades as the evening deepens',
        chrome[0].bar > chrome[0.5].bar && chrome[0.5].bar > chrome[1].bar,
        `${chrome[0].bar} → ${chrome[0.5].bar} → ${chrome[1].bar}`);
  check('So does the navigation',
        chrome[0].nav > chrome[0.5].nav && chrome[0.5].nav > chrome[1].nav,
        `${chrome[0].nav} → ${chrome[0.5].nav} → ${chrome[1].nav}`);
  check('The ground darkens with it',
        chrome[1].ground > chrome[0].ground,
        `${chrome[0].ground} → ${chrome[1].ground}`);
  check('But nothing is ever taken away',
        chrome[1].bar > 0 && chrome[1].nav > 0
        && chrome[1].barThere && chrome[1].navDisplay !== 'none',
        JSON.stringify(chrome[1]));
  check('And the film grain survives the darkening',
        chrome[1].grain > 0 && Math.abs(chrome[1].grain - chrome[0].grain) < 1e-6,
        `${chrome[0].grain} → ${chrome[1].grain}`);
  await ramp.ctx.close();

  /* The sky follows it too: slower as the evening draws in, and still
     moving at the end. Measured rather than inferred. */
  const rate = async (hour, minute) => {
    const c = await open({ hour, minute });
    const probe = () => c.p.evaluate(() => window.__starProbe());
    const a = await probe();
    const radius = a.fields.find(f => f.id === 'starfield').radius;
    await c.p.waitForTimeout(4000);
    const z = await probe();
    const dusk = await c.p.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dusk')));
    const errs = c.errs;
    await c.ctx.close();
    return { drift: (z.spin - a.spin) * radius, dusk, errs };
  };
  const early = await rate(19, 0);     // DAY: no dusk at all
  const mid   = await rate(21, 45);    // halfway through the evening
  const late  = await rate(23, 30);    // bedtime
  check('The sky is at full rate before the evening', early.dusk === 0, String(early.dusk));
  check('It slows as the evening draws in', mid.drift < early.drift * 0.85,
        `${mid.drift.toFixed(1)}px at dusk ${mid.dusk} vs ${early.drift.toFixed(1)}px`);
  check('And is slowest at bedtime', late.drift < mid.drift,
        `${late.drift.toFixed(1)}px vs ${mid.drift.toFixed(1)}px`);
  check('But never stops: a frozen sky is a broken loop, not a calm one',
        late.drift > 0.5, `${late.drift.toFixed(1)}px over 4s`);
  check('No console errors across the evening',
        [...early.errs, ...mid.errs, ...late.errs].length === 0);

  /* Reduced motion: every value survives, the travel between them does not,
     and the sky holds still. The brief requires it to remain beautiful
     without movement, which means the dimming must still happen. */
  const calm = await open({ reduced: true, hour: 23, minute: 30 });
  const calmState = await calm.p.evaluate(() => ({
    dusk: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dusk')),
    barTransition: getComputedStyle(document.querySelector('.topbar')).transitionDuration,
    bar: parseFloat(getComputedStyle(document.querySelector('.topbar')).opacity),
    ground: parseFloat(getComputedStyle(document.documentElement, '::after').opacity)
  }));
  check('Reduced motion still reaches full night', calmState.dusk === 1, String(calmState.dusk));
  check('With the chrome still faded and the ground still dark',
        calmState.bar < 0.6 && calmState.ground > 0.5, JSON.stringify(calmState));
  check('It simply arrives instead of travelling',
        /^0s/.test(calmState.barTransition), calmState.barTransition);
  const cs0 = await calm.p.evaluate(() => window.__starProbe().spin);
  await calm.p.waitForTimeout(2000);
  const cs1 = await calm.p.evaluate(() => window.__starProbe().spin);
  check('And the sky holds still', cs0 === cs1, `${cs0} / ${cs1}`);
  await calm.ctx.close();

  /* ================================================================
     WHAT IT COSTS

     This screen is used at bedtime, on a phone that is about to be put down
     for eight hours. A beautiful sky that eats a tenth of the battery is not
     a feature.
     ================================================================ */
  const cost = await open({ hour: 23, minute: 30 });
  await cost.p.locator('#momentGo').click();
  await cost.p.waitForTimeout(800);
  const budget = await cost.p.evaluate(() => new Promise(resolve => {
    let frames = 0, long = 0, prev = performance.now();
    const started = prev;
    const tick = now => {
      const dt = now - prev; prev = now;
      frames++; if (dt > 34) long++;      // worse than ~30fps
      if (now - started < 3000) requestAnimationFrame(tick);
      else resolve({ frames, long, seconds: (now - started) / 1000 });
    };
    requestAnimationFrame(tick);
  }));
  const fps = budget.frames / budget.seconds;
  check('The dua screen holds a smooth frame rate', fps > 45, `${fps.toFixed(0)} fps`);
  check('With no stalls', budget.long <= 3, `${budget.long} long frames in ${budget.frames}`);
  /* The sky is one canvas. Anything else animating behind a screen whose
     whole purpose is to be put down is a battery leak. */
  const animating = await cost.p.evaluate(() => {
    const running = document.getAnimations().filter(a => a.playState === 'running'
      && !(a.effect && a.effect.getTiming && a.effect.getTiming().duration === 0));
    return { count: running.length,
             canvases: [...document.querySelectorAll('canvas')].length };
  });
  check('Nothing else is animating at bedtime', animating.count === 0,
        `${animating.count} running animations`);
  check('And the sky is still just the two canvases it always was',
        animating.canvases === 2, `${animating.canvases} canvases`);
  check('No console errors', cost.errs.length === 0, cost.errs.join(' | '));
  await cost.ctx.close();

  /* A slow device. Chromium cannot be made genuinely slow here, but it can
     be made to miss frames, and the one thing that must survive that is the
     tap: an animation that swallows the only button on the screen would
     strand someone in a dua they have already read. */
  const slow = await open({ hour: 23, minute: 30 });
  const session = await slow.ctx.newCDPSession(slow.p);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await slow.p.locator('#momentGo').click();
  await slow.p.waitForTimeout(1500);
  check('On a throttled device the dua still appears',
        await slow.p.locator('#duaVeil').isVisible());
  const hit = await slow.p.evaluate(() => {
    const r = document.getElementById('duaAmin').getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el && (el.id || el.tagName);
  });
  check('And nothing is sitting on top of the one button', hit === 'duaAmin', String(hit));
  await slow.p.locator('#duaAmin').click();
  await slow.p.waitForTimeout(6500);
  check('One tap still closes the day on a slow device',
        await slow.p.locator('#lazyVeil').isVisible());
  check('No console errors when throttled', slow.errs.length === 0, slow.errs.join(' | '));
  await slow.ctx.close();

  /* The three screens, with the new face: Amiri sets smaller than the system
     stacks did, so the sizes went up, and that has to still fit. */
  for (const [name, viewport] of [['a small iPhone', { width:320, height:568 }],
                                  ['a large iPhone', { width:430, height:932 }],
                                  ['an iPad',        { width:834, height:1112 }]]) {
    const dev = await open({ viewport });
    await dev.p.locator('#momentGo').click();
    await dev.p.waitForTimeout(900);
    const m = await dev.p.evaluate(() => {
      const line = document.getElementById('duaLine1');
      const rise = document.getElementById('duaLine2');
      const amin = document.getElementById('duaAmin');
      const veil = document.getElementById('duaVeil');
      const r = line.getBoundingClientRect();
      return { fits: r.left >= -0.5 && r.right <= window.innerWidth + 0.5,
               size: parseFloat(getComputedStyle(line).fontSize),
               lines: Math.round(r.height / parseFloat(getComputedStyle(line).lineHeight)),
               riseFits: rise.getBoundingClientRect().right <= window.innerWidth + 0.5,
               aminIn: amin.getBoundingClientRect().bottom <= window.innerHeight + 0.5,
               scrolls: veil.scrollHeight > veil.clientHeight + 1,
               overflow: document.documentElement.scrollWidth > window.innerWidth };
    });
    check(`On ${name} the larger face still fits`,
          m.fits && m.riseFits && !m.overflow && !m.scrolls,
          `${m.lines} lines at ${m.size.toFixed(1)}px`);
    check(`On ${name} it is bigger than the old system stack was`, m.size >= 25,
          `${m.size.toFixed(1)}px`);
    check(`On ${name} the button is still on screen`, m.aminIn);
    check(`No console errors on ${name}`, dev.errs.length === 0, dev.errs.join(' | '));
    await dev.ctx.close();
  }

  /* The verse on Learn is the app's other piece of Arabic, and it was the
     one still falling back to whatever the device shipped. */
  const learn = await open({ hour: 13, minute: 0 });
  /* Every Arabic element in the document, wherever it lives — the dua block,
     the verse on Learn, and the .ayah in the opening sequence, which is
     removed from the DOM when the opening is off and so cannot be looked up
     by one selector. Checking the lot is also the regression guard: a new
     piece of Arabic added later with its own hard-coded stack fails here. */
  const arabic = await learn.p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[lang="ar"]')) {
      const cs = getComputedStyle(el);
      out.push({ what: el.id || el.className || el.tagName,
                 family: cs.fontFamily, dir: cs.direction, weight: cs.fontWeight,
                 spacing: cs.letterSpacing });
    }
    return out;
  });
  check('There is Arabic on the page to check', arabic.length >= 4, `${arabic.length} elements`);
  const notAmiri = arabic.filter(a => !/Amiri Naskh/.test(a.family));
  check('Every piece of Arabic is set in the same face', notAmiri.length === 0,
        notAmiri.map(a => `${a.what}: ${a.family}`).join(' | '));
  const notRtl = arabic.filter(a => a.dir !== 'rtl');
  check('And every piece of it runs right to left', notRtl.length === 0,
        notRtl.map(a => a.what).join(','));
  const bold = arabic.filter(a => Number(a.weight) > 400);
  check('None of it asks for a weight the face does not have', bold.length === 0,
        bold.map(a => `${a.what}: ${a.weight}`).join(' | '));
  const tracked = arabic.filter(a => a.spacing !== 'normal' && Math.abs(parseFloat(a.spacing)) > 0.01);
  check('And none of it is tracked out, which would break the joins',
        tracked.length === 0, tracked.map(a => `${a.what}: ${a.spacing}`).join(' | '));
  /* The verse on Learn specifically: it was the piece still asking for
     Georgia, which on a device means whatever Arabic that device ships. */
  const verse = await learn.p.evaluate(() => {
    const el = [...document.querySelectorAll('[lang="ar"]')]
      .find(n => /سُبَاتًا/.test(n.textContent));
    return el ? { family: getComputedStyle(el).fontFamily, tag: el.tagName } : null;
  });
  check('The verse is set in it too', verse && /Amiri Naskh/.test(verse.family),
        verse ? `${verse.tag}: ${verse.family}` : 'verse not found');
  check('No console errors on Learn', learn.errs.length === 0, learn.errs.join(' | '));
  await learn.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
