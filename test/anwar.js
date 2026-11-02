/**
 * Jamea al Anwar — the courtyard, driven.
 *
 * Three things could go wrong here and only one of them is visual.
 *
 *   A claim. The brief forbids inventing architectural, historical or
 *   religious detail, so the suite reads the whole rendered screen and
 *   asserts it carries no date, no founding, no Arabic, and no
 *   photograph — and that it says, permanently and not behind a
 *   disclosure, that what you are looking at is drawn.
 *
 *   A second engine. Audio belongs to SSExplore and the wind-down to
 *   SSAssist. The module is checked for the absence of its own.
 *
 *   Birds that are not birds. A flock that leaves as one animal, or a
 *   bird that circles forever, or two birds standing in the same place,
 *   are each the difference between a simulation and a loop. All three
 *   are asserted, and the second one is a real bug this suite caught:
 *   half the birds circled anticlockwise and never met an exit
 *   condition written against an absolute angle.
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

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

async function open(browser, opts) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    ...(opts || {})
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2300);
  await page.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
  await page.waitForTimeout(600);
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  /* ================================================================
     1. It is reachable, it opens, and it closes.
     ================================================================ */
  {
    const { ctx, page, errs } = await open(browser);

    const listed = await page.evaluate(() =>
      [...document.querySelectorAll('#explore button, #explore a')]
        .map(b => b.textContent.trim())
        .filter(t => /anwar/i.test(t)));
    check('1 · It is listed among the things you can start',
      listed.length > 0, listed.join(' | '));

    const opened = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 900));
      const h = document.getElementById('anwar');
      return {
        present: Boolean(h),
        role: h && h.getAttribute('role'),
        modal: h && h.getAttribute('aria-modal'),
        label: h && h.getAttribute('aria-label'),
        locked: document.documentElement.classList.contains('anwar-open'),
        canvas: Boolean(h && h.querySelector('canvas'))
      };
    });
    check('1 · It opens', opened.present === true);
    check('1 · As a named modal dialog',
      opened.role === 'dialog' && opened.modal === 'true' && /anwar/i.test(opened.label || ''),
      opened.label);
    check('1 · And takes over the screen', opened.locked === true);
    check('1 · With a canvas for the birds', opened.canvas === true);

    const tap = await page.evaluate(() => {
      const b = document.querySelector('.anwar-touch');
      return { exists: Boolean(b), tag: b && b.tagName,
               name: b && b.getAttribute('aria-label') };
    });
    check('1 · The courtyard itself is a real, named control',
      tap.tag === 'BUTTON' && /lift|disturb/i.test(tap.name || ''), tap.name);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const shut = await page.evaluate(() => ({
      gone: document.getElementById('anwar') === null,
      unlocked: !document.documentElement.classList.contains('anwar-open'),
      state: window.SSAnwar.state().open
    }));
    check('1 · Escape closes it', shut.gone === true && shut.state === false);
    check('1 · And gives the app back', shut.unlocked === true);
    check('1 · Nothing was thrown', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. It claims nothing.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const claims = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 700));
      const h = document.getElementById('anwar');
      const prov = h.querySelector('.anwar-provenance');
      /* Everything that could carry a photograph, anywhere in the tree. */
      const painted = [...h.querySelectorAll('*')].filter(n => {
        const bg = getComputedStyle(n).backgroundImage || '';
        return /url\(/i.test(bg);
      }).length;
      return {
        text: h.textContent,
        provenance: prov ? prov.textContent : '',
        hidden: prov ? (prov.offsetParent === null) : true,
        behindDisclosure: Boolean(h.querySelector('details')),
        images: h.querySelectorAll('img, video, picture, source').length,
        urlBackgrounds: painted
      };
    });
    check('2 · It says what you are looking at is drawn',
      /is drawn/i.test(claims.provenance));
    check('2 · And that it is not a picture of the building',
      /not a picture of the building/i.test(claims.provenance));
    check('2 · And that no detail is taken from it',
      /none is claimed/i.test(claims.provenance));
    check('2 · The line is on the screen, not behind a disclosure',
      claims.hidden === false && claims.behindDisclosure === false);
    check('2 · There is no photograph anywhere in it',
      claims.images === 0 && claims.urlBackgrounds === 0,
      claims.images + ' media, ' + claims.urlBackgrounds + ' url() backgrounds');
    check('2 · No date is given', !/\b\d{3,4}\s?(CE|AD|AH)\b|\bcentury\b/i.test(claims.text));
    check('2 · Nothing is said to have been founded or built',
      !/founded|was built|commissioned|restored in/i.test(claims.text));
    check('2 · It carries no Arabic, so it cannot modify any',
      ARABIC.test(claims.text) === false);
    await ctx.close();
  }

  /* ================================================================
     3. The birds.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const rest = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 1200));
      const s = window.SSAnwar.state();
      return { s, unique: new Set(s.slots).size === s.slots.length };
    });
    check('3 · The ledge starts full and quiet',
      rest.s.birds > 6 && rest.s.flying === 0,
      rest.s.birds + ' birds, ' + rest.s.flying + ' flying');
    check('3 · And no two birds are standing in the same place',
      rest.unique === true, rest.s.slots.join(','));

    /* A flock does not leave as one animal. */
    const lift = await page.evaluate(async () => {
      window.SSAnwar.startle(10);            /* far left, on the ledge */
      await new Promise(r => setTimeout(r, 900));
      return window.SSAnwar.state();
    });
    check('3 · A disturbance lifts some of them', lift.flying > 0,
      String(lift.flying));
    check('3 · But not all of them — a flock is not one animal',
      lift.roosting > 0, lift.roosting + ' stayed');

    /* Nothing flies forever. This is the bug the suite exists for. */
    const settled = await page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 22000));
      const s = window.SSAnwar.state();
      return { s, unique: new Set(s.slots).size === s.slots.length };
    });
    check('3 · Everything comes back down', settled.s.flying === 0,
      settled.s.modes.join(','));
    check('3 · To the ledge, one bird to a place',
      settled.unique === true && settled.s.roosting === settled.s.birds,
      settled.s.slots.join(','));

    /* Left alone, it gets quieter rather than busier. */
    const quiet = await page.evaluate(() => window.SSAnwar.state().calmFor);
    check('3 · And the courtyard keeps count of how long it has been left',
      quiet >= 20, String(quiet));
    await ctx.close();
  }

  /* ================================================================
     4. It owns no audio and no timer.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const surface = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 700));
      return {
        keys: Object.keys(window.SSAnwar).sort(),
        before: {
          audio: window.SSExplore.audioRunning(),
          session: window.SSAssist.session()
        }
      };
    });
    check('4 · Its whole surface is open, close, state and startle',
      surface.keys.join(',') === 'close,open,startle,state', surface.keys.join(','));
    check('4 · Nothing is playing until something is pressed',
      surface.before.audio === false && surface.before.session === null);

    const windDown = await page.evaluate(async () => {
      [...document.querySelectorAll('.anwar-btn')]
        .find(b => /wind-down/i.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 2600));
      return {
        audio: window.SSExplore.audioRunning(),
        session: window.SSAssist.session(),
        timer: window.SSExplore.timerEndsAt() > 0
      };
    });
    check('4 · The wind-down button starts a real Assist session',
      windDown.session !== null);
    check('4 · With Assist’s sound and Assist’s timer, not its own',
      windDown.audio === true && windDown.timer === true);

    /* Closing the courtyard is not stopping the night. */
    const after = await page.evaluate(async () => {
      window.SSAnwar.close();
      await new Promise(r => setTimeout(r, 700));
      return {
        gone: document.getElementById('anwar') === null,
        session: window.SSAssist.session(),
        audio: window.SSExplore.audioRunning()
      };
    });
    check('4 · Closing the courtyard leaves the wind-down running',
      after.gone === true && after.session !== null && after.audio === true);
    await page.evaluate(() => window.SSAssist.stop());
    await ctx.close();
  }

  /* ================================================================
     5. Reduced motion means still, not merely slower.
     ================================================================ */
  {
    const { ctx, page } = await open(browser, { reducedMotion: 'reduce' });
    const still = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 900));
      const first = window.SSAnwar.state();
      window.SSAnwar.startle();
      await new Promise(r => setTimeout(r, 2500));
      const second = window.SSAnwar.state();
      const sway = getComputedStyle(document.querySelector('.anwar-lantern')).animationName;
      const twinkle = getComputedStyle(document.querySelector('.anwar-stars span')).animationName;
      return {
        calm: first.calm,
        birds: first.birds,
        before: first.modes.join(','),
        after: second.modes.join(','),
        sway, twinkle
      };
    });
    check('5 · It knows motion was turned down', still.calm === true);
    check('5 · The courtyard is still full', still.birds > 6, String(still.birds));
    check('5 · Nothing moves, even when disturbed',
      still.before === still.after && !/takeoff|circle/.test(still.after),
      still.after);
    check('5 · The lanterns do not sway', still.sway === 'none', still.sway);
    check('5 · And the stars do not twinkle', still.twinkle === 'none', still.twinkle);
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
  console.log('ALL CHECKS PASSED');
})();
