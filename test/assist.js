/**
 * SleepSphere Assist — the one-tap wind-down, driven as a person drives it.
 *
 * The brief lists the failures this must not have, and they are the
 * assertions below rather than a summary of them: no fake success, no
 * duplicate audio, no timer that keeps running after it is cancelled,
 * no fabricated sleep data, no button that does nothing.
 *
 * The one that matters most is the last section. Assist is a sequence
 * of steps and the tempting shape is to report the sequence rather than
 * the steps — "wind-down started" because the function reached the end.
 * So audio is forced to fail, and what is checked is that nothing then
 * claims to be playing.
 *
 * Needs the repository served at :8099.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = 'http://localhost:8099/index.html';

/* 20:40, the evening phase. The night console that carries the start
   button is contextual and is display:none at waking and at bedtime, so
   without a fixed clock this suite passes or fails on what time it
   happens to run — and focus() on a button with no layout does nothing. */
const EVENING = () => {
  const fixed = new Date(); fixed.setHours(20, 40, 0, 0);
  const Real = Date;
  window.Date = class extends Real {
    constructor(...a) { return a.length ? new Real(...a) : new Real(fixed); }
    static now() { return fixed.getTime(); }
  };
};
let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
};

async function open(browser, opts) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    ...(opts || {})
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(EVENING);
  if (opts && opts.before) await page.addInitScript(opts.before);
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
     1. One tap.
     ================================================================ */
  {
    const { ctx, page, errs } = await open(browser);
    const before = await page.evaluate(() => ({
      button: Boolean(document.getElementById('assistStart')),
      label: (document.getElementById('assistStart') || {}).textContent,
      audio: window.SSExplore.audioRunning(),
      sheet: Boolean(document.querySelector('.ss-assist'))
    }));
    check('1 · There is one button to start a wind-down', before.button === true);
    check('1 · Worded as the thing it does',
      /wind-down/i.test(before.label || ''), (before.label || '').trim());
    check('1 · Nothing is playing before it is pressed', before.audio === false);
    check('1 · And no sheet is up', before.sheet === false);

    await page.evaluate(() => document.getElementById('assistStart').click());
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => ({
      session: window.SSAssist.session(),
      playing: window.SSExplore.playing(),
      endsAt: window.SSExplore.timerEndsAt(),
      sheet: Boolean(document.querySelector('.ss-assist')),
      now: (document.querySelector('[data-now]') || {}).textContent || '',
      dua: !document.getElementById('duaVeil').hidden
    }));
    check('1 · One tap starts the sound', after.playing.length === 1, after.playing.join(','));
    check('1 · And arms the fade-out timer', after.endsAt > Date.now(),
      Math.round((after.endsAt - Date.now()) / 60000) + ' min');
    check('1 · And opens the verified dua', after.dua === true);
    check('1 · And shows the controls', after.sheet === true);
    check('1 · Which report what is actually playing',
      /rain/i.test(after.now) && /playing/i.test(after.now), after.now);
    check('1 · No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. The four controls, each doing a real thing.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => document.getElementById('assistStart').click());
    await page.waitForTimeout(2200);

    /* Hold. */
    const held = await page.evaluate(async () => {
      [...document.querySelectorAll('.ss-assist .ss-assist-btn')].find(b => /hold/i.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 500));
      return {
        paused: window.SSAssist.session().paused,
        contextState: window.SSExplore.contextState(),
        now: (document.querySelector('[data-now]') || {}).textContent || '',
        label: [...document.querySelectorAll('.ss-assist .ss-assist-btn')].map(b => b.textContent.trim()).join(',')
      };
    });
    check('2 · Hold really suspends the audio',
      held.paused === true && held.contextState === 'suspended', held.contextState);
    check('2 · And says so rather than still claiming to play',
      /held/i.test(held.now), held.now);
    check('2 · And offers Resume', /resume/i.test(held.label), held.label);

    const resumed = await page.evaluate(async () => {
      [...document.querySelectorAll('.ss-assist .ss-assist-btn')].find(b => /resume/i.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 700));
      return { paused: window.SSAssist.session().paused, state: window.SSExplore.contextState() };
    });
    check('2 · Resume picks the same sound back up',
      resumed.paused === false && resumed.state === 'running', resumed.state);

    /* Changing the sound must swap it, not stack it. */
    const swapped = await page.evaluate(async () => {
      const chip = [...document.querySelectorAll('.ss-assist [data-assist-sound]')].find(c => c.dataset.assistSound === 'wind');
      chip.click();
      await new Promise(r => setTimeout(r, 2000));
      return { playing: window.SSExplore.playing(), session: window.SSAssist.session().sound };
    });
    check('2 · Changing the sound swaps it', swapped.session === 'wind', swapped.session);
    check('2 · And never leaves two playing at once',
      swapped.playing.length === 1, swapped.playing.join(','));

    /* Changing the timer must re-arm, not add a second one. */
    const retimed = await page.evaluate(async () => {
      [...document.querySelectorAll('.ss-assist [data-assist-timer]')].find(c => c.dataset.assistTimer === '15').click();
      await new Promise(r => setTimeout(r, 400));
      return {
        timer: window.SSAssist.session().timer,
        minutes: Math.round((window.SSExplore.timerEndsAt() - Date.now()) / 60000)
      };
    });
    check('2 · Changing the length re-arms the timer',
      retimed.timer === 15 && retimed.minutes <= 15 && retimed.minutes >= 13,
      retimed.minutes + ' min');
    await ctx.close();
  }

  /* ================================================================
     3. Stop means stopped — including the timer.

        "No timer that continues incorrectly after cancellation" is in
        the brief, and it is the one a person only discovers twenty
        minutes later when the phone fades something that is not
        playing.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => document.getElementById('assistStart').click());
    await page.waitForTimeout(2200);
    const stopped = await page.evaluate(async () => {
      [...document.querySelectorAll('.ss-assist .ss-assist-btn')].find(b => /stop/i.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 1500));
      return {
        session: window.SSAssist.session(),
        playing: window.SSExplore.playing(),
        audio: window.SSExplore.audioRunning(),
        endsAt: window.SSExplore.timerEndsAt(),
        sheet: Boolean(document.querySelector('.ss-assist'))
      };
    });
    check('3 · Stop ends the session', stopped.session === null);
    check('3 · Stop silences the audio',
      stopped.playing.length === 0 && stopped.audio === false, stopped.playing.join(','));
    check('3 · Stop cancels the timer too, not just the sound',
      stopped.endsAt === 0, String(stopped.endsAt));
    check('3 · And takes the controls away', stopped.sheet === false);
    await ctx.close();
  }

  /* ================================================================
     4. Preferences, in the app's own store, surviving a reload.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => document.getElementById('assistStart').click());
    await page.waitForTimeout(2200);
    await page.evaluate(async () => {
      [...document.querySelectorAll('.ss-assist [data-assist-sound]')].find(c => c.dataset.assistSound === 'stream').click();
      await new Promise(r => setTimeout(r, 1600));
      [...document.querySelectorAll('.ss-assist [data-assist-timer]')].find(c => c.dataset.assistTimer === '30').click();
      await new Promise(r => setTimeout(r, 400));
      window.SSAssist.stop();
    });
    await page.waitForTimeout(600);

    const stored = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}');
      return { assist: (raw.settings || {}).assist || null, keys: Object.keys(localStorage) };
    });
    check('4 · Preferences are kept in the app\'s own state, not a new store',
      stored.assist && stored.assist.sound === 'stream' && Number(stored.assist.timer) === 30,
      JSON.stringify(stored.assist));
    check('4 · No extra storage key was invented',
      stored.keys.filter(k => /assist/i.test(k)).length === 0, stored.keys.join(', '));

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2300);
    const reloaded = await page.evaluate(() => window.SSAssist.prefs());
    check('4 · And they survive a reload',
      reloaded.sound === 'stream' && reloaded.timer === 30, JSON.stringify(reloaded));

    /* The thing it must never write. */
    const records = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}');
      return { mornings: (raw.mornings || []).length, plan: raw.plan };
    });
    check('4 · A wind-down records no sleep whatsoever',
      records.mornings === 0, records.mornings + ' morning record(s)');
    await ctx.close();
  }

  /* ================================================================
     5. When the audio cannot start.

        The failure the whole design is pointed at: a sequence that
        reports itself rather than its steps. Every AudioContext is
        forced to stay suspended, so the sound genuinely cannot play.
     ================================================================ */
  {
    const blockAudio = () => {
      const Real = window.AudioContext || window.webkitAudioContext;
      class Stuck extends Real {
        constructor(...a) { super(...a); }
        get state() { return 'suspended'; }
        resume() { return Promise.resolve(); }
      }
      window.AudioContext = Stuck;
      window.webkitAudioContext = Stuck;
    };
    const { ctx, page, errs } = await open(browser, { before: blockAudio });
    await page.evaluate(() => document.getElementById('assistStart').click());
    await page.waitForTimeout(2600);
    const blocked = await page.evaluate(() => ({
      session: window.SSAssist.session(),
      playing: window.SSExplore.playing(),
      toast: (document.getElementById('toast') || {}).textContent || '',
      toastShown: (document.getElementById('toast') || {}).classList
        ? document.getElementById('toast').classList.contains('show') : false,
      sheet: Boolean(document.querySelector('.ss-assist')),
      button: (document.getElementById('assistStart') || {}).disabled
    }));
    check('5 · A blocked start claims no session', blocked.session === null);
    check('5 · And nothing is listed as playing',
      blocked.playing.length === 0, blocked.playing.join(','));
    check('5 · And no controls appear over silence', blocked.sheet === false);
    check('5 · The person is told, on screen',
      blocked.toastShown === true && blocked.toast.length > 0, blocked.toast);
    check('5 · In the browser\'s own words, not a generic shrug',
      /blocked|tap again|unsupported|could not/i.test(blocked.toast), blocked.toast);
    check('5 · And the button is usable again', blocked.button === false);
    check('5 · Nothing was thrown at the page', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     6. Reachable without a mouse, and labelled for a screen reader.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const a11y = await page.evaluate(() => {
      const b = document.getElementById('assistStart');
      b.focus();
      return { focused: document.activeElement === b, tag: b.tagName };
    });
    check('6 · The start button takes keyboard focus',
      a11y.focused === true && a11y.tag === 'BUTTON');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(2400);
    const sheet = await page.evaluate(() => {
      const s = document.querySelector('.ss-assist');
      if (!s) return { missing: true };
      const chips = [...s.querySelectorAll('.ss-assist-chip')];
      const small = chips.filter(c => c.getBoundingClientRect().height < 44).length;
      return {
        role: s.getAttribute('role'),
        label: s.getAttribute('aria-label'),
        groups: s.querySelectorAll('[role="group"][aria-labelledby]').length,
        pressed: chips.filter(c => c.getAttribute('aria-pressed') === 'true').length,
        undersized: small
      };
    });
    check('6 · Enter starts it, like a tap', sheet.missing !== true);
    check('6 · The sheet is announced as a dialog with a name',
      sheet.role === 'dialog' && /wind-down/i.test(sheet.label || ''), sheet.label);
    check('6 · Sound and length are labelled groups',
      sheet.groups === 2, String(sheet.groups));
    check('6 · The current choices are marked pressed',
      sheet.pressed === 2, String(sheet.pressed));
    check('6 · Every chip is big enough to hit',
      sheet.undersized === 0, sheet.undersized + ' under 44px');
    await ctx.close();
  }

  /* ================================================================
     7. The morning half.

        Assist prepares the question; it never answers it. The prompt
        exists only because a wind-down happened, and it carries no
        figure about how anyone slept.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const none = await page.evaluate(() => window.SSAssist.morningPrompt());
    check('7 · With no wind-down behind it, there is nothing to ask', none === null);

    const prompt = await page.evaluate(() => {
      const s = window.SS.state.settings;
      s.assist = { ...(s.assist || {}), sound: 'rain', timer: 20,
                   lastStartedAt: new Date(Date.now() - 8 * 3600000).toISOString() };
      window.SS.save();
      return window.SSAssist.morningPrompt();
    });
    check('7 · After a night, there is', prompt !== null && !!prompt.startedAt);
    check('7 · And it carries what was played, not how anyone slept',
      prompt && prompt.sound === 'rain' && prompt.timer === 20 &&
      !('minutes' in prompt) && !('quality' in prompt) && !('score' in prompt),
      JSON.stringify(prompt));

    const stale = await page.evaluate(() => {
      const s = window.SS.state.settings;
      s.assist = { ...(s.assist || {}), lastStartedAt: new Date(Date.now() - 50 * 3600000).toISOString() };
      window.SS.save();
      return window.SSAssist.morningPrompt();
    });
    check('7 · Two days later it does not still ask about that night', stale === null);
    await ctx.close();
  }

  /* ================================================================
     8. The morning card.

        The half that closes the loop. One question, three answers, a
        way out — and the thing it must never do is turn an answer
        into a night. The app's morning record carries bed time, wake
        time, onset and awake minutes; a tap has none of them, and
        inventing them to fit the shape would be fabricating sleep
        data to make a check-in look thorough.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);

    const quiet = await page.evaluate(() => ({
      card: Boolean(document.getElementById('assistMorning')),
      prompt: window.SSAssist.morningPrompt()
    }));
    check('8 · With no wind-down behind it, nothing is asked',
      quiet.card === false && quiet.prompt === null);

    /* A wind-down last night, and the app opened this morning. */
    const asked = await page.evaluate(async () => {
      const s = window.SS.state.settings;
      s.assist = { ...(s.assist || {}), sound: 'rain', timer: 20,
                   lastStartedAt: new Date(Date.now() - 9 * 3600000).toISOString() };
      window.SS.save();
      window.SSAssistUI.mountMorning();
      await new Promise(r => setTimeout(r, 300));
      const card = document.getElementById('assistMorning');
      if (!card) return { missing: true };
      return {
        answers: [...card.querySelectorAll('.ss-assist-chip')].map(b => b.textContent.trim()),
        skip: Boolean([...card.querySelectorAll('button')].find(b => /skip/i.test(b.textContent))),
        group: card.querySelector('[role="group"][aria-labelledby]') !== null,
        note: (card.querySelector('.ss-assist-morning-note') || {}).textContent || '',
        small: [...card.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44).length
      };
    });
    check('8 · After a wind-down, one question appears', asked.missing !== true);
    check('8 · With the three answers the brief names',
      asked.answers && asked.answers.join(' / ') === 'Still tired / In between / Refreshed',
      (asked.answers || []).join(' / '));
    check('8 · And a way to skip it', asked.skip === true);
    check('8 · Labelled as a group for a screen reader', asked.group === true);
    check('8 · It says what the answer is and is not',
      /not a measurement/i.test(asked.note || ''), (asked.note || '').slice(0, 54));
    check('8 · Every control is big enough to tap', asked.small === 0, String(asked.small));

    const answered = await page.evaluate(async () => {
      const before = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}');
      [...document.querySelectorAll('#assistMorning .ss-assist-chip')]
        .find(b => /refreshed/i.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 500));
      const after = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}');
      return {
        card: Boolean(document.getElementById('assistMorning')),
        checkIns: (after.settings.assist || {}).checkIns || [],
        morningsBefore: (before.mornings || []).length,
        morningsAfter: (after.mornings || []).length,
        promptNow: window.SSAssist.morningPrompt()
      };
    });
    check('8 · Answering puts the question away', answered.card === false);
    check('8 · The answer is kept, as an answer',
      answered.checkIns.length === 1 && answered.checkIns[0].answer === 'refreshed',
      JSON.stringify(answered.checkIns));
    check('8 · And carries only when it was said, not how long anyone slept',
      answered.checkIns[0] && Object.keys(answered.checkIns[0]).sort().join(',') === 'answer,at',
      Object.keys(answered.checkIns[0] || {}).join(','));
    check('8 · No sleep record is invented to hold it',
      answered.morningsAfter === answered.morningsBefore,
      answered.morningsBefore + ' → ' + answered.morningsAfter);
    check('8 · And it is not asked twice', answered.promptNow === null);

    /* Skipping records nothing, and still stops the asking. */
    const skipped = await page.evaluate(async () => {
      const s = window.SS.state.settings;
      s.assist = { ...(s.assist || {}),
                   lastStartedAt: new Date(Date.now() - 9 * 3600000).toISOString() };
      window.SS.save();
      window.SSAssistUI.mountMorning();
      await new Promise(r => setTimeout(r, 250));
      [...document.querySelectorAll('#assistMorning button')]
        .find(b => /skip/i.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 400));
      const raw = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}');
      return {
        card: Boolean(document.getElementById('assistMorning')),
        checkIns: ((raw.settings.assist || {}).checkIns || []).length,
        prompt: window.SSAssist.morningPrompt()
      };
    });
    check('8 · Skipping puts it away too', skipped.card === false);
    check('8 · Records nothing', skipped.checkIns === 1, String(skipped.checkIns));
    check('8 · And is not asked again', skipped.prompt === null);

    /* Four days away, one question — not four. */
    const backlog = await page.evaluate(async () => {
      const s = window.SS.state.settings;
      s.assist = { ...(s.assist || {}),
                   lastStartedAt: new Date(Date.now() - 4 * 24 * 3600000).toISOString() };
      window.SS.save();
      window.SSAssistUI.mountMorning();
      await new Promise(r => setTimeout(r, 250));
      return { cards: document.querySelectorAll('.ss-assist-morning').length };
    });
    check('8 · Coming back after four days brings no backlog',
      backlog.cards === 0, backlog.cards + ' card(s)');
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
