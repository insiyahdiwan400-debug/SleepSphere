/**
 * My Rhythm — the day that follows from the night.
 *
 * The thing this module could most easily become is a wellness checklist
 * with confident numbers and no provenance, so that is what the suite is
 * built to catch:
 *
 *   · Every line must carry the arithmetic that produced it, and that
 *     arithmetic must be true — each time is recomputed here from the
 *     anchors and the gap, and compared against what the screen shows.
 *   · A gap set to none must remove its line rather than hide it.
 *   · Changing one gap must move one line and leave the rest where they
 *     were. A day that reshuffles when you touch one number is a day
 *     nobody can reason about.
 *   · Nothing counts. Marks last a day; a stale day's marks are gone;
 *     no streak, no total, no record of what was missed.
 *
 * Needs the repository served at :8099.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = 'http://localhost:8099/index.html';
let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
};

/* A fixed start of day, so every expected time below is arithmetic and
   not a function of when this happens to run. */
const SETUP = () => {
  try {
    const raw = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}');
    raw.settings = { ...(raw.settings || {}), usualWake: '06:30', target: 480 };
    localStorage.setItem('sleepsphere_state_v2', JSON.stringify(raw));
  } catch (e) {}
};

async function open(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2300);
  await page.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.SS.state.settings.usualWake = '06:30';
    window.SS.state.settings.target = 480;
    window.SS.save();
  });
  await page.evaluate(() => document.querySelector('[data-go="rhythm"]').click());
  await page.waitForTimeout(700);
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  /* ================================================================
     1. It is a day, and it says where the day came from.
     ================================================================ */
  {
    const { ctx, page, errs } = await open(browser);
    const seen = await page.evaluate(() => ({
      active: document.getElementById('rhythm').classList.contains('active'),
      source: document.getElementById('rhythmSource').textContent,
      span: document.getElementById('rhythmSpan').textContent,
      basis: document.getElementById('rhythmBasis').textContent,
      rows: [...document.querySelectorAll('.rhythm-item')].map(r => r.dataset.key),
      engine: window.__rhythm().items.map(i => i.key),
      anchors: window.__rhythm().anchors
    }));
    check('1 · The day opens', seen.active === true);
    check('1 · It names the source of the times, not just the times',
      /usual day/i.test(seen.source), seen.source);
    check('1 · And runs from getting up to lights out',
      /6:30 AM until 10:30 PM/.test(seen.span), seen.span);
    check('1 · The screen draws exactly what the engine returned',
      seen.rows.join(',') === seen.engine.join(','),
      seen.rows.join(',') + '  vs  ' + seen.engine.join(','));
    check('1 · Nothing was thrown', errs.length === 0, errs.join(' | '));

    /* ============================================================
       2. Every time is the stated arithmetic, recomputed here.
       ============================================================ */
    const sums = await page.evaluate(() => {
      const day = window.__rhythm();
      const a = day.anchors, r = day.rules;
      const at = key => (day.items.find(i => i.key === key) || {}).at;
      const back = (from, hours) => ((Math.round(from - hours * 60) % 1440) + 1440) % 1440;
      return {
        wake: at('wake') === a.wake,
        caffeine: at('caffeine') === back(a.sleep, r.caffeineGap),
        meal: at('meal') === back(a.sleep, r.mealGap),
        move: at('move') === back(a.windDown, r.moveGap),
        winddown: at('winddown') === a.windDown,
        sleep: at('sleep') === a.sleep,
        everyLineHasABasis: day.items.every(i => typeof i.basis === 'string' && i.basis.length > 10),
        domHasABasis: [...document.querySelectorAll('.rhythm-item')]
          .every(r2 => (r2.querySelector('.rhythm-basis') || {}).textContent)
      };
    });
    check('2 · Getting up is where the plan puts it', sums.wake === true);
    check('2 · Caffeine is its gap before sleep', sums.caffeine === true);
    check('2 · The meal is its gap before sleep', sums.meal === true);
    check('2 · Hard effort is its gap before the wind-down', sums.move === true);
    check('2 · The wind-down is the wind-down', sums.winddown === true);
    check('2 · Lights out is the planned sleep', sums.sleep === true);
    check('2 · And every line carries the arithmetic that produced it',
      sums.everyLineHasABasis === true);
    check('2 · On the screen as well as in the engine', sums.domHasABasis === true);

    /* Breaks are spaced across the waking day, not pinned to o'clocks. */
    const breaks = await page.evaluate(() => {
      const day = window.__rhythm();
      const gap = (from, to) => ((Math.round(to - from) % 1440) + 1440) % 1440;
      const list = day.items.filter(i => /^break/.test(i.key))
        .map(i => gap(day.anchors.wake, i.at));
      const steps = list.slice(1).map((v, idx) => v - list[idx]);
      return { count: list.length, first: list[0], last: list[list.length - 1],
               awake: day.awake,
               even: steps.every(s => Math.abs(s - steps[0]) <= 1) };
    });
    check('2 · The breaks are evenly spaced', breaks.even === true);
    check('2 · All of them inside the waking day',
      breaks.first > 0 && breaks.last < breaks.awake,
      breaks.first + '…' + breaks.last + ' of ' + breaks.awake);
    await ctx.close();
  }

  /* ================================================================
     3. Changing one gap moves one line.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const moved = await page.evaluate(async () => {
      const snapshot = () => Object.fromEntries(
        window.__rhythm().items.map(i => [i.key, i.at]));
      const before = snapshot();
      const select = document.querySelector('[data-rule="caffeineGap"]');
      select.value = '6';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const after = snapshot();
      const changed = Object.keys(before).filter(k => before[k] !== after[k]);
      return {
        changed, shift: after.caffeine - before.caffeine,
        stored: (JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}')
          .settings.rhythm || {}).caffeineGap,
        shown: document.querySelector('[data-key="caffeine"] .rhythm-basis').textContent
      };
    });
    check('3 · Exactly one line moved', moved.changed.join(',') === 'caffeine',
      moved.changed.join(','));
    check('3 · By exactly the amount asked for', moved.shift === 120,
      String(moved.shift) + ' min');
    check('3 · The new gap is on disk', moved.stored === 6, String(moved.stored));
    check('3 · And the line now states the new arithmetic',
      /6 h before/.test(moved.shown), moved.shown);

    /* None means gone, not hidden. */
    const removed = await page.evaluate(async () => {
      const select = document.querySelector('[data-rule="breaks"]');
      select.value = '0';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      return {
        engine: window.__rhythm().items.filter(i => /^break/.test(i.key)).length,
        dom: document.querySelectorAll('.rhythm-item[data-key^="break"]').length,
        others: document.querySelectorAll('.rhythm-item').length
      };
    });
    check('3 · Setting a gap to none removes its lines',
      removed.engine === 0 && removed.dom === 0,
      removed.engine + ' / ' + removed.dom);
    check('3 · And leaves the rest of the day standing', removed.others >= 5,
      String(removed.others));

    const refused = await page.evaluate(() => ({
      tooBig: window.__rhythmRule('caffeineGap', 99),
      negative: window.__rhythmRule('mealGap', -1),
      nonsense: window.__rhythmRule('mealGap', 'soon'),
      unknown: window.__rhythmRule('vibes', 3),
      still: window.__rhythm().rules
    }));
    check('3 · An out-of-range gap is refused',
      refused.tooBig === false && refused.negative === false);
    check('3 · So is a value that is not a number', refused.nonsense === false);
    check('3 · And a rule that does not exist', refused.unknown === false);
    check('3 · None of which disturbed the real gaps',
      refused.still.caffeineGap === 6 && refused.still.mealGap === 3,
      JSON.stringify(refused.still));
    await ctx.close();
  }

  /* ================================================================
     4. Nothing is counted.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const marked = await page.evaluate(async () => {
      const row = document.querySelector('.rhythm-item[data-key="caffeine"]');
      const mark = row.querySelector('.rhythm-mark');
      const before = mark.getAttribute('aria-pressed');
      mark.click();
      await new Promise(r => setTimeout(r, 350));
      const raw = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}');
      return {
        before,
        after: document.querySelector('.rhythm-item[data-key="caffeine"] .rhythm-mark')
          .getAttribute('aria-pressed'),
        dimmed: document.querySelector('.rhythm-item[data-key="caffeine"]')
          .classList.contains('done'),
        stored: (raw.settings.rhythm || {}).done,
        note: document.getElementById('rhythmMarks').textContent
      };
    });
    check('4 · A line can be marked done',
      marked.before === 'false' && marked.after === 'true');
    check('4 · And reads as done', marked.dimmed === true);
    check('4 · The mark is filed under the day it belongs to',
      marked.stored && marked.stored.date === new Date().toISOString().slice(0, 10) &&
      marked.stored.keys.join(',') === 'caffeine',
      JSON.stringify(marked.stored));
    check('4 · The screen says the marks do not accumulate',
      /tomorrow they are gone/i.test(marked.note), marked.note);
    check('4 · And that a day with none of them is not a failure',
      /not a day you failed/i.test(marked.note));

    /* Yesterday's marks simply stop applying. */
    const stale = await page.evaluate(async () => {
      const s = window.SS.state.settings;
      s.rhythm = { ...(s.rhythm || {}),
                   done: { date: '2020-01-01', keys: ['caffeine', 'meal', 'sleep'] } };
      window.SS.save();
      document.querySelector('.nav button[data-view="today"]').click();
      await new Promise(r => setTimeout(r, 300));
      document.querySelector('[data-go="rhythm"]').click();
      await new Promise(r => setTimeout(r, 500));
      return {
        done: window.__rhythm().items.filter(i => i.done).length,
        dimmed: document.querySelectorAll('.rhythm-item.done').length
      };
    });
    check('4 · A stale day brings nothing forward',
      stale.done === 0 && stale.dimmed === 0,
      stale.done + ' / ' + stale.dimmed);

    /* No streak, no tally, anywhere on the screen. */
    const words = await page.evaluate(() =>
      document.getElementById('rhythm').textContent);
    check('4 · The word streak appears nowhere', !/streak/i.test(words));
    check('4 · Nor a count of days in a row', !/days in a row|in a row/i.test(words));
    await ctx.close();
  }

  /* ================================================================
     5. Easy Mode reaches it, and the wind-down line reaches Assist.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const least = await page.evaluate(async () => {
      window.SSAssist.setEffort('minimum');
      document.querySelector('.nav button[data-view="today"]').click();
      await new Promise(r => setTimeout(r, 300));
      document.querySelector('[data-go="rhythm"]').click();
      await new Promise(r => setTimeout(r, 500));
      return {
        marks: document.querySelectorAll('.rhythm-mark').length,
        rows: document.querySelectorAll('.rhythm-item').length,
        engine: window.__rhythm().items.length,
        note: document.getElementById('rhythmMarks').textContent
      };
    });
    check('5 · Bare minimum asks nothing of the day', least.marks === 0,
      String(least.marks));
    check('5 · While showing every line of it',
      least.rows === least.engine && least.rows > 4,
      least.rows + ' of ' + least.engine);
    check('5 · And saying why there is nothing to tick',
      /something to read, not something to tick/i.test(least.note), least.note);

    const started = await page.evaluate(async () => {
      const go = document.querySelector('.rhythm-item[data-key="winddown"] .rhythm-go');
      if (!go) return { missing: true };
      go.click();
      await new Promise(r => setTimeout(r, 2600));
      return {
        audio: window.SSExplore.audioRunning(),
        session: window.SSAssist.session() !== null,
        view: document.documentElement.dataset.view
      };
    });
    check('5 · The wind-down line starts the wind-down', started.audio === true);
    check('5 · As a real session, not a navigation', started.session === true);
    check('5 · And takes you to the night, where it is running',
      started.view === 'today', started.view);
    await page.evaluate(() => window.SSAssist.stop());
    await ctx.close();
  }

  /* ================================================================
     6. It claims nothing it cannot support.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const words = await page.evaluate(() => ({
      text: document.getElementById('rhythm').textContent,
      rules: document.getElementById('rhythmRules').textContent
    }));
    check('6 · It says the gaps are conventions, not findings',
      /not findings measured on you/i.test(words.rules));
    check('6 · And that no outcome is claimed for them',
      /does not claim an outcome/i.test(words.rules));
    check('6 · No study is cited that is not in the app',
      !/et al\.|20\d\d\)|journal/i.test(words.text));
    check('6 · Nothing promises an improvement',
      !/will improve|guarantee|proven to|scientifically proven/i.test(words.text));
    check('6 · And nothing reads as a diagnosis',
      !/you have |disorder|deficien/i.test(words.text));
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
  console.log('ALL CHECKS PASSED');
})();
