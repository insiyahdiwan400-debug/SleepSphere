/**
 * The context engine, Brain Day, and the four destinations.
 *
 * The engine is a pure function of (clock, state), so most of this is
 * arithmetic rather than UI: the clock is frozen, the state is seeded, and
 * the phase is read directly. That matters because the boundaries are where
 * this goes wrong — a participant opening the app at 06:29 and being told
 * "goodnight" is the kind of thing that gets an app abandoned on day two.
 *
 * The navigation checks exist because cutting twelve destinations to four is
 * the easiest way in this whole project to strand a working feature where
 * nobody can reach it.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const STUDY = { onboarded:true, participantId:'P001', startDate:'2026-10-01',
  enrolledAt:'2026-10-01T06:00:00.000Z', consentAck:true, consentAt:'2026-10-01T06:00:00.000Z',
  cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1 };

// Wake 06:30, wind-down 21:30, settle 22:30. Ordinary, and planned.
const PLAN = { mode:'continuous', target:480, settle:15, wind:60, barrier:'Screens',
  wake:'06:30', reason:'Class', blockOne:480, blockTwo:0, total:480,
  sleepStart:1350, settleStart:1335, windStart:1290, wakeAnchor:'06:30', savedDate:'2026-10-06' };

const state = extra => ({
  version:3,
  settings:{ name:'', age:'adult', target:480, faith:'on', installDismissed:true, openingOff:true,
             lastZone:'Asia/Dubai', locationGranted:false, dim:false, intent:'restore',
             welcomeSeen:true, mode:'dark', useCycle:false, healthLinked:false, place:null,
             highLatRule:'seventh', fajrEdited:false },
  study:{ ...STUDY }, plan:null, brainDays:{}, scans:[], thoughts:[], mornings:[],
  bioCheckins:[], lazyNight:null, trip:null, activeExperiment:null,
  experimentHistory:[], feedback:[], ...extra
});

const morning = date => ({
  id:'m-'+date, date, createdAt:date+'T06:00:00.000Z', bedTime:'22:30', sleepTime:'22:50',
  wakeTime:'06:30', awakeMinutes:12, napMinutes:0, opportunityMinutes:480, sleepMinutes:448,
  efficiency:93, rest:4, energy:3, focus:4, calm:4, fajr:'ready', factors:[], note:'',
  targetMinutes:480, intent:'restore', planSnapshot:null, brainDay:null, bioHarmonyId:null,
  bioHarmonySnapshot:null, experimentId:null, adherence:'not_applicable', demo:false
});

/* Seeds once, not on every navigation. addInitScript re-runs on reload, so a
   plain setItem would quietly restore the original blob and make any
   "does it survive a reopen?" check test nothing at all. */
