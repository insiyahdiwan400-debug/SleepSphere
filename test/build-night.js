/**
 * Build my night.
 *
 * The feature's claim is that it does not ask for what it already knows, so
 * most of what matters here is a DECISION rather than a screen: which shape
 * the night takes, which hour the day actually begins, what counts as known
 * and what has to be asked. Those are asserted against the engine directly,
 * because they are arithmetic and arithmetic should not be tested by
 * clicking.
 *
 * The screen is tested too, separately, for the things only a screen can get
 * wrong: that a normal evening really is one tap, that a one-night change
 * does not quietly rewrite a permanent preference, and that the saved plan
 * is the one every other part of the app then reads.
 *
 * Timezone is pinned to Asia/Dubai throughout. Fajr comes from the real
 * engine, and the real engine answers in local time — without a pinned zone
 * these checks would assert whatever offset the runner happened to have.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const KEY = 'sleepsphere_state_v2';
const DUBAI = { latitude: 25.2048, longitude: 55.2708, name: 'Dubai' };
const BASE = { welcomeSeen:true, openingOff:true, mode:'dark', target:480, faith:'on', place: DUBAI };

/* Still seeded at version 2, so every run of this suite also exercises the
   v2 -> v3 migration that Phase 0 put in. */
const seed = (settings, extra) => `(()=>{localStorage.setItem('${KEY}', JSON.stringify(Object.assign({
  version:2,
  settings:${JSON.stringify(Object.assign({}, BASE, settings || {}))},
  brainDays:{},
  study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}, ${JSON.stringify(extra || {})})));})()`;

