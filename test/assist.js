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

  /* ================================================================
     9. Easy Mode.

        "Bare minimum should genuinely reduce effort. It must not
        simply show a shorter checklist." So what is measured here is
        the number of things a person has to touch to be asleep, and
        the number of things put in front of them while they do it —
        not the number of items on a list.

        The other half of the same promise: nothing is taken away. At
        every level, every control is still there and still reachable.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);

    const chooser = await page.evaluate(() => {
      const box = document.getElementById('assistEffort');
      if (!box) return { missing: true };
      return {
        levels: [...box.querySelectorAll('[data-assist-effort]')].map(b => b.textContent.trim()),
        ids: [...box.querySelectorAll('[data-assist-effort]')].map(b => b.dataset.assistEffort),
        pressed: [...box.querySelectorAll('[data-assist-effort]')]
          .filter(b => b.getAttribute('aria-pressed') === 'true')
          .map(b => b.dataset.assistEffort),
        group: box.querySelector('[role="group"][aria-labelledby]') !== null,
        note: (box.querySelector('.ss-assist-effort-note') || {}).textContent || '',
        small: [...box.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44).length
      };
    });
    check('9 · The three levels are offered beside the button they change',
      chooser.missing !== true);
    check('9 · Worded as the brief words them',
      chooser.levels && chooser.levels.join(' / ') === 'Bare minimum / A little effort / Full routine',
      (chooser.levels || []).join(' / '));
    check('9 · One is current, and it is the middle one',
      chooser.pressed && chooser.pressed.join(',') === 'some', (chooser.pressed || []).join(','));
    check('9 · Labelled as a group for a screen reader', chooser.group === true);
    check('9 · Each level is big enough to tap', chooser.small === 0, String(chooser.small));
    check('9 · And it says what the level does before it is committed to',
      chooser.note.length > 40, chooser.note.slice(0, 48));

    /* The note is not one sentence reused three times. */
    const notes = await page.evaluate(async () => {
      const out = {};
      for (const level of window.SSAssist.EFFORT) {
        document.querySelector('[data-assist-effort="' + level + '"]').click();
        await new Promise(r => setTimeout(r, 120));
        out[level] = {
          note: document.querySelector('.ss-assist-effort-note').textContent,
          button: document.getElementById('assistStart').textContent.trim(),
          pressed: document.querySelector('[data-assist-effort="' + level + '"]')
            .getAttribute('aria-pressed')
        };
      }
      return out;
    });
    check('9 · Each level has its own description',
      new Set(Object.values(notes).map(n => n.note)).size === 3);
    check('9 · Pressing a level marks it as the current one',
      Object.values(notes).every(n => n.pressed === 'true'));
    check('9 · And the button says which of the two things it will do',
      notes.full.button !== notes.minimum.button,
      notes.minimum.button + ' | ' + notes.full.button);

    /* ---- bare minimum: one tap, and nothing on top of it ---- */
    const least = await page.evaluate(async () => {
      window.SSAssist.setEffort('minimum');
      document.getElementById('assistStart').click();
      await new Promise(r => setTimeout(r, 2500));
      return {
        audio: window.SSExplore.audioRunning(),
        session: window.SSAssist.session() !== null,
        sheet: Boolean(document.querySelector('.ss-assist')),
        dua: document.getElementById('duaVeil') ? !document.getElementById('duaVeil').hidden : false,
        timer: window.SSExplore.timerEndsAt() > 0
      };
    });
    check('9 · Bare minimum: the one tap starts the sound', least.audio === true);
    check('9 · Bare minimum: and the timer that fades it', least.timer === true);
    check('9 · Bare minimum: and the dua it already decided on', least.dua === true);
    check('9 · Bare minimum: with no panel put on top of it', least.sheet === false);

    /* Nothing was taken away: the controls are one tap from here, and
       all of them are there. */
    const reachable = await page.evaluate(async () => {
      window.SSAssistUI.open();
      await new Promise(r => setTimeout(r, 300));
      const s = document.querySelector('.ss-assist');
      if (!s) return { missing: true };
      return {
        sounds: s.querySelectorAll('[data-assist-sound]').length,
        layers: window.SSExplore.LAYERS.length,
        timers: s.querySelectorAll('[data-assist-timer]').length,
        offered: window.SSAssist.TIMERS.length,
        transport: [...s.querySelectorAll('[data-transport] button')].map(b => b.textContent.trim())
      };
    });
    check('9 · Bare minimum takes nothing away: every sound is still there',
      reachable.sounds === reachable.layers,
      reachable.sounds + ' of ' + reachable.layers);
    check('9 · Every length too', reachable.timers === reachable.offered,
      reachable.timers + ' of ' + reachable.offered);
    check('9 · And hold and stop are where they always are',
      reachable.transport && reachable.transport.join(' / ') === 'Hold / Stop',
      (reachable.transport || []).join(' / '));

    await page.evaluate(() => { window.SSAssist.stop(); window.SSAssistUI.close(); });
    await page.waitForTimeout(500);
    await ctx.close();
  }

  /* ================================================================
     10. Full routine asks first, and starts nothing until told.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);

    const asked = await page.evaluate(async () => {
      window.SSAssist.setEffort('full');
      document.getElementById('assistStart').click();
      await new Promise(r => setTimeout(r, 600));
      const s = document.querySelector('.ss-assist');
      return {
        sheet: Boolean(s),
        mode: window.SSAssistUI.mode(),
        audio: window.SSExplore.audioRunning(),
        session: window.SSAssist.session(),
        transport: s ? [...s.querySelectorAll('[data-transport] button')].map(b => b.textContent.trim()) : [],
        pressedSound: s ? [...s.querySelectorAll('[data-assist-sound]')]
          .filter(b => b.getAttribute('aria-pressed') === 'true').length : 0,
        pressedTimer: s ? [...s.querySelectorAll('[data-assist-timer]')]
          .filter(b => b.getAttribute('aria-pressed') === 'true').length : 0
      };
    });
    check('10 · Full routine: the tap opens the controls', asked.sheet === true);
    check('10 · And starts nothing until it is told to',
      asked.audio === false && asked.session === null);
    check('10 · Offering the forward move and a way out',
      asked.transport.join(' / ') === 'Begin / Not now', asked.transport.join(' / '));
    check('10 · With the current sound and length already marked',
      asked.pressedSound === 1 && asked.pressedTimer === 1,
      asked.pressedSound + ' / ' + asked.pressedTimer);

    /* Changing a choice before starting changes what starts. */
    const chosen = await page.evaluate(async () => {
      const other = window.SSExplore.LAYERS.map(l => l.id)
        .find(id => id !== window.SSAssist.prefs().sound);
      document.querySelector('[data-assist-sound="' + other + '"]').click();
      document.querySelector('[data-assist-timer="30"]').click();
      await new Promise(r => setTimeout(r, 400));
      return { wanted: other, prefs: window.SSAssist.prefs(),
               audio: window.SSExplore.audioRunning() };
    });
    check('10 · A choice made here is remembered',
      chosen.prefs.sound === chosen.wanted && chosen.prefs.timer === 30,
      chosen.prefs.sound + ' / ' + chosen.prefs.timer);
    check('10 · And still nothing is playing', chosen.audio === false);

    const begun = await page.evaluate(async () => {
      [...document.querySelectorAll('.ss-assist [data-transport] button')]
        .find(b => /begin/i.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 2600));
      const s = document.querySelector('.ss-assist');
      return {
        audio: window.SSExplore.audioRunning(),
        session: window.SSAssist.session(),
        mode: window.SSAssistUI.mode(),
        transport: s ? [...s.querySelectorAll('[data-transport] button')].map(b => b.textContent.trim()) : []
      };
    });
    check('10 · Begin starts it, from inside the sheet', begun.audio === true);
    check('10 · On the sound that was chosen',
      begun.session && begun.session.sound === chosen.wanted,
      begun.session ? begun.session.sound : 'no session');
    check('10 · For the length that was chosen',
      begun.session && begun.session.timer === 30,
      begun.session ? String(begun.session.timer) : '—');
    check('10 · And the same sheet becomes the running one',
      begun.mode === 'live' && begun.transport.join(' / ') === 'Hold / Stop',
      begun.transport.join(' / '));

    /* The level is a preference like any other and survives a reload. */
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2300);
    const kept = await page.evaluate(() => ({
      level: window.SSAssist.effort(),
      pressed: [...document.querySelectorAll('[data-assist-effort]')]
        .filter(b => b.getAttribute('aria-pressed') === 'true')
        .map(b => b.dataset.assistEffort).join(','),
      label: document.getElementById('assistStart').textContent.trim(),
      rejected: window.SSAssist.setEffort('whatever'),
      afterReject: window.SSAssist.effort()
    }));
    check('10 · The level survives a reload', kept.level === 'full', kept.level);
    check('10 · And the chooser shows it', kept.pressed === 'full', kept.pressed);
    check('10 · As does the button', /set up/i.test(kept.label), kept.label);
    check('10 · A level that is not one of the three is refused',
      kept.rejected === false && kept.afterReject === 'full');
    await ctx.close();
  }

  /* ================================================================
     11. The level reaches the morning too.

        Full routine offers the app's own morning record beside the one
        question. They are two different records — the question is how
        someone felt, the record is times and minutes — and answering
        one never fills in the other.
     ================================================================ */
  {
    const { ctx, page } = await open(browser);
    const morning = await page.evaluate(async (level) => {
      const out = {};
      for (const l of ['minimum', 'full']) {
        window.SSAssist.setEffort(l);
        const s = window.SS.state.settings;
        s.assist = { ...(s.assist || {}),
                     lastStartedAt: new Date(Date.now() - 9 * 3600000).toISOString() };
        window.SS.save();
        const old = document.getElementById('assistMorning');
        if (old) old.remove();
        window.SSAssistUI.mountMorning();
        await new Promise(r => setTimeout(r, 250));
        const card = document.getElementById('assistMorning');
        out[l] = {
          card: Boolean(card),
          answers: card ? card.querySelectorAll('.ss-assist-chip').length : 0,
          record: card ? Boolean(card.querySelector('.ss-assist-morning-more')) : false,
          skip: card ? Boolean([...card.querySelectorAll('button')]
            .find(b => b.textContent.trim() === 'Skip')) : false
        };
      }
      return out;
    });
    check('11 · Both levels ask the one question',
      morning.minimum.card && morning.full.card &&
      morning.minimum.answers === 3 && morning.full.answers === 3);
    check('11 · Both can be skipped', morning.minimum.skip && morning.full.skip);
    check('11 · Full routine also offers the full morning record',
      morning.full.record === true);
    check('11 · Bare minimum does not put that in front of anyone',
      morning.minimum.record === false);

    const separate = await page.evaluate(async () => {
      const before = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}');
      [...document.querySelectorAll('#assistMorning .ss-assist-chip')]
        .find(b => /tired/i.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 500));
      const after = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}');
      return {
        checkIns: ((after.settings.assist || {}).checkIns || []).length,
        morningsBefore: (before.mornings || []).length,
        morningsAfter: (after.mornings || []).length
      };
    });
    check('11 · The question is recorded as a question', separate.checkIns === 1,
      String(separate.checkIns));
    check('11 · And no morning record is written from it',
      separate.morningsAfter === separate.morningsBefore,
      separate.morningsBefore + ' → ' + separate.morningsAfter);
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
