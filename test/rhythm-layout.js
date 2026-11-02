/**
 * My Rhythm — layout, at the sizes people actually hold.
 *
 * This suite exists because of a release blocker: the bar at the bottom
 * of the app is fixed, and the Adjust panel used to expand inside the
 * card. On a phone that pushed the controls someone had just asked for
 * off the top of the screen; on a tablet the last of them passed under
 * the fixed bar and could not be touched at all.
 *
 * So the thing checked here is not "does it look right" but a property:
 * EVERY CONTROL IS REACHABLE. For each one, scroll it into view and
 * assert it is then fully inside the viewport and clear of the bar. A
 * control that is merely above the current scroll position is fine —
 * that is what scrolling is for — and a control that cannot be brought
 * into view at all, or that lands under the bar when it is, is not.
 *
 * Run at six viewports: the shortest iPhone still in use, three current
 * ones, the largest, and an iPad, where the bar is at the TOP and the
 * failure mode is therefore the opposite way up.
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

const SIZES = [
  ['iPhone SE', 375, 667],
  ['iPhone 13 mini', 375, 812],
  ['iPhone 15', 390, 844],
  ['iPhone 15 Pro', 393, 852],
  ['iPhone 15 Pro Max', 430, 932],
  ['iPad', 1024, 1366]
];

/* Every control the screen offers, named for a failure message. */
const CONTROLS = `#rhythm button, #rhythm select, #rhythm a,
                  #rhythmPanel button, #rhythmPanel select`;

/* In the page: bring one control into view and report where it lands
   against the viewport and against the fixed bar. */
const PROBE = `(function (index) {
  var all = [].slice.call(document.querySelectorAll(${JSON.stringify(CONTROLS)}))
    .filter(function (el) { var b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0; });
  var el = all[index];
  if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  var b = el.getBoundingClientRect();
  var nav = document.querySelector('.sidebar').getBoundingClientRect();
  var vw = document.documentElement.clientWidth;
  var vh = document.documentElement.clientHeight;
  return {
    name: (el.getAttribute('aria-label') || el.id || el.textContent || el.tagName)
            .trim().slice(0, 26),
    total: all.length,
    inView: b.top >= -0.5 && b.bottom <= vh + 0.5 && b.left >= -0.5 && b.right <= vw + 0.5,
    underBar: b.bottom > nav.top + 0.5 && b.top < nav.bottom - 0.5 &&
              b.right > nav.left + 0.5 && b.left < nav.right - 0.5,
    tall: Math.round(b.height),
    rect: [Math.round(b.top), Math.round(b.bottom)].join('-'),
    bar: [Math.round(nav.top), Math.round(nav.bottom)].join('-')
  };
})`;

