/**
 * Schedule feasibility.
 *
 * The defect this suite exists for: building a night at 21:23 produced the
 * instruction "wind down at 19:12" — four hours into the past. The fix is
 * not a clamp. It is an ORDER, and the order is what most of these checks
 * actually assert:
 *
 *   1. decide which night the plan belongs to       (nightFrame, from its END)
 *   2. date the plan's events inside that night     (local Date construction)
 *   3. only then compare anything against now       (fitNight)
 *
 * Done in the other order there is exactly one answer available for "when is
 * 19:12?" — the next one from now — and a passed instruction comes back
 * wearing tomorrow's timestamp. The regression at the top of THE NIGHT
 * FIRST is that case, and it is the one check that must never go green by
 * accident.
 *
 * Everything here runs against absolute local timestamps, returned as ISO
 * strings WITH their offset, because a check that compares UTC cannot tell a
 * DST bug from a correct answer. Fajr is '04:50' in the fixtures rather than
 * calculated, so these checks test the planner; that Fajr itself comes only
 * from the real engine is asserted separately at the bottom and in
 * fatimi-convention.js.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const KEY = 'sleepsphere_state_v2';
const KOLKATA = { latitude: 19.076, longitude: 72.8777, name: 'Mumbai' };
const BASE = { welcomeSeen:true, openingOff:true, mode:'dark', target:480, faith:'on',
               place: KOLKATA, usualWake:'06:00', fajrHabit:'stay' };

const seed = (extra) => `(()=>{localStorage.setItem('${KEY}', JSON.stringify(Object.assign({
  version:3, settings:${JSON.stringify(BASE)}, brainDays:{}, plan:null,
  study:{onboarded:true, participantId:'P001', startDate:'2026-10-01', enrolledAt:'2026-10-01T06:00:00.000Z', consentAck:true, consentAt:'2026-10-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}, ${JSON.stringify(extra || {})})));})()`;

/* ---- Fixtures. Clock-only ideal plans, exactly as buildNight emits them.
   `wake` is the hour the participant gave; `finalWake` is where the sleep
   actually ends. On a stay-awake night those differ, and that difference is
   the whole of requirement 6. */
const CONTINUOUS = {                       // 8h to 06:00, 30 wind, 15 settle
  mode:'continuous', target:480, settle:15, wind:30, fajr:'04:50',
  wake:'06:00', finalWake:'06:00', wakeAnchor:'06:00', afterFajr:null,
  windStart:21*60+15, settleStart:21*60+45, sleepStart:22*60,
  blockOne:480, blockTwo:0, total:480, obligation:null, brainDay:null,
  savedDate:'2026-10-07', source:'build-my-night' };

// The on-device case. 45 wind, 45 settle, up from Fajr, required by 06:00.
const STAY = {
  mode:'continuous', target:480, settle:45, wind:45, fajr:'04:50',
  wake:'06:00', finalWake:'04:50', wakeAnchor:'04:50', afterFajr:'stay',
  windStart:19*60+20, settleStart:20*60+5, sleepStart:20*60+50,
  blockOne:480, blockTwo:0, total:480, obligation:null, brainDay:null,
  savedDate:'2026-10-07', source:'build-my-night' };

const BRIDGE = {
  mode:'fajr', target:480, settle:15, wind:30, fajr:'04:50', returnSleep:'05:15',
  finalWake:'07:00', wakeAnchor:'04:50', afterFajr:'return', awakeBridge:25,
  windStart:21*60+50, settleStart:22*60+20, sleepStart:22*60+35,
  blockOne:375, blockTwo:105, total:480, obligation:null, brainDay:null,
  savedDate:'2026-10-07', source:'build-my-night' };

/* Written exactly as the engine reports a timestamp — local wall clock with
   its offset and no seconds — so a check can compare whole instants rather
   than slicing them apart and hoping the date agreed. */
