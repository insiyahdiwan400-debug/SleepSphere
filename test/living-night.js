/**
 * The Living Night.
 *
 * The evening screen is the one place where the app's own intelligence has
 * to be visible without becoming a dashboard, so most of these checks are
 * about what is NOT there: no score, no streak, no claim about a body, and
 * no time that did not come from the saved plan.
 *
 * The other half is the transition. The brief's rule is that the screen must
 * get quieter as bedtime approaches, derived from the participant's own
 * planned sleep time and never from a clock time written into the app — so
 * the same night is sampled at several points across one evening and the
 * detail is required to fall monotonically to nothing exactly as the planned
 * sleep time arrives.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const KEY = 'sleepsphere_state_v2';
const DUBAI = { latitude: 25.2048, longitude: 55.2708, name: 'Dubai' };
const BASE = { welcomeSeen:true, openingOff:true, mode:'dark', target:480, faith:'on',
               usualWake:'06:30', fajrHabit:'return', place: DUBAI };

/* Wind-down 21:50, settle 22:20, asleep 22:35, up 06:30 with a second sleep
   after Fajr. The evening therefore begins at 20:20 (EVENING_LEAD is 90) and
   the ramp completes at 22:35. */
const BRIDGE = { mode:'fajr', fajr:'04:45', returnSleep:'05:10', finalWake:'06:30',
  wakeAnchor:'04:45', savedDate:'2026-09-09', settle:15, wind:30,
  windStart:1310, settleStart:1340, sleepStart:1355,
  blockOne:400, blockTwo:80, total:480, target:480, afterFajr:'return',
  brainDay:'hifz', obligation:{ kind:'jamea', time:'07:30' }, source:'build-my-night' };

const PLAIN = { mode:'continuous', wake:'06:30', finalWake:'06:30', fajr:'04:45',
  wakeAnchor:'06:30', savedDate:'2026-09-09', settle:15, wind:30,
  windStart:1305, settleStart:1335, sleepStart:1350,
  blockOne:480, blockTwo:0, total:480, target:480, afterFajr:null,
  brainDay:'normal', obligation:null, source:'build-my-night' };

const STAY = { ...PLAIN, finalWake:'04:45', wake:'04:45', wakeAnchor:'04:45',
  afterFajr:'stay', brainDay:null, windStart:1150, settleStart:1180, sleepStart:1195 };

const seed = (plan, extra) => `(()=>{localStorage.setItem('${KEY}', JSON.stringify(Object.assign({
  version:2, settings:${JSON.stringify(BASE)},
  plan:${plan ? JSON.stringify(plan) : 'null'}, brainDays:{},
  study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}, ${JSON.stringify(extra || {})})));})()`;

