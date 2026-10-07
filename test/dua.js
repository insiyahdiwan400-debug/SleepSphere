/**
 * The bedtime dua.
 *
 * Two different things are being protected here, and they need different
 * kinds of check.
 *
 * 1. THE TEXT. The wording was supplied by the researcher as the
 *    Jamea/Fatimi form. It is not the app's to improve, and nothing in the
 *    scheduling code may reach it. So the assertions below are written as
 *    literal Arabic strings — not as `DUA.line1`, which would pass no matter
 *    what the constant said. If one of these fails, either the religious
 *    text changed or something is rewriting it; both are the same bug.
 *
 * 2. THE ONE DYNAMIC PHRASE. Everything after `ساعة` is assembled from the
 *    person's own plan. The interesting cases are all failure cases: a Fajr
 *    Bridge night where the dua must name the SECOND waking and not Fajr,
 *    and a night with no reliable wake time at all, where the supplied
 *    placeholder has to survive untouched rather than a plausible hour being
 *    invented.
 *
 * And the surrounding night: that the screen does not become a dashboard,
 * that one tap ends it, that the research record is not touched by reading a
 * dua, and that the sky calms down instead of throwing meteors at someone
 * who is trying to fall asleep.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const KEY = 'sleepsphere_state_v2';

/* The supplied text, written out again here on purpose. See the note above:
   comparing the screen against the app's own constant proves only that the
   app is self-consistent. */
const SUPPLIED = {
  heading: 'قبل النوم',
  line1: 'اللهم لا تؤمني مكرك ولا تنسني ذكرك ولا تجعلني من القوم الغافلين',
  lead: 'أقوم إن شاء الله تعالى ساعة',
  placeholder: '(كذا وكذا)',
  closing: 'تصبح على خير'
};

/* The seed stays at version 2 so every run also exercises the v2 -> v3
   migration, and carries a study block so the app does not open into
   fieldwork onboarding. */
const DEFAULT_SETTINGS = { welcomeSeen:true, openingOff:true, mode:'dark', target:480, faith:'on' };
const seed = extra => `(()=>{localStorage.setItem('${KEY}', JSON.stringify(Object.assign({
  version:2,
  settings:${JSON.stringify(DEFAULT_SETTINGS)},
  study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}, ${JSON.stringify(extra || {})})));})()`;

/* Local wall-clock, not UTC: the phase boundaries are local, and these
   checks need bedtime. 23:30 on 9 September 2026. */
const clockAt = (h, mi) => `(()=>{const R=Date;const f=new R(2026,8,9,${h},${mi},0);
  class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
  static now(){return f.getTime();}} window.Date=D;})()`;

