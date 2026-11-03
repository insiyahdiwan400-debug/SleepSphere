/**
 * SleepSphere Assist — the sheet you actually touch.
 *
 * Deliberately small. One button starts the wind-down; a sheet then
 * shows what is running and gives back the four controls a person
 * reaches for in the dark: hold it, change the sound, change how long,
 * stop. Nothing on it is decorative, and nothing on it reports a state
 * Assist did not confirm.
 *
 * Every label is read from the live session rather than from what was
 * asked for, so a sound that failed to start cannot leave the sheet
 * claiming it is playing.
 */
(function () {
  'use strict';

  const A = () => window.SSAssist;
  const E = () => window.SSExplore;
  let sheet = null, unwatch = null;
  /* 'live' follows a running wind-down. 'choose' is the same sheet
     shown before one starts, which is what full routine asks for. */
  let mode = 'live';

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const btn = (label, cls, onClick) => {
    const b = el('button', cls, label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };

  function say(message) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(say.handle);
    say.handle = setTimeout(() => t.classList.remove('show'), 3400);
  }

  function soundName(id) {
    const layers = (E() && E().LAYERS) || [];
    const found = layers.find(l => l.id === id);
    return found ? found.label : id;
  }

  /* ================================================================
     The sheet.
     ================================================================ */
  function open(opts) {
    if (opts && opts.choose) mode = 'choose';
    if (sheet) { render(A().session()); return sheet; }
    sheet = el('div', 'ss-assist');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Wind-down');
    sheet.innerHTML =
      '<div class="ss-assist-card">' +
        '<p class="ss-assist-eyebrow" data-eyebrow>Wind-down</p>' +
        '<p class="ss-assist-now" data-now></p>' +
        '<div class="ss-assist-row" data-transport></div>' +
        '<p class="ss-assist-label" id="ssAssistSoundLabel">Sound</p>' +
        '<div class="ss-assist-row ss-assist-wrap" data-sounds role="group" aria-labelledby="ssAssistSoundLabel"></div>' +
        '<p class="ss-assist-label" id="ssAssistTimerLabel">Fade out after</p>' +
        '<div class="ss-assist-row" data-timers role="group" aria-labelledby="ssAssistTimerLabel"></div>' +
      '</div>';
    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('on'));

    /* Sounds. Only the ones the audio engine actually has. */
    const sounds = sheet.querySelector('[data-sounds]');
    ((E() && E().LAYERS) || []).forEach(layer => {
      const b = btn(layer.label, 'ss-assist-chip', async () => {
        b.disabled = true;
        try {
          const ok = await A().setSound(layer.id);
          if (!ok) say('That sound is not available.');
        } catch (err) {
          say(err && err.message ? err.message : 'That sound could not start.');
        } finally { b.disabled = false; }
      });
      /* Namespaced. explore.js already puts data-sound on the hub's
         own sound cards, so a bare data-sound here made the two
         indistinguishable to any query over the document — which is
         exactly how a click meant for this sheet reached a hub card
         and started a second sound on top of the first. */
      b.dataset.assistSound = layer.id;
      sounds.appendChild(b);
    });

    /* Timers. */
    const timers = sheet.querySelector('[data-timers]');
    A().TIMERS.forEach(min => {
      const b = btn(min + ' min', 'ss-assist-chip', () => {
        if (!A().setTimer(min)) say('That length is not available.');
      });
      b.dataset.assistTimer = String(min);
      timers.appendChild(b);
    });

    unwatch = A().onChange(render);
    render(A().session());
    return sheet;
  }

  function close() {
    mode = 'live';
    if (unwatch) { unwatch(); unwatch = null; }
    if (sheet) { sheet.classList.remove('on'); const s = sheet; setTimeout(() => s.remove(), 240); }
    sheet = null;
  }

  function render(s) {
    if (!sheet) return;
    if (!s) { if (mode === 'choose') renderChoosing(); else close(); return; }

    /* What is true, not what was asked for. */
    sheet.querySelector('[data-eyebrow]').textContent = 'Wind-down';
    const now = sheet.querySelector('[data-now]');
    now.textContent = s.paused
      ? soundName(s.sound) + ' — held'
      : s.audio
        ? soundName(s.sound) + ' playing'
        : soundName(s.sound) + ' — no sound coming out';

    const transport = sheet.querySelector('[data-transport]');
    transport.innerHTML = '';
    transport.appendChild(btn(s.paused ? 'Resume' : 'Hold', 'ss-assist-btn', () => {
      if (s.paused) { if (!A().resume()) say('Could not resume.'); }
      else if (!A().pause()) say('Could not hold the sound.');
    }));
    transport.appendChild(btn('Stop', 'ss-assist-btn ss-assist-stop', () => {
      A().stop();
      say('Stopped. Nothing is playing.');
    }));

    sheet.querySelectorAll('[data-assist-sound]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.assistSound === s.sound)));
    sheet.querySelectorAll('[data-assist-timer]').forEach(b =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.assistTimer) === s.timer)));
  }

  /* The sheet before the wind-down. Same controls, same chips, same
     labels — it is not a second screen, it is this one shown earlier.
     Pressing Begin is still a real tap, which is what the audio
     context needs. */
  function renderChoosing() {
    const p = A().prefs();
    /* Said as a plan, not as a state. The same card a moment later will
       say what is actually playing, and the two must not read alike. */
    sheet.querySelector('[data-eyebrow]').textContent = 'Set up tonight';
    sheet.querySelector('[data-now]').textContent =
      soundName(p.sound) + ', fading out after ' + p.timer + ' minutes.';

    const transport = sheet.querySelector('[data-transport]');
    transport.innerHTML = '';
    const begin = btn('Begin', 'ss-assist-btn ss-assist-begin', () => runStart(begin));
    transport.appendChild(begin);
    transport.appendChild(btn('Not now', 'ss-assist-btn', close));

    sheet.querySelectorAll('[data-assist-sound]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.assistSound === p.sound)));
    sheet.querySelectorAll('[data-assist-timer]').forEach(b =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.assistTimer) === p.timer)));
  }

  /* One start, wherever the tap came from: the night console's button
     or Begin inside the sheet. Both are inside a gesture. */
  async function runStart(button) {
    if (!A() || !E()) { say('Sounds are still loading — try again in a moment.'); return false; }
    const was = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Starting…'; }
    try {
      /* Awaited inside the tap: on iOS the context has to be resumed
         from the gesture, and the result tells us what really ran. */
      const done = await A().start();
      mode = 'live';
      /* Bare minimum does not put a panel over the dua. The controls
         are still one tap away from the night console; they are just
         not pushed at someone who asked for less. */
      if (sheet) render(A().session());
      else if (A().plan().openControls) open();
      const p = A().prefs();
      say(done.timer
        ? soundName(p.sound) + ' playing. Fading out in ' + p.timer + ' minutes.'
        : soundName(p.sound) + ' playing.');
      if (!done.saved) say('Playing, but this device is not saving preferences.');
      return true;
    } catch (err) {
      say(err && err.message ? err.message : 'The wind-down could not start.');
      return false;
    } finally {
      if (button) { button.disabled = false; button.textContent = was; }
    }
  }

  /* ================================================================
     The one button.
     ================================================================ */
  function wire() {
    const start = document.getElementById('assistStart');
    if (!start || start.dataset.wired) return;
    start.dataset.wired = 'yes';
    start.addEventListener('click', () => {
      /* Full routine opens the controls first and chooses nothing.
         The other two levels have already chosen, so the tap is the
         whole interaction. */
      if (A() && A().plan().askBeforeStarting) { open({ choose: true }); return; }
      runStart(start);
    });
    mountEffort(start);
  }

  /* ================================================================
     EASY MODE.

     Three levels, chosen here, in one place, next to the button they
     change. The difference between them is said in a line before it is
     committed to, because a setting whose effect you only discover by
     using it is not really a choice.

     None of the three hides a control. Bare minimum removes steps by
     having already decided them; full routine puts the same decisions
     back in front of you. Everything in the sheet is reachable at every
     level.
     ================================================================ */
  const EFFORT_NOTE = {
    minimum: 'One tap, and that is the whole of it. The sound, the ' +
             'length and the dua are already decided, and nothing opens ' +
             'on top of them.',
    some: 'One tap, then the controls stay open in case you want a ' +
          'different sound or a different length.',
    full: 'The controls open first so you choose the sound and the ' +
          'length, and the morning offers the full record as well.'
  };

  function mountEffort(start) {
    if (!A() || document.getElementById('assistEffort')) return;
    const host = start.closest('.console-actions') || start.parentNode;
    if (!host) return;

    const box = el('div', 'ss-assist-effort');
    box.id = 'assistEffort';
    const label = el('p', 'ss-assist-label', 'How much effort tonight');
    label.id = 'ssAssistEffortLabel';
    box.appendChild(label);

    const row = el('div', 'ss-assist-row ss-assist-wrap');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-labelledby', 'ssAssistEffortLabel');
    const note = el('p', 'ss-assist-effort-note');

    A().EFFORT.forEach(level => {
      const b = btn(A().EFFORT_WORDS[level], 'ss-assist-chip', () => {
        /* Two different failures used to share one message and one early
           return: a level that does not exist, and a level that applied
           fine but could not be written to disk. In the second case the
           chooser was left showing the old level while the app had
           already changed to the new one, and said "not available" about
           something that was. They are separate now, and the chooser
           repaints either way because the level really has changed. */
        if (A().EFFORT.indexOf(level) < 0) { say('That level is not available.'); return; }
        const saved = A().setEffort(level);
        paint();
        if (!saved) say('Set for tonight \u2014 this device is not saving preferences.');
        /* Changing the level while the sheet is open should not leave
           a panel standing that this level would not have opened. */
        if (sheet && !A().session() && mode === 'choose' && !A().plan().askBeforeStarting) close();
      });
      b.dataset.assistEffort = level;
      row.appendChild(b);
    });
    box.appendChild(row);
    box.appendChild(note);

    function paint() {
      const level = A().effort();
      row.querySelectorAll('[data-assist-effort]').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.assistEffort === level)));
      note.textContent = EFFORT_NOTE[level] || '';
      start.textContent = level === 'full' ? 'Set up my wind-down' : 'Start my wind-down';
    }
    paint();

    if (host.insertAdjacentElement) host.insertAdjacentElement('afterend', box);
    else host.appendChild(box);
  }

  /* ================================================================
     THE MORNING CARD.

     One question, three answers, and a way out. It appears only when
     there was a wind-down to ask about, it goes for good once it is
     answered or dismissed, and someone returning after four days meets
     no backlog of unanswered mornings — there is only ever the most
     recent one, and only for a day.
     ================================================================ */
  const ANSWER_WORDS = [
    ['tired', 'Still tired'],
    ['between', 'In between'],
    ['refreshed', 'Refreshed']
  ];

  function mountMorning() {
    const assist = A();
    if (!assist || document.getElementById('assistMorning')) return;
    const prompt = assist.morningPrompt();
    if (!prompt) return;
    const host = document.getElementById('today');
    if (!host) return;

    const card = el('section', 'card ss-assist-morning');
    card.id = 'assistMorning';
    card.appendChild(el('p', 'ss-assist-eyebrow', 'This morning'));
    const question = el('h3', null, 'How restored do you feel?');
    question.id = 'assistMorningQ';
    card.appendChild(question);
    card.appendChild(el('p', 'ss-assist-morning-note',
      'One tap, kept to yourself. It is how you felt, not a measurement ' +
      'of how you slept — the app has no way to know that and does not guess.'));

    const row = el('div', 'ss-assist-row ss-assist-wrap');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-labelledby', 'assistMorningQ');
    ANSWER_WORDS.forEach(pair => {
      row.appendChild(btn(pair[1], 'ss-assist-chip', () => {
        const saved = assist.recordMorning(pair[0]);
        card.remove();
        say(saved ? 'Noted. Nothing else to do.'
                  : 'Noted for now — this device is not saving to disk.');
      }));
    });
    card.appendChild(row);

    /* Skipping is an answer about the question, not about the night: it
       clears the prompt and records nothing at all. */
    const foot = el('div', 'ss-assist-morning-foot');
    foot.appendChild(btn('Skip', 'ss-assist-skip', () => {
      assist.skipMorning();
      card.remove();
    }));

    /* Full routine also offers the morning record the app already has.
       It is a separate record with separate fields, and answering one
       never fills in the other. */
    if (!assist.plan().morningQuestionOnly && typeof window.SSOpenMorningFlow === 'function') {
      foot.appendChild(btn('Record the full morning', 'ss-assist-skip ss-assist-morning-more',
        () => window.SSOpenMorningFlow()));
    }
    card.appendChild(foot);

    host.insertBefore(card, host.firstChild);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountMorning);
  else mountMorning();

  window.SSAssistUI = { open, close, sheet: () => sheet, mountMorning, mode: () => mode };
})();
