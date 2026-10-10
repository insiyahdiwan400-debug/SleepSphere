/**
 * SleepSphere Worlds — FLIGHT.
 *
 * The atmosphere is the product. A real sky fills the screen and the times
 * live in a small bar you can open; the schedule is available, not imposed.
 *
 * ── The Descent ───────────────────────────────────────────────────────
 * Three phases, and the participant moves through them by dragging the sky
 * down — the gesture pulls the sun under the horizon, so the interaction
 * and the metaphor are the same motion. A button does the same thing for
 * anyone who cannot or will not drag.
 *
 *      ARRIVE   golden light, still high            sky 0.35 → 0.9
 *      SETTLE   twilight, a slow breath             sky 0.9  → 1.7
 *      RELEASE  the last light goes, stars out      sky 1.7  → 2.0
 *
 * Each phase holds one short line. The screen gets quieter as it goes:
 * fewer words, less contrast, less to look at. By Release there is one
 * sentence and one action, and the action ends the evening.
 *
 * ── Why it does not become a game ─────────────────────────────────────
 * There is no score, no streak, nothing unlocked and nothing to come back
 * for. The Descent can be skipped entirely. Finishing it hands straight to
 * the shell's night guard, which withdraws the interface until morning —
 * this world cannot keep anyone on screen even if the design wanted to.
 */
