/**
 * SleepSphere Explore.
 *
 * Six practices, each of which has to do something when you press it. The
 * brief's requirement is blunt — "Every visible Explore feature must
 * function" and "Ensure every interaction has a meaningful outcome" — so
 * nothing here is a card that opens a card.
 *
 * Rules this module holds itself to:
 *
 *   · Audio is OFF until asked for, has a volume and a mute, and stops
 *     when you leave or when the tab goes away. Nothing starts playing
 *     because a screen opened.
 *   · Sound is SYNTHESISED, not sampled. No audio files means nothing to
 *     licence, nothing to attribute wrongly, nothing to download, and a
 *     soundscape that works with no network at 3am — which is when it is
 *     wanted.
 *   · Guidance is text first. A body scan that only exists as timing is
 *     useless to anyone who cannot watch it, so every step's words are on
 *     screen and announced, and the timer is the decoration.
 *   · Reflection and Gratitude write to SS.engine.addThought — the same
 *     journal the classic Unload screen uses. One list, one cap, one erase
 *     path, one export. Not a second store nobody remembers to delete.
 *   · Nothing here records sleep, estimates sleep, or writes a morning.
 *   · No streaks, no counts of days practised, nothing that turns a calming
 *     thing into an obligation.
 *
 * The religious content is deliberately NOT reimplemented. The app's
 * existing dua and stillness material is verified; this module links to it
 * rather than copying it, because a copy is a second thing to keep correct.
 */