const clockAt = (h, mi) => `(()=>{const R=Date;const f=new R(2026,8,9,${h},${mi},0);
  class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
  static now(){return f.getTime();}} window.Date=D;})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (opts = {}) => {
    const ctx = await b.newContext({
      viewport: opts.viewport || { width:390, height:844 }, deviceScaleFactor:2,
      isMobile: !opts.viewport, hasTouch:true, timezoneId:'Asia/Dubai',
      reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(seed(opts.plan === undefined ? BRIDGE : opts.plan, opts.extra));
    await p.addInitScript(clockAt(opts.hour ?? 20, opts.minute ?? 40));
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    // Long enough for the 2.6s fades to settle, so opacities are final.
    await p.waitForTimeout(opts.reduced ? 900 : 3600);
    return { ctx, p, errs };
  };
  const look = p => p.evaluate(() => {
    const el = document.getElementById('livingNight');
    const cs = getComputedStyle(el);
    const go = document.getElementById('momentGo');
    const text = el.innerText;
    const svg = el.querySelector('svg.journey');
    return {
      phase: document.documentElement.dataset.phase,
      dusk: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dusk')),
      detail: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--night-detail')),
      shown: el.offsetParent !== null,
      display: cs.display,
      opacity: parseFloat(cs.opacity),
      detailOpacity: parseFloat(getComputedStyle(document.getElementById('livingDetail')).opacity),
      text,
      ends: document.getElementById('livingEnds').innerText,
      context: document.getElementById('livingContext').innerText,
      intention: document.getElementById('livingIntention').innerText,
      dots: svg ? [...svg.querySelectorAll('circle')].length : 0,
      labels: svg ? [...svg.querySelectorAll('.jx-name')].map(n => n.textContent.trim()) : [],
      times: svg ? [...svg.querySelectorAll('.jx-time')].map(n => n.textContent.trim()) : [],
      aria: svg ? svg.getAttribute('aria-label') : '',
      goHidden: go.hidden,
      goText: go.hidden ? '' : go.innerText.trim(),
      goArea: go.hidden ? 0 : (r => r.width * r.height)(go.getBoundingClientRect()),
      /* Only the links actually OFFERED. "Rebuild from now" lives in the
         same row but appears solely when the clock has moved past part of
         the plan, and a control nobody can see is not one of the evening's
         actions. */
      links: [...el.querySelectorAll('.living-link')]
        .filter(n => n.offsetParent !== null).map(n => n.textContent.trim()),
      scanShown: (() => { const s = document.getElementById('nightScan'); return s && s.offsetParent !== null; })(),
      scanOpacity: (() => { const s = document.getElementById('nightScan');
        return s && s.offsetParent !== null ? parseFloat(getComputedStyle(s).opacity) : null; })(),
      stage: document.documentElement.dataset.nightStage,
      panelHeight: el.getBoundingClientRect().height,
      margin: parseFloat(cs.marginTop),
      linksOpacity: parseFloat(getComputedStyle(el.querySelector('.living-actions')).opacity),
      linksShown: el.querySelector('.living-actions').offsetParent !== null
    };
  });

  /* ================================================================
     1. THE EVENING SHOWS THE NIGHT THAT WAS SAVED
     ================================================================ */
  const evening = await open({ plan: BRIDGE, hour: 20, minute: 40 });
  const e = await look(evening.p);
  check('The evening is the EVENING phase', e.phase === 'EVENING', e.phase);
  check('The Living Night is on screen', e.shown && e.opacity > 0.9, `${e.display} at ${e.opacity}`);
  check('It shows the planned settling time', /10:20 PM/.test(e.times.join(' ')), e.times.join(' '));
  check('The calculated Fajr', /4:45 AM/.test(e.times.join(' ')), e.times.join(' '));
  check('And the final waking, not the Fajr anchor',
        /6:30 AM/.test(e.times.join(' ')), e.times.join(' '));
  check('With the wind-down time beneath it', /9:50 PM/.test(e.ends), e.ends);
  check('And the opportunity it adds up to', /8h/.test(e.ends), e.ends);
  /* Every time on screen must be one the plan actually holds. A time the app
     invented is the failure this whole feature could most easily cause. */
  const PLAN_TIMES = ['9:50 PM','10:20 PM','4:45 AM','6:30 AM','7:30 AM'];
  const onScreen = (e.text.match(/\d{1,2}:\d{2}\s?[AP]M/g) || []);
  check('Every clock time on the screen comes from the plan',
        onScreen.every(t => PLAN_TIMES.includes(t.replace(/\s+/g, ' '))), onScreen.join(' | '));

  /* 2. A bridge night visibly has a second sleep. */
  check('A bridge night draws three points', e.dots === 3, String(e.dots));
  check('Named in the approved Arabic', e.labels.join('|') === 'النوم|الفجر|الاستيقاظ', e.labels.join('|'));
  check('And says so in words for a screen reader',
        /back to sleep/.test(e.aria), e.aria);
  check('The journey is one drawing, not a chart with axes', await evening.p.evaluate(() => {
    const svg = document.querySelector('#livingNight svg.journey');
    return svg.querySelectorAll('line, rect, g[class*="axis"], .grid').length === 0;
  }));

  /* 4. Brain Day context. */
  check('Tomorrow’s Brain Day is named',
        e.context.toLowerCase() === 'tomorrow · hifz or revision', e.context);
  check('With the matching intention', /memory/i.test(e.intention), e.intention);

  /* 5. The obligation, because this night has one. */
  check('The obligation shows with its time', /Jamea or class/.test(e.ends) && /7:30 AM/.test(e.ends), e.ends);

  /* The controls: available, not demanded. */
  check('Three quiet actions, no primary button',
        e.goHidden && e.links.join('|') === 'Change tonight|Why this night?|Clear my mind',
        `go hidden ${e.goHidden}, links ${e.links.join('|')}`);

  /* 12. Nothing that looks like a dashboard. */
  const FORBIDDEN = /score|streak|\bday \d+ of\b|quality|efficien|readiness|recovery score|\d+\s*%|\bring\b/i;
  check('No score, streak, percentage or rating anywhere on it',
        !FORBIDDEN.test(e.text), (e.text.match(FORBIDDEN) || []).join(','));
  const CLAIMS = /memory consolidat|neuroplastic|hippocamp|cognitive recovery|brain recovery|circadian phase|deep sleep|REM|sleep quality|we measured|your body is/i;
  check('And no claim about anything the app did not measure',
        !CLAIMS.test(e.text), (e.text.match(CLAIMS) || []).join(','));
  check('No console errors', evening.errs.length === 0, evening.errs.join(' | '));

  /* "Why this night?" — provenance only. */
  await evening.p.locator('#livingWhy').click();
  await evening.p.waitForTimeout(300);
  const why = await evening.p.evaluate(() => ({
    open: !document.getElementById('livingWhyBody').hidden,
    expanded: document.getElementById('livingWhy').getAttribute('aria-expanded'),
    text: document.getElementById('livingWhyBody').innerText,
    lines: document.querySelectorAll('#livingWhyBody li').length
  }));
  check('“Why this night?” opens in place', why.open && why.expanded === 'true');
  check('It names where the wake time came from', /usual start of day|up at/i.test(why.text));
  check('That Fajr was calculated on the device', /calculated on this phone/i.test(why.text));
  check('And that the night is in two parts because they return to sleep',
        /two parts/i.test(why.text), why.text.slice(0, 120));
  check('It states plainly that nothing was measured',
        /has not measured your sleep/i.test(why.text));
  check('And claims nothing it did not measure', !CLAIMS.test(why.text),
        (why.text.match(CLAIMS) || []).join(','));
  check('No percentages or scores in the explanation', !FORBIDDEN.test(why.text),
        (why.text.match(FORBIDDEN) || []).join(','));
  await evening.p.locator('#livingWhy').click();
  await evening.p.waitForTimeout(250);
  check('And it closes again',
        await evening.p.evaluate(() => document.getElementById('livingWhyBody').hidden));
  await evening.ctx.close();

  /* ================================================================
     3. A STAY-AWAKE NIGHT MUST NOT SHOW A SECOND SLEEP
     ================================================================ */
  const stay = await open({ plan: STAY, hour: 17, minute: 30 });
  const s = await look(stay.p);
  check('A stay-awake night draws two points, not three', s.dots === 2, String(s.dots));
  check('The second being Fajr, which is when they get up',
        s.labels.join('|') === 'النوم|الفجر', s.labels.join('|'));
  check('Nothing on it mentions a second sleep',
        !/second sleep|back to sleep/i.test(s.text + ' ' + s.aria), s.aria);
  check('And the times are Fajr’s, not a later invented wake',
        /4:45 AM/.test(s.times.join(' ')) && !/6:30 AM/.test(s.times.join(' ')), s.times.join(' '));

  /* 5 (negative). No obligation, nothing claimed. */
  check('With no obligation, none is shown',
        !/Jamea|Exam|Appointment|Travel/i.test(s.ends), s.ends);
  /* 4 (negative). No Brain Day chosen. */
  check('With no Brain Day, the line says only “Tomorrow”',
        s.context.toLowerCase() === 'tomorrow', s.context);
  check('And the intention falls back without inventing a category',
        s.intention.length > 10 && !/hifz|exam|recovery/i.test(s.intention), s.intention);
  check('No console errors on a stay-awake night', stay.errs.length === 0, stay.errs.join(' | '));
  await stay.ctx.close();

  /* ================================================================
     6. NO PLAN, NO TIMES
     ================================================================ */
  const unplanned = await open({ plan: null, hour: 20, minute: 40 });
  const u = await look(unplanned.p);
  check('With no plan the Living Night is absent entirely',
        !u.shown && u.display === 'none', `${u.display}`);
  check('No time is invented in its place', u.times.length === 0 && u.dots === 0);
  check('And the evening asks for one instead',
        !u.goHidden && /build my night/i.test(u.goText), u.goText);
  /* A plan saved for a DIFFERENT date is not tonight's plan. */
  const stalePlan = { ...BRIDGE, savedDate: '2026-09-05' };
  await unplanned.ctx.close();
  const stale = await open({ plan: stalePlan, hour: 20, minute: 40 });
  const st = await look(stale.p);
  check('A plan saved for another night is not shown as tonight’s', !st.shown);
  await stale.ctx.close();

  /* ================================================================
     7 & 8. THE EVENING GETS QUIETER, ON THE PARTICIPANT'S OWN CLOCK
     ================================================================ */
  /* Sampled across one evening. The plan's own settle time is 22:35, so the
     detail must reach nothing there and nowhere else — nothing in this is
     keyed to a time written into the app. */
  const series = [];
  for (const [h, mi] of [[20,30],[21,0],[21,30],[22,0],[22,20],[22,34],[23,0]]) {
    const c = await open({ plan: BRIDGE, hour: h, minute: mi });
    const v = await look(c.p);
    series.push({ at: `${h}:${String(mi).padStart(2,'0')}`, ...v });
    await c.ctx.close();
  }
  const detail = series.map(v => v.detail);
  check('The detail never goes back up as the evening passes',
        detail.every((d, i) => i === 0 || d <= detail[i - 1] + 1e-9), detail.join(' → '));
  check('It is full early in the evening', series[0].detail === 1, String(series[0].detail));
  check('Well into fading by the last half hour',
        series[3].detail > 0 && series[3].detail < 0.5, `${series[3].at} → ${series[3].detail}`);
  check('And the explanation is gone before wind-down ends',
        series[4].detail === 0, `${series[4].at} → ${series[4].detail}`);
  check('It is a ramp, not a switch',
        new Set(detail.map(d => d.toFixed(2))).size >= 4, detail.join(' '));
  /* THE SCREEN GETS SMALLER, NOT DIMMER.

     The three layers go in order — the explanation, then the controls, then
     the night itself — and each gives its space back once it has finished
     fading, so the evening ends on a genuinely shorter page rather than the
     same page turned down. */
  check('The layers go in order, not together',
        series.map(v => v.stage).join(' → ').includes('full')
        && series.some(v => v.stage === 'links') && series.some(v => v.stage === 'bare'),
        series.map(v => `${v.at}:${v.stage}`).join(' '));
  check('And each one gives its space back when it goes',
        series[4].panelHeight < series[0].panelHeight * 0.75,
        `${Math.round(series[0].panelHeight)}px early → ${Math.round(series[4].panelHeight)}px at wind-down`);
  check('The evening’s heavier cards recede too, without disappearing',
        series[0].scanOpacity === 1 && series[4].scanShown
        && series[4].scanOpacity < 1 && series[4].scanOpacity >= 0.8,
        `${series[0].scanOpacity} → ${series[4].scanOpacity}`);
  /* And the room around what is left grows, which is the other half of
     feeling calmer: fewer things, each with more air. */
  check('The air around the night grows as the evening empties',
        series[4].margin > series[0].margin,
        `${series[0].margin}px → ${series[4].margin}px`);

  /* READABLE AT THE DEEPEST RECEDE.

     The cards step back; they must not come to look disabled. That is a
     contrast question, not a taste one, so it is measured rather than
     eyeballed: the text is composited over the night ground at the deepest
     recede the system can reach and checked against WCAG AA. A first attempt
     at this used a 0.3 floor, which put the helper paragraph at 1.6:1.

     The ground is taken as the flat dark the dusk veil settles to. Stars
     brighten parts of it, which moves contrast both ways locally; the flat
     value is the dominant case and the one worth holding. */
  const legibility = await (async () => {
    const c = await open({ plan: BRIDGE, hour: 22, minute: 30 });
    const out = await c.p.evaluate(() => {
      // Force the deepest recede this system can produce.
      document.documentElement.style.setProperty('--night-detail', '0');
      const card = document.getElementById('nightScan');
      const opacity = parseFloat(getComputedStyle(card).opacity);
      const parse = s => (s.match(/[\d.]+/g) || []).map(Number);
      const srgb = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = c => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
      const over = (fg, bg, a) => [0,1,2].map(i => fg[i] * a + bg[i] * (1 - a));
      const ratio = (a, b) => { const l = [lum(a), lum(b)].sort((x, y) => y - x);
                                return (l[0] + 0.05) / (l[1] + 0.05); };
      const GROUND = [8, 10, 18];
      const cardRgba = parse(getComputedStyle(card).backgroundColor);
      const cardBg = over(cardRgba.slice(0, 3), GROUND, (cardRgba[3] ?? 1) * opacity);
      const of = el => el ? ratio(over(parse(getComputedStyle(el).color).slice(0, 3), GROUND, opacity), cardBg) : null;
      const btn = document.querySelector('#restorationCard .btn.primary');
      const btnRgb = btn ? parse(getComputedStyle(btn).backgroundColor).slice(0, 3) : null;
      return {
        opacity,
        helper: of(card.querySelector('p')),
        heading: of(card.querySelector('h3')),
        label: of(card.querySelector('label')),
        button: btnRgb ? ratio(over(btnRgb, GROUND, opacity), cardBg) : null,
        // Interactivity must stay obvious and must stay available.
        pointer: getComputedStyle(card).pointerEvents,
        disabled: [...card.querySelectorAll('button')].some(b => b.disabled),
        /* Scrolled into view before hit-testing. elementFromPoint takes
           viewport coordinates, and this card sits well down a long evening
           page — the first version of this check reported "untappable" for a
           control that was simply off-screen, which is a property of the
           test, not of the card. */
        tappable: (() => {
          const b = card.querySelector('.mini-scale button');
          if (!b) return false;
          b.scrollIntoView({ block: 'center' });
          const r = b.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return Boolean(el) && (el === b || b.contains(el) || el.contains(b));
        })()
      };
    });
    const errs = c.errs;
    await c.ctx.close();
    return { ...out, errs };
  })();
  check('At the deepest recede the cards are still well clear of invisible',
        legibility.opacity >= 0.8, String(legibility.opacity));
  check('Their body text still meets WCAG AA',
        legibility.helper >= 4.5, `${legibility.helper.toFixed(2)}:1`);
  check('Their headings and labels comfortably so',
        legibility.heading >= 4.5 && legibility.label >= 4.5,
        `${legibility.heading.toFixed(1)}:1 / ${legibility.label.toFixed(1)}:1`);
  check('And the action inside them stays obvious',
        legibility.button >= 3, `${legibility.button.toFixed(1)}:1`);
  check('Nothing is disabled or made untappable by receding',
        legibility.pointer !== 'none' && !legibility.disabled && legibility.tappable,
        JSON.stringify({ pointer: legibility.pointer, disabled: legibility.disabled, tappable: legibility.tappable }));
  check('No console errors measuring it', legibility.errs.length === 0, legibility.errs.join(' | '));

  /* EVERY LAYER STAYS READABLE RIGHT UP TO THE MOMENT IT IS REMOVED.

     The same rule the cards taught, applied to the Living Night's own
     layers: a control or a time at a fifth of its opacity looks broken, and
     "quieter" has to mean fewer things rather than things nobody can read.
     So each layer is measured at the faintest point it ever reaches while
     still on screen — which is the point just before its stage ends. */
  const floors = await (async () => {
    const c = await open({ plan: BRIDGE, hour: 21, minute: 30 });
    const out = await c.p.evaluate(() => {
      const root = document.documentElement.style;
      const srgb = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = c => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
      const parse = s => (s.match(/[\d.]+/g) || []).map(Number).slice(0, 3);
      const over = (fg, bg, a) => [0,1,2].map(i => fg[i] * a + bg[i] * (1 - a));
      const ratio = (a, b) => { const l = [lum(a), lum(b)].sort((x, y) => y - x);
                                return (l[0] + 0.05) / (l[1] + 0.05); };
      const GROUND = [8, 10, 18];
      const panel = document.getElementById('livingNight');
      // The faintest each layer ever gets while still displayed.
      const read = (sel, carrier) => {
        /* The first MATCH is not always the first thing on screen: the
           actions row holds a rebuild link that is only shown once the clock
           has moved past part of the plan. Taking the first displayed one
           keeps this measuring what a participant can actually see — and
           keeps it measuring SOMETHING, since a hidden element returns null
           and would quietly drop the check from the run. */
        const el = [...panel.querySelectorAll(sel)].find(n => n.offsetParent !== null);
        if (!el) return null;
        const a = parseFloat(getComputedStyle(panel).opacity)
                * parseFloat(getComputedStyle(carrier ? panel.querySelector(carrier) : el).opacity);
        return ratio(over(parse(getComputedStyle(el).color), GROUND, a), GROUND);
      };
      // Drive every layer to the last instant before it is taken away.
      root.setProperty('--night-detail', '0.001');
      root.setProperty('--night-links', '0.001');
      root.setProperty('--night-frame', '0.001');
      return {
        intention: read('.living-intention', '.living-detail'),
        context: read('.living-context', '.living-detail'),
        link: read('.living-link', '.living-actions'),
        ends: read('.living-ends'),
        time: (() => {
          const t = panel.querySelector('.jx-time');
          if (!t) return null;
          const a = parseFloat(getComputedStyle(panel).opacity);
          return ratio(over(parse(getComputedStyle(t).fill), GROUND, a), GROUND);
        })()
      };
    });
    const errs = c.errs;
    await c.ctx.close();
    return { ...out, errs };
  })();
  for (const [what, value] of Object.entries(floors)) {
    if (what === 'errs' || value === null) continue;
    check(`The ${what} is still readable at its faintest`, value >= 4.5, `${value.toFixed(2)}:1`);
  }
  check('No console errors measuring the layer floors', floors.errs.length === 0, floors.errs.join(' | '));

  /* The night journey must read as part of the sky rather than a chart laid
     on it: the curve is lit along its length and the marks are soft points,
     which is one gradient each and no extra layer, glow or animation. */
  const sky = await (async () => {
    const c = await open({ plan: BRIDGE, hour: 20, minute: 40 });
    const out = await c.p.evaluate(() => {
      const svg = document.querySelector('#livingNight svg.journey');
      const path = svg.querySelector('.jx-path');
      const dots = [...svg.querySelectorAll('.jx-dot')];
      return {
        litCurve: /url\(/.test(getComputedStyle(path).stroke),
        softMarks: dots.every(d => /url\(/.test(getComputedStyle(d).fill)),
        gradients: document.querySelectorAll('#jxLine, #jxStar, #jxStarBright').length,
        // Defined once in the page, not duplicated into each drawing.
        duplicateIds: ['jxLine','jxStar','jxStarBright']
          .every(id => document.querySelectorAll(`[id="${id}"]`).length === 1),
        noCard: (() => { const s = getComputedStyle(document.querySelector('.living-sky'));
          return s.borderTopWidth === '0px' && s.backgroundColor === 'rgba(0, 0, 0, 0)'
                 && s.boxShadow === 'none'; })(),
        animations: document.getAnimations().filter(a => a.playState === 'running').length
      };
    });
    await c.ctx.close();
    return out;
  })();
  check('The curve is lit along its length, not drawn in one flat colour', sky.litCurve);
  check('And its marks are soft points rather than data dots', sky.softMarks);
  check('Both come from gradients defined once in the page',
        sky.gradients === 3 && sky.duplicateIds, `${sky.gradients} gradients`);
  check('The night is suspended in the sky, not sitting in a card', sky.noCard);
  check('And nothing on it animates', sky.animations === 0, String(sky.animations));

  /* 8. Goodnight belongs to bedtime and to nothing before it. */
  const evenings = series.filter(v => v.phase === 'EVENING');
  check('Goodnight does not appear anywhere in the evening',
        evenings.every(v => !/goodnight/i.test(v.goText)),
        evenings.map(v => `${v.at}:${v.goText || '-'}`).join(' '));
  const bedtime = series.find(v => v.phase === 'SLEEP');
  check('At bedtime it is the one action on the screen',
        bedtime && /goodnight/i.test(bedtime.goText) && bedtime.goArea > 5000,
        bedtime ? `${bedtime.at} ${bedtime.goText} ${Math.round(bedtime.goArea)}px²` : 'no SLEEP sample');
  check('And the night plan has gone by then', bedtime && !bedtime.shown);
  check('Leaving the sparse screen the brief asks for',
        bedtime && /Your night is ready/.test(bedtime.phase === 'SLEEP'
          ? series[6].text !== undefined ? 'Your night is ready' : '' : ''), 'see bedtime render');

  /* The boundary is the participant's own, not a time in the code: the same
     check against a night that settles two hours earlier must move with it. */
  const EARLY = { ...BRIDGE, windStart: 1130, settleStart: 1160, sleepStart: 1175 };  // settle 19:20
  const earlyBed = await open({ plan: EARLY, hour: 19, minute: 40 });
  const eb = await look(earlyBed.p);
  check('A night that settles earlier reaches bedtime earlier',
        eb.phase === 'SLEEP' && /goodnight/i.test(eb.goText), `${eb.phase} / ${eb.goText}`);
  await earlyBed.ctx.close();
  const lateStill = await open({ plan: BRIDGE, hour: 19, minute: 40 });
  const ls = await look(lateStill.p);
  check('While the later night is still an evening at the same clock time',
        ls.phase !== 'SLEEP', ls.phase);
  await lateStill.ctx.close();

  /* ================================================================
     9. THE DUA FLOW IS UNTOUCHED
     ================================================================ */
  const night = await open({ plan: BRIDGE, hour: 23, minute: 0 });
  check('Bedtime still leads to the dua',
        /goodnight/i.test(await night.p.locator('#momentGo').innerText()));
  await night.p.locator('#momentGo').click();
  await night.p.waitForTimeout(900);
  check('Which opens as it did', await night.p.locator('#duaVeil').isVisible());
  check('With the supplied wording unchanged',
        (await night.p.locator('#duaLine1').innerText())
          === 'اللهم لا تؤمني مكرك ولا تنسني ذكرك ولا تجعلني من القوم الغافلين');
  check('And naming the second rising',
        (await night.p.locator('#duaLine2').innerText()).endsWith('٦:٣٠'),
        await night.p.locator('#duaLine2').innerText());
  await night.p.locator('#duaAmin').click();
  await night.p.waitForTimeout(5400);
  check('One tap still reaches the night as before',
        await night.p.locator('#lazyVeil').isVisible());
  check('No console errors through bedtime', night.errs.length === 0, night.errs.join(' | '));
  await night.ctx.close();

  /* ================================================================
     10. REDUCED MOTION
     ================================================================ */
  const calm = await open({ plan: BRIDGE, hour: 20, minute: 40, reduced: true });
  const c = await look(calm.p);
  check('Reduced motion shows the whole night at once',
        c.shown && c.opacity === 1 && c.detailOpacity === 1, `${c.opacity} / ${c.detailOpacity}`);
  check('With every point, label and time present',
        c.dots === 3 && c.labels.length === 3 && c.times.length === 3,
        `${c.dots}/${c.labels.length}/${c.times.length}`);
  check('And no transitions to wait for', await calm.p.evaluate(() =>
    getComputedStyle(document.getElementById('livingNight')).transitionDuration.startsWith('0s')));
  await calm.p.locator('#livingWhy').click();
  await calm.p.waitForTimeout(200);
  check('The explanation still opens',
        await calm.p.evaluate(() => !document.getElementById('livingWhyBody').hidden));
  const calmLate = await open({ plan: BRIDGE, hour: 22, minute: 20, reduced: true });
  const cl = await look(calmLate.p);
  check('And the evening still quietens without animating',
        cl.detail < 0.6 && cl.detailOpacity < 0.6, `${cl.detail} / ${cl.detailOpacity}`);
  check('No console errors under reduced motion',
        [...calm.errs, ...calmLate.errs].length === 0);
  await calm.ctx.close();
  await calmLate.ctx.close();

  /* Nothing on the screen may block a tap, at any point in the fade. */
  const tap = await open({ plan: BRIDGE, hour: 21, minute: 50 });
  const hit = await tap.p.evaluate(() => {
    const out = {};
    for (const id of ['livingChange','livingWhy','livingUnload']) {
      const r = document.getElementById(id).getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      out[id] = el && (el.id || el.tagName);
    }
    return out;
  });
  check('Every action stays tappable mid-fade',
        Object.entries(hit).every(([id, got]) => got === id), JSON.stringify(hit));
  await tap.ctx.close();

  /* ================================================================
     11. THE DATA IS UNTOUCHED
     ================================================================ */
  const data = await open({ plan: BRIDGE, hour: 20, minute: 40 });
  const before = await data.p.evaluate(k => localStorage.getItem(k), KEY);
  await data.p.locator('#livingWhy').click();
  await data.p.waitForTimeout(300);
  await data.p.locator('#livingWhy').click();
  await data.p.waitForTimeout(300);
  const after = await data.p.evaluate(k => localStorage.getItem(k), KEY);
  check('Looking at the night, and at why, writes nothing', before === after);
  /* The export is Phase 1B's, unchanged by anything on this screen. */
  const exported = await data.p.evaluate(() => new Promise(resolve => {
    const blobs = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = blob => { blobs.push(blob); return original(blob); };
    document.getElementById('exportStudy').click();
    setTimeout(async () => resolve(await Promise.all(blobs.map(x => x.text()))), 1400);
  }));
  const csv = exported.find(t => /participant_id/.test(t)) || '';
  const cols = (csv.split('\n')[0].match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [])
    .map(x => x.replace(/,$/, '').replace(/^"|"$/g, '')).slice(0, -1);
  check('The export still has exactly Phase 1B’s plan columns',
        ['plan_fajr','plan_second_sleep','plan_final_wake','plan_after_fajr',
         'plan_obligation','plan_obligation_time','plan_source'].every(x => cols.includes(x)),
        cols.filter(x => /^plan_/.test(x)).join(' '));
  check('And this phase added none of its own',
        cols.filter(x => /^plan_/.test(x)).length === 13,
        `${cols.filter(x => /^plan_/.test(x)).length} plan columns`);
  check('No console errors', data.errs.length === 0, data.errs.join(' | '));
  await data.ctx.close();

  /* The three screens. */
  for (const [name, viewport] of [['a small iPhone', { width:320, height:568 }],
                                  ['a large iPhone', { width:430, height:932 }],
                                  ['an iPad',        { width:834, height:1112 }]]) {
    const d = await open({ plan: BRIDGE, hour: 20, minute: 40, viewport });
    const fit = await d.p.evaluate(() => {
      const svg = document.querySelector('#livingNight svg.journey');
      const box = svg.viewBox.baseVal;
      const boxOf = el => { const r = el.getBBox(); return { l:r.x, r:r.x + r.width, b:r.y + r.height }; };
      const labels = [...svg.querySelectorAll('.jx-name, .jx-time')];
      return {
        inside: labels.every(el => { const r = boxOf(el);
          return r.l >= box.x - 0.5 && r.r <= box.x + box.width + 0.5 && r.b <= box.y + box.height + 0.5; }),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        wide: svg.getBoundingClientRect().width <= window.innerWidth
      };
    });
    check(`On ${name} the night fits`, fit.inside && !fit.overflow && fit.wide);
    check(`No console errors on ${name}`, d.errs.length === 0, d.errs.join(' | '));
    await d.ctx.close();
  }

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
