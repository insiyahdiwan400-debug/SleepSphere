/**
 * SleepSphere Insights.
 *
 * The thing worth testing here is not that a chart draws. It is that the
 * screen refuses to invent. This app's integrity layer says an unknown
 * sleep total is null and must never be read as a night of no sleep, and
 * Insights is the first screen that averages, medians and compares — which
 * is exactly where a `Number(x) || 0` would do the most damage and be the
 * hardest to see.
 *
 * So the suite seeds records with three different kinds of absence —
 * nights with no record, a night recorded times-only, and ratings nobody
 * gave — and asserts that each stays absent all the way to the copy on
 * screen.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = 'http://localhost:8099/index.html';
const KEY = 'sleepsphere_state_v2';

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
}

const TODAY = new Date(2026, 9, 10);
function day(n) {
  const d = new Date(TODAY); d.setDate(d.getDate() - n);
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function morning(i, over) {
  return Object.assign({
    id: 'm' + i, supersedes: null, date: day(i), createdAt: day(i) + 'T07:00:00.000Z',
    bedTime: '22:40', sleepTime: '23:0' + (i % 6), wakeTime: '06:' + (20 + (i % 9)),
    awakeMinutes: 10 + (i % 4) * 7, napMinutes: 0,
    opportunityMinutes: 450, sleepMinutes: 390 + ((i * 17) % 90), efficiency: 88,
    rest: 3 + (i % 3), energy: 2 + ((i * 3) % 4), focus: 3, calm: 3,
    fajr: 'ready', factors: [], note: '', targetMinutes: 480, intent: 'restore',
    planSnapshot: null, brainDay: 'normal', bioHarmonyId: null, bioHarmonySnapshot: null,
    experimentId: null, adherence: 'not_applicable', demo: false, verified: 'entered'
  }, over || {});
}

function seedScript(mornings) {
  return 'localStorage.setItem(' + JSON.stringify(KEY) + ', ' + JSON.stringify(JSON.stringify({
    version: 3,
    settings: { welcomeSeen: true, openingOff: true, mode: 'dark', target: 480, faith: 'on',
                usualWake: '06:30', fajrHabit: 'return', place: null, name: '' },
    plan: null, brainDays: {}, mornings, morningRevisions: [],
    study: { onboarded: true, participantId: 'P007', startDate: '2026-09-01',
             enrolledAt: '2026-09-01T06:00:00.000Z', consentAck: true,
             consentAt: '2026-09-01T06:00:00.000Z', cohort: 'jamea-v1',
             schemaVersion: 3, storageMode: 'local', lastSeenDay: 40 },
    bioCheckins: [], thoughts: [], scans: [], feedback: [], experimentHistory: []
  })) + ');';
}

const clockAt = () => `(()=>{const R=Date;const f=new R(2026,9,10,9,0,0);
  class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
  static now(){return f.getTime();}} window.Date=D;})()`;

async function open(browser, mornings) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
  const errs = [];
  await ctx.addInitScript(clockAt());
  await ctx.addInitScript(seedScript(mornings));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => { const e = document.getElementById('previewBar'); if (e) e.remove(); });
  await p.evaluate(() => document.querySelector('.nav button[data-view="twin"]').click());
  await p.waitForTimeout(400);
  return { ctx, p, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });

  /* ================================================================
     1. Three kinds of absence stay absent.
     ================================================================ */
  {
    const mornings = [];
    for (let i = 1; i <= 20; i++) {
      if (i % 7 === 0) continue;                                   // no record at all
      if (i === 4) { mornings.push(morning(i, { sleepMinutes: null, efficiency: null, verified: 'times-only' })); continue; }
      if (i === 5) { mornings.push(morning(i, { rest: null, energy: null })); continue; }
      mornings.push(morning(i));
    }
    const { ctx, p, errs } = await open(browser, mornings);

    const d = await p.evaluate(() => window.SSInsights.gather(30));
    check('The window is calendar nights, not a slice of the array', d.nights.length === 30, String(d.nights.length));
    check('Unrecorded nights are counted as unrecorded', d.unrecordedCount === 12, String(d.unrecordedCount));
    check('A times-only night counts as recorded', d.recordedCount === 18, String(d.recordedCount));
    check('But it is not usable for a duration average', d.unusableCount === 1, String(d.unusableCount));
    check('So the average rests on 17 nights, not 30', d.withDuration.length === 17, String(d.withDuration.length));
    check('And every night it rests on really has a total',
      d.withDuration.every(n => typeof n.duration === 'number' && n.duration > 0));

    /* The failure this whole suite exists for. */
    const zeroes = await p.evaluate(() =>
      window.SSInsights.gather(30).nights.filter(n => n.duration === 0).length);
    check('No absent night was turned into a zero', zeroes === 0, String(zeroes));

    const text = await p.evaluate(() => document.getElementById('insights').innerText);
    check('The copy says how many were not recorded', /12 were not recorded/.test(text));
    check('And why a recorded night is still a gap', /not knowable/i.test(text));
    check('No zero-hour night is printed anywhere', !/\b0h\b|\b0m asleep/.test(text));
    check('No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. Clock arithmetic across midnight.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, [
      morning(1, { sleepTime: '23:40', wakeTime: '06:30' }),
      morning(2, { sleepTime: '00:20', wakeTime: '07:00' }),
      morning(3, { sleepTime: '23:50', wakeTime: '06:40' }),
      morning(4, { sleepTime: '00:10', wakeTime: '06:50' })
    ]);
    const c = await p.evaluate(() => window.SSInsights.consistency(window.SSInsights.gather(30)));
    /* 23:40 and 00:20 are forty minutes apart, not twenty-three hours.
       Without the night shift the median lands in the afternoon and the
       spread reads as half a day. */
    check('Bed times either side of midnight stay adjacent',
      c.bed.mad <= 25, 'MAD ' + Math.round(c.bed.mad) + ' min');
    const shown = await p.evaluate(() => {
      const m = window.SSInsights.consistency(window.SSInsights.gather(30));
      return window.SSInsights.fmtClock(m.bed.median);
    });
    check('And the median reads as a midnight-ish hour', /12:0\d AM|11:5\d PM/.test(shown), shown);
    await ctx.close();
  }

  /* ================================================================
     3. A pattern is withheld until there is enough to say it.
     ================================================================ */
  {
    const few = [];
    for (let i = 1; i <= 6; i++) few.push(morning(i));
    const { ctx, p } = await open(browser, few);
    const pat = await p.evaluate(() => window.SSInsights.pattern(window.SSInsights.gather(30)));
    check('Below the sample floor no comparison is drawn', pat.enough === false, 'n=' + pat.n);
    const text = await p.evaluate(() => document.getElementById('insights').innerText);
    check('And the screen says what it is waiting for', /You have 6 so far|10 nights/.test(text));
    await ctx.close();
  }
  {
    const many = [];
    for (let i = 1; i <= 20; i++) many.push(morning(i));
    const { ctx, p } = await open(browser, many);
    const pat = await p.evaluate(() => window.SSInsights.pattern(window.SSInsights.gather(30)));
    check('With enough nights the comparison is drawn', pat.enough === true, 'n=' + pat.n);
    const text = await p.evaluate(() => document.getElementById('insights').innerText);
    check('Stated as a description, never as a cause',
      /does not show that one caused the other/i.test(text));
    check('And it shows the split it used', /median of|Split at your own median/i.test(text));
    await ctx.close();
  }

  /* ================================================================
     4. Demonstration data never enters a real figure.
     ================================================================ */
  {
    const mix = [];
    for (let i = 1; i <= 12; i++) mix.push(morning(i, { sleepMinutes: 400 }));
    for (let i = 13; i <= 20; i++) mix.push(morning(i, { id: 'demo' + i, demo: true, sleepMinutes: 90 }));
    const { ctx, p } = await open(browser, mix);
    const d = await p.evaluate(() => window.SSInsights.gather(30));
    check('Demonstration records are excluded from the window',
      d.withDuration.every(n => n.duration === 400), 'n=' + d.withDuration.length);
    check('So a 90-minute example cannot drag the median',
      d.withDuration.length === 12, String(d.withDuration.length));
    await ctx.close();
  }

  /* ================================================================
     5. Nothing recorded is a real state with a real answer.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser, []);
    const text = await p.evaluate(() => document.getElementById('insights').innerText);
    check('An empty history says so plainly', /No mornings recorded/.test(text));
    check('And promises no estimate', /does not estimate/i.test(text));
    check('No chart is drawn over nothing',
      (await p.evaluate(() => document.querySelectorAll('.in-bar').length)) === 0);
    check('No console errors on an empty history', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     6. Tone. The brief forbids a verdict.
     ================================================================ */
  {
    const many = [];
    for (let i = 1; i <= 25; i++) many.push(morning(i));
    const { ctx, p } = await open(browser, many);
    const text = await p.evaluate(() => document.getElementById('insights').innerText.toLowerCase());
    const banned = ['score', 'grade', '/100', 'streak', 'failed', 'poor', 'bad night',
                    'you should', 'warning', 'deficit', 'debt'];
    const found = banned.filter(w => text.includes(w));
    check('No score, grade, streak or verdict language', found.length === 0, found.join(', ') || 'clean');
    check('No medical conclusion is offered',
      !/(disorder|insomnia|apnea|diagnos)/i.test(text));
    await ctx.close();
  }

  /* ================================================================
     7. It behaves on a phone, and under reduced motion.
     ================================================================ */
  {
    const many = [];
    for (let i = 1; i <= 25; i++) many.push(morning(i));
    const { ctx, p } = await open(browser, many);
    const fit = await p.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      chart: (() => { const c = document.querySelector('.in-chart'); return c ? Math.round(c.getBoundingClientRect().width) : 0; })(),
      vw: window.innerWidth
    }));
    check('No horizontal page scroll on a phone', fit.doc <= 1, String(fit.doc));
    check('The chart fits its column', fit.chart > 0 && fit.chart <= fit.vw, fit.chart + ' / ' + fit.vw);

    const small = await p.evaluate(() =>
      [...document.querySelectorAll('#insights button')]
        .filter(b => b.offsetParent !== null)
        .filter(b => b.getBoundingClientRect().height < 32).length);
    check('Range controls are big enough to tap', small === 0, String(small));

    /* Tapping a night reads it out. Reading nights is a REPEATED action —
       you tap along the chart comparing them — so the chart itself must not
       move under the finger doing the tapping. The readout sits below it
       and is allowed to fill, within a reserved box. */
    const before = await p.evaluate(() => {
      const c = document.querySelector('.in-chart').getBoundingClientRect();
      return { top: c.top, h: document.getElementById('insights').getBoundingClientRect().height };
    });
    await p.evaluate(() => document.querySelector('.in-bar').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await p.waitForTimeout(250);
    const after = await p.evaluate(() => ({
      top: document.querySelector('.in-chart').getBoundingClientRect().top,
      h: document.getElementById('insights').getBoundingClientRect().height,
      read: document.querySelector('.in-readout').textContent
    }));
    check('Tapping a night reads that night out', /asleep|not recorded|not known/.test(after.read), after.read.slice(0, 60));
    check('The chart does not move under the finger tapping it',
      Math.abs(after.top - before.top) < 1, before.top + ' -> ' + after.top);
    check('And the section below barely shifts', Math.abs(after.h - before.h) < 2,
      before.h + ' -> ' + after.h);

    /* The screen-reader path is the same numbers, not a second source. */
    const table = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('.in-sr tr')].slice(1);
      return { rows: rows.length, hasNotRecorded: rows.some(r => /Not recorded/.test(r.textContent)) };
    });
    check('A readable table carries every night', table.rows === 30, String(table.rows));
    check('Including the ones with nothing in them', table.hasNotRecorded);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce'
    });
    const many = [];
    for (let i = 1; i <= 15; i++) many.push(morning(i));
    await ctx.addInitScript(clockAt());
    await ctx.addInitScript(seedScript(many));
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.evaluate(() => { const e = document.getElementById('previewBar'); if (e) e.remove(); });
    await p.evaluate(() => document.querySelector('.nav button[data-view="twin"]').click());
    await p.waitForTimeout(400);
    const anims = await p.evaluate(() =>
      document.getAnimations().filter(a => a.playState === 'running').length);
    check('Nothing animates under reduced motion', anims === 0, String(anims));
    await ctx.close();
  }

  /* ================================================================
     8. The records themselves are untouched.
     ================================================================ */
  {
    const many = [];
    for (let i = 1; i <= 10; i++) many.push(morning(i));
    const { ctx, p } = await open(browser, many);
    const after = await p.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
      return { count: raw.mornings.length, first: raw.mornings[0].sleepMinutes,
               version: raw.version };
    });
    check('Insights wrote nothing to the records', after.count === 10, String(after.count));
    check('And changed no value in them', after.first === morning(1).sleepMinutes, String(after.first));
    check('SCHEMA_VERSION untouched', after.version === 3, String(after.version));
    await ctx.close();
  }

  await browser.close();
  console.log('');
  console.log(fail ? `${fail} FAILED, ${pass} passed` : 'ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