// 21:00 local: the EVENING phase, which is when this feature exists.
const clockAt = (h, mi) => `(()=>{const R=Date;const f=new R(2026,8,9,${h},${mi},0);
  class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
  static now(){return f.getTime();}} window.Date=D;})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (opts = {}) => {
    const ctx = await b.newContext({
      viewport: opts.viewport || { width:390, height:844 }, deviceScaleFactor:2,
      isMobile: !opts.viewport, hasTouch:true, timezoneId: opts.tz || 'Asia/Dubai',
      reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(seed(opts.settings, opts.extra));
    await p.addInitScript(clockAt(opts.hour ?? 21, opts.minute ?? 0));
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1100);
    return { ctx, p, errs };
  };
  const read = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

  /* ================================================================
     THE ENGINE — one page, many nights.
     ================================================================ */
  const engine = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' } });
  const build = input => engine.p.evaluate(i => window.__buildNight(i), input);
  const shapeOf = input => engine.p.evaluate(i => window.__nightShape(i), input);
  const intentionOf = (plan, k) => engine.p.evaluate(([pl, kn]) => window.__intention(pl, kn), [plan, k || {}]);

  check('No console errors on an ordinary evening', engine.errs.length === 0, engine.errs.join(' | '));

  /* ---- The ordinary night. Everything else is a variation on this. */
  const plain = await build({ target:480, wake:'07:00' });
  check('A plain night runs back from when they get up',
        plain.mode === 'continuous' && plain.wake === '07:00'
        && plain.sleepStart === 23 * 60 && plain.total === 480,
        `settle ${plain.settleStart}, sleep ${plain.sleepStart}, wind ${plain.windStart}`);
  check('With the settle and wind-down stacked before it',
        plain.settleStart === 23 * 60 - 15 && plain.windStart === 23 * 60 - 45);

  /* ---- The Fajr Bridge: the case the whole feature is shaped around. */
  const bridge = await build({ target:480, fajr:'04:45', wake:'06:30', afterFajr:'return' });
  check('Returning to sleep after Fajr builds a bridge', bridge.mode === 'fajr');
  check('The second block is the sleep after Fajr',
        bridge.blockTwo === 80 && bridge.finalWake === '06:30',
        `${bridge.blockTwo}m from ${bridge.returnSleep} to ${bridge.finalWake}`);
  check('And the first block is whatever the target still needs',
        bridge.blockOne === 400 && bridge.total === 480, `${bridge.blockOne} + ${bridge.blockTwo}`);
  check('So the night starts early enough to fit it',
        bridge.sleepStart === (4 * 60 + 45) - 400 + 1440 - 1440 + 1440 % 1440 || bridge.sleepStart === 22 * 60 + 5,
        `settle at ${bridge.sleepStart}`);
  check('The wake anchor is Fajr, the final waking is not',
        bridge.wakeAnchor === '04:45' && bridge.finalWake === '06:30');

  /* ---- Staying awake. The day genuinely begins at Fajr, and saying "up at
     6:30" for someone who is up at 4:45 would put every other screen — and
     the dua — an hour and three quarters out. */
  const stay = await build({ target:480, fajr:'04:45', wake:'06:30', afterFajr:'stay' });
  check('Staying awake makes Fajr the start of the day',
        stay.mode === 'continuous' && stay.finalWake === '04:45',
        `${stay.mode} / ${stay.finalWake}`);
  check('And the night is built back from Fajr', stay.sleepStart === (4 * 60 + 45) - 480 + 1440,
        `settle at ${stay.sleepStart}`);
  const stayNoWake = await build({ target:480, fajr:'04:45', afterFajr:'stay' });
  check('A stay-awake night needs no stored wake time at all',
        stayNoWake && stayNoWake.finalWake === '04:45');

  /* ---- Shapes that are NOT bridges, however the habit is stored. */
  check('No Fajr means no bridge',
        await shapeOf({ wake:'06:30', afterFajr:'return' }) === 'continuous');
  check('A final wake before Fajr is not a bridge',
        await shapeOf({ fajr:'04:45', wake:'04:20', afterFajr:'return' }) === 'continuous');
  check('Nor is a fifteen-minute lie-in',
        await shapeOf({ fajr:'04:45', wake:'05:00', afterFajr:'return' }) === 'continuous');
  check('But half an hour is', await shapeOf({ fajr:'04:45', wake:'05:15', afterFajr:'return' }) === 'fajr');
  check('And a nine-hour gap is not a second sleep',
        await shapeOf({ fajr:'04:45', wake:'14:00', afterFajr:'return' }) === 'continuous');

  /* ---- The night crosses midnight, which is the normal case and the one
     that breaks naive arithmetic. */
  const crossing = await build({ target:480, wake:'06:00' });
  check('A night that crosses midnight is still eight hours',
        crossing.sleepStart === 22 * 60 && crossing.total === 480,
        `settle ${crossing.settleStart} wake ${crossing.wake}`);
  const late = await build({ target:480, wake:'04:00' });
  check('And so is one that starts before midnight and ends very early',
        late.sleepStart === 20 * 60 && late.total === 480, `settle ${late.sleepStart}`);

  /* ---- Nothing reliable: no invented hour, anywhere. */
  check('With nothing to go on, no night is built',
        (await build({ target:480 })) === null);
  check('Not even with a Fajr, if they have not said they stay up',
        (await build({ target:480, fajr:'04:45' })) === null);

  /* ---- planFinalWake: the one answer every screen now shares. */
  const finalOf = plan => engine.p.evaluate(pl => window.__planFinalWake(pl), plan);
  check('The final waking of a bridge night is the second rising',
        await finalOf(bridge) === '06:30');
  check('Of a stay-awake night, Fajr', await finalOf(stay) === '04:45');
  check('Of a plain night, the planned wake', await finalOf(plain) === '07:00');
  check('And of no plan at all, nothing', await finalOf(null) === null);

  /* ---- Brain Day changes what is SAID, never what is measured. */
  const INTENTIONS = {};
  for (const key of ['hifz','heavy_learning','exam','travel','recovery','normal']) {
    INTENTIONS[key] = await intentionOf(plain, { brainDay: key });
  }
  check('Every Brain Day has its own intention',
        new Set(Object.values(INTENTIONS)).size === 6, Object.keys(INTENTIONS).join(','));
  check('No Brain Day still gets one', (await intentionOf(plain, {})).length > 10);
  /* The forbidden claims, checked as a set rather than one at a time: the
     app may say tomorrow is demanding, and may say sleep opportunity is
     worth protecting. It may not say it knows what the brain did. */
  const FORBIDDEN = /memory consolidat|neuroplastic|hippocamp|cognitive recovery|brain recovery|learning performance|consolidat/i;
  const allCopy = Object.values(INTENTIONS).join(' ') + ' ' + await intentionOf(plain, {});
  check('No intention claims to measure the brain', !FORBIDDEN.test(allCopy),
        (allCopy.match(FORBIDDEN) || []).join(','));
  check('Recovery day carries no performance pressure',
        !/should|must|need to|make sure|important/i.test(INTENTIONS.recovery), INTENTIONS.recovery);
  check('Exam day does not encourage trading sleep for study',
        /realistic|steady/i.test(INTENTIONS.exam) && !/push|extra hour|stay up/i.test(INTENTIONS.exam),
        INTENTIONS.exam);
  check('Travel acknowledges unusual timing', /unusual|timing/i.test(INTENTIONS.travel), INTENTIONS.travel);
  check('Hifz talks about opportunity, not about memory being measured',
        /opportunit/i.test(INTENTIONS.hifz), INTENTIONS.hifz);
  check('And no intention uses guilt',
        !/fail|lazy|bad night|you didn|ruin|damage|harm/i.test(allCopy));

  /* An early start outranks the category — whatever tomorrow is for, the
     useful thing to say about a night ending at 04:00 is when it must start. */
  const earlyIntention = await intentionOf(await build({ target:480, wake:'04:00' }), { brainDay:'normal' });
  check('An unusually early start is what gets said',
        /early/i.test(earlyIntention), earlyIntention);

  /* A short night is reported as arithmetic, without alarm. */
  const shortIntention = await intentionOf(await build({ target:480, fajr:'04:45', wake:'05:30', afterFajr:'stay' }), {});
  check('A short window is stated, not scolded',
        !/harm|damage|dangerous|must/i.test(shortIntention), shortIntention);

  /* ---- The journey, described in words. Nothing on the drawing is
     information that exists only on the drawing. */
  const bridgeText = await engine.p.evaluate(pl => window.__journeyText(pl), bridge);
  check('The journey reads in order', /Wind down.*settle.*Fajr.*back to sleep.*up/.test(bridgeText), bridgeText);
  await engine.ctx.close();

  /* ================================================================
     WHAT IS KNOWN, AND WHAT IS ASKED
     ================================================================ */
  const knows = async settings => {
    const c = await open({ settings });
    const k = await c.p.evaluate(() => window.__nightKnowledge());
    const asks = await c.p.evaluate(() => {
      document.getElementById('momentGo').click();
      return { change: !document.getElementById('nightChange').hidden,
               know: !document.getElementById('nightKnow').hidden };
    });
    const errs = c.errs;
    await c.ctx.close();
    return { k, asks, errs };
  };

  const full = await knows({ usualWake:'06:30', fajrHabit:'return' });
  check('A known evening asks nothing', full.asks.know && !full.asks.change);
  check('It has the usual wake, the habit and a calculated Fajr',
        full.k.usualWake === '06:30' && full.k.habit === 'return'
        && /^\d{2}:\d{2}$/.test(full.k.fajr), JSON.stringify(full.k.fajr));
  check('Fajr is Dubai’s, from the existing engine', full.k.fajr === '04:45', full.k.fajr);
  check('And nothing is missing', full.k.missing.length === 0, full.k.missing.join(','));

  const noWake = await knows({ usualWake:'', fajrHabit:'return' });
  check('Without a usual wake, it asks', noWake.asks.change && !noWake.asks.know);
  check('And says so', noWake.k.missing.includes('wake'));

  const depends = await knows({ usualWake:'06:30', fajrHabit:'depends' });
  check('“It depends” is the one thing worth asking tonight',
        depends.asks.change && !depends.asks.know);
  check('Which is not the same as missing information', depends.k.asksTonight === true);

  const neverAsked = await knows({ usualWake:'06:30', fajrHabit:'' });
  check('Never having been asked about Fajr also asks', neverAsked.asks.change);

  /* No location: no Fajr, and none invented. The night is still buildable. */
  const noPlace = await open({ settings:{ usualWake:'06:30', fajrHabit:'return', place:null } });
  const noFajr = await noPlace.p.evaluate(() => window.__nightKnowledge());
  check('With no location, Fajr is unknown rather than guessed', noFajr.fajr === null);
  await noPlace.p.locator('#momentGo').click();
  await noPlace.p.waitForTimeout(500);
  check('And the evening still goes straight to the one-tap confirmation',
        await noPlace.p.locator('#nightKnow').isVisible());
  check('Saying plainly that Fajr is not set',
        /not set/i.test(await noPlace.p.locator('#knowNote').innerText()),
        await noPlace.p.locator('#knowNote').innerText());
  await noPlace.p.locator('#knowNormal').click();
  await noPlace.p.waitForTimeout(500);
  check('The night built without a Fajr is an ordinary one',
        await noPlace.p.locator('#planJourney').isVisible());
  check('No console errors without a location', noPlace.errs.length === 0, noPlace.errs.join(' | '));
  await noPlace.ctx.close();

  /* ================================================================
     THE SCREEN — one tap, and what it saves
     ================================================================ */
  const normal = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' },
                              extra:{ brainDays:{ '2026-09-10':'hifz' } } });
  check('The evening leads with building the night',
        /build my night/i.test(await normal.p.locator('#momentGo').innerText()));
  await normal.p.locator('#momentGo').click();
  await normal.p.waitForTimeout(600);
  const facts = await normal.p.locator('#knowFacts').innerText();
  check('It says back what it already knows',
        /6:30/.test(facts) && /4:45/.test(facts) && /back to sleep/i.test(facts), facts);
  check('Including what tomorrow is for',
        /hifz/i.test(await normal.p.locator('#nightTitle').innerText()));
  /* One tap. That is the claim of the feature, so it is counted. */
  await normal.p.locator('#knowNormal').click();
  await normal.p.waitForTimeout(500);
  check('One tap reaches the built night', await normal.p.locator('#nightPlan').isVisible());
  check('The intention is the Hifz one',
        /memory/i.test(await normal.p.locator('#planIntention').innerText()),
        await normal.p.locator('#planIntention').innerText());
  const before = await read(normal.p);
  check('Nothing is saved before Save is pressed', before.plan === null);
  await normal.p.locator('#planSave').click();
  await normal.p.waitForTimeout(700);
  const saved = (await read(normal.p)).plan;
  check('Saving stores a complete night',
        saved && saved.mode === 'fajr' && saved.fajr === '04:45' && saved.finalWake === '06:30'
        && Number.isFinite(saved.windStart) && Number.isFinite(saved.sleepStart),
        JSON.stringify({ mode:saved?.mode, fajr:saved?.fajr, final:saved?.finalWake }));
  check('Stamped with tonight’s date and where it came from',
        saved.savedDate === '2026-09-09' && saved.source === 'build-my-night',
        `${saved.savedDate} / ${saved.source}`);
  check('Carrying the Brain Day it was built for', saved.brainDay === 'hifz');
  check('The overlay closes itself', !(await normal.p.locator('#nightVeil').isVisible()));
  /* And the rest of the app reads it. This is the integration that matters:
     the dua, the context engine and Today all take their wake time from the
     same saved plan. */
  check('The dua now names the second rising, not Fajr',
        (await normal.p.evaluate(() => window.__dua().line2)).endsWith('٦:٣٠'),
        await normal.p.evaluate(() => window.__dua().line2));
  check('The context engine anchors on the saved plan',
        (await normal.p.evaluate(() => window.__anchors())).source === 'plan');
  check('And Today shows the final waking, not the Fajr anchor',
        /6:30/.test(await normal.p.locator('#todayWake').innerText()),
        await normal.p.locator('#todayWake').innerText());
  check('No console errors through the whole flow', normal.errs.length === 0, normal.errs.join(' | '));
  await normal.ctx.close();

  /* ---- A one-night change must not become a permanent one. */
  const override = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' } });
  await override.p.locator('#momentGo').click();
  await override.p.waitForTimeout(500);
  await override.p.locator('#knowChange').click();
  await override.p.waitForTimeout(400);
  await override.p.locator('#changeHabit [data-habit="stay"]').click();
  await override.p.locator('#changeWake').fill('05:40');
  await override.p.locator('#changeBuild').click();
  await override.p.waitForTimeout(500);
  await override.p.locator('#planSave').click();
  await override.p.waitForTimeout(700);
  const after = await read(override.p);
  check('Tonight’s plan takes the one-night answer',
        after.plan.afterFajr === 'stay' && after.plan.finalWake === '04:45',
        `${after.plan.afterFajr} / ${after.plan.finalWake}`);
  check('But the permanent preference is untouched',
        after.settings.fajrHabit === 'return', after.settings.fajrHabit);
  check('And so is the usual wake time', after.settings.usualWake === '06:30', after.settings.usualWake);
  await override.ctx.close();

  /* ---- Unless they say so explicitly. */
  const keep = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' } });
  await keep.p.locator('#momentGo').click();
  await keep.p.waitForTimeout(500);
  await keep.p.locator('#knowChange').click();
  await keep.p.waitForTimeout(400);
  await keep.p.locator('#changeHabit [data-habit="stay"]').click();
  await keep.p.locator('#changeHabitKeep').check();
  await keep.p.locator('#changeBuild').click();
  await keep.p.waitForTimeout(500);
  await keep.p.locator('#planSave').click();
  await keep.p.waitForTimeout(700);
  check('Ticking “make this my usual” does change it',
        (await read(keep.p)).settings.fajrHabit === 'stay');
  await keep.ctx.close();

  /* ---- A fixed thing tomorrow morning. */
  const duty = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' } });
  await duty.p.locator('#momentGo').click();
  await duty.p.waitForTimeout(500);
  await duty.p.locator('#knowChange').click();
  await duty.p.waitForTimeout(400);
  await duty.p.locator('#changeDuty [data-duty="jamea"]').click();
  await duty.p.waitForTimeout(300);
  await duty.p.locator('#changeDutyTime').fill('07:30');
  await duty.p.locator('#changeBuild').click();
  await duty.p.waitForTimeout(500);
  check('The obligation is shown under the night',
        /jamea/i.test(await duty.p.locator('#planEnds').innerText())
        && /7:30/.test(await duty.p.locator('#planEnds').innerText()),
        await duty.p.locator('#planEnds').innerText());
  await duty.p.locator('#planSave').click();
  await duty.p.waitForTimeout(600);
  const dutyPlan = (await read(duty.p)).plan;
  check('And saved as a category and a time, never free text',
        dutyPlan.obligation.kind === 'jamea' && dutyPlan.obligation.time === '07:30'
        && Object.keys(dutyPlan.obligation).length === 2,
        JSON.stringify(dutyPlan.obligation));
  check('There is no free-text field anywhere in the flow', await duty.p.evaluate(() =>
    [...document.querySelectorAll('#nightVeil input, #nightVeil textarea')]
      .every(el => ['time','checkbox'].includes(el.type))));
  await duty.ctx.close();

  /* A night with no obligation says nothing about one. */
  const noDuty = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' } });
  await noDuty.p.locator('#momentGo').click();
  await noDuty.p.waitForTimeout(500);
  await noDuty.p.locator('#knowNormal').click();
  await noDuty.p.waitForTimeout(500);
  check('No obligation, nothing claimed',
        !/jamea|exam|appointment/i.test(await noDuty.p.locator('#planEnds').innerText()));
  await noDuty.p.locator('#planSave').click();
  await noDuty.p.waitForTimeout(600);
  check('And none stored', (await read(noDuty.p)).plan.obligation === null);
  await noDuty.ctx.close();

  /* ---- A saved plan outranks the usual schedule on a revisit. */
  const revisit = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' },
    extra:{ plan:{ mode:'continuous', wake:'05:15', finalWake:'05:15', savedDate:'2026-09-09',
                   windStart:1230, settleStart:1260, sleepStart:1275, total:480, target:480,
                   afterFajr:null, brainDay:'exam', obligation:null } } });
  check('A planned evening offers to change the plan',
        /change tonight/i.test(await revisit.p.locator('#momentGo').innerText()));
  await revisit.p.locator('#momentGo').click();
  await revisit.p.waitForTimeout(600);
  check('And starts from what was saved, not from the usual time',
        /5:15/.test(await revisit.p.locator('#knowFacts').innerText()),
        await revisit.p.locator('#knowFacts').innerText());
  await revisit.ctx.close();

  /* ================================================================
     THE JOURNEY, DRAWN
     ================================================================ */
  const drawOf = async (settings, steps) => {
    const c = await open({ settings, viewport: steps?.viewport });
    await c.p.locator('#momentGo').click();
    await c.p.waitForTimeout(500);
    if (steps?.before) await steps.before(c.p);
    if (!(await c.p.locator('#nightPlan').isVisible())) {
      if (await c.p.locator('#knowNormal').isVisible()) await c.p.locator('#knowNormal').click();
      else await c.p.locator('#changeBuild').click();
      await c.p.waitForTimeout(500);
    }
    const out = await c.p.evaluate(() => {
      const svg = document.querySelector('.journey');
      if (!svg) return null;
      const box = svg.viewBox.baseVal;
      const dots = [...svg.querySelectorAll('circle')].map(el => ({
        x:+el.getAttribute('cx'), y:+el.getAttribute('cy'), bright: el.classList.contains('bright') }));
      const names = [...svg.querySelectorAll('.jx-name')];
      const times = [...svg.querySelectorAll('.jx-time')];
      const boxOf = el => { const r = el.getBBox(); return { l:r.x, r:r.x + r.width, t:r.y, b:r.y + r.height }; };
      return {
        dots,
        labels: names.map(el => el.textContent.trim()),
        dir: names.map(el => getComputedStyle(el).direction),
        family: names.length ? getComputedStyle(names[0]).fontFamily : '',
        times: times.map(el => el.textContent.trim()),
        // Every label and time inside the box the browser draws.
        inside: [...names, ...times].every(el => {
          const r = boxOf(el);
          return r.l >= box.x - 0.5 && r.r <= box.x + box.width + 0.5
                 && r.b <= box.y + box.height + 0.5;
        }),
        // No two printed times may overlap each other.
        clear: times.every((a, i) => times.every((bEl, j) => {
          if (i >= j) return true;
          const ra = boxOf(a), rb = boxOf(bEl);
          return ra.r <= rb.l + 0.5 || rb.r <= ra.l + 0.5 || ra.b <= rb.t + 0.5 || rb.b <= ra.t + 0.5;
        })),
        aria: svg.getAttribute('aria-label'),
        overflow: document.documentElement.scrollWidth > window.innerWidth
      };
    });
    const errs = c.errs;
    await c.ctx.close();
    return { ...out, errs };
  };

  const bDraw = await drawOf({ usualWake:'06:30', fajrHabit:'return' });
  check('A bridge night is drawn with three points', bDraw.dots.length === 3);
  check('In order along the night', bDraw.dots[0].x < bDraw.dots[1].x && bDraw.dots[1].x < bDraw.dots[2].x,
        bDraw.dots.map(d => Math.round(d.x)).join(' < '));
  check('Fajr is the high point of the journey',
        bDraw.dots[1].y === Math.min(...bDraw.dots.map(d => d.y)) && bDraw.dots[1].bright,
        bDraw.dots.map(d => d.y).join(','));
  check('Settling is the low point', bDraw.dots[0].y === Math.max(...bDraw.dots.map(d => d.y)));
  check('Named in the approved Arabic', bDraw.labels.join('|') === 'النوم|الفجر|الاستيقاظ',
        bDraw.labels.join('|'));
  check('Right to left', bDraw.dir.every(d => d === 'rtl'));
  check('In the same Naskh', /Amiri Naskh/.test(bDraw.family), bDraw.family);
  check('Three times printed, and readable', bDraw.times.length === 3, bDraw.times.join(' '));
  check('None of them overlapping', bDraw.clear, bDraw.times.join(' '));
  check('Nothing clipped by the box', bDraw.inside);
  check('The whole journey is described for a screen reader',
        /Wind down/.test(bDraw.aria) && /up/.test(bDraw.aria), bDraw.aria);
  check('No console errors drawing it', bDraw.errs.length === 0, bDraw.errs.join(' | '));

  const sDraw = await drawOf({ usualWake:'06:30', fajrHabit:'stay' });
  check('A stay-awake night has two points, the second being Fajr',
        sDraw.dots.length === 2 && sDraw.labels.join('|') === 'النوم|الفجر',
        sDraw.labels.join('|'));
  check('Its times do not overlap either', sDraw.clear, sDraw.times.join(' '));

  const pDraw = await drawOf({ usualWake:'07:00', fajrHabit:'return', place:null });
  check('A night with no Fajr is one curve, two points',
        pDraw.dots.length === 2 && pDraw.labels.join('|') === 'النوم|الاستيقاظ',
        pDraw.labels.join('|'));

  /* The three screens. A journey that clips on a 320 is a journey nobody
     with a small phone can read. */
  for (const [name, viewport] of [['a small iPhone', { width:320, height:568 }],
                                  ['a large iPhone', { width:430, height:932 }],
                                  ['an iPad',        { width:834, height:1112 }]]) {
    const d = await drawOf({ usualWake:'06:30', fajrHabit:'return' }, { viewport });
    check(`On ${name} the journey fits`, d.inside && !d.overflow);
    check(`On ${name} the times stay clear of each other`, d.clear, d.times.join(' '));
    check(`On ${name} all three points are drawn`, d.dots.length === 3);
    check(`No console errors on ${name}`, d.errs.length === 0, d.errs.join(' | '));
  }

  /* ================================================================
     THE HANDOFF — what the next morning and the researcher get
     ================================================================ */
  const handoff = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' },
                               extra:{ brainDays:{ '2026-09-10':'hifz' } } });
  await handoff.p.locator('#momentGo').click();
  await handoff.p.waitForTimeout(500);
  await handoff.p.locator('#knowChange').click();
  await handoff.p.waitForTimeout(400);
  await handoff.p.locator('#changeDuty [data-duty="jamea"]').click();
  await handoff.p.waitForTimeout(250);
  await handoff.p.locator('#changeDutyTime').fill('07:30');
  await handoff.p.locator('#changeBuild').click();
  await handoff.p.waitForTimeout(500);
  await handoff.p.locator('#planSave').click();
  await handoff.p.waitForTimeout(700);

  /* The Restoration Twin's inputs: everything needed to compare planned
     against what happened, without inventing any sleep data. */
  const plan = (await read(handoff.p)).plan;
  check('The plan keeps the planned first sleep', Number.isFinite(plan.sleepStart) && plan.blockOne > 0);
  check('The Fajr it was built around', plan.fajr === '04:45');
  check('The planned second sleep', plan.returnSleep && plan.blockTwo > 0);
  check('The final planned wake', plan.finalWake === '06:30');
  check('The Brain Day', plan.brainDay === 'hifz');
  check('And the obligation', plan.obligation.kind === 'jamea');
  check('No actual sleep data is invented', !('sleepMinutes' in plan) && !('efficiency' in plan));

  /* The research export, read out of the real download rather than a probe,
     so what is asserted is the file the researcher actually receives. */
  const exported = await handoff.p.evaluate(() => new Promise(resolve => {
    const blobs = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = blob => { blobs.push(blob); return original(blob); };
    document.getElementById('exportStudy').click();
    setTimeout(async () => resolve(await Promise.all(blobs.map(b => b.text()))), 1400);
  }));
  const csv = exported.find(text => /participant_id/.test(text)) || '';
  /* Split respecting the quoting, not on every comma: several columns can
     legitimately hold one, and a naive split silently shifts every value
     after it by one and still looks like a passing test. */
  const splitRow = line => (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [])
    .map(cell => cell.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'))
    .slice(0, -1);
  const lines = csv.trim().split('\n');
  const cols = splitRow(lines[0]);
  const dateAt = cols.indexOf('date');
  // The row for the night that was just planned, not merely the first row:
  // study day 1 is the enrolment date and has no plan on it.
  const row = lines.slice(1).map(splitRow).find(cells => cells[dateAt] === '2026-09-09') || [];
  const valueOf = key => {
    const i = cols.indexOf(key);
    return i < 0 ? undefined : row[i];
  };
  for (const column of ['plan_fajr','plan_second_sleep','plan_final_wake',
                        'plan_after_fajr','plan_obligation','plan_obligation_time','plan_source']) {
    check(`The export has a ${column} column`, cols.includes(column));
  }
  check('With the Fajr the night was built around', valueOf('plan_fajr') === '04:45', valueOf('plan_fajr'));
  check('The final waking, which plan_wake_anchor is not',
        valueOf('plan_final_wake') === '06:30' && valueOf('plan_wake_anchor') === '04:45',
        `final ${valueOf('plan_final_wake')}, anchor ${valueOf('plan_wake_anchor')}`);
  check('The second sleep', /^\d{2}:\d{2}$/.test(valueOf('plan_second_sleep')), valueOf('plan_second_sleep'));
  check('The obligation as a category and a time',
        valueOf('plan_obligation') === 'jamea' && valueOf('plan_obligation_time') === '07:30');
  check('And where the plan came from', valueOf('plan_source') === 'build-my-night');
  /* Every new column is documented. A column a researcher cannot look up is
     a column that will be guessed at three months from now. */
  const dictionary = exported.find(text => /^"?column/.test(text)) || '';
  check('Every new column is in the data dictionary',
        ['plan_fajr','plan_second_sleep','plan_final_wake','plan_after_fajr',
         'plan_obligation','plan_obligation_time','plan_source']
          .every(key => dictionary.includes(key)),
        dictionary ? 'dictionary present' : 'no dictionary exported');
  /* Private text stays private: Phase 1B adds no free-text field, and the
     thought-unload text must still not be in the study export. */
  check('No free text of any kind reaches the export',
        !/thought|unload|note_text/i.test(cols.join(",")), cols.join(","));
  check('No console errors in the handoff', handoff.errs.length === 0, handoff.errs.join(' | '));
  await handoff.ctx.close();

  /* ---- The morning prefill takes the FINAL waking. It used to take the
     wake anchor, which on a bridge night is Fajr, so a participant's morning
     record started an hour and three quarters wrong before they touched it. */
  const prefill = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' },
    extra:{ plan:{ mode:'fajr', fajr:'04:45', returnSleep:'05:10', finalWake:'06:30',
                   wakeAnchor:'04:45', savedDate:'2026-09-09', settle:15, wind:30,
                   windStart:1295, settleStart:1325, sleepStart:1325, blockOne:400, blockTwo:80,
                   total:480, target:480, afterFajr:'return', brainDay:null, obligation:null } },
    hour: 7, minute: 10 });
  await prefill.p.waitForTimeout(500);
  const wakeField = await prefill.p.evaluate(() => {
    document.getElementById('momentGo').click();
    return new Promise(r => setTimeout(() => r(document.getElementById('actualWake').value), 900));
  });
  check('The morning opens prefilled with the final waking, not Fajr',
        wakeField === '06:30', wakeField);
  await prefill.ctx.close();

  /* ================================================================
     WHAT IT COSTS, AND WHAT IT NEEDS MOVEMENT FOR

     This runs in the evening, on the same phone that has to last the night,
     and it is the screen immediately before the one the brief says must not
     stimulate. It adds no animation of its own beyond a crossfade.
     ================================================================ */
  const cost = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' } });
  await cost.p.locator('#momentGo').click();
  await cost.p.waitForTimeout(500);
  await cost.p.locator('#knowNormal').click();
  await cost.p.waitForTimeout(700);
  const budget = await cost.p.evaluate(() => new Promise(resolve => {
    let frames = 0, long = 0, prev = performance.now();
    const started = prev;
    const tick = now => {
      const dt = now - prev; prev = now;
      frames++; if (dt > 34) long++;
      if (now - started < 2500) requestAnimationFrame(tick);
      else resolve({ frames, long, seconds: (now - started) / 1000 });
    };
    requestAnimationFrame(tick);
  }));
  check('The journey holds a smooth frame rate',
        budget.frames / budget.seconds > 45, `${(budget.frames / budget.seconds).toFixed(0)} fps`);
  check('With no stalls', budget.long <= 3, `${budget.long} long frames of ${budget.frames}`);
  check('The journey is SVG, not another canvas', await cost.p.evaluate(() =>
    document.querySelectorAll('#nightVeil canvas').length === 0
    && document.querySelectorAll('#nightVeil svg').length === 1));
  check('And nothing on it is animating', await cost.p.evaluate(() =>
    document.getAnimations().filter(a => a.playState === 'running').length === 0));
  await cost.ctx.close();

  /* Reduced motion. Nothing here depends on movement to be understood —
     the journey is a still drawing — so the only thing to drop is the fade. */
  const calm = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' }, reduced:true });
  await calm.p.locator('#momentGo').click();
  await calm.p.waitForTimeout(400);
  check('Reduced motion shows the screen immediately',
        await calm.p.evaluate(() =>
          parseFloat(getComputedStyle(document.getElementById('nightVeil')).opacity) > 0.9
          && getComputedStyle(document.getElementById('nightVeil')).transitionDuration.startsWith('0s')));
  await calm.p.locator('#knowNormal').click();
  await calm.p.waitForTimeout(400);
  const stillDraw = await calm.p.evaluate(() => {
    const svg = document.querySelector('.journey');
    return { dots: svg.querySelectorAll('circle').length,
             names: svg.querySelectorAll('.jx-name').length,
             times: svg.querySelectorAll('.jx-time').length };
  });
  check('And the journey is complete without any animation',
        stillDraw.dots === 3 && stillDraw.names === 3 && stillDraw.times === 3,
        JSON.stringify(stillDraw));
  check('No console errors under reduced motion', calm.errs.length === 0, calm.errs.join(' | '));
  await calm.ctx.close();

  /* A throttled device: the one thing that must survive is the tap. */
  const slow = await open({ settings:{ usualWake:'06:30', fajrHabit:'return' } });
  const session = await slow.ctx.newCDPSession(slow.p);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await slow.p.locator('#momentGo').click();
  await slow.p.waitForTimeout(1600);
  check('On a throttled device the screen still appears',
        await slow.p.locator('#nightKnow').isVisible());
  const topmost = await slow.p.evaluate(() => {
    const r = document.getElementById('knowNormal').getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el && (el.id || el.tagName);
  });
  check('And nothing sits on top of the primary action', topmost === 'knowNormal', String(topmost));
  await slow.p.locator('#knowNormal').click();
  await slow.p.waitForTimeout(1500);
  await slow.p.locator('#planSave').click();
  await slow.p.waitForTimeout(1800);
  check('A night can still be saved when throttled',
        Boolean((await read(slow.p)).plan));
  check('No console errors when throttled', slow.errs.length === 0, slow.errs.join(' | '));
  await slow.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