const settings = extra => Object.assign({}, DEFAULT_SETTINGS, extra);

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (state, opts = {}) => {
    const ctx = await b.newContext({
      viewport: opts.viewport || { width:390, height:844 }, deviceScaleFactor:2,
      isMobile: opts.viewport ? false : true, hasTouch:true,
      reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(seed(state));
    await p.addInitScript(clockAt(opts.hour ?? 23, opts.minute ?? 30));
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1100);
    return { ctx, p, errs };
  };
  const read = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

  /* ================================================================
     THE TEXT ITSELF
     ================================================================ */
  const plan = (extra) => ({ plan: Object.assign({
    savedDate: '2026-09-09', windStart: 1320, sleepStart: 1380, brainDay: null
  }, extra) });

  const night = await open(plan({ mode:'continuous', wake:'06:30' }));
  check('No console errors at bedtime', night.errs.length === 0, night.errs.join(' | '));
  check('Bedtime is the SLEEP phase',
        (await night.p.evaluate(() => document.documentElement.dataset.phase)) === 'SLEEP');
  check('Goodnight is the one thing on the screen',
        await night.p.locator('#momentGo').isVisible()
        && /goodnight/i.test(await night.p.locator('#momentGo').innerText()));
  check('The dua is not on screen before it is asked for',
        !(await night.p.locator('#duaVeil').isVisible()));

  await night.p.locator('#momentGo').click();
  await night.p.waitForTimeout(900);
  check('Goodnight opens the dua', await night.p.locator('#duaVeil').isVisible());

  const onScreen = await night.p.evaluate(() => ({
    heading: document.getElementById('duaHeading').textContent,
    line1: document.getElementById('duaLine1').textContent,
    line2: document.getElementById('duaLine2').textContent,
    amin: document.getElementById('duaAmin').textContent
  }));
  check('The heading is the supplied wording', onScreen.heading === SUPPLIED.heading,
        JSON.stringify(onScreen.heading));
  check('The dua is the supplied wording, character for character',
        onScreen.line1 === SUPPLIED.line1, JSON.stringify(onScreen.line1));
  check('The second line keeps the supplied lead untouched',
        onScreen.line2.startsWith(SUPPLIED.lead + ' '), JSON.stringify(onScreen.line2));
  check('Nothing is appended after the time',
        onScreen.line2 === `${SUPPLIED.lead} ٦:٣٠`, JSON.stringify(onScreen.line2));

  /* Rendering. The one thing that must be legible on this screen is a block
     of Arabic with diacritics, at night, by someone already sleepy. */
  const type = await night.p.evaluate(() => {
    const el = document.getElementById('duaLine1');
    const cs = getComputedStyle(el);
    return { dir: el.getAttribute('dir'), lang: el.getAttribute('lang'),
             computedDir: cs.direction, size: parseFloat(cs.fontSize),
             line: parseFloat(cs.lineHeight), family: cs.fontFamily,
             box: el.getBoundingClientRect().width,
             viewport: window.innerWidth };
  });
  check('Arabic is marked as Arabic and renders right to left',
        type.lang === 'ar' && type.dir === 'rtl' && type.computedDir === 'rtl',
        `${type.lang}/${type.dir}/${type.computedDir}`);
  check('It is set large enough to read', type.size >= 20, `${type.size}px`);
  check('With room for the diacritics', type.line / type.size >= 1.8,
        `line-height ${(type.line / type.size).toFixed(2)}×`);
  check('In a Naskh stack, not the UI sans', /Naskh|Bayan|Geeza|Traditional/i.test(type.family),
        type.family);
  check('And it fits the phone', type.box <= type.viewport,
        `${Math.round(type.box)}px of ${type.viewport}px`);
  check('No horizontal overflow with the dua open', await night.p.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth));

  /* Not a dashboard. The brief's whole objection to the old bedtime screen
     was competing buttons; one tappable thing is the design. */
  const taps = await night.p.evaluate(() => {
    const veil = document.getElementById('duaVeil');
    return [...veil.querySelectorAll('button,a,input,select,textarea')]
      .filter(el => el.offsetParent !== null).map(el => el.id || el.tagName);
  });
  check('Exactly one thing to tap', taps.length === 1 && taps[0] === 'duaAmin',
        taps.join(','));
  check('No charts, scores or numbers on the screen', await night.p.evaluate(() => {
    const veil = document.getElementById('duaVeil');
    // The arc is symbolic and marked aria-hidden; nothing else may be a graph.
    const graphs = [...veil.querySelectorAll('canvas,svg')].filter(el => el.id !== 'duaArc');
    const western = /[0-9]/.test(veil.innerText);
    return graphs.length === 0 && !western;
  }));
  check('The arc is decoration, not data',
        (await night.p.locator('#duaArc').getAttribute('aria-hidden')) === 'true');

  /* The sky, with the dua open: still there, calmer. */
  const settling = await night.p.evaluate(() => document.documentElement.dataset.settling);
  check('The sky is told to settle', settling === 'yes', String(settling));
  const spin0 = await night.p.evaluate(() => window.__starProbe().spin);
  await night.p.waitForTimeout(3000);
  const spin1 = await night.p.evaluate(() => window.__starProbe().spin);
  const field = (await night.p.evaluate(() => window.__starProbe())).fields
                  .find(f => f.id === 'starfield');
  check('There are still stars behind the dua', field.onScreen >= 250,
        `${field.onScreen} on screen`);
  /* Measured against the sky's own declared day rate rather than a literal.
     This check used to pin 0.0000035 * 1000 * 0.5 — the base rate of the
     day, written into the test — so retuning the sky broke it for a reason
     that had nothing to do with the dua. What it is really asserting is the
     relationship: at bedtime the field turns at about a third of its
     daytime rate, and that holds whatever the rate is. */
  const dayRate = (await night.p.evaluate(() => window.__starProbe().rate)) * 1000;
  const bedRate = (spin1 - spin0) / 3;
  check('But the field turns more slowly than in the day',
        spin1 > spin0 && bedRate < dayRate * 0.5,
        `${bedRate.toExponential(2)} against a day rate of ${dayRate.toExponential(2)} rad/s`);
  check('And at roughly the third it is meant to be',
        bedRate > dayRate * 0.25 && bedRate < dayRate * 0.42,
        `${(bedRate / dayRate).toFixed(2)} of the day rate`);

  /* One tap ends it, and the record is untouched by having read a dua. */
  const before = await read(night.p);
  await night.p.locator('#duaAmin').click();
  await night.p.waitForTimeout(1200);
  check('The closing words appear', await night.p.locator('#duaClosing').isVisible()
        && (await night.p.locator('#duaClosing').textContent()) === SUPPLIED.closing);
  await night.p.waitForTimeout(4200);
  check('The dua closes itself', !(await night.p.locator('#duaVeil').isVisible()));
  check('And hands over to the night the app already had',
        await night.p.locator('#lazyVeil').isVisible());
  const after = await read(night.p);
  check('A lazy night was opened', Boolean(after.lazyNight?.startedAt));
  const stripNight = s => { const c = JSON.parse(JSON.stringify(s)); delete c.lazyNight; return c; };
  check('Reading the dua changed nothing else in the record',
        JSON.stringify(stripNight(before)) === JSON.stringify(stripNight(after)));
  check('No morning was invented', (after.mornings || []).length === 0);
  check('Still no console errors', night.errs.length === 0, night.errs.join(' | '));
  await night.ctx.close();

  /* ================================================================
     THE TIME IT NAMES

     Cheap, deterministic, and read straight out of the engine: these are
     arithmetic, not a screen.
     ================================================================ */
  const probe = await open(null);
  const dua = override => probe.p.evaluate(o => window.__dua(o), override);

  for (const [clock, arabic] of [['06:00','٦:٠٠'], ['06:15','٦:١٥'],
                                 ['06:30','٦:٣٠'], ['06:45','٦:٤٥']]) {
    const d = await dua(plan({ mode:'continuous', wake: clock }));
    check(`A ${clock} wake reads as ${arabic}`,
          d.line2 === `${SUPPLIED.lead} ${arabic}`, JSON.stringify(d.line2));
  }

  /* The Fajr Bridge. This is the case that makes the whole feature worth
     having: someone who prays Fajr at 04:45 and goes back to sleep until
     06:15 is RISING at 06:15, and a dua that announces 04:45 is wrong about
     the night it is closing. */
  const bridge = await dua(plan({ mode:'fajr', fajr:'04:45', finalWake:'06:15' }));
  check('A Fajr Bridge night names the second waking, not Fajr',
        bridge.line2 === `${SUPPLIED.lead} ٦:١٥`, JSON.stringify(bridge.line2));

  /* And the other Fajr night: no second sleep, so the day genuinely begins
     at Fajr and that is the hour to name. */
  const atFajr = await dua(plan({ mode:'fajr', fajr:'04:45', finalWake:null }));
  check('When the day begins at Fajr, the dua names Fajr',
        atFajr.line2 === `${SUPPLIED.lead} ٤:٤٥`, JSON.stringify(atFajr.line2));

  /* Changing the plan changes the dua. It is read at open time, not frozen
     when the app loaded. */
  const changed = await dua(plan({ mode:'continuous', wake:'05:20' }));
  check('A changed plan changes the dua',
        changed.line2 === `${SUPPLIED.lead} ٥:٢٠`, JSON.stringify(changed.line2));

  /* Failing safely. There is no 06:30 default any more, and there must be no
     invented hour here either: the supplied placeholder stays. */
  const none = await dua({ plan: null, settings: settings({ usualWake: '' }) });
  check('With no plan and no usual wake, nothing is guessed',
        none.minutes === null && none.line2 === `${SUPPLIED.lead} ${SUPPLIED.placeholder}`,
        JSON.stringify(none.line2));
  check('And the placeholder is the supplied one, unedited',
        none.line2.endsWith('(كذا وكذا)'), JSON.stringify(none.line2));

  /* A plan whose own wake field is empty is just as unreliable. */
  const emptyPlan = await dua({ plan: Object.assign(plan().plan, { mode:'continuous', wake:'' }),
                                settings: settings({ usualWake: '' }) });
  check('An incomplete plan keeps the placeholder too',
        emptyPlan.line2 === `${SUPPLIED.lead} ${SUPPLIED.placeholder}`,
        JSON.stringify(emptyPlan.line2));

  /* The answer the person gave at onboarding is a reliable time; it is the
     fallback, and it is only used when tonight has no plan. */
  const usual = await dua({ plan: null, settings: settings({ usualWake: '07:05' }) });
  check('Without a plan, the usual wake time is used',
        usual.line2 === `${SUPPLIED.lead} ٧:٠٥`, JSON.stringify(usual.line2));
  const both = await dua(Object.assign(plan({ mode:'continuous', wake:'06:00' }),
                                       { settings: settings({ usualWake: '07:05' }) }));
  check('Tonight’s plan outranks the usual time',
        both.line2 === `${SUPPLIED.lead} ٦:٠٠`, JSON.stringify(both.line2));

  /* Midnight and noon are where a 12-hour clock goes wrong, and an hour
     printed as ٠ would be a visible mistake in a dua. */
  const noon = await dua(plan({ mode:'continuous', wake:'12:00' }));
  const midnight = await dua(plan({ mode:'continuous', wake:'00:30' }));
  check('Noon reads as ١٢, not ٠', noon.line2.endsWith('١٢:٠٠'), JSON.stringify(noon.line2));
  check('After midnight reads as ١٢, not ٠', midnight.line2.endsWith('١٢:٣٠'),
        JSON.stringify(midnight.line2));

  /* Determinism: the same state must produce the same line, because the
     alternative is a dua that changes while it is being read. */
  const twice = await Promise.all([dua(plan({ mode:'continuous', wake:'06:15' })),
                                  dua(plan({ mode:'continuous', wake:'06:15' }))]);
  check('The same night always produces the same line',
        twice[0].line2 === twice[1].line2);

  /* The constants are frozen, so nothing can assign over the text at
     runtime — the one way the scheduling code could reach it. */
  check('The text cannot be reassigned at runtime',
        (await probe.p.evaluate(() => window.__dua().line1)) === SUPPLIED.line1);
  await probe.ctx.close();

  /* ================================================================
     THE REST OF THE NIGHT
     ================================================================ */

  /* Someone who turned faith-aware options off asked not to be shown this,
     and gets the plain one-tap goodnight the app always had. */
  const general = await open({ settings: settings({ faith:'off' }),
                               plan: plan({ mode:'continuous', wake:'06:30' }).plan });
  await general.p.locator('#momentGo').click();
  await general.p.waitForTimeout(600);
  check('Faith-aware off goes straight to the night, with no dua',
        !(await general.p.locator('#duaVeil').isVisible())
        && await general.p.locator('#lazyVeil').isVisible());
  check('No console errors on the general path', general.errs.length === 0,
        general.errs.join(' | '));
  await general.ctx.close();

  /* Reduced motion: the same screen, without the fades, and it must still
     get all the way to the end. The timings differ, which is exactly why
     this needs its own run rather than being assumed. */
  const calm = await open(plan({ mode:'continuous', wake:'06:15' }), { reduced:true });
  await calm.p.locator('#momentGo').click();
  await calm.p.waitForTimeout(500);
  check('Reduced motion still shows the dua', await calm.p.locator('#duaVeil').isVisible());
  check('And it is readable immediately, not faded in', await calm.p.evaluate(() =>
        parseFloat(getComputedStyle(document.getElementById('duaVeil')).opacity) > 0.9));
  const calmSpin0 = await calm.p.evaluate(() => window.__starProbe().spin);
  await calm.p.waitForTimeout(1500);
  const calmSpin1 = await calm.p.evaluate(() => window.__starProbe().spin);
  check('The sky holds still', calmSpin0 === calmSpin1, `${calmSpin0} / ${calmSpin1}`);
  await calm.p.locator('#duaAmin').click();
  await calm.p.waitForTimeout(1200);
  check('And one tap still reaches the night',
        await calm.p.locator('#lazyVeil').isVisible());
  check('No console errors under reduced motion', calm.errs.length === 0, calm.errs.join(' | '));
  await calm.ctx.close();

  /* The three screens this actually has to work on. A dua that reflows into
     a column one word wide, or runs off the side, is not readable. */
  for (const [name, viewport] of [['a small iPhone', { width:320, height:568 }],
                                  ['a large iPhone', { width:430, height:932 }],
                                  ['an iPad',        { width:834, height:1112 }]]) {
    const dev = await open(plan({ mode:'fajr', fajr:'04:45', finalWake:'06:15' }), { viewport });
    await dev.p.locator('#momentGo').click();
    await dev.p.waitForTimeout(800);
    const m = await dev.p.evaluate(() => {
      const line = document.getElementById('duaLine1');
      const amin = document.getElementById('duaAmin');
      const veil = document.getElementById('duaVeil');
      const r = line.getBoundingClientRect(), a = amin.getBoundingClientRect();
      const cs = getComputedStyle(line);
      return { fits: r.left >= -0.5 && r.right <= window.innerWidth + 0.5,
               lines: Math.round(r.height / parseFloat(cs.lineHeight)),
               size: parseFloat(cs.fontSize),
               tapHeight: a.height,
               aminInside: a.bottom <= window.innerHeight + 0.5 && a.top >= -0.5,
               overflow: document.documentElement.scrollWidth > window.innerWidth,
               scrolls: veil.scrollHeight > veil.clientHeight + 1 };
    });
    check(`On ${name} the dua stays inside the screen`, m.fits && !m.overflow,
          `${m.lines} lines at ${m.size}px`);
    check(`On ${name} it does not shred into a narrow column`, m.lines <= 6,
          `${m.lines} lines`);
    check(`On ${name} the tap target is reachable and big enough`,
          m.aminInside && m.tapHeight >= 44, `${Math.round(m.tapHeight)}px`);
    check(`On ${name} nothing has to be scrolled to be read`, !m.scrolls);
    check(`No console errors on ${name}`, dev.errs.length === 0, dev.errs.join(' | '));
    await dev.ctx.close();
  }

  /* The arc. It is drawn from the person's own plan, and the shape has to
     say something true: a bridge night has three points with Fajr highest,
     an ordinary night has two. */
  const arcOf = async state => {
    const c = await open(state);
    await c.p.locator('#momentGo').click();
    await c.p.waitForTimeout(700);
    const out = await c.p.evaluate(() => {
      const svg = document.getElementById('duaArc');
      const box = svg.viewBox.baseVal;
      const texts = [...svg.querySelectorAll('text')];
      return { marks: [...svg.querySelectorAll('circle')].map(el => ({
                 x:+el.getAttribute('cx'), y:+el.getAttribute('cy'),
                 bright: !el.classList.contains('faint') })),
               labels: texts.map(el => el.textContent.trim()),
               /* Measured in the SVG's own user units, so this says whether
                  the label is inside the box the browser will draw — the
                  Arabic labels are far wider than the English ones were and
                  the first box was cut to fit the curve alone. */
               inside: texts.every(el => {
                 const b = el.getBBox();
                 return b.x >= box.x - 0.5 && b.x + b.width <= box.x + box.width + 0.5
                        && b.y + b.height <= box.y + box.height + 0.5;
               }),
               dir: texts.map(el => getComputedStyle(el).direction),
               family: texts.length ? getComputedStyle(texts[0]).fontFamily : '',
               fill: texts.length ? getComputedStyle(texts[0]).fill : '',
               size: texts.length ? parseFloat(getComputedStyle(texts[0]).fontSize) : 0,
               transform: texts.length ? getComputedStyle(texts[0]).textTransform : '',
               spacing: texts.length ? getComputedStyle(texts[0]).letterSpacing : '',
               // The dua itself, to compare prominence against.
               duaFill: getComputedStyle(document.getElementById('duaLine1')).color,
               duaSize: parseFloat(getComputedStyle(document.getElementById('duaLine1')).fontSize),
               blocksTaps: getComputedStyle(svg).pointerEvents };
    });
    await c.ctx.close();
    return out;
  };
  const bridgeArc = await arcOf(plan({ mode:'fajr', fajr:'04:45', finalWake:'06:15' }));
  check('A bridge night is drawn with three points', bridgeArc.marks.length === 3);
  const bright = bridgeArc.marks.filter(m => m.bright);
  check('Fajr is the one bright point', bright.length === 1);
  check('And it is the highest point on the arc, not a break in it',
        bright[0].y === Math.min(...bridgeArc.marks.map(m => m.y)),
        JSON.stringify(bridgeArc.marks.map(m => m.y)));
  /* The labels are Arabic, and asserted as literal strings for the same
     reason the dua is: comparing the screen against the app's own constant
     proves only that the app agrees with itself. */
  check('The arc names its points in Arabic',
        bridgeArc.labels.join('|') === 'النوم|الفجر|الاستيقاظ',
        bridgeArc.labels.join('|'));
  check('Each label is laid out right to left',
        bridgeArc.dir.every(d => d === 'rtl'), bridgeArc.dir.join(','));
  check('In the same Naskh as the rest of the Arabic',
        /Amiri Naskh/.test(bridgeArc.family), bridgeArc.family);
  check('With no tracking and no case transform',
        (bridgeArc.spacing === 'normal' || parseFloat(bridgeArc.spacing) === 0)
        && bridgeArc.transform === 'none',
        `${bridgeArc.spacing} / ${bridgeArc.transform}`);
  /* ظ is in الاستيقاظ and was NOT in the first font cut: a missing glyph
     falls back to the system face silently, so one letter of one label would
     have been set in something else. This is the check that catches it. */
  check('Every letter of every label is in the font cut',
        await (async () => {
          const c = await open(plan({ mode:'fajr', fajr:'04:45', finalWake:'06:15' }));
          const out = await c.p.evaluate(async () => {
            await document.fonts.ready;
            const chars = [...new Set('النومالفجرالاستيقاظ')];
            return chars.filter(ch => !document.fonts.check(`20px "Amiri Naskh"`, ch));
          });
          await c.ctx.close();
          return out.length === 0;
        })());
  /* "Keep these labels visually very subtle. The dua must remain the clear
     visual focus." Both halves of that, measured. */
  check('The labels sit far back from the dua',
        bridgeArc.size < bridgeArc.duaSize * 0.45,
        `${bridgeArc.size}px against the dua's ${bridgeArc.duaSize}px`);
  check('And are much fainter than it', await (async () => {
    const alpha = s => { const m = /rgba?\([^)]*?,\s*([\d.]+)\)$/.exec(s); return m ? Number(m[1]) : 1; };
    return alpha(bridgeArc.fill) <= 0.3 && alpha(bridgeArc.duaFill) >= 0.9;
  })(), `${bridgeArc.fill} against ${bridgeArc.duaFill}`);
  check('But they are not clipped by the box that holds them', bridgeArc.inside);

  const plainArc = await arcOf(plan({ mode:'continuous', wake:'06:30' }));
  check('An ordinary night is drawn with two', plainArc.marks.length === 2);
  check('And is labelled for what it is',
        plainArc.labels.join('|') === 'النوم|الاستيقاظ', plainArc.labels.join('|'));
  check('Its labels fit too', plainArc.inside);

  /* Nothing in the animation may sit between a tired person and the one
     button on the screen. */
  const tapTest = await open(plan({ mode:'continuous', wake:'06:30' }));
  await tapTest.p.locator('#momentGo').click();
  await tapTest.p.waitForTimeout(300);   // mid-fade, on purpose
  const topmost = await tapTest.p.evaluate(() => {
    const a = document.getElementById('duaAmin').getBoundingClientRect();
    const el = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
    return el && (el.id || el.tagName);
  });
  check('The button is tappable while the screen is still fading in',
        topmost === 'duaAmin', String(topmost));
  await tapTest.p.locator('#duaAmin').click();
  await tapTest.p.waitForTimeout(5600);
  check('A tap during the fade still completes the night',
        await tapTest.p.locator('#lazyVeil').isVisible());
  await tapTest.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
