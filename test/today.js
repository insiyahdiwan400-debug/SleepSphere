/**
 * Today — SleepSphere 2.0.
 *
 * The visual milestone is judged on three things no screenshot can prove on
 * its own: that the one action a participant came for is reachable WITHOUT
 * scrolling past the decoration, that the composition holds from a 320px
 * phone to a large one, and that every word on it stays readable against the
 * daypart it sits on.
 *
 * Contrast is measured, not asserted from the palette — the atmosphere is
 * interpolated between nine keyframes by applySky(), so the ground under a
 * given phrase is whatever the hour made it, not whatever the token said.
 *
 * The sphere is explicitly NOT a measurement. The check for that is here
 * too: it carries no number, and it is hidden from assistive technology
 * because it has nothing to tell anybody.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const KEY = 'sleepsphere_state_v2';
const BASE = { welcomeSeen:true, openingOff:true, mode:'dark', target:480, faith:'on',
  place:{ latitude:19.076, longitude:72.8777, name:'Mumbai' },
  usualWake:'06:00', fajrHabit:'stay', name:'Insiyah' };
const PLAN = { mode:'continuous', target:480, settle:15, wind:30, fajr:'05:17', wake:'06:00',
  finalWake:'06:00', wakeAnchor:'06:00', afterFajr:null, windStart:21*60+15,
  settleStart:21*60+45, sleepStart:22*60, blockOne:480, blockTwo:0, total:480,
  obligation:null, brainDay:'hifz', savedDate:'2026-10-09', source:'build-my-night' };

/* IST: 06:30 dawn · 13:30 day · 19:30 evening · 22:30 night. */
const DAYPARTS = [
  { name:'dawn',     iso:'2026-10-09T01:00:00.000Z', phase:'WAKE',    plan:null, eyebrow:'Dawn' },
  { name:'day',      iso:'2026-10-09T08:00:00.000Z', phase:'DAY',     plan:null, eyebrow:'Today' },
  { name:'evening',  iso:'2026-10-09T14:00:00.000Z', phase:'EVENING', plan:PLAN, eyebrow:'This evening' },
  { name:'midnight', iso:'2026-10-09T17:00:00.000Z', phase:'SLEEP',   plan:PLAN, eyebrow:'Tonight' }
];

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (opts = {}) => {
    const ctx = await b.newContext({
      viewport: opts.viewport || { width:390, height:844 }, deviceScaleFactor:2,
      isMobile:true, hasTouch:true, timezoneId:'Asia/Kolkata',
      reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(`localStorage.setItem('${KEY}', JSON.stringify({
      version:3, settings:${JSON.stringify(Object.assign({}, BASE, opts.settings || {}))},
      brainDays:{'2026-10-09':'hifz'}, plan:${JSON.stringify(opts.plan || null)},
      lazyNight:null, mornings:[], morningRevisions:[],
      study:{onboarded:true,participantId:'P014',startDate:'2026-10-01',enrolledAt:'2026-10-01T06:00:00.000Z',consentAck:true,consentAt:'2026-10-01T06:00:00.000Z',cohort:'jamea-v1',schemaVersion:3,storageMode:'local',lastSeenDay:1},
      bioCheckins:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
    }));`);
    const t = new Date(opts.iso).getTime();
    await p.addInitScript(`(()=>{const R=Date;
      class D extends R{constructor(...a){if(!a.length)return super(${t});return super(...a);}
      static now(){return ${t};}} window.Date=D;})()`);
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1500);
    return { ctx, p, errs };
  };

  /* Contrast, measured against what is actually behind the text. */
  const CONTRAST = `(() => {
    const srgb = v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); };
    const lum = c => .2126*srgb(c[0]) + .7152*srgb(c[1]) + .0722*srgb(c[2]);
    const parse = s => (s.match(/[\\d.]+/g) || []).map(Number);
    const ratio = (a,b) => { const l=[lum(a),lum(b)].sort((x,y)=>y-x); return (l[0]+.05)/(l[1]+.05); };
    const groundAt = el => {
      let n = el;
      while (n && n !== document.documentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg.length >= 3 && (bg[3] === undefined || bg[3] > .92)) return bg.slice(0,3);
        n = n.parentElement;
      }
      return [10,12,30];   // the page ground behind the atmosphere
    };
    const out = {};
    ['momentEyebrow','momentGreeting','momentAsk','momentSub'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.textContent.trim()) return;
      const fg = parse(getComputedStyle(el).color).slice(0,3);
      out[id] = Math.round(ratio(fg, groundAt(el)) * 100) / 100;
    });
    const go = document.getElementById('momentGo');
    if (go && !go.hidden) {
      /* The action is a gradient, so backgroundColor is transparent and
         measuring against it compares the label with nothing. Both ends of
         the real gradient are resolved instead, and the worse one stands. */
      const rootCs = getComputedStyle(document.documentElement);
      const ends = ['--accent-lift','--accent']
        .map(v => rootCs.getPropertyValue(v).trim())
        .map(hex => [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16)))
        .filter(c => c.every(n => Number.isFinite(n)));
      const fg = parse(getComputedStyle(go).color).slice(0,3);
      out.action = ends.length
        ? Math.round(Math.min(...ends.map(end => ratio(fg, end))) * 100) / 100
        : null;
    }
    return out;
  })()`;

  /* ================================================================
     THE FOUR DAYPARTS
     ================================================================ */
  for (const part of DAYPARTS) {
    const c = await open({ iso: part.iso, plan: part.plan });
    const v = await c.p.evaluate(() => {
      const go = document.getElementById('momentGo');
      const r = go && !go.hidden ? go.getBoundingClientRect() : null;
      const sphere = document.getElementById('livingSphere');
      return {
        phase: document.documentElement.dataset.phase,
        eyebrow: document.getElementById('momentEyebrow').textContent.trim(),
        greeting: document.getElementById('momentGreeting').textContent.trim(),
        ask: document.getElementById('momentAsk').textContent.trim(),
        sphere: Boolean(sphere),
        sphereHidden: sphere ? sphere.getAttribute('aria-hidden') : null,
        sphereText: sphere ? sphere.innerText.trim() : 'x',
        sphereFocusable: sphere ? sphere.querySelectorAll('a,button,[tabindex]').length : -1,
        actionBottom: r ? Math.round(r.bottom) : null,
        actionHeight: r ? Math.round(r.height) : null,
        scrollW: document.documentElement.scrollWidth,
        tabs: [...document.querySelectorAll('.nav button[data-view]')].map(n => n.dataset.view)
      };
    });
    const contrast = await c.p.evaluate(CONTRAST);

    check(`${part.name} · the phase is ${part.phase}`, v.phase === part.phase, v.phase);
    check(`${part.name} · the eyebrow names the daypart, not the state machine`,
          v.eyebrow === part.eyebrow, v.eyebrow);
    check(`${part.name} · the greeting is personal without being familiar`,
          /Insiyah\.$/.test(v.greeting) && !/\bwe\b|let's/i.test(v.greeting), v.greeting);
    check(`${part.name} · there is an ask, and it is not empty`, v.ask.length > 3, v.ask);
    /* Presence in the composition. Whether it is *drawn* in a given state is
       a separate, deliberate rule, checked under MOTION below. */
    check(`${part.name} · the Living Sphere is in the composition`, v.sphere === true);
    check(`${part.name} · THE SPHERE IS NOT A MEASUREMENT · no number on it`,
          !/\d/.test(v.sphereText), v.sphereText);
    check(`${part.name} · and it is hidden from assistive technology`,
          v.sphereHidden === 'true' && v.sphereFocusable === 0,
          `aria-hidden ${v.sphereHidden}, focusables ${v.sphereFocusable}`);
    if (v.actionBottom !== null) {
      check(`${part.name} · THE ACTION IS REACHABLE WITHOUT SCROLLING`,
            v.actionBottom <= 844, `bottom at ${v.actionBottom}px of 844`);
      check(`${part.name} · and the target is at least 48px`,
            v.actionHeight >= 48, `${v.actionHeight}px`);
    }
    check(`${part.name} · no horizontal scroll`, v.scrollW <= 390, `${v.scrollW}px`);
    check(`${part.name} · exactly four tabs, unchanged`,
          v.tabs.join(',') === 'today,twin,learn,data', v.tabs.join(','));
    Object.entries(contrast).forEach(([id, value]) => {
      // 4.5:1 for body text; the ask is large-scale type, where AA is 3:1.
      const floor = id === 'momentAsk' ? 3 : 4.5;
      check(`${part.name} · ${id} is readable on its daypart`, value >= floor, `${value}:1`);
    });
    check(`${part.name} · no console errors`, c.errs.length === 0, c.errs.join(' | '));
    await c.ctx.close();
  }

  /* ================================================================
     RESPONSIVE — the composition has to hold on a small phone.
     ================================================================ */
  for (const vp of [{ width:320, height:568 }, { width:390, height:844 }, { width:430, height:932 }]) {
    const c = await open({ iso:DAYPARTS[3].iso, plan:PLAN, viewport:vp });
    const v = await c.p.evaluate(() => {
      const go = document.getElementById('momentGo');
      const r = go.getBoundingClientRect();
      const sphere = document.getElementById('livingSphere').getBoundingClientRect();
      return { bottom:Math.round(r.bottom), scrollW:document.documentElement.scrollWidth,
               sphere:Math.round(sphere.width), overlap: r.top < sphere.bottom };
    });
    check(`${vp.width}x${vp.height} · the action still fits the first screen`,
          v.bottom <= vp.height, `${v.bottom} of ${vp.height}`);
    check(`${vp.width}x${vp.height} · no horizontal scroll`, v.scrollW <= vp.width, `${v.scrollW}px`);
    check(`${vp.width}x${vp.height} · the sphere gives up size rather than the action`,
          v.sphere <= 200 && v.overlap === false, `sphere ${v.sphere}px`);
    check(`${vp.width}x${vp.height} · no console errors`, c.errs.length === 0, c.errs.join(' | '));
    await c.ctx.close();
  }

  /* ================================================================
     REDUCED MOTION — a composed still frame, not a broken one.
     ================================================================ */
  /* Read motion where it is actually supposed to exist, so "none" means the
     preference was honoured rather than that this daypart never moved. */
  const motion = async opts => {
    const c = await open(opts);
    const v = await c.p.evaluate(() => {
      const svg = document.querySelector('.sphere-svg');
      const bands = document.querySelector('.sphere-bands');
      const cs = getComputedStyle(svg);
      return { svgAnim: cs.animationName, bandAnim: getComputedStyle(bands).animationName,
               visible: svg.getBoundingClientRect().width > 0,
               opacity: parseFloat(cs.opacity),
               running: document.getAnimations()
                 .filter(a => a.playState === 'running').length };
    });
    const errs = c.errs;
    await c.ctx.close();
    return { ...v, errs };
  };

  const lively = await motion({ iso:DAYPARTS[1].iso });
  check('By day the sphere does breathe',
        lively.svgAnim === 'sphereBreathe', lively.svgAnim);
  check('And its interior drifts', lively.bandAnim === 'sphereDrift', lively.bandAnim);

  const still = await motion({ iso:DAYPARTS[1].iso, reduced:true });
  check('Reduced motion · the sphere does not breathe',
        still.svgAnim === 'none', still.svgAnim);
  check('Reduced motion · and its interior does not drift',
        still.bandAnim === 'none', still.bandAnim);
  check('Reduced motion · but the sphere is still composed and visible',
        still.visible === true && still.opacity === 1, `opacity ${still.opacity}`);
  check('Reduced motion · nothing at all is left running',
        still.running === 0, String(still.running));
  check('Reduced motion · no console errors', still.errs.length === 0, still.errs.join(' | '));

  /* The app's existing rule — "the sky is one canvas", test/night.js — is
     that nothing animates on a screen whose purpose is to be put down. The
     sphere settles into it rather than being an exception to it. */
  for (const i of [2, 3]) {
    const quiet = await motion({ iso:DAYPARTS[i].iso, plan:PLAN });
    check(`${DAYPARTS[i].name} · the sphere has settled for the night`,
          quiet.svgAnim === 'none' && quiet.bandAnim === 'none' && quiet.running === 0,
          `${quiet.svgAnim}/${quiet.bandAnim}/${quiet.running}`);
  }

  /* The sphere stands in for the night until the night exists. Once it does,
     the Living Night's own lit sky is the celestial object on the screen and
     the sphere steps out of exactly that one state — then comes back at
     bedtime, when the Living Night has faded. See DESIGN.md section 6. */
  const eveningPlanned = await motion({ iso:DAYPARTS[2].iso, plan:PLAN });
  check('evening · with a night built, the sphere gives the screen to it',
        eveningPlanned.visible === false, `width ${eveningPlanned.visible}`);
  const eveningBare = await motion({ iso:DAYPARTS[2].iso, plan:null });
  check('evening · with no night yet, the sphere is there and fully drawn',
        eveningBare.visible === true && eveningBare.opacity === 1,
        `opacity ${eveningBare.opacity}`);
  const bedtime = await motion({ iso:DAYPARTS[3].iso, plan:PLAN });
  check('midnight · and at bedtime it has come back, fully drawn',
        bedtime.visible === true && bedtime.opacity === 1, `opacity ${bedtime.opacity}`);

  /* ================================================================
     INTERACTION — every existing route still works.
     ================================================================ */
  const wake = await open({ iso:DAYPARTS[0].iso });
  await wake.p.locator('#momentGo').click();
  await wake.p.waitForTimeout(800);
  check('WAKE · the action still opens the morning flow',
        await wake.p.evaluate(() => document.getElementById('flow').classList.contains('active')
          || document.documentElement.dataset.view === 'morning'),
        'the recording flow is reachable');
  await wake.ctx.close();

  const evening = await open({ iso:DAYPARTS[1].iso });
  await evening.p.locator('#momentGo').click();
  await evening.p.waitForTimeout(700);
  check('DAY · the action still opens the Brain Day choice',
        await evening.p.evaluate(() => !document.getElementById('brainGrid').hidden));
  await evening.ctx.close();

  const planning = await open({ iso:DAYPARTS[2].iso, plan:PLAN });
  check('EVENING · the Living Night is still rendered',
        await planning.p.evaluate(() => !document.getElementById('livingNight').hidden));
  check('EVENING · and Change tonight is still one tap away',
        await planning.p.locator('#livingChange').isVisible());
  /* The brief: nobody scrolls past decoration to reach an essential action.
     Tonight's plan and its three actions are the evening's whole point, so
     the sphere may not displace them out of the first viewport. */
  const reach = await planning.p.evaluate(() => {
    const out = {};
    for (const id of ['livingChange','livingWhy','livingUnload']) {
      const r = document.getElementById(id).getBoundingClientRect();
      out[id] = { bottom: Math.round(r.bottom),
                  hit: (el => el && (el.id || el.tagName))(
                    document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
    }
    return out;
  });
  check('EVENING · tonight\'s actions stay inside the first viewport',
        Object.values(reach).every(v => v.bottom <= 844 && v.hit),
        JSON.stringify(reach));
  await planning.p.locator('#livingChange').click();
  await planning.p.waitForTimeout(800);
  check('EVENING · which still opens Build my night',
        await planning.p.evaluate(() => !document.getElementById('nightVeil').hidden));
  await planning.ctx.close();

  const night = await open({ iso:DAYPARTS[3].iso, plan:PLAN });
  await night.p.locator('#momentGo').click();
  await night.p.waitForTimeout(900);
  check('SLEEP · Goodnight still reaches the dua',
        await night.p.evaluate(() => !document.getElementById('duaVeil').hidden
          || !document.getElementById('earlyVeil').hidden),
        'the bedtime ritual is reachable');
  await night.ctx.close();

  /* ---- The greeting without a name. */
  const nameless = await open({ iso:DAYPARTS[1].iso, settings:{ name:'' } });
  const bare = await nameless.p.evaluate(() =>
    document.getElementById('momentGreeting').textContent.trim());
  check('With no name given, the greeting simply does not use one',
        /^Good (morning|afternoon|evening)\.$/.test(bare), bare);
  await nameless.ctx.close();

  /* ---- Light mode has to stay readable too. */
  const light = await open({ iso:DAYPARTS[1].iso, settings:{ mode:'light' } });
  const lightContrast = await light.p.evaluate(CONTRAST);
  Object.entries(lightContrast).forEach(([id, value]) => {
    const floor = id === 'momentAsk' ? 3 : 4.5;
    check(`Light mode · ${id} is readable`, value >= floor, `${value}:1`);
  });
  check('Light mode · no console errors', light.errs.length === 0, light.errs.join(' | '));
  await light.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