const at = (y, m, d, h, mi) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}+05:30`;
const clock = iso => (iso || '').slice(11, 16);
const day = iso => (iso || '').slice(0, 10);

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (opts = {}) => {
    const ctx = await b.newContext({
      viewport:{ width:390, height:844 }, deviceScaleFactor:2, isMobile:true, hasTouch:true,
      timezoneId: opts.tz || 'Asia/Kolkata' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(seed(opts.extra));
    if (opts.iso) {
      /* Freeze the page's clock. Needed only for the checks that drive the
         real screen; the engine checks pass `now` in explicitly. */
      const t = new Date(opts.iso).getTime();
      await p.addInitScript(`(()=>{const R=Date;
        class D extends R{constructor(...a){if(!a.length)return super(${t});return super(...a);}
        static now(){return ${t};}} window.Date=D;})()`);
    }
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(900);
    return { ctx, p, errs };
  };

  const page = await open();
  const fit   = (plan, iso) => page.p.evaluate(([pl, i]) => window.__fitNight(pl, i), [plan, iso]);
  const frame = (plan, iso) => page.p.evaluate(([pl, i]) => window.__nightFrame(pl, i), [plan, iso]);
  const events = plan => page.p.evaluate(pl => window.__nightEvents(pl), plan);
  const requiredBy = plan => page.p.evaluate(pl => window.__planRequiredBy(pl), plan);
  const finalWake  = plan => page.p.evaluate(pl => window.__planFinalWake(pl), plan);
  const build = input => page.p.evaluate(i => window.__buildNight(i), input);

  check('No console errors on load', page.errs.length === 0, page.errs.join(' | '));

  const K = (await fit(CONTINUOUS, at(2026,10,7,18,0))).constants;
  check('The constants are the product’s own, not invented ones',
        K.MIN_WIND === 15 && K.SHORTFALL_TOLERANCE === 15
        && K.MIN_NIGHT === 120 && K.MINIMAL_FLOOR === 135,
        JSON.stringify(K));

  /* ================================================================
     THE NIGHT FIRST — the whole fix, and the regression it is for.
     ================================================================ */

  /* ---- 19:12 at 21:23. The reported defect, in the exact shape reported:
     an ideal wind-down in the early evening, read several hours later. If
     the dating ever reverts to "next occurrence from now", this is the check
     that catches it — the wind-down comes back as TOMORROW and passed goes
     false. */
  const late = await fit(STAY, at(2026,10,7,21,23));
  check('REGRESSION · the ideal wind-down stays on TONIGHT’s date',
        day(late.ideal.wind.at) === '2026-10-07' && clock(late.ideal.wind.at) === '19:20',
        late.ideal.wind.at);
  check('REGRESSION · and is therefore PASSED, not tomorrow’s future event',
        late.ideal.wind.passed === true, String(late.ideal.wind.passed));
  check('REGRESSION · nothing actionable is issued in the past',
        late.beforeNow.length === 0, late.beforeNow.join(','));
  check('REGRESSION · the wind-down issued is now, not 19:20',
        clock(late.actionable.wind) === '21:23', late.actionable.wind);

  /* ---- The anchor comes from the END of the night, which is what makes the
     above true in both directions. */
  const evening = await frame(CONTINUOUS, at(2026,10,7,18,0));
  check('An evening plan anchors to tonight',
        day(evening.anchorDate) === '2026-10-07', evening.anchorDate);
  const inProgress = await frame(CONTINUOUS, at(2026,10,8,0,10));
  check('At 00:10 the plan anchors to YESTERDAY evening — the night in progress',
        day(inProgress.anchorDate) === '2026-10-07', inProgress.anchorDate);
  check('So a 21:15 wind-down reads as last evening, not as tonight',
        day(inProgress.events.wind.at) === '2026-10-07'
        && inProgress.events.wind.passed === true, inProgress.events.wind.at);
  check('And the rising is still correctly ahead',
        inProgress.events.finalRising.at === at(2026,10,8,6,0),
        inProgress.events.finalRising.at);
  const nextNight = await frame(CONTINUOUS, at(2026,10,7,9,0));
  check('In the morning, after the night has ended, the plan is tonight’s',
        day(nextNight.anchorDate) === '2026-10-07'
        && day(nextNight.events.finalRising.at) === '2026-10-08', nextNight.anchorDate);

  /* ---- Midnight rollover, in the dates and in the arithmetic. */
  const roll = await fit({ ...CONTINUOUS, finalWake:'07:00', wake:'07:00', wakeAnchor:'07:00',
                           sleepStart:23*60, settleStart:22*60+45, windStart:22*60+15 },
                         at(2026,10,7,23,55));
  check('A night built at 23:55 keeps its evening anchor',
        day(roll.anchorDate) === '2026-10-07', roll.anchorDate);
  check('And puts the bed time on the NEXT date',
        roll.actionable.sleep === at(2026,10,8,0,10), roll.actionable.sleep);
  check('Fifteen minutes across midnight is fifteen minutes',
        roll.actionable.wind === at(2026,10,7,23,55), roll.actionable.wind);

  /* ---- Day offsets: a forward walk with a STRICT carry. */
  const ev = await events(BRIDGE);
  check('Events before midnight carry nothing',
        ev.wind.dayOffset === 0 && ev.settle.dayOffset === 0 && ev.sleep.dayOffset === 0);
  check('Events after it carry exactly one day',
        ev.fajr.dayOffset === 1 && ev.returnSleep.dayOffset === 1
        && ev.finalRising.dayOffset === 1 && ev.requiredBy.dayOffset === 1,
        JSON.stringify({ f:ev.fajr.dayOffset, r:ev.returnSleep.dayOffset,
                         fr:ev.finalRising.dayOffset, rb:ev.requiredBy.dayOffset }));
  check('An equal rising and obligation do not carry a day (strict <)',
        ev.finalRising.minutes === ev.requiredBy.minutes
        && ev.finalRising.dayOffset === ev.requiredBy.dayOffset, '07:00 = 07:00');
  const zeroSettle = await events({ ...CONTINUOUS, settle:0, settleStart:22*60, windStart:21*60+30 });
  check('A zero settle puts settling on the bed time, same day (strict <)',
        zeroSettle.settle.minutes === zeroSettle.sleep.minutes
        && zeroSettle.settle.dayOffset === zeroSettle.sleep.dayOffset, 'settle = sleep');
  /* Fajr is dated from the sleep, not walked with the spine — so a Fajr that
     falls AFTER the rising cannot push everything behind it a day out. */
  const earlyRise = await events({ ...CONTINUOUS, wake:'03:00', finalWake:'03:00',
                                   wakeAnchor:'03:00', sleepStart:19*60,
                                   settleStart:18*60+45, windStart:18*60+15 });
  check('A Fajr after the rising does not corrupt the carry',
        earlyRise.finalRising.dayOffset === 1 && earlyRise.fajr.dayOffset === 1,
        JSON.stringify({ fr:earlyRise.finalRising.dayOffset, f:earlyRise.fajr.dayOffset }));

  /* ================================================================
     FAJR, THE RISING AND THE OBLIGATION — three things, kept apart.
     ================================================================ */

  check('On a stay-awake night the sleep ends at Fajr',
        await finalWake(STAY) === '04:50');
  check('And the hour they gave survives as the obligation',
        await requiredBy(STAY) === '06:00');
  check('06:00 is never rewritten into 04:50 by the fit',
        clock(late.actionable.requiredBy) === '06:00'
        && clock(late.actionable.finalRising) === '04:50',
        `${late.actionable.finalRising} / ${late.actionable.requiredBy}`);
  check('The gap between them is awake time, not sleep opportunity',
        late.opportunity === 447,  // 21:23 -> 04:50, and NOT -> 06:00 (517)
        String(late.opportunity));
  check('buildNight itself no longer overwrites the stated hour',
        (await build({ target:480, fajr:'04:50', wake:'06:00', afterFajr:'stay' })).wake === '06:00');
  check('While still building the night back from Fajr',
        (await build({ target:480, fajr:'04:50', wake:'06:00', afterFajr:'stay' })).sleepStart
          === 20*60+50);
  check('And still reporting Fajr as the rising',
        (await build({ target:480, fajr:'04:50', wake:'06:00', afterFajr:'stay' })).finalWake
          === '04:50');
  check('A stated hour BEFORE Fajr is not collapsed into it',
        (await build({ target:480, fajr:'04:50', wake:'03:00', afterFajr:'stay' })).finalWake
          === '03:00');
  check('With no stated hour at all, Fajr is both',
        await requiredBy(await build({ target:480, fajr:'04:50', afterFajr:'stay' })) === '04:50');

  /* Identical instants, still two questions. */
  const plainFit = await fit(CONTINUOUS, at(2026,10,7,18,0));
  check('On an ordinary night the two coincide',
        plainFit.actionable.finalRising === plainFit.actionable.requiredBy,
        plainFit.actionable.finalRising);
  check('And are still asked separately in the model',
        await finalWake(CONTINUOUS) === '06:00' && await requiredBy(CONTINUOUS) === '06:00');
  check('The screen does not print the same instant twice',
        plainFit.facts.filter(f => f.includes('6:00 AM')).length === 1,
        plainFit.facts.join(' · '));
  check('But prints both when they differ',
        late.facts.some(f => f.includes('4:50')) && late.facts.some(f => f.includes('6:00')),
        late.facts.join(' · '));

  /* ================================================================
     THE FOUR STATES, AT THEIR EXACT BOUNDARIES.
     ================================================================ */

  check('An ordinary evening needs nothing adapted',
        plainFit.phase === 'AMPLE' && plainFit.adapted === false
        && plainFit.shortfall === 0, `${plainFit.phase} / ${plainFit.adapted}`);
  check('And is served the plan exactly as built',
        plainFit.actionable.wind === at(2026,10,7,21,15)
        && plainFit.actionable.sleep === at(2026,10,7,22,0), plainFit.actionable.wind);

  /* AMPLE implies the wind-down has not passed — the two cannot coexist,
     because slack >= 0 is precisely "there is still room for the routine". */
  check('AMPLE and a passed wind-down are mutually exclusive',
        plainFit.ideal.wind.passed === false);

  // Exact boundary: opportunity == target + wind + settle == 525 -> 21:15.
  const edgeAmple = await fit(CONTINUOUS, at(2026,10,7,21,15));
  check('AMPLE holds at exactly target + wind + settle',
        edgeAmple.phase === 'AMPLE' && edgeAmple.opportunity === 525,
        `${edgeAmple.phase} / ${edgeAmple.opportunity}`);
  const edgeCompressed = await fit(CONTINUOUS, at(2026,10,7,21,16));
  check('One minute later it is compressed',
        edgeCompressed.phase === 'COMPRESSED' && edgeCompressed.opportunity === 524,
        `${edgeCompressed.phase} / ${edgeCompressed.opportunity}`);
  // COMPRESSED floor: target + MIN_WIND - SHORTFALL_TOLERANCE == 480 -> 22:00.
  const edgeLow = await fit(CONTINUOUS, at(2026,10,7,22,0));
  check('COMPRESSED holds down to target + 15 − tolerance',
        edgeLow.phase === 'COMPRESSED' && edgeLow.opportunity === 480,
        `${edgeLow.phase} / ${edgeLow.opportunity}`);
  const edgeLate = await fit(CONTINUOUS, at(2026,10,7,22,1));
  check('And one minute below that it is a late night',
        edgeLate.phase === 'LATE' && edgeLate.opportunity === 479,
        `${edgeLate.phase} / ${edgeLate.opportunity}`);
  // MINIMAL_FLOOR == 135 -> 03:45.
  const edgeFloor = await fit(CONTINUOUS, at(2026,10,8,3,45));
  check('LATE holds down to two hours plus a wind-down',
        edgeFloor.phase === 'LATE' && edgeFloor.opportunity === 135,
        `${edgeFloor.phase} / ${edgeFloor.opportunity}`);
  const edgeMinimal = await fit(CONTINUOUS, at(2026,10,8,3,46));
  check('Below it there is nothing left to plan',
        edgeMinimal.phase === 'MINIMAL' && edgeMinimal.opportunity === 134,
        `${edgeMinimal.phase} / ${edgeMinimal.opportunity}`);

  /* ---- The fifteen-minute tolerance, doing exactly its one job. */
  const tol = await fit({ ...CONTINUOUS, target:510, sleepStart:21*60+30,
                          settleStart:21*60+15, windStart:20*60+45 },
                        at(2026,10,7,21,24));
  check('A nine-minute shortfall stays the compressed experience',
        tol.phase === 'COMPRESSED' && tol.shortfall === 9,
        `${tol.phase} / short ${tol.shortfall}`);
  check('The target is still the target, and the shortfall is still named',
        tol.target === 510 && tol.sleepMinutes === 501,
        `${tol.sleepMinutes} of ${tol.target}`);
  const beyondTol = await fit({ ...CONTINUOUS, target:510, sleepStart:21*60+30,
                                settleStart:21*60+15, windStart:20*60+45 },
                              at(2026,10,7,21,40));
  check('Sixteen minutes short is no longer inside the tolerance',
        beyondTol.phase === 'LATE' && beyondTol.shortfall === 25,
        `${beyondTol.phase} / short ${beyondTol.shortfall}`);

  /* ================================================================
     THE COMPRESSION LADDER — settle first, never proportional.
     ================================================================ */

  /* 30 wind + 15 settle with 510 minutes left: the target fits only if the
     settle goes. It goes whole, and the wind-down is untouched. */
  const ladder = await fit(CONTINUOUS, at(2026,10,7,21,30));
  check('Settle is given up before the wind-down loses a minute',
        ladder.routine.wind === 30 && ladder.routine.settle === 0,
        JSON.stringify(ladder.routine));
  check('Never proportionally — not 20 and 10',
        !(ladder.routine.wind === 20 && ladder.routine.settle === 10));
  check('And with the settle gone the target is still met',
        ladder.shortfall === 0 && ladder.sleepMinutes === 480,
        `${ladder.sleepMinutes}`);
  const rungTwo = await fit(CONTINUOUS, at(2026,10,7,21,0));
  check('With room to spare, both are kept',
        rungTwo.routine.wind === 30 && rungTwo.routine.settle === 15,
        JSON.stringify(rungTwo.routine));
  check('A zero settle is a value the product already offers, not a hack',
        ladder.routine.settle === 0);
  check('The wind-down never falls below the product’s own fifteen minutes',
        edgeLate.routine.wind === 15 && edgeFloor.routine.wind === 15,
        `${edgeLate.routine.wind} / ${edgeFloor.routine.wind}`);
  check('Nor does a sixty-minute wind-down get compressed past it',
        (await fit({ ...CONTINUOUS, wind:60, settle:45, windStart:20*60+15,
                     settleStart:21*60+15 }, at(2026,10,8,2,0))).routine.wind === 15);
  check('A late night keeps no settle at all',
        edgeLate.routine.settle === 0 && edgeFloor.routine.settle === 0);
  check('And the smallest nights are given no routine to pretend about',
        edgeMinimal.routine === null && edgeMinimal.steps.length === 1
        && edgeMinimal.steps[0] === 'Go to bed now.', JSON.stringify(edgeMinimal.steps));

  /* ---- An impossible ideal adapts; it is not honoured, and it is not
     replaced by an absurd six-minute routine. */
  check('Six minutes before the ideal bed time, bed moves later',
        clock(tol.actionable.sleep) === '21:39', tol.actionable.sleep);
  check('Rather than inventing a six-minute wind-down',
        tol.routine.wind === 15 && clock(tol.actionable.wind) === '21:24',
        JSON.stringify(tol.routine));
  check('The ideal bed time is preserved, separately and untouched',
        clock(tol.ideal.sleep.at) === '21:30', tol.ideal.sleep.at);

  /* ================================================================
     AWAKE TIME IS NEVER SLEEP OPPORTUNITY.
     ================================================================ */

  const bridgeFit = await fit(BRIDGE, at(2026,10,7,20,30));
  check('A bridge night built in good time needs nothing adapted',
        bridgeFit.phase === 'AMPLE' && bridgeFit.adapted === false, bridgeFit.phase);
  check('The twenty-five awake minutes come out of the opportunity',
        bridgeFit.opportunity === 605,   // 630 clock minutes, less the bridge
        String(bridgeFit.opportunity));
  check('And the two-part structure survives intact',
        clock(bridgeFit.actionable.sleep) === '22:35'
        && clock(bridgeFit.actionable.fajr) === '04:50'
        && clock(bridgeFit.actionable.returnSleep) === '05:15'
        && clock(bridgeFit.actionable.finalRising) === '07:00',
        [bridgeFit.actionable.sleep, bridgeFit.actionable.returnSleep].join(' / '));
  check('With both blocks counted and the bridge excluded',
        bridgeFit.sleepMinutes === 480 && bridgeFit.shortfall === 0,
        String(bridgeFit.sleepMinutes));
  check('A stay-awake night measures to Fajr, never to the obligation',
        late.sleepMinutes === 432, String(late.sleepMinutes));
  /* Only part of the bridge is left once Fajr has gone by, and only that
     part may be subtracted. */
  const midBridge = await fit(BRIDGE, at(2026,10,8,5,0));
  check('Past Fajr, only the remaining bridge is subtracted',
        midBridge.opportunity === 105, String(midBridge.opportunity));

  /* ---- What the fit protects is what the plan PROMISED, which is not
     always what it stored as a target. A plan whose own times arrange less
     than its target — the bridge branch clamps the first block at zero, an
     obligation can leave less room, an old saved plan can simply disagree
     with itself — must not declare a participant who is exactly on time to
     be already behind and start compressing a routine that was never long. */
  const underbuilt = { ...BRIDGE, finalWake:'06:30', wakeAnchor:'04:50',
                       blockOne:400, blockTwo:80 };   // times give 450, target says 480
  const onTime = await fit(underbuilt, at(2026,10,7,21,50));
  check('A plan that never met its target does not report itself behind',
        onTime.protect === 450 && onTime.target === 480,
        `protect ${onTime.protect} of target ${onTime.target}`);
  check('So somebody exactly on time is left entirely alone',
        onTime.phase === 'AMPLE' && onTime.adapted === false
        && clock(onTime.actionable.wind) === '21:50',
        `${onTime.phase} / ${onTime.adapted} / ${onTime.actionable.wind}`);
  check('And the state never contradicts the shortfall it reports',
        onTime.shortfall === 0, String(onTime.shortfall));
  /* The participant is still told the plain arithmetic against the target.
     The tolerance and the protected quantity decide how much of the
     EXPERIENCE changes; they never decide whether somebody is told. */
  check('But the plain distance from the target is still reported',
        onTime.shortOfTarget === 30, String(onTime.shortOfTarget));
  check('A nine-minute shortfall is named rather than rounded away',
        tol.shortOfTarget === 9, String(tol.shortOfTarget));
  /* Fifteen minutes before the planned bed time the runway is down to the
     fifteen the product offers, so the settle is gone and the wind-down is
     short — but the BED TIME is still the planned one, so the plan has not
     been departed from and the screen does not announce a change. Being
     partway through your own routine is following it. */
  const onTimeLate = await fit(underbuilt, at(2026,10,7,22,20));
  check('Fifteen minutes out, the routine is short but the plan still holds',
        onTimeLate.phase === 'COMPRESSED' && onTimeLate.adapted === false
        && clock(onTimeLate.actionable.sleep) === '22:35',
        `${onTimeLate.phase} / ${onTimeLate.adapted} / ${onTimeLate.actionable.sleep}`);
  check('And the sleep it protects is untouched',
        onTimeLate.shortfall === 0 && onTimeLate.routine.settle === 0,
        `short ${onTimeLate.shortfall}, settle ${onTimeLate.routine.settle}`);
  check('Never more than the target, either',
        (await fit({ ...CONTINUOUS, target:420 }, at(2026,10,7,18,0))).protect === 420);

  /* ================================================================
     THE EIGHT WORKED EXAMPLES, AS APPROVED.
     ================================================================ */

  const examples = [
    ['1 · 18:00, an ordinary future night', CONTINUOUS, at(2026,10,7,18,0),
     { phase:'AMPLE', wind:'21:15', sleep:'22:00', rising:'06:00', required:'06:00', sleep_m:480 }],
    ['2 · 21:23, ideal wind-down 19:20, staying awake', STAY, at(2026,10,7,21,23),
     { phase:'LATE', wind:'21:23', sleep:'21:38', rising:'04:50', required:'06:00', sleep_m:432 }],
    ['3 · six minutes before the ideal bed time',
     { ...CONTINUOUS, target:510, sleepStart:21*60+30, settleStart:21*60+15, windStart:20*60+45 },
     at(2026,10,7,21,24),
     { phase:'COMPRESSED', wind:'21:24', sleep:'21:39', rising:'06:00', required:'06:00', sleep_m:501 }],
    ['4 · after the ideal bed time', CONTINUOUS, at(2026,10,7,22,40),
     { phase:'LATE', wind:'22:40', sleep:'22:55', rising:'06:00', required:'06:00', sleep_m:425 }],
    ['5 · 23:55, with the night after midnight',
     { ...CONTINUOUS, wake:'07:00', finalWake:'07:00', wakeAnchor:'07:00',
       sleepStart:23*60, settleStart:22*60+45, windStart:22*60+15 },
     at(2026,10,7,23,55),
     { phase:'LATE', wind:'23:55', sleep:'00:10', rising:'07:00', required:'07:00', sleep_m:410 }],
    ['6 · 00:10, a night already in progress', CONTINUOUS, at(2026,10,8,0,10),
     { phase:'LATE', wind:'00:10', sleep:'00:25', rising:'06:00', required:'06:00', sleep_m:335 }],
    ['7 · shortly before Fajr, staying awake', STAY, at(2026,10,8,4,5),
     { phase:'MINIMAL', wind:null, sleep:'04:05', rising:'04:50', required:'06:00', sleep_m:45 }],
    ['8 · returning to sleep after Fajr', BRIDGE, at(2026,10,7,20,30),
     { phase:'AMPLE', wind:'21:50', sleep:'22:35', rising:'07:00', required:'07:00', sleep_m:480 }]
  ];

  for (const [name, plan, iso, want] of examples) {
    const f = await fit(plan, iso);
    const got = { phase:f.phase, wind:f.actionable.wind ? clock(f.actionable.wind) : null,
                  sleep:clock(f.actionable.sleep), rising:clock(f.actionable.finalRising),
                  required:clock(f.actionable.requiredBy), sleep_m:f.sleepMinutes };
    check(`EXAMPLE ${name}`,
          Object.keys(want).every(k => got[k] === want[k]),
          `${JSON.stringify(got)} want ${JSON.stringify(want)}`);
    check(`EXAMPLE ${name} — nothing actionable in the past`,
          f.beforeNow.length === 0, f.beforeNow.join(','));
    check(`EXAMPLE ${name} — the obligation is never moved`,
          clock(f.actionable.requiredBy) === want.required, f.actionable.requiredBy);
  }

  /* ================================================================
     THE SWEEP. Every five minutes of a full day, every night shape.
     The one invariant that has to hold absolutely.
     ================================================================ */

  const sweepPlans = [['continuous', CONTINUOUS], ['stay', STAY], ['bridge', BRIDGE],
                      ['zero settle', { ...CONTINUOUS, settle:0, settleStart:22*60, windStart:21*60+30 }],
                      ['sixty wind', { ...CONTINUOUS, wind:60, windStart:20*60+45 }]];
  let offenders = [];
  let phasesSeen = new Set();
  for (const [label, plan] of sweepPlans) {
    for (let minute = 0; minute < 1440; minute += 5) {
      const iso = at(2026,10,7, Math.floor(minute / 60), minute % 60);
      const f = await fit(plan, iso);
      phasesSeen.add(f.phase);
      if (f.beforeNow.length) offenders.push(`${label} ${clock(iso)} ${f.beforeNow.join('/')}`);
      // The routine must also never be presented below the product minimum.
      if (f.routine && f.routine.wind < 15 && plan.wind >= 15) {
        offenders.push(`${label} ${clock(iso)} wind ${f.routine.wind}`);
      }
      // And the obligation must survive every single one of them.
      if (f.actionable.requiredBy == null) offenders.push(`${label} ${clock(iso)} lost requiredBy`);
      // A state that says there was room, beside a shortfall, is incoherent.
      if (f.phase === 'AMPLE' && f.shortfall > 0) {
        offenders.push(`${label} ${clock(iso)} AMPLE but ${f.shortfall} short`);
      }
      // Bed may only move EARLIER than planned across a clock change.
      if (f.routine && f.actionable.sleep < f.ideal.sleep.at) {
        offenders.push(`${label} ${clock(iso)} bed pulled earlier`);
      }
    }
  }
  check('SWEEP · 1440 minutes × 5 night shapes: no actionable event in the past',
        offenders.length === 0, offenders.slice(0, 6).join(' | '));
  check('SWEEP · and all four states are genuinely reached',
        ['AMPLE','COMPRESSED','LATE','MINIMAL'].every(p => phasesSeen.has(p)),
        [...phasesSeen].join(','));

  /* ================================================================
     DST. The night is 23 or 25 hours long and the arithmetic knows it.
     Lord Howe is skipped; Chile springs forward on 6 September 2026 at
     00:00 (so 00:00 becomes 01:00) and falls back on 5 April at 00:00.
     ================================================================ */
  const dst = await open({ tz:'America/Santiago' });
  const dstFit = (plan, iso) => dst.p.evaluate(([pl, i]) => window.__fitNight(pl, i), [plan, iso]);
  const SANTIAGO = { ...CONTINUOUS, fajr:null };

  /* Spring forward: the night of 5-6 September is 23 hours, so a 22:00 bed
     time and a 06:00 rising are SEVEN real hours apart, not eight. The hour
     has to come from somewhere, and with the whole evening still ahead it
     comes out of the bed time rather than out of the sleep. */
  const spring = await dstFit(SANTIAGO, '2026-09-05T18:00-04:00');
  check('DST spring-forward · the short night is measured as short',
        spring.opportunity === 660, String(spring.opportunity));   // 11h, not 12h
  check('DST spring-forward · the planned bed time would have cost an hour',
        spring.ideal.sleep.at === '2026-09-05T22:00-04:00', spring.ideal.sleep.at);
  check('DST spring-forward · so bed moves earlier and the target still lands',
        spring.actionable.sleep === '2026-09-05T21:00-04:00'
        && spring.sleepMinutes === 480 && spring.shortfall === 0,
        `${spring.actionable.sleep} / ${spring.sleepMinutes}`);
  check('DST spring-forward · nothing actionable lands in the past',
        spring.beforeNow.length === 0, spring.beforeNow.join(','));

  /* Late on the same night there is no evening left to give, so the hour
     comes out of the sleep instead and is reported as missing. */
  const springLate = await dstFit(SANTIAGO, '2026-09-05T21:30-04:00');
  check('DST spring-forward · late on, the hour is taken from the sleep and named',
        springLate.phase === 'LATE' && springLate.sleepMinutes === 435
        && springLate.shortfall === 45,
        `${springLate.phase} / ${springLate.sleepMinutes} / ${springLate.shortfall}`);

  /* Fall back: the night of 4-5 April is 25 hours. The extra hour is simply
     there, and nobody's bed time is rewritten to take it away again. */
  const fall = await dstFit(SANTIAGO, '2026-04-04T18:00-03:00');
  check('DST fall-back · the long night is measured as long',
        fall.opportunity === 780, String(fall.opportunity));       // 13h, not 12h
  check('DST fall-back · the planned bed time is left exactly alone',
        fall.adapted === false && fall.actionable.sleep === '2026-04-04T22:00-03:00',
        fall.actionable.sleep);
  check('DST fall-back · and the extra hour is counted honestly, not clipped',
        fall.phase === 'AMPLE' && fall.sleepMinutes === 540 && fall.shortfall === 0,
        `${fall.phase} / ${fall.sleepMinutes}`);
  check('DST fall-back · nothing actionable lands in the past',
        fall.beforeNow.length === 0, fall.beforeNow.join(','));
  check('No console errors across either DST night', dst.errs.length === 0, dst.errs.join(' | '));
  await dst.ctx.close();

  /* ================================================================
     OLD SAVED PLANS. None of them has heard of any of this.
     ================================================================ */

  // A plan saved before the fix, with `wake` already overwritten to Fajr.
  const overwritten = { ...STAY, wake:'04:50', finalWake:'04:50' };
  const oldFit = await fit(overwritten, at(2026,10,7,21,23));
  check('An old stay-awake plan still resolves',
        oldFit && oldFit.phase === 'LATE', String(oldFit && oldFit.phase));
  check('Its rising and obligation are simply the same instant',
        oldFit.actionable.finalRising === oldFit.actionable.requiredBy,
        oldFit.actionable.finalRising);
  check('And nothing is issued in its past either', oldFit.beforeNow.length === 0);

  // The oldest shape of all: the manual planner's, with no wind/settle values.
  const bare = { mode:'continuous', wake:'06:30', finalWake:'06:30', wakeAnchor:'06:30',
                 windStart:1305, settleStart:1335, sleepStart:1350, total:480, target:480 };
  const bareFit = await fit(bare, at(2026,10,7,19,0));
  check('A plan with no feasibility fields at all still fits',
        bareFit && bareFit.phase === 'AMPLE' && bareFit.beforeNow.length === 0,
        String(bareFit && bareFit.phase));
  check('A plan with no times at all returns nothing rather than guessing',
        await fit({ mode:'continuous', wake:'06:00' }, at(2026,10,7,19,0)) === null);

  /* ================================================================
     THE SCREEN. Reopening never rewrites; only rebuilding fits.
     ================================================================ */

  const ui = await open({ extra:{ plan:{ ...STAY, savedDate:new Date().toISOString().slice(0,10) } } });
  const planOf = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)).plan, KEY);
  const before = await planOf(ui.p);
  check('A saved plan is on disk as saved', before && before.windStart === 19*60+20,
        String(before && before.windStart));
  await ui.p.waitForTimeout(600);
  const afterLook = await planOf(ui.p);
  check('Merely looking at Today does not rewrite it',
        JSON.stringify(afterLook) === JSON.stringify(before));
  check('The stored plan keeps the IDEAL times, not the fitted ones',
        afterLook.windStart === 19*60+20 && afterLook.sleepStart === 20*60+50,
        `${afterLook.windStart} / ${afterLook.sleepStart}`);
  check('And the participant’s stated hour is what is stored',
        afterLook.wake === '06:00' && afterLook.finalWake === '04:50',
        `${afterLook.wake} / ${afterLook.finalWake}`);
  check('No console errors with an out-of-date plan on screen',
        ui.errs.length === 0, ui.errs.join(' | '));
  await ui.ctx.close();

  /* ---- The window in which the evening screen departs from the plan is
     narrow and must not be silently dead: the bed time only moves in the
     last fifteen minutes before it, so that is the only time this screen
     shows anything but the plan. Measured on a night whose planned bed time
     is 22:35, eight minutes out. */
  /* Dated to the frozen page clock, not to Node's. Taking today's date from
     the runner made this check pass only while the two agreed, and it broke
     silently the first time the suite ran after midnight UTC. */
  const BRIDGE_TONIGHT = { ...BRIDGE, savedDate:'2026-10-07' };
  const nearBed = await open({ extra:{ plan: BRIDGE_TONIGHT }, iso: at(2026,10,7,22,27) });
  const seenOnScreen = await nearBed.p.evaluate(() => {
    const shown = id => { const n = document.getElementById(id); return n && n.offsetParent !== null; };
    return { living: shown('livingNight'),
             ends: (document.getElementById('livingEnds') || {}).innerText || '',
             // null means the element does not exist at all, which is the point.
             rebuild: document.getElementById('livingRebuild') ? shown('livingRebuild') : null,
             change: shown('livingChange'),
             links: [...document.querySelectorAll('#livingNight .living-link')]
               .filter(n => n.offsetParent !== null).map(n => n.textContent.trim()) };
  });
  check('Eight minutes before bed the evening screen is still up',
        seenOnScreen.living === true, JSON.stringify(seenOnScreen));
  check('And it shows the bed time it actually is, with nothing in the past',
        /Wind down now/.test(seenOnScreen.ends) && /In bed 10:42 PM/.test(seenOnScreen.ends),
        seenOnScreen.ends);
  /* And nothing has been added to this screen to say so. Measured here
     rather than assumed: by the time the bed time moves, this screen has
     already given its controls row back, so a rebuild control placed in it
     would be reachable for about one minute. The times carry the night; the
     plan pane carries the rebuild. */
  check('No control has been added that cannot be reached',
        seenOnScreen.rebuild === null, String(seenOnScreen.rebuild));
  check('The controls row is already given back at this hour',
        seenOnScreen.links.length === 0, seenOnScreen.links.join('|'));
  check('No console errors in that window', nearBed.errs.length === 0, nearBed.errs.join(' | '));
  await nearBed.ctx.close();

  /* ---- The copy. None of the four internal names, and none of the four
     promises the app is not allowed to make. */
  const copyPage = await open();
  const leads = await copyPage.p.evaluate(plans => plans.map(p => window.__fitNight(p[0], p[1]).lead),
    [[CONTINUOUS, at(2026,10,7,18,0)], [CONTINUOUS, at(2026,10,7,21,30)],
     [CONTINUOUS, at(2026,10,7,22,40)], [CONTINUOUS, at(2026,10,8,3,46)]]);
  const words = leads.join(' ').toLowerCase();
  check('No internal state name reaches the participant',
        !/ample|compressed|minimal|feasib|toleranc|shortfall|opportunity window/.test(words), words);
  check('No promise about how tomorrow will feel',
        !/fresh|restored|recover|rested|sharper|focus|alert|energi/.test(words), words);
  check('No failure language',
        !/fail|too late|missed|wrong|should have|you didn’t|you did not/.test(words), words);
  check('A late night is offered as a night, not a verdict',
        leads[2] === 'It’s later than planned. Let’s work with the night you have.', leads[2]);
  check('And an ordinary evening says nothing extra at all', leads[0] === '', leads[0]);
  await copyPage.ctx.close();

  /* ================================================================
     FAJR PROVENANCE, AND THE SCHEMA.
     ================================================================ */

  const prayer = await page.p.evaluate(() => {
    const probe = window.__prayerProbe ? window.__prayerProbe() : null;
    return { probe, knowledge: window.__nightKnowledge() };
  });
  check('Fajr comes from the prayer engine, which is still the only source',
        /^\d{2}:\d{2}$/.test(prayer.knowledge.fajr || ''), String(prayer.knowledge.fajr));
  const source = await page.p.evaluate(async () => {
    const text = await (await fetch('index.html')).text();
    const engine = text.split('SCHEDULE FEASIBILITY')[1].split('/* ---- Tonight')[0];
    return {
      // No second prayer calculation inside the feasibility layer.
      prayerCalls: (engine.match(/PrayTimes|sunset|solarNoon|julian|declination|17\.7/g) || []).length,
      // And no generic "next occurrence of this clock value" helper anywhere.
      atHelper: /function\s+at\s*\(|const\s+at\s*=\s*\(?\s*clock/.test(text),
      version: (text.match(/const SCHEMA_VERSION = (\d+)/) || [])[1]
    };
  });
  check('The feasibility layer contains no prayer arithmetic of its own',
        source.prayerCalls === 0, String(source.prayerCalls));
  check('There is no at(clock) helper able to move a passed event forward',
        source.atHelper === false);
  check('The schema version is unchanged', source.version === '3', source.version);

  const shape = await page.p.evaluate(() => {
    const plan = window.__buildNight({ target:480, fajr:'04:50', wake:'06:00', afterFajr:'stay' });
    return Object.keys(plan).sort();
  });
  const EXPECTED = ['afterFajr','barrier','blockOne','blockTwo','fajr','finalWake','mode',
                    'reason','settle','settleStart','sleepStart','target','total','wake',
                    'wakeAnchor','wind','windStart'].sort();
  check('The plan’s key set is exactly what it was — nothing added, nothing dropped',
        JSON.stringify(shape) === JSON.stringify(EXPECTED),
        shape.filter(k => !EXPECTED.includes(k)).join(',') || 'same');
  check('requiredBy is internal: it is not a field on the plan',
        !shape.includes('requiredBy') && !shape.includes('finalRising'));

  /* ---- The export, at the byte level. A stay-awake night is the one case
     where this patch changes a stored VALUE (plan.wake now holds the hour
     the participant gave instead of Fajr), so it is the case to prove the
     research CSV by: every plan column must read exactly as it did before,
     because none of them is plan.wake and the one that looks like it —
     plan_final_wake — goes through planFinalWake and is still Fajr. */
  const csvPage = await open({ extra:{
    plan: { ...STAY, savedDate:'2026-10-07' },
    study:{ onboarded:true, participantId:'P014', startDate:'2026-10-07',
            enrolledAt:'2026-10-07T06:00:00.000Z', consentAck:true,
            consentAt:'2026-10-07T06:00:00.000Z', cohort:'jamea-v1',
            schemaVersion:3, storageMode:'local', lastSeenDay:1 } } });
  const exported = await csvPage.p.evaluate(() => new Promise(resolve => {
    const names = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { names.push(this.download); realClick.call(this); };
    const seen = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = blob => { seen.push(blob); return original(blob); };
    document.querySelector('.nav button[data-view="data"]').click();
    document.getElementById('exportStudy').click();
    setTimeout(async () => {
      const texts = await Promise.all(seen.map(blob => blob.text()));
      resolve({ names, texts });
    }, 1500);
  }));
  /* Every cell is quoted by csvCell, so strip the quoting before comparing —
     a check that matched '"04:50"' against '04:50' would report a change to
     the research export that had not happened. */
  const unquote = row => row.split(',').map(cell => cell.replace(/^"|"$/g, ''));
  const rows = (exported.texts[0] || '').split('\n');
  const header = unquote(rows[0] || '');
  const cells = unquote(rows.find(r => r.includes('2026-10-07')) || '');
  const col = name => cells[header.indexOf(name)];
  check('The CSV header is unchanged — no column added, renamed or dropped',
        header.length === 50 && !header.some(h => /required|final_rising|feasib|protect/.test(h)),
        `${header.length} columns`);
  check('The plan columns read exactly as they did before the patch',
        col('plan_wake_anchor') === '04:50' && col('plan_final_wake') === '04:50'
        && col('plan_fajr') === '04:50' && col('plan_after_fajr') === 'stay',
        [col('plan_wake_anchor'), col('plan_final_wake'), col('plan_fajr'), col('plan_after_fajr')].join('/'));
  check('And the stored schema version in the export is still 3',
        col('schema_version') === '3', col('schema_version'));
  check('No console errors exporting', csvPage.errs.length === 0, csvPage.errs.join(' | '));
  await csvPage.ctx.close();

  await page.ctx.close();
  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
