/**
 * Sabat — the two ends of the night.
 *
 * The brief's constraint on this module is one sentence: "Do not invent
 * religious wording or silently modify verified Arabic texts." Both
 * halves of that are checkable, and they are what this suite checks.
 *
 *   Not modified — every character of Arabic on the screen is compared
 *   against the same source the bedtime veil reads, byte for byte,
 *   including the tashkeel. A dropped fatha is a modification.
 *
 *   Not invented — SleepSphere has no waking duʿāʾ, because none has
 *   been supplied. So the waking card is checked for the absence of
 *   Arabic entirely. A screen that quietly filled that gap with
 *   something plausible would pass a screenshot and fail here.
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

/* Any Arabic letter or Arabic diacritic. Used to assert presence where
   there should be text and absence where there should not. */
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

async function open(browser, before) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  if (before) await page.addInitScript(before);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2300);
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
     1. Reachable, and it is the module the brief names.
     ================================================================ */
  {
    const { ctx, page, errs } = await open(browser);

    const ways = await page.evaluate(() =>
      [...document.querySelectorAll('[data-go="sabat"]')]
        .map(b => b.textContent.trim()));
    check('1 · There is a way in', ways.length > 0, ways.length + ' way(s)');
    check('1 · Worded as the module', ways.every(w => /sabat/i.test(w)), ways.join(' / '));

    const opened = await page.evaluate(async () => {
      document.querySelector('[data-go="sabat"]').click();
      await new Promise(r => setTimeout(r, 700));
      return {
        active: document.getElementById('sabat').classList.contains('active'),
        title: document.getElementById('pageTitle').textContent,
        view: document.documentElement.dataset.view
      };
    });
    check('1 · Opening it arrives there', opened.active === true && opened.view === 'sabat');
    check('1 · With a title about the night, not about a score',
      /night/i.test(opened.title), opened.title);
    check('1 · Nothing was thrown', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. The Arabic is the verified Arabic.

        Compared against the DUA constant itself rather than against a
        copy written into this file: a copy here would be a third
        transcription, and a test that asserts one transcription
        matches another transcription proves nothing about either.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(async () => {
      document.querySelector('[data-go="sabat"]').click();
      await new Promise(r => setTimeout(r, 700));
    });

    const text = await page.evaluate(() => {
      const src = window.__dua ? window.__dua() : null;
      const read = id => (document.getElementById(id) || {}).textContent || '';
      return {
        src,
        heading: read('sabatHeading'),
        line1: read('sabatLine1'),
        line2: read('sabatLine2'),
        closing: read('sabatClosing')
      };
    });

    check('2 · The verified source is reachable to compare against',
      text.src !== null && typeof text.src.line1 === 'string');
    if (text.src) {
      check('2 · The heading is the supplied heading, character for character',
        text.heading === text.src.heading, text.heading);
      check('2 · The first line is the supplied line, character for character',
        text.line1 === text.src.line1);
      check('2 · Including every diacritic',
        text.line1.length === text.src.line1.length,
        text.line1.length + ' vs ' + text.src.line1.length);
      check('2 · The second line opens with the supplied lead, unchanged',
        text.line2.indexOf(text.src.lead) === 0, text.line2);
      check('2 · And the closing is the supplied closing',
        text.closing === text.src.closing, text.closing);
    }

    /* The only moving part is the hour, and only where one is known. */
    const unknown = await page.evaluate(() => ({
      line2: document.getElementById('sabatLine2').textContent,
      placeholder: window.__dua().placeholder,
      note: document.getElementById('sabatHour').textContent
    }));
    check('2 · With no plan, the supplied placeholder stands',
      unknown.line2.endsWith(unknown.placeholder), unknown.line2);
    check('2 · And the screen says so rather than looking incomplete',
      /not filled in with a guess/i.test(unknown.note));

    /* Given a rising time, the hour appears — in Arabic-Indic digits,
       and nowhere else in the text. */
    const known = await page.evaluate(async () => {
      window.SS.state.settings.usualWake = '06:15';
      window.SS.save();
      document.querySelector('[data-go="sabat"]').click();
      await new Promise(r => setTimeout(r, 500));
      const src = window.__dua();
      const line2 = document.getElementById('sabatLine2').textContent;
      return {
        line2, lead: src.lead, placeholder: src.placeholder,
        note: document.getElementById('sabatHour').textContent
      };
    });
    check('2 · Given a rising time, the hour replaces the placeholder',
      known.line2.indexOf(known.placeholder) < 0, known.line2);
    check('2 · The lead is still untouched', known.line2.indexOf(known.lead) === 0);
    check('2 · The hour is set in Arabic-Indic digits',
      /[٠-٩]/.test(known.line2) && !/[0-9]/.test(known.line2), known.line2);
    check('2 · And the screen says where the hour came from',
      /6:15/.test(known.note), known.note);
    await ctx.close();
  }

  /* ================================================================
     3. The screen and the veil cannot disagree.

        Two places showing the same duʿāʾ is two places to get it wrong.
        They read one source, and this is the assertion that keeps them
        reading one source.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const both = await page.evaluate(async () => {
      document.querySelector('[data-go="sabat"]').click();
      await new Promise(r => setTimeout(r, 600));
      const screen = ['sabatHeading', 'sabatLine1', 'sabatLine2', 'sabatClosing']
        .map(id => document.getElementById(id).textContent);
      document.getElementById('sabatRead').click();
      await new Promise(r => setTimeout(r, 900));
      const veil = ['duaHeading', 'duaLine1', 'duaLine2', 'duaClosing']
        .map(id => document.getElementById(id).textContent);
      return {
        screen, veil,
        open: !document.getElementById('duaVeil').hidden
      };
    });
    check('3 · Read it now opens the duʿāʾ', both.open === true);
    check('3 · And it is the same text as the screen just showed',
      both.screen.join('\u0000') === both.veil.join('\u0000'),
      both.screen.join(' | ') + '  vs  ' + both.veil.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     4. Nothing is invented where nothing was supplied.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const waking = await page.evaluate(async () => {
      document.querySelector('[data-go="sabat"]').click();
      await new Promise(r => setTimeout(r, 600));
      const card = document.getElementById('sabatMorning');
      return {
        present: Boolean(card),
        text: card ? card.textContent : '',
        arabicNodes: card
          ? [...card.querySelectorAll('[lang="ar"], [dir="rtl"]')].length : -1
      };
    });
    check('4 · The waking end has a place on the screen', waking.present === true);
    check('4 · It carries no Arabic at all', ARABIC.test(waking.text) === false);
    check('4 · And no element pretending to hold any', waking.arabicNodes === 0,
      String(waking.arabicNodes));
    check('4 · It says plainly that none has been supplied',
      /no verified wording has been supplied/i.test(waking.text));
    check('4 · Rather than promising a feature that exists',
      !/coming soon|available now/i.test(waking.text));
    await ctx.close();
  }

  /* ================================================================
     5. The one preference this screen owns, and it reaches Assist.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const toggled = await page.evaluate(async () => {
      document.querySelector('[data-go="sabat"]').click();
      await new Promise(r => setTimeout(r, 600));
      const b = document.getElementById('sabatDuaToggle');
      const before = {
        pressed: b.getAttribute('aria-pressed'),
        pref: window.SSAssist.prefs().dua,
        label: b.textContent.trim()
      };
      b.click();
      await new Promise(r => setTimeout(r, 400));
      const after = {
        pressed: b.getAttribute('aria-pressed'),
        pref: window.SSAssist.prefs().dua,
        label: b.textContent.trim(),
        stored: (JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}')
          .settings.assist || {}).dua,
        state: document.getElementById('sabatDuaState').textContent
      };
      return { before, after };
    });
    check('5 · It starts on, which is what the default says',
      toggled.before.pressed === 'true' && toggled.before.pref === true);
    check('5 · Turning it off reaches Assist', toggled.after.pref === false);
    check('5 · And the disk', toggled.after.stored === false,
      String(toggled.after.stored));
    check('5 · The button reports the new state, not the old',
      toggled.after.pressed === 'false' && toggled.after.label !== toggled.before.label,
      toggled.before.label + ' → ' + toggled.after.label);
    check('5 · And it says what the wind-down will now do',
      /leaves this to you/i.test(toggled.after.state), toggled.after.state);

    /* The real proof: a wind-down started with it off does not open it. */
    const quiet = await page.evaluate(async () => {
      document.querySelector('.nav button[data-view="today"]').click();
      await new Promise(r => setTimeout(r, 500));
      const done = await window.SSAssist.start();
      await new Promise(r => setTimeout(r, 600));
      return {
        dua: done.dua,
        veil: !document.getElementById('duaVeil').hidden,
        audio: window.SSExplore.audioRunning()
      };
    });
    check('5 · With it off, the wind-down does not open the duʿāʾ',
      quiet.dua === false && quiet.veil === false);
    check('5 · But still does everything else', quiet.audio === true);
    await page.evaluate(() => window.SSAssist.stop());
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
  console.log('ALL CHECKS PASSED');
})();
