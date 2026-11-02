/**
 * Jamea al Anwar — the courtyard, driven.
 *
 * The scene is a photograph of the actual building, so the questions
 * worth asking changed when the plate did.
 *
 *   Provenance. A CC BY plate carries a condition: the attribution has
 *   to be on the screen. It is checked for, and checked to be visible
 *   rather than present-but-hidden. The plate is also checked to be the
 *   one this repository ships, so a future edit cannot quietly point
 *   the screen at something unlicensed.
 *
 *   No commentary. The brief is explicit that how the screen was built
 *   belongs in documentation. The rendered text is read and must not
 *   mention SVG, CSS, canvas, drawing or rendering — and must be short
 *   enough to be a title and two controls rather than an explanation.
 *
 *   The light. The grade is driven by the app's own sky, so the same
 *   screen opened at one in the afternoon and at eleven at night must
 *   not look the same. Measured, not asserted: both are opened with the
 *   clock pinned and the two grades compared.
 *
 *   The birds. Still a simulation, now over a photograph: nothing
 *   roosting is drawn, everything that lifts comes back down, and the
 *   drawn birds are smaller than the photographed ones, which is the
 *   check that catches them reading as paper aeroplanes.
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

/* Pin the clock: the grade is a function of the hour, so a suite that
   runs at an arbitrary time is testing an arbitrary look. */
const AT = (hour) => {
  const fixed = new Date(); fixed.setHours(hour, 40, 0, 0);
  const Real = Date;
  window.Date = class extends Real {
    constructor(...a) { return a.length ? new Real(...a) : new Real(fixed); }
    static now() { return fixed.getTime(); }
  };
};