async function sweep(page, when) {
  const bad = [];
  let n = 0, small = [];
  for (let i = 0; i < 60; i++) {
    const r = await page.evaluate(`(${PROBE})(${i})`);
    if (!r) break;
    n = r.total;
    if (!r.inView || r.underBar) {
      bad.push(r.name + ' [' + r.rect + ' vs bar ' + r.bar + ']' +
               (r.underBar ? ' UNDER BAR' : ' OFF SCREEN'));
    }
    /* 26px is the tick, which has a 44px hit area painted by ::after.
       Everything else is a real target and has to be one. */
    if (r.tall < 26) small.push(r.name + '@' + r.tall);
  }
  return { count: n, bad, small, when };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  for (const [name, w, h] of SIZES) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: true
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
      document.querySelector('[data-go="rhythm"]').click();
    });
    await page.waitForTimeout(800);

    /* ---- the one action, at the scroll position you arrive at ----

       Reachability is not enough for the primary control. A button that
       is only clear of the bar once you scroll is the exact state that
       was flagged, and whether it happens depends on how tall the day
       is — so both shapes are checked: one where two activities land on
       the same minute and collapse into a row, and one where they do
       not. */
    for (const grouped of [true, false]) {
      const rest = await page.evaluate(async (g) => {
        const s = window.SS.state.settings;
        s.rhythm = { ...(s.rhythm || {}), moveGap: g ? 2 : 1, mealGap: 3 };
        window.SS.save();
        document.querySelector('.nav button[data-view="today"]').click();
        await new Promise(r => setTimeout(r, 250));
        document.querySelector('[data-go="rhythm"]').click();
        await new Promise(r => setTimeout(r, 650));
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 350));
        const b = document.getElementById('rhythmStart').getBoundingClientRect();
        const nav = document.querySelector('.sidebar').getBoundingClientRect();
        const vh = document.documentElement.clientHeight;
        return {
          over: b.bottom > nav.top + 0.5 && b.top < nav.bottom - 0.5 &&
                b.right > nav.left + 0.5 && b.left < nav.right - 0.5,
          inView: b.top >= -0.5 && b.bottom <= vh + 0.5,
          where: Math.round(b.top) + '-' + Math.round(b.bottom) +
                 ' vs bar ' + Math.round(nav.top) + '-' + Math.round(nav.bottom)
        };
      }, grouped);
      check(name + ' · Start wind-down is clear of the bar without scrolling' +
            (grouped ? ' (two activities share a minute)' : ''),
        rest.over === false && rest.inView === true, rest.where);
    }

    /* ---- the screen itself ---- */
    const shut = await sweep(page, 'closed');
    check(name + ' · Every control on the day is reachable and clear of the bar',
      shut.bad.length === 0, shut.bad.join(' | ') || shut.count + ' controls');
    check(name + ' · And each is a real target',
      shut.small.length === 0, shut.small.join(' | '));

    /* ---- the sheet ---- */
    const opened = await page.evaluate(async () => {
      document.getElementById('rhythmAdjust').click();
      await new Promise(r => setTimeout(r, 450));
      const sheet = document.getElementById('rhythmPanel');
      const body = sheet.querySelector('.rhythm-sheet-body');
      const sb = sheet.getBoundingClientRect();
      const vh = document.documentElement.clientHeight;
      return {
        shown: sheet.hidden === false,
        fixed: getComputedStyle(sheet).position === 'fixed',
        /* It must sit inside the screen, not run off either end. */
        inside: sb.top >= -0.5 && sb.bottom <= vh + 0.5,
        rect: Math.round(sb.top) + '-' + Math.round(sb.bottom) + ' of ' + vh,
        /* Its own scroll, so the page behind it never grows. */
        scrolls: getComputedStyle(body).overflowY === 'auto',
        needsScroll: body.scrollHeight > body.clientHeight + 1,
        pageLocked: getComputedStyle(document.documentElement).overflow === 'hidden',
        /* Over the bar, not under it. */
        above: Number(getComputedStyle(sheet).zIndex) >
               Number(getComputedStyle(document.querySelector('.sidebar')).zIndex),
        /* The safe area is inside the scrolling half, so the last
           control can always clear the home indicator. */
        safePad: getComputedStyle(body).paddingBottom,
        modal: sheet.getAttribute('aria-modal'),
        labelled: Boolean(document.getElementById(sheet.getAttribute('aria-labelledby'))),
        expanded: document.getElementById('rhythmAdjust').getAttribute('aria-expanded'),
        focused: document.activeElement && document.activeElement.tagName
      };
    });
    check(name + ' · Adjust opens a sheet, fixed and on top of the bar',
      opened.shown && opened.fixed && opened.above);
    check(name + ' · The sheet fits the screen', opened.inside === true, opened.rect);
    check(name + ' · It scrolls itself and locks the page behind it',
      opened.scrolls === true && opened.pageLocked === true);
    check(name + ' · It is a labelled modal dialog',
      opened.modal === 'true' && opened.labelled === true && opened.expanded === 'true');
    check(name + ' · And focus lands on the first thing to change',
      opened.focused === 'SELECT', String(opened.focused));
    check(name + ' · Its last control clears the home indicator',
      /env\(|\d/.test(opened.safePad) && parseFloat(opened.safePad) >= 26,
      opened.safePad);

    const open = await sweep(page, 'open');
    check(name + ' · Every control in the sheet is reachable and clear of the bar',
      open.bad.length === 0, open.bad.join(' | ') || open.count + ' controls');

    /* Changing something in the sheet still changes the day behind it. */
    const changed = await page.evaluate(async () => {
      const before = window.__rhythm().items.find(i => i.key === 'caffeine').at;
      const sel = document.querySelector('[data-rule="caffeineGap"]');
      sel.value = '6';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 350));
      return { before, after: window.__rhythm().items.find(i => i.key === 'caffeine').at };
    });
    check(name + ' · A change made in the sheet reaches the day',
      changed.after === (changed.before + 120) % 1440,
      changed.before + ' → ' + changed.after);

    const closed = await page.evaluate(async () => {
      document.getElementById('rhythmScrim').click();
      await new Promise(r => setTimeout(r, 450));
      const a = {
        scrim: document.getElementById('rhythmPanel').hidden === true,
        unlocked: getComputedStyle(document.documentElement).overflow !== 'hidden',
        back: document.activeElement && document.activeElement.id
      };
      document.getElementById('rhythmAdjust').click();
      await new Promise(r => setTimeout(r, 400));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      a.escape = document.getElementById('rhythmPanel').hidden === true;
      return a;
    });
    check(name + ' · Tapping away closes it and unlocks the page',
      closed.scrim === true && closed.unlocked === true);
    check(name + ' · Focus goes back to Adjust', closed.back === 'rhythmAdjust', closed.back);
    check(name + ' · Escape closes it too', closed.escape === true);

    check(name + ' · Nothing was thrown', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     Two things at the same minute share one clock and one node.
     ================================================================ */
  {
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2300);
    await page.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
    await page.waitForTimeout(600);
    const together = await page.evaluate(async () => {
      const s = window.SS.state.settings;
      s.usualWake = '06:30'; s.target = 480;
      /* 2h before a 21:30 wind-down and 3h before a 22:30 sleep are the
         same 19:30 — the collision this has to handle. */
      s.rhythm = { ...(s.rhythm || {}), moveGap: 2, mealGap: 3 };
      window.SS.save();
      document.querySelector('[data-go="rhythm"]').click();
      await new Promise(r => setTimeout(r, 700));
      const items = window.__rhythm().items;
      const clash = items.filter(i => i.key === 'move' || i.key === 'meal');
      const rows = [...document.querySelectorAll('.rhythm-item')];
      const shared = rows.find(r => (r.dataset.key || '').split(' ').length > 1);
      const times = rows.map(r => r.querySelector('.rhythm-when').textContent);
      return {
        clashAt: clash.map(c => c.at),
        rows: rows.length,
        engineItems: items.length,
        shared: Boolean(shared),
        sharedKeys: shared ? shared.dataset.key : '',
        clocks: shared ? shared.querySelectorAll('.rhythm-when').length : -1,
        nodes: shared ? shared.querySelectorAll('.rhythm-node').length : -1,
        labels: shared ? [...shared.querySelectorAll('.rhythm-label')].map(n => n.textContent) : [],
        marks: shared ? shared.querySelectorAll('.rhythm-mark').length : -1,
        duplicateTimes: times.length - new Set(times).size
      };
    });
    check('Two activities at the same minute really do collide',
      together.clashAt[0] === together.clashAt[1], together.clashAt.join(' / '));
    check('They are drawn as one row', together.shared === true, together.sharedKeys);
    check('With one clock and one node',
      together.clocks === 1 && together.nodes === 1,
      together.clocks + ' / ' + together.nodes);
    check('Both labels, stacked', together.labels.length === 2, together.labels.join(' + '));
    check('And a tick each, so neither is lost', together.marks === 2, String(together.marks));
    check('No time is printed twice anywhere on the day',
      together.duplicateTimes === 0, String(together.duplicateTimes));
    check('Every item the engine returned is still on the screen',
      together.engineItems > together.rows, together.engineItems + ' in ' + together.rows + ' rows');

    /* Ticking one of a pair must not tick the other. */
    const one = await page.evaluate(async () => {
      const row = [...document.querySelectorAll('.rhythm-item')]
        .find(r => (r.dataset.key || '').split(' ').length > 1);
      row.querySelectorAll('.rhythm-mark')[0].click();
      await new Promise(r => setTimeout(r, 350));
      const raw = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}');
      const now = [...document.querySelectorAll('.rhythm-item')]
        .find(r => (r.dataset.key || '').split(' ').length > 1);
      return {
        keys: ((raw.settings.rhythm || {}).done || {}).keys || [],
        pressed: [...now.querySelectorAll('.rhythm-mark')]
          .map(b => b.getAttribute('aria-pressed')).join(',')
      };
    });
    check('Ticking one of a pair marks one of them',
      one.keys.length === 1, JSON.stringify(one.keys));
    check('And the other stays open', one.pressed === 'true,false', one.pressed);
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
  console.log('ALL CHECKS PASSED');
})();