(function () {
  'use strict';
  var W = window.SSWorlds;
  if (!W || !window.SSSky) return;
  var el = W.el, t = W.t, A = W.actions;

  var PHASES = [
    { id: 'arrive',  name: 'Arrive',
      line: 'You’re here. Nothing left to decide tonight.',
      from: 0.35, to: 0.95 },
    { id: 'settle',  name: 'Settle',
      line: 'Let the day go. Slow the breath out.',
      from: 0.95, to: 1.70 },
    { id: 'release', name: 'Release',
      line: 'The light is gone. Nothing more tonight.',
      from: 1.70, to: 2.00 }
  ];

  /* Where the sky sits when nobody is descending — driven by the clock, so
     opening the app in the afternoon and at dusk are different skies. */
  function restingSky(model) {
    if (model.phase === 'WAKE') return 2.72;
    if (model.phase === 'DAY') return 0.08;
    if (model.phase === 'EVENING') return 0.30;
    return 2.0;
  }

  var sky = null, host = null, state = {
    descending: false, progress: 0, phase: 0, finishing: false, audio: null, sheet: false
  };

  /* ── optional ambience ───────────────────────────────────────────────
     Generated on the device with WebAudio — no file, no network, no cost.
     Off unless started, and the stop is always visible while it plays. */
  function audioOn() {
    if (state.audio) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var len = ctx.sampleRate * 4;
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++) {           /* brown noise: soft, not hissy */
        var white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.2;
      }
      var src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      var gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 2.5);
      src.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
      src.start();
      state.audio = { ctx: ctx, gain: gain, src: src };
    } catch (e) { /* no audio is a fine outcome */ }
  }
  function audioOff() {
    if (!state.audio) return;
    var a = state.audio; state.audio = null;
    try {
      a.gain.gain.linearRampToValueAtTime(0, a.ctx.currentTime + 0.8);
      setTimeout(function () { try { a.src.stop(); a.ctx.close(); } catch (e) {} }, 900);
    } catch (e) {}
  }

  /* ── the descent ─────────────────────────────────────────────────── */
  function skyForProgress(p) {
    var i = p < 1 / 3 ? 0 : p < 2 / 3 ? 1 : 2;
    var ph = PHASES[i];
    var local = (p - i / 3) * 3;
    return { t: ph.from + (ph.to - ph.from) * Math.max(0, Math.min(1, local)), phase: i };
  }

  function setProgress(p, overlay) {
    state.progress = Math.max(0, Math.min(1, p));
    var s = skyForProgress(state.progress);
    if (sky) sky.set(s.t);
    if (s.phase !== state.phase) {
      state.phase = s.phase;
      paintDescent(overlay, true);
    } else {
      paintDescent(overlay, false);
    }
    if (state.progress >= 1 && !state.finishing) finish(overlay);
  }

  function finish(overlay) {
    state.finishing = true;
    overlay.classList.add('fl-ending');
    /* One held beat, then the shell takes the screen away for the night. */
    setTimeout(function () {
      audioOff();
      state.descending = false; state.finishing = false; state.progress = 0; state.phase = 0;
      delete document.documentElement.dataset.descending;
      A.settle();
    }, 2300);
  }

  function paintDescent(overlay, phaseChanged) {
    var ph = PHASES[state.phase];
    var lineEl = overlay.querySelector('.fl-line');
    var nameEl = overlay.querySelector('.fl-phase');
    var dots = overlay.querySelectorAll('.fl-dot');
    if (nameEl && nameEl.textContent !== ph.name) nameEl.textContent = ph.name;
    if (lineEl && lineEl.textContent !== ph.line) {
      if (phaseChanged) {
        lineEl.classList.add('fl-swap');
        setTimeout(function () {
          lineEl.textContent = ph.line;
          lineEl.classList.remove('fl-swap');
        }, 260);
      } else { lineEl.textContent = ph.line; }
    }
    for (var i = 0; i < dots.length; i++) {
      dots[i].setAttribute('data-on', String(i <= state.phase));
    }
    /* The interface itself dims as the night arrives. */
    overlay.style.setProperty('--fl-fade', String(1 - state.progress * 0.45));
  }

  function startDescent(overlay) {
    state.descending = true; state.progress = 0; state.phase = 0; state.finishing = false;
    /* The Descent is a focused mode: navigation goes away so the only
       things on screen are the sky, one line, and the way onward. */
    document.documentElement.dataset.descending = 'yes';
    overlay.classList.add('fl-descending');
    paintDescent(overlay, true);
    setProgress(0.001, overlay);
  }

  /* ── world ───────────────────────────────────────────────────────── */
  W.register({
    id: 'flight',
    name: 'Flight',
    blurb: 'A real sky, and a wind-down you move through.',
    fullBleed: true,
    lexicon: {
      tonight: 'Tonight', logbook: 'Nights', learn: 'Notes', you: 'You',
      settledKicker: 'Good night',
      settledLine: 'The sky is dark. Nothing to watch until morning.'
    },

    /* Mounted once; survives every re-render. */
    mount: function (root) {
      host = el('div', { class: 'fl-sky', 'aria-hidden': 'true' });
      var canvas = el('canvas', { class: 'fl-canvas' });
      host.appendChild(canvas);
      root.insertBefore(host, root.firstChild);
      sky = new window.SSSky(canvas, { t: 0.42 });
      sky.start();
    },

    sync: function (model) {
      if (!sky || state.descending) return;
      sky.set(restingSky(model));
    },

    scene: function (model, journey, api) {
      var box = el('div', { class: 'fl-wrap' });

      /* ---------------- TONIGHT ---------------- */
      if (journey === 'tonight') {
        if (state.descending) return descentScene(model, api);

        if (model.need) {
          box.appendChild(t('p', 'fl-kick', 'Before tonight'));
          box.appendChild(t('p', 'fl-ask', model.need === 'wake'
            ? 'When do you need to be up?' : 'After Fajr, back to sleep?'));
          var opts = el('div', { class: 'fl-opts' });
          (model.need === 'wake' ? ['05:30', '06:30', '07:30'] : ['Back to sleep', 'Stay up'])
            .forEach(function (o) {
              opts.appendChild(el('button', { class: 'fl-opt', type: 'button',
                text: model.need === 'wake' ? api.fmt(api.engine.toMinutes(o)) : o,
                onclick: function () { if (model.need === 'wake') A.answerWake(model, o); } }));
            });
          box.appendChild(opts);
          return box;
        }

        box.appendChild(timesBar(model, api));

        var mid = el('div', { class: 'fl-mid' });
        mid.appendChild(t('p', 'fl-kick', model.saved ? 'Tonight' : 'Proposed'));
        mid.appendChild(t('p', 'fl-head',
          model.phase === 'EVENING' || model.phase === 'SLEEP'
            ? 'Wind down at ' + model.stages[0].time + '.'
            : 'Tonight is ready.'));
        box.appendChild(mid);

        var foot = el('div', { class: 'fl-foot' });
        if (!model.saved) {
          foot.appendChild(el('button', { class: 'fl-go', type: 'button', id: 'wGo',
            text: 'Use this night', onclick: function () { A.acceptPlan(model); } }));
        } else {
          foot.appendChild(el('button', { class: 'fl-go', type: 'button', id: 'flDescend',
            text: 'Begin the Descent',
            onclick: function () {
              var overlay = document.querySelector('.fl-wrap');
              startDescent(overlay);
              W.refresh();
            } }));
        }
        foot.appendChild(el('button', { class: 'fl-quiet', type: 'button', id: 'wAdjust',
          text: 'Something is different tonight', onclick: function () { A.go('adjust'); } }));
        box.appendChild(foot);
        return box;
      }

      /* ---------------- NIGHTS ---------------- */
      if (journey === 'logbook') {
        box.appendChild(scrim());
        var top = el('div', { class: 'fl-scroll' });
        if (model.phase === 'WAKE' && model.needsRecord) {
          top.appendChild(arrival(model, api));
        } else {
          top.appendChild(t('p', 'fl-kick', 'Nights'));
          top.appendChild(t('p', 'fl-head2', insight(model, api)));
        }
        var list = el('ul', { class: 'fl-log' });
        model.history.slice(-7).reverse().forEach(function (n) {
          var mins = api.engine.sleepMinutesOf(n);
          var li = el('li', { class: 'fl-log-row' });
          li.appendChild(t('span', 'fl-log-d', n.date.slice(5).replace('-', '/')));
          li.appendChild(bar(mins));
          li.appendChild(t('span', 'fl-log-v', mins === null ? '—' : api.dur(mins)));
          list.appendChild(li);
        });
        if (model.history.length) top.appendChild(list);
        box.appendChild(top);
        return box;
      }

      /* ---------------- NOTES ---------------- */
      if (journey === 'learn') {
        box.appendChild(scrim());
        var s2 = el('div', { class: 'fl-scroll' });
        s2.appendChild(t('p', 'fl-kick', 'Notes'));
        [['Two blocks is a normal shape',
          'Sleeping either side of Fajr has been ordinary across most of human history. What matters is the total opportunity and a steady waking hour.'],
         ['The hour before bed does the work',
          'Falling asleep is something the body gets ready for, which is why the night starts with a wind-down time rather than a bedtime.'],
         ['There is no score here',
          'A phone cannot measure your sleep. It can hold the times you gave it and be honest about the difference.']
        ].forEach(function (pair) {
          var d = el('details', { class: 'fl-disc' });
          d.appendChild(el('summary', { text: pair[0] }));
          d.appendChild(t('p', 'fl-disc-b', pair[1]));
          s2.appendChild(d);
        });
        box.appendChild(s2);
        return box;
      }

      /* ---------------- ADJUST ---------------- */
      if (journey === 'adjust') {
        box.appendChild(scrim());
        var s3 = el('div', { class: 'fl-scroll' });
        s3.appendChild(t('p', 'fl-kick', 'Tonight is different'));
        [{ id: 'later', label: 'Up later than usual', shift: -60 },
         { id: 'early', label: 'Early start tomorrow', wake: '05:30' },
         { id: 'exam',  label: 'Heavy day ahead', shift: 0 }].forEach(function (sit) {
          s3.appendChild(el('button', { class: 'fl-opt fl-opt-wide', type: 'button',
            'data-sit': sit.id, text: sit.label,
            onclick: function () {
              var built = A.adjust(model, sit);
              var old = s3.querySelector('.fl-revised');
              if (old) old.remove();
              var panel = el('div', { class: 'fl-revised' });
              if (!built) {
                panel.appendChild(t('p', 'fl-opt-d', 'Not enough to rebuild that night.'));
              } else {
                panel.appendChild(t('p', 'fl-kick', 'Revised'));
                panel.appendChild(t('p', 'fl-head2', 'Wind down ' + api.fmt(built.windStart) + '.'));
                panel.appendChild(el('button', { class: 'fl-go', type: 'button', id: 'wRefile',
                  text: 'Use this', onclick: function () { A.commit(built); A.go('tonight'); } }));
              }
              s3.appendChild(panel);
            } }));
        });
        box.appendChild(s3);
        return box;
      }

      /* ---------------- YOU ---------------- */
      box.appendChild(scrim());
      var s4 = el('div', { class: 'fl-scroll' });
      s4.appendChild(t('p', 'fl-kick', 'You'));
      s4.appendChild(el('button', {
        class: 'fl-opt fl-opt-wide', type: 'button', id: 'flSound',
        'aria-pressed': String(Boolean(state.audio)),
        text: state.audio ? 'Ambience: on — tap to stop' : 'Ambience: off',
        onclick: function (e) {
          if (state.audio) { audioOff(); e.currentTarget.textContent = 'Ambience: off'; }
          else { audioOn(); e.currentTarget.textContent = 'Ambience: on — tap to stop'; }
          e.currentTarget.setAttribute('aria-pressed', String(Boolean(state.audio)));
        } }));
      s4.appendChild(t('p', 'fl-opt-d',
        'Generated on this device. Nothing is downloaded, and it stops when the Descent ends.'));
      s4.appendChild(t('p', 'fl-kick', 'World'));
      W.list().forEach(function (world) {
        s4.appendChild(el('button', { class: 'fl-opt fl-opt-wide', type: 'button',
          'data-world': world.id, text: world.name,
          onclick: function () { A.setWorld(world.id); } }));
      });
      s4.appendChild(t('p', 'fl-opt-d',
        'Changing world changes how SleepSphere looks. Your nights, schedule and settings stay as they are.'));
      box.appendChild(s4);
      return box;

      /* ---------------- pieces ---------------- */
      function scrim() { return el('div', { class: 'fl-scrim', 'aria-hidden': 'true' }); }

      function bar(mins) {
        var b = el('div', { class: 'fl-bar' });
        var fill = el('i');
        fill.style.width = mins === null ? '0%' : Math.round(Math.min(1, mins / 540) * 100) + '%';
        if (mins === null) b.classList.add('fl-bar-unknown');
        b.appendChild(fill);
        return b;
      }
    }
  });

  /* The compact schedule. Closed it is one line; open it is four. It never
     takes the screen from the sky. */
  function timesBar(model, api) {
    var wrap = el('div', { class: 'fl-times', 'data-open': String(state.sheet) });
    var head = el('button', { class: 'fl-times-head', type: 'button', id: 'flTimes',
      'aria-expanded': String(state.sheet),
      onclick: function () { state.sheet = !state.sheet; W.refresh(); } });
    head.appendChild(t('span', 'fl-times-k', 'Tonight'));
    head.appendChild(t('b', 'fl-times-v', api.dur(model.total)));
    head.appendChild(t('span', 'fl-times-c', state.sheet ? '⌃' : '⌄'));
    wrap.appendChild(head);
    if (state.sheet) {
      var grid = el('div', { class: 'fl-times-grid' });
      var LAB = { wind: 'Wind down', sleep: 'Asleep by', fajr: 'Fajr',
                  return: 'Back to sleep', wake: 'Up' };
      model.stages.forEach(function (s) {
        var r = el('div', { class: 'fl-times-row' });
        r.appendChild(t('span', '', LAB[s.key]));
        r.appendChild(t('b', '', s.time));
        grid.appendChild(r);
      });
      wrap.appendChild(grid);
    }
    return wrap;
  }

  /* The morning. The sky has already walked back to sunrise by the time
     this is read; the insight is the engine's own honest comparison. */
  function arrival(model, api) {
    var card = el('div', { class: 'fl-arrive' });
    card.appendChild(t('p', 'fl-kick', 'Good morning'));
    card.appendChild(t('p', 'fl-head2', 'How did last night leave you?'));
    var seg = el('div', { class: 'fl-seg', role: 'group', 'aria-label': 'Rested, 1 to 5' });
    for (var i = 1; i <= 5; i++) (function (v) {
      seg.appendChild(el('button', { type: 'button', text: String(v), 'data-v': v,
        'aria-label': 'Rested ' + v + ' of 5',
        onclick: function () {
          A.record({ rest: v, energy: v, focus: v });
          W.refresh();
        } }));
    })(i);
    card.appendChild(seg);
    return card;
  }

  function insight(model, api) {
    var usable = api.engine.withSleepDuration(model.history);
    if (usable.length < 4) return model.history.length + ' nights recorded so far.';
    var half = Math.floor(usable.length / 2);
    var avg = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    var early = avg(usable.slice(0, half).map(api.engine.sleepMinutesOf));
    var late = avg(usable.slice(half).map(api.engine.sleepMinutesOf));
    var d = Math.round(late - early);
    if (Math.abs(d) < 15) return 'Your nights are holding steady.';
    return d > 0 ? 'About ' + d + ' minutes longer than when you started.'
                 : 'About ' + Math.abs(d) + ' minutes shorter than when you started.';
  }

  /* ── the descent screen ──────────────────────────────────────────── */
  function descentScene(model, api) {
    var box = el('div', { class: 'fl-wrap fl-descending' });

    var top = el('div', { class: 'fl-desc-top' });
    top.appendChild(t('p', 'fl-phase', PHASES[state.phase].name));
    var dots = el('div', { class: 'fl-dots', 'aria-hidden': 'true' });
    PHASES.forEach(function (p, i) {
      dots.appendChild(el('i', { class: 'fl-dot', 'data-on': String(i <= state.phase) }));
    });
    top.appendChild(dots);
    box.appendChild(top);

    var mid = el('div', { class: 'fl-desc-mid' });
    mid.appendChild(t('p', 'fl-line', PHASES[state.phase].line));
    mid.appendChild(el('div', { class: 'fl-breath', 'aria-hidden': 'true' }));
    box.appendChild(mid);

    var foot = el('div', { class: 'fl-desc-foot' });
    foot.appendChild(t('p', 'fl-hint', 'Draw the sky down, or continue.'));
    foot.appendChild(el('button', { class: 'fl-go fl-go-quiet', type: 'button', id: 'flContinue',
      text: 'Continue',
      onclick: function () {
        setProgress(state.progress + 0.3401, box);
      } }));
    foot.appendChild(el('button', { class: 'fl-quiet', type: 'button', id: 'flSkip',
      text: 'Skip to good night',
      onclick: function () { setProgress(1, box); } }));
    box.appendChild(foot);

    /* The gesture: dragging down pulls the sun under the horizon. The same
       motion as the metaphor, which is why it needs no explaining beyond
       one line of hint text. */
    var startY = null, startP = 0;
    box.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      startY = e.clientY; startP = state.progress;
      box.setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointermove', function (e) {
      if (startY === null) return;
      var dy = e.clientY - startY;
      setProgress(startP + dy / (window.innerHeight * 0.85), box);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      box.addEventListener(ev, function () { startY = null; });
    });

    setTimeout(function () { paintDescent(box, false); }, 0);
    return box;
  }

  /* When the night guard takes over, any ambience goes with it. */
  var guardWatch = setInterval(function () {
    if (document.querySelector('.w-settled') && state.audio) audioOff();
  }, 1000);
  window.addEventListener('pagehide', function () { clearInterval(guardWatch); audioOff(); });

  window.__flight = {
    descend: function () {
      var overlay = document.querySelector('.fl-wrap');
      startDescent(overlay); W.refresh();
    },
    setProgress: function (p) { setProgress(p, document.querySelector('.fl-wrap')); },
    state: function () { return { descending: state.descending, progress: state.progress,
                                  phase: state.phase, audio: Boolean(state.audio),
                                  sky: sky ? sky.target : null }; }
  };
})();
