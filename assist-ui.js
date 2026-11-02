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
  function open() {
    if (sheet) return sheet;
    sheet = el('div', 'ss-assist');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Wind-down');
    sheet.innerHTML =
      '<div class="ss-assist-card">' +
        '<p class="ss-assist-eyebrow">Wind-down</p>' +
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
    if (unwatch) { unwatch(); unwatch = null; }
    if (sheet) { sheet.classList.remove('on'); const s = sheet; setTimeout(() => s.remove(), 240); }
    sheet = null;
  }

  function render(s) {
    if (!sheet) return;
    if (!s) { close(); return; }

    /* What is true, not what was asked for. */
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

  /* ================================================================
     The one button.
     ================================================================ */
  function wire() {
    const start = document.getElementById('assistStart');
    if (!start || start.dataset.wired) return;
    start.dataset.wired = 'yes';
    start.addEventListener('click', async () => {
      if (!A() || !E()) { say('Sounds are still loading — try again in a moment.'); return; }
      start.disabled = true;
      const was = start.textContent;
      start.textContent = 'Starting…';
      try {
        /* Awaited inside the tap: on iOS the context has to be resumed
           from the gesture, and the result tells us what really ran. */
        const done = await A().start();
        open();
        const p = A().prefs();
        say(done.timer
          ? soundName(p.sound) + ' playing. Fading out in ' + p.timer + ' minutes.'
          : soundName(p.sound) + ' playing.');
        if (!done.saved) say('Playing, but this device is not saving preferences.');
      } catch (err) {
        say(err && err.message ? err.message : 'The wind-down could not start.');
      } finally {
        start.disabled = false;
        start.textContent = was;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  window.SSAssistUI = { open, close, sheet: () => sheet };
})();
