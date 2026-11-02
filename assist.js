/**
 * SleepSphere Assist — the one-tap wind-down.
 *
 * This is an orchestrator, not a feature. Everything it does already
 * existed and was reachable only by someone who knew where to look: the
 * soundscapes are in explore.js, the sleep timer is in explore.js, the
 * dua is in index.html, the night is in index.html. What was missing was
 * a single tap that does all of it in the right order and remembers how
 * you like it.
 *
 * So there is no audio engine in here, no timer, no storage of its own.
 * It calls SSExplore and SS, and it keeps its preferences in
 * state.settings.assist through SS.save, which is the same store, the
 * same schema shape and the same save path as everything else. A second
 * audio engine beside the first is how an app ends up playing two rain
 * loops at once.
 *
 * What it will not do:
 *
 *   · Start audio outside a user gesture. iOS will not allow it and
 *     pretending otherwise produces a button that silently does nothing.
 *   · Record a minute of sleep. It writes when a wind-down began and
 *     what was playing. Whether anyone slept is the morning's business,
 *     and it is asked, not inferred.
 *   · Claim a step worked when it did not. Each step reports, and a
 *     failure is said out loud rather than swallowed to keep the
 *     sequence looking tidy.
 */
(function () {
  'use strict';

  const TIMERS = [15, 20, 30];
  const DEFAULTS = { sound: 'rain', timer: 20, dua: true };

  /* The app's own store. Assist never opens localStorage itself: it
     reads and writes the one state object, through the one save path,
     so the storage guard, the schema version and the erase button all
     keep applying to it without knowing it exists. */
  function app() { return window.SS || null; }
  function settings() {
    const a = app();
    if (!a || !a.state || !a.state.settings) return null;
    return a.state.settings;
  }

  function prefs() {
    const s = settings();
    const saved = (s && s.assist) || {};
    const sound = typeof saved.sound === 'string' ? saved.sound : DEFAULTS.sound;
    const timer = TIMERS.indexOf(Number(saved.timer)) > -1 ? Number(saved.timer) : DEFAULTS.timer;
    return {
      sound: knownSound(sound) ? sound : DEFAULTS.sound,
      timer,
      dua: saved.dua !== false,
      lastStartedAt: saved.lastStartedAt || ''
    };
  }

  function knownSound(id) {
    const E = window.SSExplore;
    if (!E || !E.LAYERS) return true;   /* Can't check yet; don't reject. */
    return E.LAYERS.some(l => l.id === id);
  }

  /* Returns false when the write did not reach the disk, so the caller
     can say so rather than assuming. */
  function remember(patch) {
    const a = app(), s = settings();
    if (!a || !s) return false;
    s.assist = { ...DEFAULTS, ...(s.assist || {}), ...patch };
    try { return a.save() !== false; } catch (e) { return false; }
  }

  /* ==================================================================
     THE SESSION. One at a time, and it knows what it actually managed.
     ================================================================== */
  let session = null;

  function live() {
    return session ? {
      sound: session.sound,
      timer: session.timer,
      paused: session.paused,
      startedAt: session.startedAt,
      audio: Boolean(window.SSExplore && window.SSExplore.audioRunning()),
      endsAt: window.SSExplore && window.SSExplore.timerEndsAt ? window.SSExplore.timerEndsAt() : 0
    } : null;
  }

  /* Must be called from inside a real tap. The sound starts first and
     everything else follows, because the gesture is spent on the first
     await and only audio needs it. */
  async function start(options) {
    const E = window.SSExplore;
    if (!E) throw new Error('Sounds are not loaded on this page');
    const want = { ...prefs(), ...(options || {}) };
    const done = { sound: false, timer: false, dua: false, saved: false };

    if (session) stop({ keepPrefs: true });

    /* 1 — audio, inside the gesture. If this throws, the message is the
       browser's own reason and is worth showing. */
    await E.startSoundOrThrow(want.sound, 0.6);
    done.sound = true;

    /* 2 — the timer that will fade it out again. */
    if (E.setSleepTimer) { E.setSleepTimer(want.timer); done.timer = true; }

    session = {
      sound: want.sound, timer: want.timer,
      startedAt: new Date().toISOString(), paused: false
    };

    /* 3 — what was chosen, and when. Not how anyone slept. */
    done.saved = remember({
      sound: want.sound, timer: want.timer, dua: want.dua,
      lastStartedAt: session.startedAt
    });

    /* 4 — the verified dua, if they keep it on. Opened after the sound
       so a dua that fails to open never costs them the audio. */
    if (want.dua && typeof window.SSOpenDua === 'function') {
      try { window.SSOpenDua(); done.dua = true; } catch (e) { done.dua = false; }
    }

    done.level = plan().level;
    notify();
    return done;
  }

  function pause() {
    const E = window.SSExplore;
    if (!session || !E || !E.pause) return false;
    E.pause();
    session.paused = true;
    notify();
    return true;
  }

  function resume() {
    const E = window.SSExplore;
    if (!session || !E || !E.resume) return false;
    E.resume();
    session.paused = false;
    notify();
    return true;
  }

  function setTimer(minutes) {
    const E = window.SSExplore;
    const m = Number(minutes);
    if (TIMERS.indexOf(m) < 0) return false;
    if (E && E.setSleepTimer) E.setSleepTimer(m);
    if (session) session.timer = m;
    remember({ timer: m });
    notify();
    return true;
  }

  async function setSound(id) {
    const E = window.SSExplore;
    if (!E || !knownSound(id)) return false;
    if (session) {
      E.stopSound(session.sound);
      await E.startSoundOrThrow(id, 0.6);
      session.sound = id;
      session.paused = false;
    }
    remember({ sound: id });
    notify();
    return true;
  }

  function stop(opts) {
    const E = window.SSExplore;
    if (E) {
      /* Cancels the fade as well as the sound: a timer that keeps
         running after Stop is the bug this clears explicitly. */
      if (E.setSleepTimer) E.setSleepTimer(0);
      if (E.stopEverySound) E.stopEverySound();
      if (E.resume) E.resume();   /* leave the context usable, not suspended */
    }
    session = null;
    if (!opts || !opts.keepPrefs) notify();
    return true;
  }

  /* ==================================================================
     Listeners, so an interface can follow the session without polling.
     ================================================================== */
  const watchers = new Set();
  function onChange(fn) { watchers.add(fn); return () => watchers.delete(fn); }
  function notify() {
    const snapshot = live();
    watchers.forEach(fn => { try { fn(snapshot); } catch (e) {} });
  }

  /* The sleep timer ends by fading the sound out in explore.js. Assist
     has to notice, or its panel would still say a wind-down is running
     over silence. Polled rather than evented because the fade belongs to
     the audio module and should not have to know Assist exists. */
  setInterval(() => {
    if (!session || session.paused) return;
    const E = window.SSExplore;
    if (E && E.audioRunning && !E.audioRunning() && !E.timerEndsAt()) {
      session = null;
      notify();
    }
  }, 4000);

  /* ==================================================================
     THE MORNING HALF.

     A wind-down is only half a loop. The other half is one question,
     asked once, with three answers and a way out — and the answer is
     kept as what it is: how someone said they felt. It is never turned
     into minutes, a score, or a night.

     It is deliberately not written as a morning record. The app already
     has one of those and it carries bed time, wake time, onset and
     awake minutes; a one-tap answer has none of them, and inventing
     them to fit the shape would be fabricating sleep data to make a
     check-in look thorough. This goes where it belongs: the
     participant's own settings, privately, alongside the preference
     that produced it.
     ================================================================== */
  const ANSWERS = ['tired', 'between', 'refreshed'];

  function checkIns() {
    const s = settings();
    const list = (s && s.assist && s.assist.checkIns) || [];
    return Array.isArray(list) ? list : [];
  }

  /* Returns false when the write did not reach the disk — the caller
     says so rather than thanking someone for an answer that was lost. */
  function recordMorning(answer) {
    if (ANSWERS.indexOf(answer) < 0) return false;
    const entry = { at: new Date().toISOString(), answer };
    /* Thirty is about a month, which is as far back as anything in here
       looks. An unbounded list in a single settings object is how a
       save gets slow enough to notice. */
    const kept = checkIns().concat([entry]).slice(-30);
    return remember({ checkIns: kept, lastStartedAt: '' });
  }

  /* Dismissing is an answer about the question, not about the night, so
     it clears the prompt and records nothing at all. */
  function skipMorning() { return remember({ lastStartedAt: '' }); }

  /* ==================================================================
     EFFORT.

     Three settings, and the difference between them has to be real.
     "Bare minimum should genuinely reduce effort. It must not simply
     show a shorter checklist."

     So effort does not hide steps — it removes them by deciding them.
     On bare minimum the wind-down does not ask which sound or how long
     because the answer is already known, the dua opens with it, and
     the morning asks one question instead of offering a form. On full
     routine the same tap opens everything and chooses nothing.

     What it never does is take anything away. Every control remains
     reachable at every level; what changes is how many of them a
     person has to touch to get to sleep.
     ================================================================== */
  const EFFORT = ['minimum', 'some', 'full'];
  const EFFORT_WORDS = {
    minimum: 'Bare minimum',
    some: 'A little effort',
    full: 'Full routine'
  };

  function effort() {
    const s = settings();
    const saved = s && s.assist && s.assist.effort;
    return EFFORT.indexOf(saved) > -1 ? saved : 'some';
  }

  /* Whether the wind-down opens the duʿāʾ. Sabat is where it is set;
     this is where it is kept, beside the sound and the length, because
     it is the third thing the one tap does. */
  function setDua(on) { return remember({ dua: on !== false }); }

  function setEffort(level) {
    if (EFFORT.indexOf(level) < 0) return false;
    return remember({ effort: level });
  }

  /* What a tap should do at this level. The wind-down reads this
     instead of branching on the level itself, so adding a level later
     is one entry here rather than a search for every if. */
  function plan() {
    const level = effort();
    return {
      level,
      label: EFFORT_WORDS[level],
      /* Bare minimum never stops to ask; full routine always offers. */
      askBeforeStarting: level === 'full',
      /* The controls are present at every level. On bare minimum they
         are not opened over the dua unasked. */
      openControls: level !== 'minimum',
      openDua: prefs().dua,
      /* One question in the morning, or the full form offered beside
         it. Neither is a shorter version of the other: the form was
         always there and stays there. */
      morningQuestionOnly: level !== 'full',
      /* My Rhythm is a day to read at every level. Only above bare
         minimum does it also offer something to tick. */
      rhythmTicks: level !== 'minimum'
    };
  }

  window.SSAssist = {
    TIMERS,
    prefs, setTimer, setSound,
    start, pause, resume, stop,
    session: live,
    onChange,
    ANSWERS, checkIns, recordMorning, skipMorning,
    EFFORT, EFFORT_WORDS, effort, setEffort, plan, setDua,
    /* The morning half of the loop: what to ask about, when a wind-down
       actually happened. Never a figure — the question is asked. */
    morningPrompt() {
      const p = prefs();
      if (!p.lastStartedAt) return null;
      const started = new Date(p.lastStartedAt);
      if (isNaN(started)) return null;
      const hours = (Date.now() - started.getTime()) / 3600000;
      if (hours < 3 || hours > 20) return null;
      return { startedAt: p.lastStartedAt, sound: p.sound, timer: p.timer };
    }
  };
})();
