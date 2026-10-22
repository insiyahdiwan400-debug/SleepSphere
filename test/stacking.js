/**
 * Can you see what the app is telling you, and can you reach the control?
 *
 * Two things in SleepSphere have to be on top of everything, and neither
 * was. The toast sat at z-index 40, under the welcome screen and
 * fieldwork (60), Flight Mode (60), the night, early and dua veils
 * (66-70), the install sheet (70) and the sound mixer (92) — so every
 * message the app gave while any of those was open was painted behind
 * it. A sound that could not start, a save that never reached the disk,
 * a field that needed fixing: all explained to a layer nobody can see.
 * And the sound player sat at 6, so once Flight Mode or a bedtime veil
 * was up there was no way to stop a soundscape without leaving the
 * screen.
 *
 * Both read from the outside as an app that says nothing and does
 * nothing, which is how it was reported.
 *
 * The player is checked by hit-testing: elementFromPoint at the centre
 * of the Stop button must return that button, which proves a finger
 * would reach it rather than the overlay. The toast carries
 * pointer-events: none by design, so it is checked by stacking instead —
 * nothing that overlaps it may be painted above it.
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

/* Every positioned, visible element whose box overlaps the target, with
   the z-index the browser actually resolved. Reading the stylesheet
   would only prove what was written; this proves what applies. */
function overlappers(selector) {
  const target = document.querySelector(selector);
  if (!target) return { missing: true };
  const box = target.getBoundingClientRect();
  const own = Number(getComputedStyle(target).zIndex) || 0;
  const over = [];
  for (const node of document.querySelectorAll('*')) {
    if (node === target || node.contains(target) || target.contains(node)) continue;
    const style = getComputedStyle(node);
    if (style.position === 'static' || style.zIndex === 'auto') continue;
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const overlaps = r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
    if (!overlaps) continue;
    const z = Number(style.zIndex) || 0;
    if (z >= own) over.push((node.id || node.className || node.tagName) + '@' + z);
  }
  return { own, over };
}

async function openApp(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  return { ctx, page, errs };
}

/* A soundscape playing, which is the only state in which the player
   exists at all. Three taps, the same three a person makes. */
async function startASound(page) {
  await page.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('.nav button[data-view="learn"]').click());
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('#explore .ex-sound').click());
  await page.waitForTimeout(1400);
  return page.evaluate(() => window.SSExplore.playing().length === 1);
}

/* The overlays that were covering them, each opened the way the app
   opens it. */
const OVERLAYS = [
  ['Flight Mode', () => { window.SSFlightCabin.open(); }],
  ['the sound mixer', () => { window.SSExplore.openMixer(); }],
  ['lazy mode', () => {
    const veil = document.querySelector('.lazy-veil');
    if (veil) veil.classList.add('active');
  }],
  ['the welcome overlay', () => {
    document.getElementById('welcomeOverlay').classList.add('active');
  }]
];

/* The mixer is the deliberate exception, and the reason is worth
   writing down rather than quietly skipping. The mixer dialog sits
   ABOVE the mini-player on purpose: it is the fuller version of the
   same controls, with a toggle and a volume for every layer. Demanding
   the little player's Stop be reachable through it would be demanding
   the dialog be partly covered by a worse copy of itself. What has to
   hold there is the same promise by a different control, so that is
   what is checked. */
const PLAYER_EXEMPT = 'the sound mixer';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });

  /* ================================================================
     1. The toast is above everything that can overlap it.
     ================================================================ */
  {
    const { ctx, page, errs } = await openApp(browser);
    await startASound(page);
    for (const [name, open] of OVERLAYS) {
      await page.evaluate(open);
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        const t = document.getElementById('toast');
        t.textContent = 'Checking that this can be read';
        t.classList.add('show');
      });
      await page.waitForTimeout(300);
      const r = await page.evaluate(overlappers, '#toast');
      check('1 · The toast is not covered by ' + name,
        r.missing !== true && r.over.length === 0,
        'z=' + r.own + (r.over.length ? ', covered by ' + r.over.join(', ') : ''));
      /* Back to a clean slate for the next one. */
      await page.evaluate(() => {
        try { window.SSFlightCabin.close(); } catch (e) {}
        try { window.SSExplore.close(); } catch (e) {}
        document.querySelector('.lazy-veil')?.classList.remove('active');
        document.getElementById('welcomeOverlay').classList.remove('active');
        document.getElementById('toast').classList.remove('show');
      });
      await page.waitForTimeout(400);
    }
    check('1 · No console errors while opening every overlay',
      errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. The sound can always be stopped.

        Not "the player has a high z-index" — that a finger landing on
        Stop reaches Stop.
     ================================================================ */
  for (const [name, open] of OVERLAYS) {
    const { ctx, page } = await openApp(browser);
    const playing = await startASound(page);
    check('2 · A sound is playing before opening ' + name, playing === true);

    await page.evaluate(open);
    await page.waitForTimeout(700);

    if (name === PLAYER_EXEMPT) {
      const viaMixer = await page.evaluate(() => {
        const toggle = document.querySelector('.ex-layer-row:not(.ex-master) .ex-toggle.on')
          || document.querySelector('.ex-layer-row:not(.ex-master) .ex-toggle');
        if (!toggle) return { missing: true };
        const box = toggle.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          onTop: hit === toggle || toggle.contains(hit),
          hit: hit ? (hit.id || hit.className || hit.tagName) : null,
          lit: toggle.classList.contains('on')
        };
      });
      check('2 · The mixer shows the sound already playing as on', viaMixer.lit === true);
      check('2 · And its own toggle is reachable',
        viaMixer.onTop === true, viaMixer.missing ? 'no toggle' : 'hit ' + viaMixer.hit);
      if (viaMixer.onTop) {
        await page.evaluate(() =>
          document.querySelector('.ex-layer-row:not(.ex-master) .ex-toggle.on').click());
        await page.waitForTimeout(1200);
        check('2 · And turning it off stops the sound',
          (await page.evaluate(() => window.SSExplore.audioRunning())) === false);
      }
      await ctx.close();
      continue;
    }

    const reach = await page.evaluate(() => {
      const stop = document.querySelector('#ssPlayer button[aria-label="Stop all sound"]');
      if (!stop) return { missing: true };
      const box = stop.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return { collapsed: true };
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        onTop: hit === stop || stop.contains(hit),
        hit: hit ? (hit.id || hit.className || hit.tagName) : null,
        tap: Math.round(Math.min(box.width, box.height))
      };
    });
    check('2 · Stop is reachable with ' + name + ' open',
      reach.onTop === true, reach.missing ? 'no player' : 'hit ' + reach.hit);

    /* And pressing it actually stops the sound, from where you are. */
    if (reach.onTop) {
      await page.evaluate(() =>
        document.querySelector('#ssPlayer button[aria-label="Stop all sound"]').click());
      await page.waitForTimeout(1200);
      check('2 · And pressing it stops the sound from ' + name,
        (await page.evaluate(() => window.SSExplore.audioRunning())) === false);
    }
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
