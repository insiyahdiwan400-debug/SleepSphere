/**
 * When the night begins, and when it does not.
 *
 * This suite exists because of a real-device report: Today showed the final
 * Goodnight composition at 18:17 for a night planned at 22:12. Two separate
 * faults produced it, and both are pinned here:
 *
 *   · an unfinished Goodnight outranked the clock for as long as the state
 *     survived — the guard became MORE true the later in the day it got
 *   · checkLazyMorning() closed that night after renderAll() had already
 *     painted, leaving a bedtime frame over a morning
 *
 * And the product rule that replaced the old boundary: in the Jamea edition
 * the evening begins at calculated Maghrib once a night is planned, while
 * everything about how that evening QUIETS stays tied to the participant's
 * own wind-down and sleep times.
 *
 * Asia/Dubai throughout. Maghrib comes from the real engine, which answers in
 * local time; without a pinned zone these checks would assert whatever offset
 * the runner happened to have.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const KEY = 'sleepsphere_state_v2';
const DUBAI = { latitude: 25.2048, longitude: 55.2708, name: 'Dubai' };
const BASE = { welcomeSeen:true, openingOff:true, mode:'dark', target:480, faith:'on',
               usualWake:'06:30', fajrHabit:'return', place: DUBAI };

/* The night from the device report: wind-down 21:42, settle 22:12,
   asleep 22:27, Fajr 04:45, back to sleep 05:10, up 06:30.
   Dubai Maghrib on 7 October 2026 is 18:00, so the evening begins there. */
const PLAN = { mode:'fajr', fajr:'04:45', returnSleep:'05:10', finalWake:'06:30',
  wakeAnchor:'04:45', savedDate:'2026-10-07', settle:15, wind:30,
  windStart:1302, settleStart:1332, sleepStart:1347,
  blockOne:400, blockTwo:80, total:480, target:480, afterFajr:'return',
  brainDay:'hifz', obligation:null, source:'build-my-night' };

const STAY = { ...PLAN, mode:'continuous', wake:'04:45', finalWake:'04:45',
  wakeAnchor:'04:45', afterFajr:'stay', returnSleep:null,
  windStart:1150, settleStart:1180, sleepStart:1195, blockOne:480, blockTwo:0 };

const seed = (extra) => `(()=>{localStorage.setItem('${KEY}', JSON.stringify(Object.assign({
  version:2, settings:${JSON.stringify(BASE)}, plan:${JSON.stringify(PLAN)}, brainDays:{}, lazyNight:null,
  study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}, ${JSON.stringify(extra || {})})));})()`;

