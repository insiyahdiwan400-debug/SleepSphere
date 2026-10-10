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
  const LAYERS = [
    { id: 'rain',   label: 'Rain',          type: 'white', hz: 1400, q: 0.6, lfo: 0.09, depth: 420, gain: 0.30 },
    { id: 'wind',   label: 'Wind',          type: 'brown', hz: 380,  q: 1.6, lfo: 0.05, depth: 180, gain: 0.45 },
    { id: 'stream', label: 'Water',         type: 'white', hz: 900,  q: 3.2, lfo: 0.21, depth: 520, gain: 0.22 },
    { id: 'night',  label: 'Night air',     type: 'brown', hz: 180,  q: 0.9, lfo: 0.03, depth: 60,  gain: 0.55 }
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
    if (active && active.stop) { try { active.stop(); } catch {} }
    active = null;
    stopAudio();
    if (layer) layer.remove();
    layer = null;
    document.documentElement.classList.remove('ex-open');
  }

  /* Leaving the app is leaving the practice, as far as sound is
     concerned. A soundscape still playing in a backgrounded tab is a
     battery complaint and a surprise in a quiet room. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { suspendAudio(); if (active && active.pause) active.pause(); }
  });

  /* ==================================================================
     AUDIO. One context, created on the first opt-in, never before.
     ================================================================== */
  let ctx = null, master = null, nodes = [];
  let muted = false, masterLevel = 0.6;

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : masterLevel;
    master.connect(ctx.destination);
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
    if (ctx) { try { ctx.close(); } catch {} ctx = null; master = null; }
  }
  function suspendAudio() { if (ctx && ctx.state === 'running') ctx.suspend(); }

  function setMaster(level) {
    masterLevel = level;
    if (master && ctx) master.gain.linearRampToValueAtTime(muted ? 0 : level, ctx.currentTime + 0.15);
  }
  function setMuted(on) {
    muted = on;
    if (master && ctx) master.gain.linearRampToValueAtTime(on ? 0 : masterLevel, ctx.currentTime + 0.15);
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

    const note = el('p', 'ex-note',
      'Every step is written out, and it moves on its own. You can pause ' +
      'anywhere, go back, or stop and leave — nothing is being counted.');
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
    function pause() { running = false; clearInterval(timer); paint(); }
    function finish() {
      running = false; done = true; clearInterval(timer);
      fill.style.width = '100%';
      paint();
    }
    function go(n) {
      if (n < 0 || n >= REGIONS.length) return;
      i = n; left = perStep; done = false; paint();
    }

    active = { stop: () => clearInterval(timer), pause };
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
    const live = new Map();

    const card = el('section', 'ex-card');
    card.appendChild(el('h2', null, 'Sounds'));
    card.appendChild(el('p', 'ex-note',
      'Nothing plays until you turn it on. These are generated on the ' +
      'device rather than streamed, so they work with no connection and ' +
      'download nothing.'));

    LAYERS.forEach(spec => {
      const row = el('div', 'ex-layer-row');
      const on = btn(spec.label, 'ex-toggle', () => {
        if (live.has(spec.id)) {
          stopLayer(live.get(spec.id)); live.delete(spec.id);
          on.classList.remove('on'); on.setAttribute('aria-pressed', 'false');
          slider.disabled = true;
        } else {
          const node = startLayer(spec, Number(slider.value) / 100);
          if (!node) { card.appendChild(el('p', 'ex-note', 'Sound is not available in this browser.')); return; }
          live.set(spec.id, node);
          on.classList.add('on'); on.setAttribute('aria-pressed', 'true');
          slider.disabled = false;
        }
      });
      on.setAttribute('aria-pressed', 'false');
      const slider = el('input');
      slider.type = 'range'; slider.min = 0; slider.max = 100; slider.value = 60;
      slider.disabled = true;
      slider.setAttribute('aria-label', spec.label + ' volume');
      slider.addEventListener('input', () => {
        const node = live.get(spec.id);
        if (node) setLayerLevel(node, Number(slider.value) / 100);
      });
      row.append(on, slider);
      card.appendChild(row);
    });

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
      'Sound stops when you close this screen, and when you switch away ' +
      'from the app.'));
    body.appendChild(card);
    active = { stop: () => { live.forEach(stopLayer); live.clear(); } };
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
    ['Sounds', 'Rain, wind, water, night air. Mix your own.', soundscape],
    ['Reflection', 'Put down what is still turning over.', () => writing('reflection')],
    ['Gratitude', 'Anything worth keeping from today.', () => writing('gratitude')],
    ['About sleep', 'Six short pieces, with their sources.', lessons]
  ];

  function mount() {
    const host = document.getElementById('learn');
    if (!host || document.getElementById('explore') || !SS || !SS.engine) return;
    const section = el('section', 'card ex-card ex-index');
    section.id = 'explore';
    section.appendChild(el('h3', null, 'Practices'));
    /* Deliberately does not say "no streaks". Naming the thing plants it,
       and a reassurance about a mechanic nobody mentioned invites the
       reader to wonder where it is. */
    section.appendChild(el('p', 'ex-note',
      'Each of these does something. Nothing here is timed against you or ' +
      'kept as a record of how often you came back.'));
    const grid = el('div', 'ex-grid');
    PRACTICES.forEach(([label, blurb, open]) => {
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
    REGIONS, PACES, LAYERS, LESSONS
  };
})();