const seed = blob => `(()=>{const k='sleepsphere_state_v2';
  if (!localStorage.getItem(k)) localStorage.setItem(k, ${JSON.stringify(JSON.stringify(blob))});})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });

  const open = async (blob, at) => {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true,
                                     timezoneId:'Asia/Dubai', locale:'en-GB' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    if (at) await p.addInitScript(fixed => {
      const Real = Date; const held = new Real(fixed);
      window.Date = class extends Real {
        constructor(...a){ return a.length ? new Real(...a) : new Real(held); }
        static now(){ return held.getTime(); }
      };
    }, at);
    if (blob) await p.addInitScript(seed(blob));
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1100);
    await p.evaluate(() => document.getElementById('opening')?.remove());
    return { ctx, p, errs };
  };

  /* ---------------------------------------------------- phase boundaries */
  // One page, many clocks: resolvePhase is pure, so the frozen Date only has
  // to be right for the state, not for each probe.
  const probe = await open(state({ plan: PLAN }), '2026-10-06T13:00:00+04:00');
  const phaseAt = hhmm => probe.p.evaluate(t => window.__phase(`2026-10-06T${t}:00+04:00`).phase, hhmm);

  check('Anchors come from the saved plan',
        (await probe.p.evaluate(() => window.__anchors().source)) === 'plan');

  for (const [time, want] of [
    ['06:31','WAKE'],  ['08:00','WAKE'],  ['10:29','WAKE'],
    ['10:31','DAY'],   ['13:00','DAY'],   ['19:59','DAY'],
    ['20:01','EVENING'], ['21:30','EVENING'], ['22:29','EVENING'],
    ['22:31','SLEEP'], ['02:00','SLEEP'], ['06:29','SLEEP']
  ]) check(`${time} is ${want}`, (await phaseAt(time)) === want, await phaseAt(time));

  // The two boundaries that matter most, to the minute.
  check('06:29 is still SLEEP, 06:31 is WAKE',
        (await phaseAt('06:29')) === 'SLEEP' && (await phaseAt('06:31')) === 'WAKE');
  check('22:29 is EVENING, 22:31 is SLEEP',
        (await phaseAt('22:29')) === 'EVENING' && (await phaseAt('22:31')) === 'SLEEP');
  check('The engine is deterministic', await probe.p.evaluate(() => {
    const first = JSON.stringify(window.__phase('2026-10-06T09:00:00+04:00'));
    for (let i = 0; i < 25; i++) if (JSON.stringify(window.__phase('2026-10-06T09:00:00+04:00')) !== first) return false;
    return true;
  }));
  await probe.ctx.close();

  // Recording this morning moves WAKE on to DAY.
  const done = await open(state({ plan: PLAN, mornings:[morning('2026-10-06')] }), '2026-10-06T08:00:00+04:00');
  check('A recorded morning turns WAKE into DAY',
        (await done.p.evaluate(() => window.__phase().phase)) === 'DAY');
  await done.ctx.close();

  // Without a plan the engine still answers, from the sleep target.
  const bare = await open(state({}), '2026-10-06T13:00:00+04:00');
  const bareAnchors = await bare.p.evaluate(() => window.__anchors());
  check('With no plan it falls back to defaults', bareAnchors.source === 'default',
        JSON.stringify(bareAnchors));
  check('And still resolves a phase',
        ['WAKE','DAY','EVENING','SLEEP'].includes(await bare.p.evaluate(() => window.__phase().phase)));
  await bare.ctx.close();

  // An open Lazy night outranks the clock.
  const inBed = await open(state({ plan: PLAN,
    lazyNight:{ date:'2026-10-06', bedTime:'23:10', sleepTime:'23:25', wakeTime:null } }),
    '2026-10-06T13:00:00+04:00');
  check('An open Lazy night reads as SLEEP even at midday',
        (await inBed.p.evaluate(() => window.__phase().phase)) === 'SLEEP',
        await inBed.p.evaluate(() => window.__phase().reason));
  await inBed.ctx.close();

  /* ---------------------------------------------------- what Today shows */
  const shows = async (at, expectPhase) => {
    const run = await open(state({ plan: PLAN }), at);
    const seen = await run.p.evaluate(() => ({
      phase: document.documentElement.dataset.phase,
      ask: document.getElementById('momentAsk').textContent,
      visible: [...document.querySelectorAll('#today [data-phase]')].filter(n => n.offsetParent !== null).length
    }));
    check(`${at.slice(11,16)} shows the ${expectPhase} moment`, seen.phase === expectPhase,
          `${seen.phase} · "${seen.ask}"`);
    check(`  no page errors at ${at.slice(11,16)}`, run.errs.length === 0, run.errs.join(' | '));
    await run.ctx.close();
    return seen;
  };
  const wake = await shows('2026-10-06T07:30:00+04:00','WAKE');
  check('  the morning asks about the night', /night leave you/i.test(wake.ask));
  check('  and nothing else competes with it', wake.visible === 0, `${wake.visible} card(s)`);
  await shows('2026-10-06T13:00:00+04:00','DAY');
  await shows('2026-10-06T21:00:00+04:00','EVENING');
  const sleep = await shows('2026-10-06T23:30:00+04:00','SLEEP');
  check('  bedtime hides every dashboard card', sleep.visible === 0, `${sleep.visible} card(s)`);

  /* ---------------------------------------------------- the fast check-in */
  const quick = await open(state({ plan: PLAN }), '2026-10-06T07:30:00+04:00');
  await quick.p.locator('#momentGo').click();
  await quick.p.waitForTimeout(400);
  let taps = 0;
  for (const value of [4, 3, 4]) {
    await quick.p.locator('.flow-choices .qc').nth(value - 1).click();
    taps += 1;
    await quick.p.waitForTimeout(320);
  }
  check('The core check-in is three taps', taps === 3);
  check('Then optional factors, which can be skipped',
        /optional/i.test(await quick.p.locator('.flow-hint').innerText()));
  await quick.p.locator('#flowSkip').click();
  await quick.p.waitForTimeout(600);
  const ack = await quick.p.locator('.reveal-quiet').innerText();
  check('One short acknowledgement, not a score', /recorded/i.test(ack), ack.split('\n')[1]);
  check('It never diagnoses', !/(disorder|insomnia|apnea|diagnos)/i.test(ack));
  check('It never claims a cause', !/\b(because|caused|due to)\b/i.test(ack));

  const saved = await quick.p.evaluate(() =>
    JSON.parse(localStorage.getItem('sleepsphere_state_v2')).mornings.at(-1));
  check('The record carries the three answers',
        saved.rest === 4 && saved.energy === 3 && saved.focus === 4,
        `rest ${saved.rest}, energy ${saved.energy}, focus ${saved.focus}`);
  check('Calm was not asked, so it is null not guessed', saved.calm === null, String(saved.calm));
  check('Times are declared estimated, not measured',
        saved.estimated.includes('bedTime') && saved.measured.length === 0,
        JSON.stringify(saved.estimated));
  check('Everything the export needs is present',
        Number.isFinite(saved.sleepMinutes) && Number.isFinite(saved.opportunityMinutes)
        && Number.isFinite(saved.efficiency),
        `${saved.sleepMinutes}m of ${saved.opportunityMinutes}m`);
  await quick.p.evaluate(() => document.getElementById('wakeDone')?.click());
  await quick.p.waitForTimeout(500);
  check('Finishing moves the day on',
        (await quick.p.evaluate(() => document.documentElement.dataset.phase)) === 'DAY');
  check('No errors through the check-in', quick.errs.length === 0, quick.errs.join(' | '));
  await quick.ctx.close();

  /* ---------------------------------------------------------- Brain Day */
  const brain = await open(state({ plan: PLAN }), '2026-10-06T13:00:00+04:00');
  check('The day asks what tomorrow needs',
        /what does your brain need tomorrow/i.test(await brain.p.locator('#momentAsk').innerText()));
  check('All six categories are offered', await brain.p.locator('.brain-chip').count() === 6);
  check('Each is a real touch target', await brain.p.evaluate(() =>
    [...document.querySelectorAll('.brain-chip')].every(c => c.getBoundingClientRect().height >= 44)));
  check('None is selected to begin with', await brain.p.evaluate(() =>
    [...document.querySelectorAll('.brain-chip')].every(c => c.getAttribute('aria-pressed') === 'false')));

  await brain.p.locator('[data-brain="hifz"]').click();
  await brain.p.waitForTimeout(400);
  check('Choosing one states it plainly',
        /tomorrow: hifz/i.test(await brain.p.locator('#momentAsk').innerText()),
        await brain.p.locator('#momentAsk').innerText());
  const stored = await brain.p.evaluate(() =>
    JSON.parse(localStorage.getItem('sleepsphere_state_v2')).brainDays);
  check('It is stored against a date, not loose on the plan',
        Object.values(stored).includes('hifz'), JSON.stringify(stored));

  await brain.p.reload({ waitUntil:'networkidle' });
  await brain.p.waitForTimeout(1200);
  check('It survives a reopen',
        /tomorrow: hifz/i.test(await brain.p.locator('#momentAsk').innerText()));

  await brain.p.locator('#momentGo').click();
  await brain.p.waitForTimeout(250);
  await brain.p.locator('[data-brain="exam"]').click();
  await brain.p.waitForTimeout(350);
  check('It can be changed',
        /tomorrow: exam/i.test(await brain.p.locator('#momentAsk').innerText()));
  // Reopen the grid to inspect how the current choice is marked. Choosing
  // closes it, which is the point of the check above.
  await brain.p.locator('#momentGo').click();
  await brain.p.waitForTimeout(250);
  check('Selected state is announced, not only coloured', await brain.p.evaluate(() => {
    const on = document.querySelector('[data-brain="exam"]');
    const off = document.querySelector('[data-brain="hifz"]');
    return on?.getAttribute('aria-pressed') === 'true'
        && off?.getAttribute('aria-pressed') === 'false';
  }));
  check('And the chosen one is marked with more than colour', await brain.p.evaluate(() =>
    document.querySelector('[data-brain="exam"] .glyph')?.textContent.trim() === '✓'));
  await brain.ctx.close();

  /* Historical integrity: a record made under one category keeps it when a
     later day is answered differently. This is the check that stops the
     dataset quietly rewriting its own past. */
  const past = state({
    plan: PLAN,
    brainDays: { '2026-10-04':'hifz', '2026-10-06':'recovery' },
    mornings: [{ ...morning('2026-10-04'), brainDay:'hifz' }]
  });
  const history = await open(past, '2026-10-06T13:00:00+04:00');
  await history.p.locator('#momentGo').click();
  await history.p.waitForTimeout(250);
  await history.p.locator('[data-brain="travel"]').click();
  await history.p.waitForTimeout(400);
  const after = await history.p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
    return { record: s.mornings.find(m => m.date === '2026-10-04')?.brainDay, map: s.brainDays };
  });
  check('Changing today never rewrites a past record', after.record === 'hifz', String(after.record));
  check('And the older day keeps its own answer', after.map['2026-10-04'] === 'hifz',
        JSON.stringify(after.map));

  // ...and it reaches the research export.
  const csv = await history.p.evaluate(() => new Promise(resolve => {
    const seen = []; const original = URL.createObjectURL;
    URL.createObjectURL = blob => { seen.push(blob); return original(blob); };
    document.querySelector('.nav button[data-view="data"]').click();
    document.getElementById('exportStudy').click();
    setTimeout(async () => resolve((await seen[0].text())), 1300);
  }));
  const lines = csv.trim().split('\n');
  const head = lines[0].split('","').map(x => x.replace(/^"|"$/g,''));
  const rows = lines.slice(1).map(l => l.split('","').map(x => x.replace(/^"|"$/g,'')));
  const col = head.indexOf('brain_day');
  const oct4 = rows.find(r => r[head.indexOf('date')] === '2026-10-04');
  check('Brain Day is exported for the day it belongs to', oct4 && oct4[col] === 'hifz',
        oct4 && oct4[col]);
  check('And days never answered export empty, not "normal"',
        rows.some(r => r[col] === ''), `${rows.filter(r => r[col] === '').length} empty`);
  check('No errors through Brain Day', history.errs.length === 0, history.errs.join(' | '));
  await history.ctx.close();

  /* ------------------------------------------------------- navigation */
  const nav = await open(state({ plan: PLAN }), '2026-10-06T13:00:00+04:00');
  const tabs = await nav.p.evaluate(() =>
    [...document.querySelectorAll('.nav button[data-view]')].map(b => b.dataset.view));
  check('Four primary destinations', tabs.length === 4, tabs.join(', '));
  check('And they are the right four',
        ['today','twin','learn','data'].every(v => tabs.includes(v)), tabs.join(', '));

  // Nothing stranded: every view still has a way in.
  const EVERY_VIEW = ['today','twin','plan','travel','unload','morning','bio',
                      'compass','experiment','learn','data','test'];
  const reachable = await nav.p.evaluate(views => {
    const entries = new Set([...document.querySelectorAll('.nav button[data-view]')].map(b => b.dataset.view));
    document.querySelectorAll('[data-go]').forEach(b => entries.add(b.dataset.go));
    return views.filter(v => !entries.has(v));
  }, EVERY_VIEW);
  check('Every old destination is still reachable', reachable.length === 0,
        reachable.length ? 'stranded: ' + reachable.join(', ') : 'all 12');

  // And the rehomed links actually land.
  for (const [from, target] of [['twin','compass'], ['twin','experiment'], ['data','travel'], ['data','test']]) {
    const landed = await nav.p.evaluate(async ([view, go]) => {
      document.querySelector(`.nav button[data-view="${view}"]`).click();
      await new Promise(r => setTimeout(r, 120));
      const link = document.querySelector(`#${view} [data-go="${go}"]`);
      if (!link) return 'no link';
      link.click();
      await new Promise(r => setTimeout(r, 160));
      return document.getElementById(go)?.classList.contains('active') ? 'ok' : 'did not open';
    }, [from, target]);
    check(`${from} → ${target}`, landed === 'ok', landed);
  }
  check('Safety material is still reachable', await nav.p.evaluate(async () => {
    document.querySelector('.nav button[data-view="learn"]').click();
    await new Promise(r => setTimeout(r, 150));
    return Boolean(document.querySelector('#stopbangCard'));
  }));
  check('No errors in navigation', nav.errs.length === 0, nav.errs.join(' | '));
  await nav.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