const clockAt = (h, mi, d = 7) => `(()=>{const R=Date;const f=new R(2026,9,${d},${h},${mi},0);
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
    await p.addInitScript(seed(opts.extra));
    await p.addInitScript(clockAt(opts.hour ?? 20, opts.minute ?? 40, opts.day ?? 7));
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(opts.reduced ? 900 : 1700);
    return { ctx, p, errs };
  };
  const look = p => p.evaluate(() => {
    const ph = window.__phase();
    const panel = document.getElementById('livingNight');
    const go = document.getElementById('momentGo');
    return { phase: ph.phase, why: ph.reason, anchors: ph.anchors,
             stamped: document.documentElement.dataset.phase,
             dusk: +window.__dusk().toFixed(3),
             stage: document.documentElement.dataset.nightStage,
             ask: document.getElementById('momentAsk').innerText,
             go: go.hidden ? '' : go.innerText.trim(),
             living: panel.offsetParent !== null,
             morningVeil: !document.getElementById('lazyMorningVeil').hidden,
             earlyVeil: !document.getElementById('earlyVeil').hidden };
  });
  const read = p => p.evaluate(k => localStorage.getItem(k), KEY);

  /* ================================================================
     THE PRAYER ENGINE IS THE ONLY SOURCE OF MAGHRIB
     ================================================================ */
  const probe = await open({ hour: 19, minute: 0 });
  const maghrib = await probe.p.evaluate(() => window.__prayerProbe(25.2048, 55.2708, 2026, 10, 7).maghrib);
  check('Maghrib comes from the existing tested engine', maghrib === '18:00', maghrib);
  /* The Fatimi convention is Maghrib at sunset; this is the same value the
     prayer card prints, not a second calculation made for the evening. */
  const sunset = await probe.p.evaluate(() => window.__prayerProbe(25.2048, 55.2708, 2026, 10, 7).sunset);
  check('And it is the same instant as sunset, as the convention requires',
        maghrib === sunset, `${maghrib} / ${sunset}`);
  check('No console errors', probe.errs.length === 0, probe.errs.join(' | '));
  await probe.ctx.close();

  /* ================================================================
     1. THE REPORTED BUG — 18:17, a night planned for 22:12
     ================================================================ */
  const reported = await open({ hour: 18, minute: 17 });
  const r = await look(reported.p);
  check('At 18:17 the app is in the evening, not at bedtime',
        r.phase === 'EVENING' && r.stamped === 'EVENING', `${r.phase} / ${r.why}`);
  check('Because Maghrib has passed', r.why === 'after-maghrib', r.why);
  check('The Living Night is shown whole', r.living && r.dusk === 0 && r.stage === 'full',
        `dusk ${r.dusk}, stage ${r.stage}`);
  check('And Goodnight is nowhere on the screen',
        !/goodnight/i.test(r.go) && !/night is ready/i.test(r.ask), `${r.ask} / ${r.go}`);
  check('The plan was read correctly all along',
        r.anchors.source === 'plan' && r.anchors.sleep === 1347 && r.anchors.wake === 390,
        JSON.stringify(r.anchors));
  await reported.ctx.close();

  /* Before Maghrib the same night is still the day. */
  const beforeMaghrib = await open({ hour: 17, minute: 30 });
  const bm = await look(beforeMaghrib.p);
  check('Half an hour before Maghrib it is still DAY', bm.phase === 'DAY', bm.phase);
  check('With no Living Night yet', !bm.living);
  await beforeMaghrib.ctx.close();

  /* The boundary itself, either side of the engine's own answer. */
  const justBefore = await open({ hour: 17, minute: 58 });
  const justAfter  = await open({ hour: 18, minute: 2 });
  check('DAY ends exactly at the calculated Maghrib',
        (await look(justBefore.p)).phase === 'DAY' && (await look(justAfter.p)).phase === 'EVENING');
  await justBefore.ctx.close(); await justAfter.ctx.close();

  /* ================================================================
     2 & 3. THE EVENING QUIETS ON THE PLAN, NOT ON MAGHRIB
     ================================================================ */
  const series = [];
  for (const [h, mi] of [[18,10],[19,30],[20,40],[21,30],[22,0],[22,20],[22,40]]) {
    const c = await open({ hour: h, minute: mi });
    series.push({ at: `${h}:${String(mi).padStart(2,'0')}`, ...(await look(c.p)) });
    await c.ctx.close();
  }
  check('Nothing has quietened between Maghrib and wind-down',
        series[0].dusk === 0 && series[1].dusk === 0 && series[0].stage === 'full',
        series.slice(0,2).map(v => `${v.at}:${v.dusk}`).join(' '));
  check('The ramp only starts once wind-down is in sight',
        series[2].dusk > 0 && series[2].dusk < 0.5, `${series[2].at} → ${series[2].dusk}`);
  check('It deepens through wind-down',
        series[4].dusk > series[2].dusk && series[5].dusk > series[4].dusk,
        series.slice(2,6).map(v => `${v.at}:${v.dusk}`).join(' '));
  check('The explanation goes before the controls do',
        series[4].stage === 'links' || series[5].stage === 'links' || series[5].stage === 'frame',
        series.map(v => `${v.at}:${v.stage}`).join(' '));
  check('Dusk never goes backwards across the evening',
        series.map(v => v.dusk).every((d, i) => i === 0 || d >= series[i-1].dusk - 1e-9),
        series.map(v => v.dusk).join(' → '));
  const evenings = series.filter(v => v.phase === 'EVENING');
  check('Goodnight appears in none of the evening',
        evenings.every(v => !/goodnight/i.test(v.go)),
        evenings.map(v => `${v.at}:${v.go || '-'}`).join(' '));
  const bed = series.find(v => v.phase === 'SLEEP');
  check('And only at the planned bedtime does it become the screen',
        bed && /goodnight/i.test(bed.go) && !bed.living && /night is ready/i.test(bed.ask),
        bed ? `${bed.at} ${bed.go}` : 'no SLEEP sample');

  /* ================================================================
     6 & 7. AN UNFINISHED NIGHT FROM TESTING
     ================================================================ */
  const LAST_NIGHT = { startedAt:'2026-10-06T19:10:00.000Z', bedTime:'23:10' };  // 23:10 local
  const stale = await open({ hour: 18, minute: 17, extra: { lazyNight: LAST_NIGHT } });
  const s = await look(stale.p);
  check('An unfinished night from yesterday cannot pin today to bedtime',
        s.phase === 'EVENING' && s.stamped === 'EVENING', `${s.phase} / ${s.why}`);
  check('The Living Night shows behind it', s.living);
  /* 7. checkLazyMorning() closes that night at boot, AFTER renderAll() has
     painted. The stamped phase must match the live one — this is the stale
     frame that put a bedtime screen over a morning. */
  check('And the stamped phase matches the live one after the night closes',
        s.stamped === s.phase, `stamped ${s.stamped}, live ${s.phase}`);
  check('The morning card is offered', s.morningVeil);
  check('Which wrote a wake time but no morning record', await stale.p.evaluate(k => {
    const st = JSON.parse(localStorage.getItem(k));
    return Boolean(st.lazyNight && st.lazyNight.wakeTime) && (st.mornings || []).length === 0;
  }, KEY));
  /* "Not now" must leave the research data alone. */
  const beforeSkip = await read(stale.p);
  await stale.p.locator('#lazyMorningSkip').click();
  await stale.p.waitForTimeout(500);
  check('“Not now” fabricates nothing', (await read(stale.p)) === beforeSkip);
  check('And leaves the correct evening behind it',
        (await look(stale.p)).phase === 'EVENING' && await stale.p.evaluate(() =>
          document.getElementById('livingNight').offsetParent !== null));
  check('No console errors', stale.errs.length === 0, stale.errs.join(' | '));
  await stale.ctx.close();

  /* A night genuinely in progress is still honoured — tested at an hour the
     plan alone would NOT call sleep, so it is the open night doing the work
     and not 'past-sleep-time' masking it. Bed at 19:00, planned sleep 22:27. */
  const inBed = await open({ hour: 20, minute: 0,
    extra: { lazyNight: { startedAt:'2026-10-07T15:00:00.000Z', bedTime:'19:00' } } });
  const ib = await look(inBed.p);
  check('A night that is actually running still holds SLEEP',
        ib.phase === 'SLEEP' && ib.why === 'lazy-night-open', `${ib.phase} / ${ib.why}`);
  await inBed.ctx.close();

  /* And one that ran past its own length has expired. */
  const expired = await open({ hour: 14, minute: 0, day: 8,
    extra: { lazyNight: { startedAt:'2026-10-07T18:30:00.000Z', bedTime:'22:30' } } });
  check('One that outran the night it describes has expired',
        (await look(expired.p)).phase !== 'SLEEP', (await look(expired.p)).why);
  await expired.ctx.close();

  /* ================================================================
     4 & 5. AN EARLY GOODNIGHT IS CONFIRMED, NOT ASSUMED
     ================================================================ */
  const early = await open({ hour: 19, minute: 0 });
  const stateBefore = await read(early.p);
  await early.p.locator('#lazyStart').click();
  await early.p.waitForTimeout(700);
  const asked = await early.p.evaluate(() => ({
    shown: !document.getElementById('earlyVeil').hidden,
    title: document.querySelector('.early-title').innerText,
    sub: document.querySelector('.early-sub').innerText,
    lazy: !document.getElementById('lazyVeil').hidden,
    dua: !document.getElementById('duaVeil').hidden
  }));
  check('Tapping Goodnight hours early asks first', asked.shown, asked.title);
  check('Naming the participant’s own planned time',
        /10:27 PM/.test(asked.sub), asked.sub);
  check('It is a question, not a warning',
        !/stop|should|warning|careful|too early|bad/i.test(asked.title + ' ' + asked.sub),
        asked.title);
  check('And nothing has begun while it is open', !asked.lazy && !asked.dua);
  check('Nor has anything been written', (await read(early.p)) === stateBefore);

  /* "Not yet" — the whole point is that it changes nothing. */
  await early.p.locator('#earlyNo').click();
  await early.p.waitForTimeout(600);
  const after = await look(early.p);
  check('“Not yet” closes it and leaves the evening exactly as it was',
        !after.earlyVeil && after.phase === 'EVENING' && after.living,
        `${after.phase} / living ${after.living}`);
  check('No night was opened', await early.p.evaluate(k =>
    JSON.parse(localStorage.getItem(k)).lazyNight === null, KEY));
  check('The plan is untouched', await early.p.evaluate(k =>
    JSON.parse(localStorage.getItem(k)).plan.sleepStart === 1347, KEY));
  check('And the stored state is byte-for-byte what it was',
        (await read(early.p)) === stateBefore);

  /* "Yes" — a deliberate early night is a real night. */
  await early.p.locator('#lazyStart').click();
  await early.p.waitForTimeout(500);
  await early.p.locator('#earlyYes').click();
  await early.p.waitForTimeout(1200);
  /* The confirmation gates the route; it does not redirect it. Both of the
     screen's routes lead to the dua in the faith-aware edition. */
  check('Confirming goes on into the dua as always',
        await early.p.locator('#duaVeil').isVisible());
  check('Which still names the planned final rising',
        (await early.p.locator('#duaLine2').innerText()).endsWith('٦:٣٠'),
        await early.p.locator('#duaLine2').innerText());
  await early.p.locator('#duaAmin').click();
  await early.p.waitForTimeout(5400);
  check('And the night legitimately begins',
        await early.p.locator('#lazyVeil').isVisible());
  const confirmed = await early.p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  check('With the bed time it actually happened at',
        confirmed.lazyNight && confirmed.lazyNight.bedTime === '19:00',
        JSON.stringify(confirmed.lazyNight));
  /* The plan is NOT rewritten to agree with what happened. The whole study
     compares the two. */
  check('And the plan left saying what was planned',
        confirmed.plan.sleepStart === 1347 && confirmed.plan.finalWake === '06:30');
  check('No morning record invented', (confirmed.mornings || []).length === 0);
  check('No console errors through the early-night flow',
        early.errs.length === 0, early.errs.join(' | '));
  await early.ctx.close();

  /* ================================================================
     "TOO TIRED — JUST GO TO BED"

     It skips the planning and the questions. It does not skip the ritual:
     the dua asks nothing of anybody, and in the faith-aware edition it is
     the point of bedtime. No intermediate screen on the way.
     ================================================================ */
  const tiredLate = await open({ hour: 21, minute: 50 });   // wind-down has begun
  await tiredLate.p.locator('#lazyStart').click();
  await tiredLate.p.waitForTimeout(900);
  const tl = await tiredLate.p.evaluate(() => ({
    early: !document.getElementById('earlyVeil').hidden,
    dua: !document.getElementById('duaVeil').hidden,
    lazy: !document.getElementById('lazyVeil').hidden,
    build: !document.getElementById('nightVeil').hidden
  }));
  check('Too tired, after wind-down, goes straight to the dua',
        tl.dua && !tl.early && !tl.lazy, JSON.stringify(tl));
  check('With no intermediate screen on the way', !tl.build);
  check('Naming the planned final rising',
        (await tiredLate.p.locator('#duaLine2').innerText()).endsWith('٦:٣٠'));
  await tiredLate.p.locator('#duaAmin').click();
  await tiredLate.p.waitForTimeout(5400);
  check('And one tap carries on into the night',
        await tiredLate.p.locator('#lazyVeil').isVisible());
  check('No console errors', tiredLate.errs.length === 0, tiredLate.errs.join(' | '));
  await tiredLate.ctx.close();

  /* Before wind-down: the question first, then the same destination. */
  const tiredEarly = await open({ hour: 19, minute: 0 });
  const tiredBefore = await read(tiredEarly.p);
  await tiredEarly.p.locator('#lazyStart').click();
  await tiredEarly.p.waitForTimeout(800);
  check('Too tired, before wind-down, asks first',
        await tiredEarly.p.evaluate(() => !document.getElementById('earlyVeil').hidden));
  check('And nothing has begun while it asks', await tiredEarly.p.evaluate(() =>
    document.getElementById('duaVeil').hidden && document.getElementById('lazyVeil').hidden));
  await tiredEarly.p.locator('#earlyYes').click();
  await tiredEarly.p.waitForTimeout(1300);
  check('Confirming goes to the dua, directly',
        await tiredEarly.p.locator('#duaVeil').isVisible());
  check('Still with no intermediate screen',
        await tiredEarly.p.evaluate(() => document.getElementById('nightVeil').hidden));
  await tiredEarly.ctx.close();

  /* And "Not yet" on that route changes nothing either. */
  const tiredNotYet = await open({ hour: 19, minute: 0 });
  const notYetBefore = await read(tiredNotYet.p);
  await tiredNotYet.p.locator('#lazyStart').click();
  await tiredNotYet.p.waitForTimeout(700);
  await tiredNotYet.p.locator('#earlyNo').click();
  await tiredNotYet.p.waitForTimeout(700);
  check('Too tired then “Not yet” leaves the evening exactly as it was',
        (await look(tiredNotYet.p)).phase === 'EVENING'
        && await tiredNotYet.p.evaluate(() => document.getElementById('livingNight').offsetParent !== null));
  check('With no dua, no night and no record',
        await tiredNotYet.p.evaluate(() =>
          document.getElementById('duaVeil').hidden && document.getElementById('lazyVeil').hidden));
  check('And the stored state byte-for-byte unchanged',
        (await read(tiredNotYet.p)) === notYetBefore);
  await tiredNotYet.ctx.close();

  /* Faith-aware off: the plain goodnight, and no Arabic forced on anyone. */
  const plain = await open({ hour: 21, minute: 50,
    extra: { settings: Object.assign({}, BASE, { faith: 'off' }) } });
  await plain.p.locator('#lazyStart').click();
  await plain.p.waitForTimeout(900);
  check('With faith-aware off, too tired goes straight to the plain goodnight',
        await plain.p.locator('#lazyVeil').isVisible());
  check('And no dua is shown',
        await plain.p.evaluate(() => document.getElementById('duaVeil').hidden));
  check('No Arabic is forced on the screen at all', await plain.p.evaluate(() =>
    ![...document.querySelectorAll('[lang="ar"]')].some(el => el.offsetParent !== null)));
  check('The early question still gates that route too', await (async () => {
    const c = await open({ hour: 19, minute: 0,
      extra: { settings: Object.assign({}, BASE, { faith: 'off' }) } });
    await c.p.locator('#lazyStart').click();
    await c.p.waitForTimeout(700);
    const asked = await c.p.evaluate(() => !document.getElementById('earlyVeil').hidden);
    await c.ctx.close();
    return asked;
  })());
  check('No console errors with faith-aware off', plain.errs.length === 0, plain.errs.join(' | '));
  await plain.ctx.close();

  /* The deep links keep the semantics they were published with: they stamp
     bed time immediately, for a bedtime automation where nobody is holding
     the phone to answer a question. Changing that is a separate decision. */
  const link = await open({ hour: 19, minute: 0 });
  await link.p.evaluate(() => window.__deepLink ? window.__deepLink('lazy') : null);
  await link.p.waitForTimeout(700);
  const dl = await link.p.evaluate(() => ({
    early: !document.getElementById('earlyVeil').hidden,
    lazy: !document.getElementById('lazyVeil').hidden
  }));
  check('The lazy deep link still stamps bed time with no question',
        dl.lazy && !dl.early, JSON.stringify(dl));
  await link.ctx.close();

  /* Near the planned bedtime there is no question at all. */
  const onTime = await open({ hour: 22, minute: 40 });
  await onTime.p.locator('#momentGo').click();
  await onTime.p.waitForTimeout(800);
  check('At the planned bedtime Goodnight proceeds in silence',
        !(await onTime.p.evaluate(() => !document.getElementById('earlyVeil').hidden))
        && await onTime.p.locator('#duaVeil').isVisible());
  await onTime.ctx.close();
  /* Wind-down has begun: inside the plan, so still no question. */
  const windingDown = await open({ hour: 21, minute: 50 });
  await windingDown.p.locator('#lazyStart').click();
  await windingDown.p.waitForTimeout(700);
  check('Once wind-down has begun it proceeds in silence too',
        !(await windingDown.p.evaluate(() => !document.getElementById('earlyVeil').hidden)),
        'threshold is the participant’s own wind-down');
  await windingDown.ctx.close();

  /* ================================================================
     11. NO PLAN — the old behaviour, unchanged
     ================================================================ */
  const noPlan = await open({ hour: 18, minute: 17, extra: { plan: null } });
  const np = await look(noPlan.p);
  check('With no plan, Maghrib does not start an evening',
        np.phase === 'DAY' && np.anchors.source === 'usual', `${np.phase} / ${np.anchors.source}`);
  check('And no night is invented', !np.living);
  await noPlan.p.locator('#lazyStart').click();
  await noPlan.p.waitForTimeout(700);
  check('Nor is an early-night question asked against a plan that does not exist',
        !(await noPlan.p.evaluate(() => !document.getElementById('earlyVeil').hidden)));
  await noPlan.ctx.close();

  /* No location: no Maghrib, so the evening falls back to the lead before
     wind-down exactly as it did before this change. */
  const noPlace = await open({ hour: 18, minute: 17,
    extra: { settings: Object.assign({}, BASE, { place: null }) } });
  const npl = await look(noPlace.p);
  check('With no location the evening falls back to the plan alone',
        npl.phase === 'DAY', `${npl.phase} / ${npl.why}`);
  const laterNoPlace = await open({ hour: 20, minute: 30,
    extra: { settings: Object.assign({}, BASE, { place: null }) } });
  check('And still opens ninety minutes before wind-down',
        (await look(laterNoPlace.p)).phase === 'EVENING');
  await noPlace.ctx.close(); await laterNoPlace.ctx.close();

  /* ================================================================
     9 & 10. THE FAJR SHAPES ARE UNCHANGED
     ================================================================ */
  const bridge = await open({ hour: 22, minute: 40 });
  check('A Fajr Bridge night still names the second rising',
        (await bridge.p.evaluate(() => window.__dua().line2)).endsWith('٦:٣٠'));
  check('And its anchors still end at the final wake',
        (await look(bridge.p)).anchors.wake === 390);
  await bridge.ctx.close();

  const stay = await open({ hour: 19, minute: 0, extra: { plan: STAY } });
  const st = await look(stay.p);
  check('A stay-awake night still ends at Fajr',
        st.anchors.wake === 285, String(st.anchors.wake));
  /* This night settles at 19:55, so the ninety-minute lead opens its evening
     at 17:40 — EARLIER than Maghrib at 18:00. Maghrib is meant to bring the
     evening forward, never to push it back, so the lead correctly wins here.
     A participant who must be asleep before sunset keeps their evening. */
  check('A night that settles before Maghrib keeps its own earlier evening',
        st.phase === 'EVENING' && st.why === 'wind-down-approaching',
        `${st.phase} / ${st.why}`);
  check('And the dua names Fajr',
        (await stay.p.evaluate(() => window.__dua().line2)).endsWith('٤:٤٥'));
  await stay.ctx.close();

  /* ================================================================
     8. THE MORNING AFTER A REAL NIGHT
     ================================================================ */
  const morning = await open({ hour: 7, minute: 10, day: 8,
    extra: { lazyNight: { startedAt:'2026-10-07T18:30:00.000Z', bedTime:'22:30' } } });
  const mg = await look(morning.p);
  check('The morning after a real night offers the one-tap morning',
        mg.morningVeil, `${mg.phase} / ${mg.why}`);
  await morning.p.locator('[data-lazy-rate="3"]').click();
  await morning.p.waitForTimeout(900);
  const done = await morning.p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  const rec = (done.mornings || []).find(m => !m.demo);
  check('Rating it writes one real morning record and closes the night',
        Boolean(rec) && done.lazyNight === null, rec ? rec.date : 'none');
  check('With the times it measured, not invented',
        rec.bedTime === '22:30' && /^\d{2}:\d{2}$/.test(rec.wakeTime),
        `${rec?.bedTime} to ${rec?.wakeTime}`);
  check('And the phase follows immediately',
        (await look(morning.p)).phase !== 'SLEEP');
  check('No console errors in the morning', morning.errs.length === 0, morning.errs.join(' | '));
  await morning.ctx.close();

  /* ================================================================
     13. REDUCED MOTION AND THE SKY
     ================================================================ */
  const calm = await open({ hour: 19, minute: 30, reduced: true });
  const cm = await look(calm.p);
  check('Reduced motion reaches the same evening', cm.phase === 'EVENING' && cm.living);
  const spin0 = await calm.p.evaluate(() => window.__starProbe().spin);
  await calm.p.waitForTimeout(1600);
  check('And the sky holds still',
        (await calm.p.evaluate(() => window.__starProbe().spin)) === spin0);
  await calm.ctx.close();

  const sky = await open({ hour: 19, minute: 30 });
  const field = (await sky.p.evaluate(() => window.__starProbe())).fields.find(f => f.id === 'starfield');
  check('The starfield is unchanged in the Maghrib evening', field.onScreen >= 250,
        `${field.onScreen} on screen`);
  check('And only the two canvases it always had',
        (await sky.p.evaluate(() => document.querySelectorAll('canvas').length)) === 2);
  await sky.ctx.close();

  /* ================================================================
     14. THE RESEARCH SCHEMA
     ================================================================ */
  const data = await open({ hour: 19, minute: 30 });
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
  check('The export still has exactly 50 columns', cols.length === 50, String(cols.length));
  check('With Phase 1B’s thirteen plan columns and no new ones',
        cols.filter(x => /^plan_/.test(x)).length === 13,
        cols.filter(x => /^plan_/.test(x)).join(' '));
  check('No field was added for the early-night confirmation',
        !cols.some(c => /early|confirm/i.test(c)), cols.filter(c => /early|confirm/i.test(c)).join(' '));
  check('And no free text reaches it', !cols.some(c => /thought|unload|note_text/i.test(c)));
  await data.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