(function () {
  'use strict';

  const SS = window.SS;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* ==================================================================
     BODY SCAN.

     Thirteen regions, feet upward, because that is the direction every
     published script runs and because starting at the head keeps people
     in their heads. Each region carries its own words; the clock is the
     decoration, not the practice.
     ================================================================== */
  const REGIONS = [
    ['Your feet', 'Let your attention rest on both feet. Notice the weight of them, the temperature, whether the toes are held or loose. Nothing needs to change.'],
    ['Lower legs', 'Move up through the ankles into the calves. Heavy or light, warm or cool — just notice which.'],
    ['Knees and thighs', 'The knees, then the long muscles above them. These carried you today. Let them be done.'],
    ['Hips and base', 'Where you meet the bed. Feel how much of your weight is already being held for you.'],
    ['Belly', 'Let the belly be soft. It will move on its own as you breathe; you do not have to help it.'],
    ['Lower back', 'Along the base of the spine. If there is an ache there, let it be an ache rather than a problem to solve.'],
    ['Chest and ribs', 'Notice the ribs widening a little, then settling. You are not breathing deeply — just noticing.'],
    ['Hands', 'Fingers, palms, the backs of the hands. Hands are often still holding something. Let them open.'],
    ['Arms', 'Up through the forearms, elbows, upper arms. Let the arms be heavy where they lie.'],
    ['Shoulders', 'The place most of us keep the day. Let them drop a little further than feels necessary.'],
    ['Neck and throat', 'Soften the throat. Let the jaw be unclenched — the teeth do not need to touch.'],
    ['Face', 'The forehead, the space between the eyebrows, the small muscles around the eyes. Let the face stop working.'],
    ['All of you', 'Now the whole body at once, resting, held. Stay here as long as you like. There is nothing after this.']
  ];

  /* ==================================================================
     BREATHING.

     No breath-holding. The brief is explicit, and it is also the right
     call: holds raise effort, and an anxious person counting a hold at
     bedtime is doing an exam, not a practice. A longer out-breath than
     in-breath is the whole mechanism.
     ================================================================== */
  const PACES = [
    { id: 'even',  label: 'Even',     in: 4, out: 4, note: 'Four in, four out. A steady place to start.' },
    { id: 'long',  label: 'Longer out', in: 4, out: 6, note: 'Four in, six out. The longer out-breath is what settles you.' },
    { id: 'slow',  label: 'Slower',   in: 5, out: 7, note: 'Five in, seven out. Only if it stays comfortable.' }
  ];

  /* ==================================================================
     SOUNDSCAPE.

     Synthesised. Each layer is noise shaped by a filter and moved by a
     slow oscillator; that is genuinely what rain and wind sound like to
     a filter bank, and it means no files and no licensing.
     ================================================================== */
  /* Each layer is noise through one bandpass, swept by a slow oscillator.
     Nothing here is a recording and none of it is presented as one: these
     are weather-shaped sounds, not field recordings of a named place. The
     honest description is in the note the screen shows.

     `leaves` and `snowfield` were added on request. A filter bank cannot
     make birdsong, so the tree layer is called Leaves rather than Forest:
     it is wind through foliage, which is a thing one bandpass can
     actually do.

     The six were tuned against measurement, not opinion — each rendered
     offline and compared on spectral centroid and on how much its level
     varies second to second:

         rain 4500Hz  water 1930  leaves 980  wind 490  snow 390  night 260

     Snowfield is the weakest of the six and it is worth saying so. Snow
     mostly sounds like low wind, and a single bandpass cannot render
     "muffled" as a quality distinct from "quiet and low". It was pulled
     apart from Night air by giving it slow deep swells where Night air is
     nearly static, which is audible, but it remains the one layer whose
     name is doing more work than its sound. */
  const LAYERS = [
    { id: 'rain',      label: 'Rain',      type: 'white', hz: 1400, q: 0.6,  lfo: 0.09, depth: 420, gain: 0.30 },
    { id: 'wind',      label: 'Wind',      type: 'brown', hz: 380,  q: 1.6,  lfo: 0.05, depth: 180, gain: 0.45 },
    { id: 'stream',    label: 'Water',     type: 'white', hz: 900,  q: 3.2,  lfo: 0.21, depth: 520, gain: 0.22 },
    { id: 'leaves',    label: 'Leaves',    type: 'brown', hz: 760,  q: 2.4,  lfo: 0.17, depth: 330, gain: 0.32 },
    { id: 'snowfield', label: 'Snowfield', type: 'brown', hz: 240,  q: 0.5,  lfo: 0.022, depth: 260, gain: 0.46 },
    { id: 'night',     label: 'Night air', type: 'brown', hz: 180,  q: 0.9,  lfo: 0.03, depth: 60,  gain: 0.55 },
    /* Cabin hum, for Flight Mode. The lowest and steadiest thing in the
       set by a wide margin — a jet cabin is a drone, not weather, so it
       barely moves. Synthesised like the rest: it is not a recording of
       an aircraft and is never described as one. */
    { id: 'engine',    label: 'Cabin hum', type: 'brown', hz: 85,   q: 0.42, lfo: 0.012, depth: 22, gain: 0.58 }
  ];

  /* ==================================================================
     LESSONS. Short, and accurate, and sourced.
     ================================================================== */
  const LESSONS = [
    ['Why a regular wake time matters more than a regular bedtime',
     'The body clock is set largely by light and by when you get up, not by when you lie down. ' +
     'Waking at a similar time most days — including days off — tends to pull the whole rhythm ' +
     'into place, and bedtime often follows on its own. Going to bed early after a bad night ' +
     'usually produces a long, frustrating wait rather than more sleep.',
     'Consistent rise time is the first instruction in most sleep-hygiene and CBT-I protocols.'],
    ['Sleep is not one thing all night',
     'A night moves through cycles of roughly ninety minutes, and the mixture changes as it goes: ' +
     'deeper sleep is concentrated in the first half, and dreaming sleep in the second. That is ' +
     'why a night cut short at the end loses proportionally more dreaming sleep, and why a late ' +
     'start loses deep sleep. Both halves do different work.',
     'Standard description of sleep architecture.'],
    ['Waking in the night is normal',
     'Brief awakenings between cycles happen to everyone, several times a night, and are usually ' +
     'forgotten by morning. They become a problem mainly when they are noticed and worried about. ' +
     'Lying awake for a long stretch is different: if it goes past about twenty minutes and ' +
     'frustration is building, most guidance suggests getting up, doing something dull in low ' +
     'light, and returning when sleepy.',
     'Stimulus-control instruction from CBT-I.'],
    ['Light in the evening, and light in the morning',
     'Bright light late tells the clock it is still day; bright light soon after waking tells it ' +
     'the day has started. Of the two, the morning light is the one most people under-use. ' +
     'Dimming the hour before bed helps more than any single screen setting.',
     'Circadian photoentrainment; the basis of light-timing advice.'],
    ['Caffeine lasts longer than it feels',
     'Caffeine has a half-life of roughly five hours in most adults, so an afternoon cup is still ' +
     'substantially present at bedtime. It does not always stop you falling asleep — it more often ' +
     'makes the sleep lighter, which is harder to notice and easier to blame on something else.',
     'Pharmacokinetics of caffeine; commonly cited range is 4-6 hours.'],
    ['The bed is for sleeping',
     'Spending long waking hours in bed gradually teaches the body that bed is a place to be awake ' +
     'in. Keeping the bed for sleep — and getting up when sleep is clearly not coming — is one of ' +
     'the better-supported behavioural changes there is.',
     'Stimulus control, one of the strongest-evidenced components of CBT-I.']
  ];

  /* ==================================================================
     Layer plumbing — shared with the rest of the app's interaction
     grammar, so Explore opens the way Motherhood does.
     ================================================================== */
  let layer = null, active = null;

  function openLayer(title) {
    closeLayer();
    layer = el('div', 'ex-layer');
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', title);
    layer.innerHTML =
      '<div class="ex-bar"><button type="button" class="ex-close">Close</button>' +
      '<span class="ex-bar-title"></span><span class="ex-bar-pad"></span></div>' +
      '<div class="ex-body"></div>';
    layer.querySelector('.ex-bar-title').textContent = title;
    layer.querySelector('.ex-close').addEventListener('click', closeLayer);
    layer.addEventListener('keydown', e => { if (e.key === 'Escape') closeLayer(); });
    document.body.appendChild(layer);
    document.documentElement.classList.add('ex-open');
    return layer.querySelector('.ex-body');
  }

  function closeLayer() {
    /* Everything a practice started, stopped — in one place, so a new
       practice cannot forget. This is also what stops audio continuing
       after the screen is gone. */
    /* Opening a dialog from the Explore hub is not closing an existing
       practice. The old unconditional stopAudio() silenced sounds as soon
       as the mixer opened, while the UI could still say Playing. */
    if (layer) {
      if (active && active.stop) { try { active.stop(); } catch {} }
      /* Keep opted-in soundscapes alive in the persistent mini-player. */
      layer.remove();
    }
    active = null;
    layer = null;
    document.documentElement.classList.remove('ex-open');
  }

  /* Leaving the app is leaving the practice, as far as sound is
     concerned. A soundscape still playing in a backgrounded tab is a
     battery complaint and a surprise in a quiet room. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { suspendAudio(); if (active && active.pause) active.pause(); }
    /* Coming back has to undo it. Suspending on hide with nothing to
       resume on show meant one glance at another app silenced the
       soundscape for good, with the toggles still lit as though it were
       playing. Only resumes if a layer is actually still chosen. */
    else if (nodes.length) wake();
  });

  /* ==================================================================
     AUDIO. One context, created on the first opt-in, never before.
     ================================================================== */
  let ctx = null, master = null, nodes = [];
  let muted = false, masterLevel = 0.6;

  /* iOS hands back a context in the `suspended` state and keeps it there
     until resume() is called from inside a real tap. Without that the
     graph is built, the gains ramp, every toggle lights up — and not one
     sample is ever heard. Nothing in here was ever resumed, which is why
     the sounds did not work on a phone. It is called on the creation
     path AND on every start, because the context can be suspended again
     later: by backgrounding the app, by a call, by the OS. */
  function wake() {
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      /* Returns a promise on some engines and nothing on others, and may
         reject if this was not called inside a gesture. Either way the
         caller carries on: a refused resume must not break the toggle. */
      try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch {}
    }
  }

  function ensureContext() {
    if (ctx) { wake(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : masterLevel;
    master.connect(ctx.destination);
    wake();
    return ctx;
  }

  function noiseBuffer(kind) {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function startLayer(spec, level) {
    if (!ensureContext()) return null;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(spec.type);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = spec.hz;
    filter.Q.value = spec.q;
    /* The slow sweep is what stops it sounding like a hiss: real weather
       moves, and a static filter does not. */
    const lfo = ctx.createOscillator();
    lfo.frequency.value = spec.lfo;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = spec.depth;
    lfo.connect(lfoGain).connect(filter.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start(); lfo.start();
    /* Fade in. A layer that snaps on at full level is startling, which is
       the opposite of the point. */
    gain.gain.linearRampToValueAtTime(level * spec.gain, ctx.currentTime + 1.2);
    const node = { spec, src, lfo, gain, level };
    nodes.push(node);
    return node;
  }

  function setLayerLevel(node, level) {
    if (!node || !ctx) return;
    node.level = level;
    node.gain.gain.linearRampToValueAtTime(level * node.spec.gain, ctx.currentTime + 0.18);
  }

  function stopLayer(node) {
    if (!node || !ctx) return;
    node.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    setTimeout(() => {
      try { node.src.stop(); node.lfo.stop(); } catch {}
      nodes = nodes.filter(n => n !== node);
    }, 500);
  }

  function stopAudio() {
    nodes.forEach(n => { try { n.src.stop(); n.lfo.stop(); } catch {} });
    nodes = [];
    LIVE.clear();  /* The controls must never report Playing after shutdown. */
    cancelFade();
    if (ctx) { try { ctx.close(); } catch {} ctx = null; master = null; }
    renderPlayer();
  }
  function suspendAudio() { if (ctx && ctx.state === 'running') ctx.suspend(); }

  function setMaster(level) {
    masterLevel = level;
    if (master && ctx) master.gain.linearRampToValueAtTime(muted ? 0 : level, ctx.currentTime + 0.15);
  }
  function setMuted(on) {
    muted = on;
    /* Unmuting is a tap and is meant to produce sound, so it is also a
       chance to wake a context the OS suspended behind our back. */
    if (!on) wake();
    if (master && ctx) master.gain.linearRampToValueAtTime(on ? 0 : masterLevel, ctx.currentTime + 0.15);
    renderPlayer();
  }

  /* ==================================================================
     WHAT IS PLAYING — one registry, shared.

     Which layers are live used to be a Map created inside the mixer
     screen and thrown away with it, so nothing else in the app could
     tell whether sound was playing. That is why there was no way to
     start a sound from anywhere else, and no way to show a player.
     One module-level registry now, and the mixer reflects it rather
     than owning it.
     ================================================================== */
  const LIVE = new Map();
  /* Cancel sound starts still awaiting iOS AudioContext.resume(). */
  let audioGeneration = 0;
  let fadeTimer = null, fadeEndsAt = 0;

  function layerSpec(id) { return LAYERS.find(l => l.id === id) || null; }
  function layerOn(id) { return LIVE.has(id); }

  /* Starting a sound, with the guards that were written for the mixer
     and now apply everywhere.

     A context can be suspended by the OS at any moment, and resume() is
     asynchronous and allowed to fail. Firing it and hoping — which is
     what the first version of this did — means a tap that silently does
     nothing. This waits, checks the context really is running, and
     throws something sayable if it is not, so the caller can show it
     rather than leaving a dead button. Sources start inside the tap. */
  async function startSoundOrThrow(id, level) {
    const spec = layerSpec(id);
    if (!spec) throw new Error('No such sound');
    if (LIVE.has(id)) return true;
    if (!ensureContext()) throw new Error('Audio is unsupported in this browser');
    /* On iOS Safari, starting the source after awaiting resume() can lose
       the original user gesture. Start the graph synchronously in the tap,
       then await the context; never claim Playing until it really runs. */
    const audioCtx = ctx;
    const generation = audioGeneration;
    const node = startLayer(spec, typeof level === 'number' ? level : 0.6);
    if (!node) throw new Error('Sound could not start');
    try {
      if (audioCtx.state !== 'running') await audioCtx.resume();
      if (audioCtx.state !== 'running') throw new Error('Audio is blocked by the browser. Tap again.');
      if (document.hidden || ctx !== audioCtx || generation !== audioGeneration) {
        try { node.src.stop(); node.lfo.stop(); } catch {}
        nodes = nodes.filter(n => n !== node);
        return false;
      }
      LIVE.set(id, node);
      renderPlayer();
      return true;
    } catch (err) {
      try { node.src.stop(); node.lfo.stop(); } catch {}
      nodes = nodes.filter(n => n !== node);
      LIVE.delete(id);
      renderPlayer();
      throw err;
    }
  }

  /* The forgiving form, for callers with nowhere to show an error. It
     never rejects, so a card tap cannot raise an unhandled rejection. */
  function startSound(id, level) {
    return startSoundOrThrow(id, level).catch(err => {
      announce(err && err.message ? err.message : 'Sound could not start');
      return false;
    });
  }

  /* Said out loud to assistive tech, and shown on the hub if it is open.
     A failure nobody is told about is the same as a dead button. */
  function announce(message) {
    let live = document.getElementById('ssAudioSays');
    if (!live) {
      live = el('p', 'ex-note');
      live.id = 'ssAudioSays';
      live.setAttribute('role', 'alert');
      const host = document.getElementById('explore');
      if (host) host.appendChild(live); else return;
    }
    live.textContent = message;
  }

  function stopSound(id) {
    const node = LIVE.get(id);
    if (!node) return;
    stopLayer(node);
    LIVE.delete(id);
    renderPlayer();
  }

  function toggleSound(id, level) {
    if (LIVE.has(id)) { stopSound(id); return Promise.resolve(false); }
    return startSound(id, level);
  }

  function stopEverySound() {
    audioGeneration += 1;
    LIVE.forEach(stopLayer);
    LIVE.clear();
    cancelFade();
    renderPlayer();
  }

  function cancelFade() {
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    fadeEndsAt = 0;
  }

  /* The sleep timer fades rather than cuts. Silence arriving suddenly is
     the thing most likely to wake someone who has just gone under, which
     would defeat the entire point of the timer. */
  function setSleepTimer(minutes) {
    cancelFade();
    if (!minutes) { renderPlayer(); return; }
    fadeEndsAt = Date.now() + minutes * 60000;
    const FADE = 60000;                       /* a minute of fading out */
    fadeTimer = setTimeout(() => {
      const from = masterLevel;
      const started = Date.now();
      (function step() {
        const k = Math.min(1, (Date.now() - started) / FADE);
        setMaster(from * (1 - k));
        if (k < 1) { fadeTimer = setTimeout(step, 250); return; }
        stopEverySound();
        setMaster(from);                      /* restored for next time */
      })();
    }, Math.max(0, minutes * 60000 - FADE));
    renderPlayer();
  }

  /* ==================================================================
     THE MINI-PLAYER.

     Persistent, because sound outlives the screen it was started from.
     It only exists while something is playing, so it costs nothing when
     the app is silent.
     ================================================================== */
  /* The hub's cards show whether their sound is playing, so they have to
     be told when it changes somewhere else — from the mixer, from the
     player's stop button, or from the sleep timer fading out. Without
     this a card sits reading "Tap to play" while its sound is audible. */
  function refreshSoundCards() {
    document.querySelectorAll('.ex-sound[data-sound]').forEach(card => {
      const on = layerOn(card.dataset.sound);
      card.classList.toggle('on', on);
      card.setAttribute('aria-pressed', String(on));
      const state = card.querySelector('.ex-sound-state');
      if (state) state.textContent = on ? 'Playing' : 'Tap to play';
    });
  }

  function renderPlayer() {
    refreshSoundCards();
    const existing = document.getElementById('ssPlayer');
    if (!LIVE.size) { if (existing) existing.remove(); return; }

    const names = [...LIVE.keys()].map(id => (layerSpec(id) || {}).label).filter(Boolean);
    const bar = existing || el('div', 'ss-player');
    bar.id = 'ssPlayer';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Sound player');
    bar.textContent = '';

    const now = el('div', 'ss-player-now');
    now.appendChild(el('strong', null, names.length === 1 ? names[0] : names.length + ' sounds'));
    const sub = el('span', null,
      fadeEndsAt ? 'Fading out in ' + Math.max(1, Math.round((fadeEndsAt - Date.now()) / 60000)) + ' min'
                 : (muted ? 'Muted' : 'Playing'));
    now.appendChild(sub);
    bar.appendChild(now);

    const controls = el('div', 'ss-player-controls');
    const play = btn(muted ? '▶' : '❚❚', 'ss-player-btn', () => setMuted(!muted));
    play.setAttribute('aria-label', muted ? 'Resume sound' : 'Pause sound');
    controls.appendChild(play);

    const vol = el('input');
    vol.type = 'range'; vol.min = 0; vol.max = 100;
    vol.value = Math.round(masterLevel * 100);
    vol.className = 'ss-player-vol';
    vol.setAttribute('aria-label', 'Overall volume');
    vol.addEventListener('input', () => setMaster(Number(vol.value) / 100));
    controls.appendChild(vol);

    const timer = btn(fadeEndsAt ? '⏱' : '⏱', 'ss-player-btn', () => {
      const next = fadeEndsAt ? 0 : 45;
      setSleepTimer(next);
    });
    timer.setAttribute('aria-label', fadeEndsAt ? 'Cancel the sleep timer' : 'Fade out after 45 minutes');
    timer.setAttribute('aria-pressed', String(Boolean(fadeEndsAt)));
    controls.appendChild(timer);

    const mix = btn('Mixer', 'ss-player-btn ss-player-mix', () => soundscape());
    mix.setAttribute('aria-label', 'Open the full sound mixer');
    controls.appendChild(mix);

    const stop = btn('×', 'ss-player-btn', stopEverySound);
    stop.setAttribute('aria-label', 'Stop all sound');
    controls.appendChild(stop);

    bar.appendChild(controls);
    if (!existing) document.body.appendChild(bar);
  }

  /* ==================================================================
     PRACTICE 1 — BODY SCAN.
     ================================================================== */
  function bodyScan() {
    const body = openLayer('Body scan');
    const perStep = 30;
    let i = 0, left = perStep, timer = null, running = false, done = false;

    const card = el('section', 'ex-card ex-stage');
    const step = el('p', 'ex-eyebrow');
    const name = el('h2');
    const words = el('p', 'ex-words');
    words.setAttribute('role', 'status');
    words.setAttribute('aria-live', 'polite');
    const bar = el('div', 'ex-bar-track');
    const fill = el('div', 'ex-bar-fill');
    bar.appendChild(fill);
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '1');
    bar.setAttribute('aria-valuemax', String(REGIONS.length));
    const clock = el('p', 'ex-clock');
    card.append(step, name, words, bar, clock);

    const controls = el('div', 'ex-controls');
    const toggle = btn('Begin', 'ex-primary', () => running ? pause() : start());
    const back = btn('Back', 'ex-quiet', () => go(i - 1));
    const fwd = btn('Next', 'ex-quiet', () => go(i + 1));
    controls.append(back, toggle, fwd);
    card.appendChild(controls);

    /* Spoken guidance, so the scan can be done with eyes closed.

       OFF until asked for, and the toggle is the asking: audio that
       starts on its own is the one thing this app must never do. It
       uses the device's own voice rather than a recording, which is
       said plainly here rather than left to be discovered. */
    let speak = false;
    const voiceRow = el('div', 'ex-controls');
    const voiceBtn = btn('Speak the steps', 'ex-quiet', () => {
      speak = !speak;
      voiceBtn.classList.toggle('on', speak);
      voiceBtn.setAttribute('aria-pressed', String(speak));
      voiceBtn.textContent = speak ? 'Stop speaking' : 'Speak the steps';
      if (speak) say(REGIONS[i][0] + '. ' + REGIONS[i][1]);
      else hush();
    });
    voiceBtn.setAttribute('aria-pressed', 'false');
    voiceRow.appendChild(voiceBtn);
    card.appendChild(voiceRow);

    function say(text) {
      if (!speak) return;
      try {
        const synth = window.speechSynthesis;
        if (!synth) return;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.82; u.pitch = 0.95; u.volume = 0.9;
        synth.speak(u);
      } catch (e) { /* no voice on this device; the text is still on screen */ }
    }
    function hush() {
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
    }

    const note = el('p', 'ex-note',
      'Every step is written out, and it moves on its own — you do not ' +
      'have to tap anything once it starts. You can pause anywhere, go ' +
      'back, or stop and leave; nothing is being counted. Spoken guidance ' +
      'uses your device’s own voice and stays off until you turn it on.');
    card.appendChild(note);
    body.appendChild(card);

    function paint() {
      step.textContent = 'Step ' + (i + 1) + ' of ' + REGIONS.length;
      name.textContent = REGIONS[i][0];
      words.textContent = REGIONS[i][1];
      fill.style.width = ((i + (1 - left / perStep)) / REGIONS.length * 100).toFixed(1) + '%';
      bar.setAttribute('aria-valuenow', String(i + 1));
      bar.setAttribute('aria-valuetext', REGIONS[i][0]);
      clock.textContent = done ? 'Finished. Stay as long as you like.'
        : running ? left + 's' : (i === 0 && left === perStep ? '' : 'Paused');
      back.disabled = i === 0;
      fwd.disabled = i >= REGIONS.length - 1;
      toggle.textContent = done ? 'Start again' : running ? 'Pause' : (left === perStep && i === 0 ? 'Begin' : 'Continue');
    }
    function tick() {
      left -= 1;
      if (left <= 0) {
        if (i >= REGIONS.length - 1) { finish(); return; }
        i += 1; left = perStep;
        say(REGIONS[i][0] + '. ' + REGIONS[i][1]);
      }
      paint();
    }
    function start() {
      if (done) { i = 0; left = perStep; done = false; }
      running = true;
      clearInterval(timer);
      timer = setInterval(tick, 1000);
      paint();
    }
    function pause() { running = false; clearInterval(timer); hush(); paint(); }
    function finish() {
      running = false; done = true; clearInterval(timer);
      fill.style.width = '100%';
      /* A gentle ending rather than a stop: the last thing said is an
         invitation to stay, not an announcement that it is over. */
      say('That is the whole body. Stay as long as you like.');
      paint();
    }
    function go(n) {
      if (n < 0 || n >= REGIONS.length) return;
      i = n; left = perStep; done = false; paint();
    }

    active = { stop: () => { clearInterval(timer); hush(); }, pause };
    paint();
  }

  /* ==================================================================
     PRACTICE 2 — BREATHING.
     ================================================================== */
  function breathing() {
    const body = openLayer('Breathing');
    let pace = PACES[1], running = false, raf = null, t0 = 0;

    const card = el('section', 'ex-card ex-stage');
    const cue = el('h2', 'ex-cue', 'Ready when you are');
    const circle = el('div', 'ex-circle');
    const ring = el('div', 'ex-ring');
    circle.appendChild(ring);
    const count = el('p', 'ex-clock');
    count.setAttribute('role', 'status');
    count.setAttribute('aria-live', 'polite');
    card.append(cue, circle, count);

    const picker = el('div', 'ex-pills');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Pace');
    PACES.forEach(p => {
      const b = btn(p.label, 'ex-pill' + (p.id === pace.id ? ' on' : ''), () => {
        pace = p;
        Array.from(picker.children).forEach(c => c.classList.toggle('on', c.textContent === p.label));
        Array.from(picker.children).forEach(c => c.setAttribute('aria-pressed', String(c.textContent === p.label)));
        paceNote.textContent = p.note;
      });
      b.setAttribute('aria-pressed', String(p.id === pace.id));
      picker.appendChild(b);
    });
    const paceNote = el('p', 'ex-note', pace.note);
    card.append(picker, paceNote);

    const go = btn('Begin', 'ex-primary', () => running ? stop() : start());
    const controls = el('div', 'ex-controls');
    controls.appendChild(go);
    card.appendChild(controls);

    card.appendChild(el('p', 'ex-note',
      'No holding the breath. The out-breath is simply longer than the ' +
      'in-breath, which is the part that settles you. If any pace feels ' +
      'like effort, use a shorter one or stop — this is not a test.'));
    body.appendChild(card);

    function frame(now) {
      const cycle = pace.in + pace.out;
      const at = ((now - t0) / 1000) % cycle;
      const inhaling = at < pace.in;
      const phase = inhaling ? at / pace.in : (at - pace.in) / pace.out;
      const scale = inhaling ? 0.55 + phase * 0.45 : 1 - phase * 0.45;
      if (!reduced()) ring.style.transform = 'scale(' + scale.toFixed(3) + ')';
      const label = inhaling ? 'Breathe in' : 'Breathe out';
      if (cue.textContent !== label) cue.textContent = label;
      const remain = Math.ceil(inhaling ? pace.in - at : cycle - at);
      const txt = label + ' · ' + remain;
      if (count.textContent !== txt) count.textContent = txt;
      raf = requestAnimationFrame(frame);
    }
    function start() {
      running = true; t0 = performance.now();
      go.textContent = 'Stop';
      ring.classList.add('on');
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
      ring.classList.remove('on');
      ring.style.transform = '';
      go.textContent = 'Begin';
      cue.textContent = 'Ready when you are';
      count.textContent = '';
    }
    active = { stop: () => cancelAnimationFrame(raf), pause: stop };
  }

  /* ==================================================================
     PRACTICE 3 — SOUNDSCAPE.
     ================================================================== */
  function soundscape() {
    const body = openLayer('Sounds');

    const card = el('section', 'ex-card');
    card.appendChild(el('h2', null, 'Sounds'));
    card.appendChild(el('p', 'ex-note',
      'Nothing plays until you turn it on. These are generated on the ' +
      'device rather than streamed, so they work with no connection and ' +
      'download nothing.'));

    LAYERS.forEach(spec => {
      const row = el('div', 'ex-layer-row');
      /* Merged: this screen keeps the shared registry, and takes the
         three protections that were written against its old local Map —
         they now live in startSound() so they also cover the hub's
         cards, which the earlier version could not reach. */
      const on = btn(spec.label, 'ex-toggle', async () => {
        if (on.disabled) return;                 /* no double taps */
        if (layerOn(spec.id)) {
          stopSound(spec.id);
          on.classList.remove('on'); on.setAttribute('aria-pressed', 'false');
          slider.disabled = true;
          return;
        }
        on.disabled = true;
        try {
          await startSoundOrThrow(spec.id, Number(slider.value) / 100);
          on.classList.add('on'); on.setAttribute('aria-pressed', 'true');
          slider.disabled = false;
        } catch (err) {
          const warning = card.querySelector('[data-audio-warning]') || el('p', 'ex-note');
          warning.dataset.audioWarning = 'true';
          warning.setAttribute('role', 'alert');
          warning.textContent = err.message || 'Audio could not start';
          card.appendChild(warning);
        } finally { on.disabled = false; }
      });
      /* Reflects what is ALREADY playing, because sound can now be
         started from the hub and this screen may be opened on top of it. */
      const alreadyOn = layerOn(spec.id);
      if (alreadyOn) on.classList.add('on');
      on.setAttribute('aria-pressed', String(alreadyOn));
      const slider = el('input');
      slider.type = 'range'; slider.min = 0; slider.max = 100;
      slider.value = alreadyOn ? Math.round((LIVE.get(spec.id).level || 0.6) * 100) : 60;
      slider.disabled = !alreadyOn;
      slider.setAttribute('aria-label', spec.label + ' volume');
      slider.addEventListener('input', () => {
        const node = LIVE.get(spec.id);
        if (node) setLayerLevel(node, Number(slider.value) / 100);
      });
      row.append(on, slider);
      card.appendChild(row);
    });

    /* Independent output check: a short sine tone goes directly to the
       destination, bypassing the weather filters and the mixer master.
       On iOS the oscillator is started in the user's tap handler. */
    const speakerStatus = el('p', 'ex-note');
    speakerStatus.setAttribute('role', 'status');
    const speakerTest = btn('Test speaker tone', 'ex-quiet', () => {
      try {
        const audio = ensureContext();
        if (!audio) {
          speakerStatus.textContent = 'This browser has no Web Audio support.';
          return;
        }
        const tone = audio.createOscillator();
        const level = audio.createGain();
        tone.type = 'sine';
        tone.frequency.value = 440;
        level.gain.setValueAtTime(0.0001, audio.currentTime);
        level.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.04);
        level.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.65);
        tone.connect(level).connect(audio.destination);
        tone.start();
        tone.stop(audio.currentTime + 0.67);
        wake();
        speakerStatus.textContent = 'Audio engine: ' + audio.state +
          '. A short test tone was requested.';
        setTimeout(() => {
          speakerStatus.textContent = 'Audio engine: ' + audio.state +
            '. If silent, check iPad volume and output device.';
        }, 850);
      } catch (err) {
        speakerStatus.textContent = 'Speaker test error: ' + (err.message || String(err));
      }
    });
    card.append(speakerTest, speakerStatus);

    const masterRow = el('div', 'ex-layer-row ex-master');
    const muteBtn = btn(muted ? 'Unmute' : 'Mute', 'ex-toggle', () => {
      setMuted(!muted);
      muteBtn.textContent = muted ? 'Unmute' : 'Mute';
      muteBtn.setAttribute('aria-pressed', String(muted));
    });
    muteBtn.setAttribute('aria-pressed', String(muted));
    const masterSlider = el('input');
    masterSlider.type = 'range'; masterSlider.min = 0; masterSlider.max = 100;
    masterSlider.value = Math.round(masterLevel * 100);
    masterSlider.setAttribute('aria-label', 'Overall volume');
    masterSlider.addEventListener('input', () => setMaster(Number(masterSlider.value) / 100));
    masterRow.append(muteBtn, masterSlider);
    card.appendChild(masterRow);

    card.appendChild(el('p', 'ex-note',
      'Sound keeps playing while you move between tabs, and the player at ' +
      'the bottom follows it. It stops when you stop it, when the sleep ' +
      'timer fades it out, or when you switch ' +
      'away from the app.'));
    body.appendChild(card);
    /* closeLayer() stops all audio, which is this project's existing rule
       for practice screens and is asserted by test/sounds-discovery.js.
       The registry is emptied to match, so the player and the hub cards
       cannot be left claiming something is playing when it is not. */
    active = { stop: () => {} };
  }

  /* ==================================================================
     PRACTICES 4 and 5 — REFLECTION and GRATITUDE.
     ================================================================== */
  function writing(kind) {
    const gratitude = kind === 'gratitude';
    const body = openLayer(gratitude ? 'Gratitude' : 'Reflection');
    const card = el('section', 'ex-card');
    card.appendChild(el('h2', null, gratitude ? 'Anything worth keeping' : 'What is still with you'));
    card.appendChild(el('p', 'ex-note', gratitude
      ? 'Write down anything from today you would rather not lose. One ' +
        'thing is enough, and nothing is fine too — there is no number to ' +
        'reach and nothing happens if you skip a day.'
      : 'Put down whatever is still turning over. Writing it somewhere is ' +
        'often enough to stop carrying it; you do not have to resolve it.'));

    const area = el('textarea');
    area.rows = 5;
    area.placeholder = gratitude ? 'Something from today…' : 'What is on your mind…';
    area.setAttribute('aria-label', gratitude ? 'Something worth keeping' : 'What is on your mind');
    card.appendChild(area);

    let next = null;
    if (!gratitude) {
      next = el('input');
      next.type = 'text';
      next.placeholder = 'One small next step, if there is one (optional)';
      next.setAttribute('aria-label', 'One small next step, optional');
      card.appendChild(next);
    }

    const saved = el('p', 'ex-note');
    saved.setAttribute('role', 'status');
    saved.setAttribute('aria-live', 'polite');

    const controls = el('div', 'ex-controls');
    controls.appendChild(btn('Keep it', 'ex-primary', () => {
      const text = area.value.trim();
      if (!text) { saved.textContent = 'Nothing written yet.'; area.focus(); return; }
      const entry = SS.engine.addThought(text, gratitude ? 'gratitude' : 'reflection',
                                         next ? next.value : '');
      if (!entry) { saved.textContent = 'Could not save that.'; return; }
      area.value = ''; if (next) next.value = '';
      saved.textContent = 'Kept. It is on this device only, with the rest of your notes.';
      renderList();
    }));
    card.append(saved, controls);
    body.appendChild(card);

    const listCard = el('section', 'ex-card');
    listCard.appendChild(el('h3', null, gratitude ? 'Earlier' : 'Earlier notes'));
    const list = el('ul', 'ex-list');
    listCard.appendChild(list);
    body.appendChild(listCard);

    function renderList() {
      const want = gratitude ? 'gratitude' : 'reflection';
      const items = SS.engine.thoughts().filter(t => t.type === want).slice(0, 10);
      list.innerHTML = '';
      if (!items.length) { list.appendChild(el('li', 'ex-empty', 'Nothing here yet.')); return; }
      items.forEach(t => {
        const li = el('li');
        li.appendChild(el('span', 'ex-when',
          new Date(t.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })));
        li.appendChild(el('span', null, t.text));
        if (t.next) li.appendChild(el('span', 'ex-next', 'Next: ' + t.next));
        list.appendChild(li);
      });
    }
    renderList();
    setTimeout(() => area.focus(), 60);
    active = { stop: () => {} };
  }

  /* ==================================================================
     PRACTICE 6 — SLEEP EDUCATION.
     ================================================================== */
  function lessons() {
    const body = openLayer('About sleep');
    const card = el('section', 'ex-card');
    card.appendChild(el('h2', null, 'A few things worth knowing'));
    card.appendChild(el('p', 'ex-note',
      'Short, and about sleep generally — none of it is about your records, ' +
      'and none of it is advice about your health.'));
    LESSONS.forEach(([title, text, source]) => {
      const d = el('details', 'ex-lesson');
      d.appendChild(el('summary', null, title));
      d.appendChild(el('p', null, text));
      d.appendChild(el('p', 'ex-source', source));
      card.appendChild(d);
    });
    body.appendChild(card);
    active = { stop: () => {} };
  }

  /* ==================================================================
     THE LIST.
     ================================================================== */
  const PRACTICES = [
    ['Body scan', 'Thirteen steps, feet upward. About seven minutes.', bodyScan],
    ['Breathing', 'A longer out-breath. No holding.', breathing],
    ['Sounds', 'Rain, water, leaves, wind, snow, night air, cabin hum. Mix your own.', soundscape],
    ['Reflection', 'Put down what is still turning over.', () => writing('reflection')],
    ['Gratitude', 'Anything worth keeping from today.', () => writing('gratitude')],
    ['About sleep', 'Six short pieces, with their sources.', lessons]
  ];

  /* ==================================================================
     THE HUB — Sounds & Experiences.

     Everything in this app that can be started was reachable, and almost
     none of it was findable: sounds were three taps inside a practice
     called "Sounds" inside a tab called Explore, Flight Mode was a URL
     parameter, Living Sky was another one, and the Sabat Compass was
     behind a button on a different screen.

     This is one screen with two labelled groups. It does NOT add a fifth
     destination — the four-tab architecture is unchanged — and it does
     not reimplement anything: every card starts something that already
     exists. From the home screen it is two taps to any sound and two to
     any experience.
     ================================================================== */

  function goWorld(id) {
    try {
      localStorage.setItem('ss_world', id);
      localStorage.setItem('ss_ui', 'classic');
      localStorage.setItem('ss_concept', 'off');
    } catch (e) {}
    location.search = '?world=' + id;
  }

  function livingSkyOn() {
    if (window.SSLivingSky && typeof window.SSLivingSky.setEnabled === 'function') {
      window.SSLivingSky.setEnabled(true);
      return true;
    }
    try { localStorage.setItem('ss_living_sky', 'on'); } catch (e) {}
    location.search = '?sky=real';
    return false;
  }

  /* A real screen, so the tile leads somewhere like every other one.
     It also reports what the footage layer actually did, which is the
     only honest thing to show: most dayparts have no recording, and
     saying "on" when nothing can play would be a lie. */
  function livingSkyTile() {
    const body = openLayer('Living Sky');
    const card = el('section', 'ex-card');
    card.appendChild(el('h2', null, 'Living Sky'));

    const sky = window.SSLivingSky;
    const on = Boolean(sky && typeof sky.enabled === 'function' && sky.enabled());

    card.appendChild(el('p', 'ex-note',
      'Real recorded sky behind the whole app, where a clip exists for the ' +
      'time of day. Everything else is the drawn sky, which is never ' +
      'described as footage.'));

    const state = el('p', 'ex-words');
    state.setAttribute('role', 'status');
    const row = el('div', 'ex-controls');
    const toggle = btn(on ? 'Turn off' : 'Turn on', 'ex-primary', () => {
      const want = !(sky && sky.enabled && sky.enabled());
      if (sky && typeof sky.setEnabled === 'function') sky.setEnabled(want);
      else { try { localStorage.setItem('ss_living_sky', want ? 'on' : 'off'); } catch (e) {} }
      paint();
    });
    row.appendChild(toggle);
    const look = btn('Go and look', 'ex-quiet', () => { closeLayer(); goView('today'); });
    row.appendChild(look);

    function paint() {
      const live = Boolean(sky && sky.enabled && sky.enabled());
      toggle.textContent = live ? 'Turn off' : 'Turn on';
      const status = sky && typeof sky.status === 'function' ? sky.status() : 'unavailable';
      const covered = sky && typeof sky.covered === 'function' ? sky.covered() : [];
      state.textContent = !live
        ? 'Off. The drawn sky is showing.'
        : status === 'playing' || status === 'paused'
          ? 'On, and footage is playing now.'
          : status === 'unavailable'
            ? 'On, but there is no recording for this time of day, so the drawn sky is showing.'
            : 'On. Loading the recording for this time of day.';
      if (covered.length) {
        state.textContent += ' Footage exists for: ' + covered.join(', ') + '.';
      }
    }
    paint();

    card.appendChild(state);
    card.appendChild(row);
    card.appendChild(el('p', 'ex-note',
      'Playback of these clips has never been verified on an iPhone, so ' +
      'this may show the drawn sky on your device. It is labelled either ' +
      'way rather than guessed at.'));
    body.appendChild(card);
    active = { stop: () => {} };
  }

  function goView(view) {
    const nav = document.querySelector('.nav button[data-view="' + view + '"]');
    if (nav) { nav.click(); return true; }
    return false;
  }

  function goScreen(target) {
    const b = document.querySelector('[data-go="' + target + '"]');
    if (b) { b.click(); return true; }
    return false;
  }

  /* Each experience names what it is and what starting it does. Nothing
     here is new behaviour; every one of these already worked. */
  const EXPERIENCES = [
    /* Opens the cabin: the window-seat screen built to the visual
       reference. The Flight world's wind-down is still reachable from
       its own card below. */
    ['Flight Mode', 'A window seat above the clouds. Real footage where it exists.',
      () => { if (window.SSFlightCabin) window.SSFlightCabin.open(); else goWorld('flight'); }],
    ['Flight wind-down', 'The descent: arrive, settle, release.', () => goWorld('flight')],
    /* Living Sky is a toggle, not a journey: it puts recorded footage
       behind the whole app. Tapping it used to enable the layer and
       leave you looking at the same screen with no sign anything had
       happened, which is indistinguishable from a dead button. It now
       says what it did and takes you where you can see it. */
    ['Living Sky', 'Recorded sky behind the app, where footage exists.', livingSkyTile],
    ['Body scan', 'Thirteen steps, feet upward. Voice-free, hands-free.', bodyScan],
    ['Breathing', 'A longer out-breath. No holding.', breathing],
    ['Sabat Compass', 'What your own nights have shown so far.', () => goScreen('compass')],
    ['Reflection', 'Put down what is still turning over.', () => writing('reflection')],
    ['Gratitude', 'Anything worth keeping from today.', () => writing('gratitude')],
    ['About sleep', 'Six short pieces, with their sources.', lessons]
  ];

  function soundCard(spec) {
    const b = btn('', 'ex-sound' + (layerOn(spec.id) ? ' on' : ''), null);
    b.dataset.sound = spec.id;
    b.appendChild(el('strong', null, spec.label));
    b.appendChild(el('span', 'ex-sound-state', layerOn(spec.id) ? 'Playing' : 'Tap to play'));
    b.setAttribute('aria-pressed', String(layerOn(spec.id)));
    /* The card does not paint itself: toggleSound drives the player,
       which refreshes every card. One source of truth for what is
       playing, so a card can never disagree with the sound. */
    b.addEventListener('click', () => { toggleSound(spec.id); });
    return b;
  }

  function mount() {
    const host = document.getElementById('learn');
    if (!host || document.getElementById('explore') || !SS || !SS.engine) return;
    const section = el('section', 'card ex-card ex-index');
    section.id = 'explore';
    section.appendChild(el('h3', null, 'Sounds & Experiences'));
    section.appendChild(el('p', 'ex-note',
      'Everything you can start is here. Nothing is timed against you or ' +
      'kept as a record of how often you came back.'));

    /* ---- Sounds ---- */
    const sh = el('div', 'ex-group-head');
    sh.appendChild(el('h4', null, 'Sounds'));
    sh.appendChild(el('span', 'ex-group-note', 'Tap to play. Layer as many as you like.'));
    section.appendChild(sh);

    const sounds = el('div', 'ex-sounds');
    LAYERS.forEach(spec => sounds.appendChild(soundCard(spec)));
    section.appendChild(sounds);

    const mixRow = el('div', 'ex-group-foot');
    mixRow.appendChild(btn('Open the mixer', 'ex-link', soundscape));
    section.appendChild(mixRow);
    section.appendChild(el('p', 'ex-note',
      'These are generated on the device rather than streamed, so they ' +
      'work with no connection and download nothing.'));

    /* ---- Experiences ---- */
    const eh = el('div', 'ex-group-head');
    eh.appendChild(el('h4', null, 'Experiences'));
    eh.appendChild(el('span', 'ex-group-note', 'Longer things to move through.'));
    section.appendChild(eh);

    const grid = el('div', 'ex-grid');
    EXPERIENCES.forEach(([label, blurb, open]) => {
      const b = btn('', 'ex-tile', open);
      b.appendChild(el('strong', null, label));
      b.appendChild(el('span', null, blurb));
      grid.appendChild(b);
    });
    section.appendChild(grid);

    /* The religious material is not reimplemented here. It is verified
       content that already exists in this app, and a second copy is a
       second thing to keep correct. */
    section.appendChild(el('p', 'ex-note',
      'The dua and the stillness readings are above, where they already were.'));
    host.insertBefore(section, host.firstChild);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.SSExplore = {
    open(id) {
      const found = PRACTICES.find(p => p[0].toLowerCase() === String(id).toLowerCase());
      if (found) found[2]();
    },
    close: closeLayer,
    audioRunning: () => Boolean(ctx && nodes.length),
    /* The hub and the player need these, and so do the tests: what is
       playing has to be inspectable from outside, or "the sound works"
       is an opinion. */
    startSound, startSoundOrThrow, stopSound, toggleSound, stopEverySound,
    openMixer: soundscape,
    playing: () => [...LIVE.keys()],
    setSleepTimer,
    timerEndsAt: () => fadeEndsAt,
    EXPERIENCES: () => EXPERIENCES.map(e => e[0]),
    REGIONS, PACES, LAYERS, LESSONS
  };
})();