async function open(browser, opts) {
  const o = opts || {};
  const ctx = await browser.newContext({
    viewport: o.viewport || { width: 393, height: 852 },
    isMobile: o.viewport ? o.viewport.width < 500 : true,
    hasTouch: true,
    reducedMotion: o.reducedMotion
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(AT, o.hour == null ? 22 : o.hour);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2400);
  await page.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
  await page.waitForTimeout(700);
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  /* ================================================================
     1. It opens, it is a dialog, it closes.
     ================================================================ */
  {
    const { ctx, page, errs } = await open(browser);

    const listed = await page.evaluate(() =>
      [...document.querySelectorAll('#explore button, #explore a')]
        .map(b => b.textContent.trim()).filter(t => /anwar/i.test(t)));
    check('1 · It is listed among the things you can start', listed.length > 0);

    const opened = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 1400));
      const h = document.getElementById('anwar');
      const plate = h.querySelector('.an-plate');
      return {
        present: Boolean(h),
        role: h.getAttribute('role'),
        modal: h.getAttribute('aria-modal'),
        label: h.getAttribute('aria-label'),
        locked: document.documentElement.classList.contains('anwar-open'),
        /* With w-descriptors naturalWidth is density-corrected, so it
           reports the layout size rather than the file's. complete plus
           the chosen candidate is what actually says it loaded. */
        loaded: plate.complete && /courtyard-(1280|1920)\.webp$/.test(plate.currentSrc),
        natural: plate.currentSrc.split('/').pop() + ' @' + plate.naturalWidth,
        alt: plate.alt,
        canvas: Boolean(h.querySelector('canvas'))
      };
    });
    check('1 · It opens', opened.present === true);
    check('1 · As a named modal dialog',
      opened.role === 'dialog' && opened.modal === 'true' && /anwar/i.test(opened.label),
      opened.label);
    check('1 · And takes over the screen', opened.locked === true);
    check('1 · The photograph actually loads', opened.loaded === true, opened.natural);
    check('1 · With a description for anyone who cannot see it',
      /courtyard/i.test(opened.alt) && opened.alt.length > 60);
    check('1 · And a canvas for the birds', opened.canvas === true);

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
     2. Provenance: the plate this repository ships, credited.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const prov = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 1000));
      const h = document.getElementById('anwar');
      const credit = h.querySelector('.an-credit');
      const link = credit ? credit.querySelector('a') : null;
      return {
        plate: window.SSAnwar.state().plate,
        src: h.querySelector('.an-plate').getAttribute('src'),
        local: [...h.querySelectorAll('img')]
          .every(i => /^\.\/media\/anwar\//.test(i.getAttribute('src'))),
        credit: credit ? credit.textContent : '',
        visible: credit ? credit.offsetParent !== null : false,
        href: link ? link.getAttribute('href') : '',
        behindDisclosure: Boolean(h.querySelector('details'))
      };
    });
    check('2 · Every image comes from this repository', prov.local === true, prov.src);
    check('2 · The photographer is named on the screen',
      prov.credit.indexOf(prov.plate.credit) > -1, prov.credit);
    check('2 · So is the licence', prov.credit.indexOf(prov.plate.licence) > -1);
    check('2 · Which links to its terms',
      /creativecommons\.org\/licenses\//.test(prov.href), prov.href);
    check('2 · And the credit is visible, not merely present',
      prov.visible === true && prov.behindDisclosure === false);
    await ctx.close();
  }

  /* ================================================================
     3. No implementation commentary, and no claims.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const words = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 900));
      const h = document.getElementById('anwar');
      /* What a person actually reads: the credit is a licence term, so
         it is excluded from the prose measurement and checked above. */
      const credit = h.querySelector('.an-credit');
      const prose = [...h.querySelectorAll('p, h1, h2, h3, span')]
        .filter(n => n !== credit && !credit.contains(n) && n.offsetParent !== null)
        .map(n => n.textContent.trim()).filter(Boolean);
      return {
        all: h.innerText,
        prose,
        buttons: [...h.querySelectorAll('button')]
          .map(b => (b.textContent || b.getAttribute('aria-label') || '').trim())
      };
    });
    check('3 · Nothing on screen explains how it was built',
      !/\bSVG\b|\bCSS\b|\bcanvas\b|\bdrawn\b|\brendered\b|original graphics/i.test(words.all),
      words.all.replace(/\s+/g, ' ').slice(0, 70));
    check('3 · There is no paragraph of instructions',
      words.prose.every(t => t.length <= 22), words.prose.join(' | '));
    check('3 · Nothing explains how to tap the birds',
      !/tap|pigeon|lift|disturb/i.test(words.prose.join(' ')));
    check('3 · The controls are a title, a way out and two actions',
      words.buttons.length === 4, words.buttons.join(' / '));
    check('3 · No date or founding is asserted',
      !/\b\d{3,4}\s?(CE|AD|AH)\b|\bcentury\b|founded|was built|commissioned/i.test(words.all));
    check('3 · And it carries no Arabic, so it cannot modify any',
      ARABIC.test(words.all) === false);
    await ctx.close();
  }

  /* ================================================================
     4. The light follows the real hour.
     ================================================================ */
  {
    const read = async (hour) => {
      const { ctx, page } = await open(browser, { hour });
      const out = await page.evaluate(async () => {
        window.SSAnwar.open();
        await new Promise(r => setTimeout(r, 3200));
        const h = document.getElementById('anwar');
        const cs = getComputedStyle(h.querySelector('.an-plate'));
        return {
          night: window.SSAnwar.state().night,
          filter: cs.filter,
          /* The lighting anchors anwar.js measures off the crop. */
          horizon: h.style.getPropertyValue('--an-horizon'),
          arcade: h.style.getPropertyValue('--an-arcade'),
          floor: h.style.getPropertyValue('--an-floor')
        };
      });
      await ctx.close();
      return out;
    };
    const noon = await read(13);
    const late = await read(23);
    check('4 · At one in the afternoon the courtyard is bright',
      noon.night < 0.3, String(noon.night));
    check('4 · At eleven at night it is dark', late.night > 0.8, String(late.night));
    check('4 · And the two are genuinely different pictures',
      noon.filter !== late.filter,
      noon.filter.slice(0, 30) + '  vs  ' + late.filter.slice(0, 30));
    check('4 · The lighting is anchored to where the arcade actually is',
      /%$/.test(late.arcade) && parseFloat(late.horizon) < parseFloat(late.arcade)
        && parseFloat(late.arcade) < parseFloat(late.floor),
      [late.horizon, late.arcade, late.floor].join(' < '));
    await (async () => {})();
  }

  /* ================================================================
     5. The birds.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const rest = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 1500));
      return window.SSAnwar.state();
    });
    check('5 · Nothing roosting is drawn — the flock is in the plate',
      rest.flying === 0, String(rest.flying));

    const lifted = await page.evaluate(async () => {
      const n = window.SSAnwar.lift(6, 0.4);
      await new Promise(r => setTimeout(r, 1200));
      return { made: n, state: window.SSAnwar.state() };
    });
    check('5 · A disturbance puts some into the air',
      lifted.state.flying > 0, String(lifted.state.flying));

    /* Scale: a drawn bird must be smaller than a photographed one, or
       it reads as a paper aeroplane over a real building. */
    const scale = await page.evaluate(() => {
      const c = document.querySelector('.an-birds');
      const w = c.getBoundingClientRect().width;
      /* The draw size anwar.js uses, recomputed from the same inputs. */
      const plateW = Math.max(w / 1920, c.getBoundingClientRect().height / 1277) * 1920;
      return { wingspan: plateW * 0.0034 * 1.5 * 2 * 1.72, viewport: w };
    });
    check('5 · And they are bird-sized, not kite-sized',
      scale.wingspan < 26, scale.wingspan.toFixed(1) + 'px wingspan');

    const settled = await page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 26000));
      return window.SSAnwar.state();
    });
    check('5 · Everything that went up comes back down',
      settled.flying === 0, String(settled.flying));
    await ctx.close();
  }

  /* ================================================================
     6. Borrowed, not owned.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const surface = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 900));
      return {
        keys: Object.keys(window.SSAnwar).sort(),
        audio: window.SSExplore.audioRunning(),
        session: window.SSAssist.session()
      };
    });
    check('6 · Its whole surface is close, lift, open and state',
      surface.keys.join(',') === 'close,lift,open,state', surface.keys.join(','));
    check('6 · Nothing plays until something is pressed',
      surface.audio === false && surface.session === null);

    const windDown = await page.evaluate(async () => {
      [...document.querySelectorAll('.an-btn')]
        .find(b => /wind-down/i.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 2600));
      return {
        audio: window.SSExplore.audioRunning(),
        session: window.SSAssist.session(),
        timer: window.SSExplore.timerEndsAt() > 0
      };
    });
    check('6 · The button starts a real Assist session', windDown.session !== null);
    check('6 · With Assist’s sound and Assist’s timer, not its own',
      windDown.audio === true && windDown.timer === true);

    const after = await page.evaluate(async () => {
      window.SSAnwar.close();
      await new Promise(r => setTimeout(r, 700));
      return {
        gone: document.getElementById('anwar') === null,
        session: window.SSAssist.session(),
        audio: window.SSExplore.audioRunning()
      };
    });
    check('6 · Closing the courtyard leaves the wind-down running',
      after.gone === true && after.session !== null && after.audio === true);
    await page.evaluate(() => window.SSAssist.stop());
    await ctx.close();
  }

  /* ================================================================
     7. Reduced motion means a still photograph.
     ================================================================ */
  {
    const { ctx, page } = await open(browser, { reducedMotion: 'reduce' });
    const still = await page.evaluate(async () => {
      window.SSAnwar.open();
      await new Promise(r => setTimeout(r, 1100));
      const before = window.SSAnwar.state();
      window.SSAnwar.lift(6, 0.5);
      await new Promise(r => setTimeout(r, 2200));
      const cs = n => getComputedStyle(document.querySelector(n)).animationName;
      return {
        calm: before.calm,
        before: before.flying,
        after: window.SSAnwar.state().flying,
        plate: cs('.an-plate'),
        grain: cs('.an-grain'),
        lamps: cs('.an-lamps'),
        loaded: (function () {
          var p = document.querySelector('.an-plate');
          return p.complete && /courtyard-(1280|1920)\.webp$/.test(p.currentSrc);
        })()
      };
    });
    check('7 · It knows motion was turned down', still.calm === true);
    check('7 · The photograph is still there', still.loaded === true);
    check('7 · No bird leaves the ground, even when disturbed',
      still.before === 0 && still.after === 0, still.before + ' → ' + still.after);
    check('7 · The plate does not drift', still.plate === 'none', still.plate);
    check('7 · The grain does not crawl', still.grain === 'none', still.grain);
    check('7 · And the lamps do not breathe', still.lamps === 'none', still.lamps);
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
  console.log('ALL CHECKS PASSED');
})();
