/**
 * SleepSphere — the simplified interface ("calm"), prototype.
 *
 * Governing principle: SleepSphere knows a lot. The user has to do very
 * little. The benchmark is the existing bedtime screen — one statement, one
 * action, one screenful, no vocabulary to learn — and every state here is
 * held to it.
 *
 * This file contains NO arithmetic about sleep, prayer times or records. It
 * calls SS.engine for all of it (see UX.md section 6). If something here
 * needs a number the engine does not expose, that is a signal to extend the
 * engine deliberately, not to compute it in the view.
 *
 * It is off unless asked for: ?ui=calm, or settings.ui === 'calm'. Classic
 * remains the default.
 */
(function () {
  'use strict';

  var SS = window.SS;
  if (!SS) return;

  /* ---------------------------------------------------------------- */
  /* Flag                                                              */
  /* ---------------------------------------------------------------- */
  var params = new URLSearchParams(location.search);
  var asked = params.get('ui');
  if (asked === 'calm' || asked === 'classic') {
    try { localStorage.setItem('ss_ui', asked); } catch (e) {}
  }
  var stored = null;
  try { stored = localStorage.getItem('ss_ui'); } catch (e) {}
  var settingsUi = (SS.state.settings || {}).ui;
  var on = (asked === 'calm') || (stored === 'calm' && asked !== 'classic') ||
           (settingsUi === 'calm' && asked !== 'classic' && stored !== 'classic');
  if (!on) return;

  document.documentElement.dataset.ui = 'calm';

  /* ---------------------------------------------------------------- */
  /* Instrumentation — so section 8 of UX.md is measured, not asserted */
  /* ---------------------------------------------------------------- */
  var metrics = { taps: 0, journeyStart: null, journey: null, log: [] };
  window.__calmMetrics = metrics;
  window.__calmBeginJourney = function (name) {
    metrics.journey = name; metrics.taps = 0; metrics.journeyStart = Date.now();
  };
  window.__calmEndJourney = function () {
    var r = { journey: metrics.journey, taps: metrics.taps,
              ms: Date.now() - (metrics.journeyStart || Date.now()) };
    metrics.log.push(r); return r;
  };
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#calm')) metrics.taps++;
  }, true);

  /* ---------------------------------------------------------------- */
  /* Tiny DOM helpers. No framework; the page already ships none.      */
  /* ---------------------------------------------------------------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (k) { if (k) n.appendChild(k); });
    return n;
  }
  var t = function (tag, cls, text) { return el(tag, { class: cls, text: text }); };

  /* ---------------------------------------------------------------- */
  /* Content: Discover. Short, contextual, optional depth.             */
  /*                                                                   */
  /* This replaces a 6.9-screen reading library. Each one is a single  */
  /* sentence a person can act on, with the explanation folded away    */
  /* until asked for. Nothing here claims to measure the reader.       */
  /* ---------------------------------------------------------------- */
  var DISCOVERIES = [
    { id: 'wind',
      when: 'EVENING',
      short: 'The hour before bed does more than the hour in bed.',
      more: 'Falling asleep is something the body gets ready for, not something it does on command. ' +
            'Dimming the room and putting the phone down starts the process before you lie down, ' +
            'which is why your night plan begins with a wind-down time rather than a bedtime.' },
    { id: 'fajr',
      when: 'EVENING',
      short: 'Sleeping in two blocks around Fajr is a normal shape, not a broken night.',
      more: 'Split sleep has been ordinary across most of human history. What matters is the total ' +
            'opportunity and how consistent the timing is — not whether it arrived in one piece. ' +
            'SleepSphere plans the two blocks instead of pretending the night is continuous.' },
    { id: 'clock',
      when: 'WAKE',
      short: 'Waking at a similar time matters more than going to bed at one.',
      more: 'Your body clock takes its strongest cue from morning light, so a steady wake time ' +
            'anchors the whole rhythm. A late night followed by your usual wake time costs you one ' +
            'night. A late night followed by a late morning moves the clock itself.' },
    { id: 'wake',
      when: 'WAKE',
      short: 'Waking in the night is normal. Everyone does it.',
      more: 'Brief awakenings happen several times a night for almost everyone; most are never ' +
            'remembered. Remembering them does not mean you slept badly — it usually means one ' +
            'happened to land at a lighter moment.' },
    { id: 'hours',
      when: 'DAY',
      short: 'Enough hours does not always feel restorative.',
      more: 'Time in bed is opportunity, not outcome. Two nights of the same length can leave you ' +
            'feeling very different, which is why SleepSphere asks how you feel rather than ' +
            'scoring the hours.' },
    { id: 'score',
      when: 'DAY',
      short: 'There is no single sleep score here, on purpose.',
      more: 'A phone cannot measure your sleep. It can hold the times you gave it and the way you ' +
            'said you felt, and it can be honest about the difference. A number would be a guess ' +
            'wearing a decimal point.' }
  ];

  /* ---------------------------------------------------------------- */
  /* Screen scaffolding                                                */
  /* ---------------------------------------------------------------- */
  var root = el('div', { id: 'calm' });
  var stage = el('div', { class: 'c-stage', id: 'calmStage' });
  var tabs = el('nav', { class: 'c-tabs', id: 'calmTabs', role: 'tablist' });
  var current = 'today';

  var TABS = [
    { id: 'today',   label: 'Today' },
    { id: 'sleep',   label: 'My Sleep' },
    { id: 'discover',label: 'Discover' },
    { id: 'you',     label: 'You' }
  ];
  TABS.forEach(function (tab) {
    tabs.appendChild(el('button', {
      type: 'button', role: 'tab', 'data-tab': tab.id, text: tab.label,
      onclick: function () { go(tab.id); }
    }));
  });

  function go(id) { current = id; render(); window.scrollTo(0, 0); }
  window.__calmGo = go;

  /* A sheet is the ONLY way depth is reached. One at a time, dismissible,
     and it never becomes a destination of its own. */
  function sheet(title, nodes, opts) {
    closeSheet();
    var o = opts || {};
    var wrap = el('div', { class: 'c-sheet', id: 'calmSheet', role: 'dialog',
                           'aria-modal': 'true', 'aria-label': title });
    var inner = el('div', { class: 'c-sheet-in' });
    inner.appendChild(el('button', { class: 'c-sheet-x', type: 'button',
      'aria-label': 'Close', text: '✕', onclick: closeSheet }));
    if (title) inner.appendChild(t('h2', 'c-sheet-h', title));
    nodes.forEach(function (n) { inner.appendChild(n); });
    wrap.appendChild(inner);
    root.appendChild(wrap);
    if (!o.keepScroll) inner.scrollTop = 0;
    return wrap;
  }
  function closeSheet() {
    var s = document.getElementById('calmSheet');
    if (s) s.remove();
  }
  window.__calmCloseSheet = closeSheet;

  /* ---------------------------------------------------------------- */
  /* TODAY                                                             */
  /*                                                                   */
  /* One statement, one action. The statement is what the engine has   */
  /* already worked out; the action is the only thing left to do.      */
  /* ---------------------------------------------------------------- */

  function fmt(mins) { return SS.engine.formatTime(mins); }

  /* Condition 6: generate only when the existing data supports it.
     buildNight returns null when it cannot, and knowledge.missing says what
     is absent. Nothing is ever invented to fill the gap. */
  function proposeNight() {
    var k = SS.engine.knowledge();
    if (k.missing.length || k.asksTonight) return { need: k.missing.length ? k.missing[0] : 'habit', knowledge: k };
    var plan = SS.engine.buildNight({
      target: k.target, settle: k.settle, wind: k.wind,
      fajr: k.fajr, wake: k.usualWake, afterFajr: k.habit
    });
    if (!plan) return { need: 'wake', knowledge: k };
    return { plan: plan, knowledge: k };
  }

  function todayScreen() {
    /* resolvePhase returns {phase, reason, anchors, recorded} — the whole
       decision, not just its name. Take the name. */
    var resolved = SS.engine.phase();
    var phase = resolved && resolved.phase ? resolved.phase : String(resolved);
    var plan = SS.engine.tonightsPlan();
    var box = el('div', { class: 'c-moment' });

    if (phase === 'SLEEP') return bedtime(box, plan);
    if (phase === 'WAKE')  return morning(box, plan);
    if (phase === 'EVENING') return evening(box, plan);
    return daytime(box, plan);
  }

  /* The phase name, wherever it is needed. */
  function phaseName() {
    var r = SS.engine.phase();
    return r && r.phase ? r.phase : String(r);
  }

  /* --- bedtime: the benchmark. Nothing may be added to this screen. -- */
  function bedtime(box, plan) {
    box.appendChild(t('p', 'c-eyebrow', 'Tonight'));
    box.appendChild(t('h1', 'c-say', 'Your night is ready.'));
    box.appendChild(t('p', 'c-sub', 'One tap, then put the phone somewhere else.'));
    box.appendChild(el('button', {
      class: 'c-go', type: 'button', id: 'calmGo', text: 'Goodnight',
      onclick: function () { goodnight(); }
    }));
    return box;
  }

  function goodnight() {
    var nodes = [
      t('p', 'c-sheet-p', 'Bed time noted. Nothing else to do tonight.'),
      el('button', { class: 'c-go', type: 'button', id: 'calmSlept', text: 'Done',
        onclick: closeSheet })
    ];
    sheet('Good night', nodes);
  }

  /* --- morning: three taps and a Done. ------------------------------ */
  function morning(box, plan) {
    var today = SS.engine.studyToday();
    var done = SS.engine.mornings().some(function (m) { return m.date === today; });

    box.appendChild(t('p', 'c-eyebrow', 'This morning'));
    if (done) {
      box.appendChild(t('h1', 'c-say', 'Last night is recorded.'));
      box.appendChild(t('p', 'c-sub', 'Nothing else to do until this evening.'));
      box.appendChild(el('button', { class: 'c-go', type: 'button', id: 'calmGo',
        text: 'See how the week is going', onclick: function () { go('sleep'); } }));
      return box;
    }
    box.appendChild(t('h1', 'c-say', 'How did last night leave you?'));
    box.appendChild(t('p', 'c-sub', 'Three taps. No times to work out.'));
    box.appendChild(el('button', {
      class: 'c-go', type: 'button', id: 'calmGo', text: 'Record last night',
      onclick: function () { recordFlow(plan); }
    }));
    return box;
  }

  /* The daily record. Three scales, then Done.

     Times are NOT asked: they come from the night the engine planned, and
     the record says so through the existing value_basis machinery. If there
     was no plan, the fragmented question below is the only way a time
     enters, and "not sure" stays unknown rather than being guessed. */
  var answers = {};
  function recordFlow(plan) {
    answers = { rest: null, energy: null, focus: null, woke: null, factors: [] };
    step1();
  }

  function scaleRow(key, label, low, high, next) {
    var wrap = el('div', { class: 'c-scale' });
    wrap.appendChild(t('p', 'c-scale-q', label));
    var row = el('div', { class: 'c-dots', role: 'group', 'aria-label': label });
    for (var i = 1; i <= 5; i++) (function (v) {
      row.appendChild(el('button', {
        type: 'button', class: 'c-dot', 'data-v': v, 'aria-label': label + ': ' + v + ' of 5',
        text: String(v),
        onclick: function () { answers[key] = v; next(); }
      }));
    })(i);
    wrap.appendChild(row);
    var ends = el('div', { class: 'c-ends' });
    ends.appendChild(t('span', '', low));
    ends.appendChild(t('span', '', high));
    wrap.appendChild(ends);
    return wrap;
  }

  function step1() {
    sheet(null, [
      t('p', 'c-step', 'Last night'),
      scaleRow('rest', 'How rested do you feel?', 'Not at all', 'Very', step2)
    ]);
  }
  function step2() {
    sheet(null, [
      t('p', 'c-step', 'Last night'),
      scaleRow('energy', 'And your energy right now?', 'Very low', 'Very steady', step3)
    ]);
  }
  function step3() {
    sheet(null, [
      t('p', 'c-step', 'Last night'),
      scaleRow('focus', 'How clear is your thinking?', 'Scattered', 'Clear', finishRecord)
    ]);
  }

  /* Fragmented sleep. Offered, never required, and never guessed.

     "Not sure how long" is a real answer: the record keeps the times it
     knows and leaves the sleep duration unknown, which the export already
     writes as blank rather than zero. */
  function fragmentedSheet(onDone) {
    var nodes = [
      t('p', 'c-step', 'Last night'),
      t('p', 'c-scale-q', 'Were you up in the night?'),
      el('div', { class: 'c-choices' }, [
        el('button', { class: 'c-choice', type: 'button', text: 'No, straight through',
          onclick: function () { answers.woke = 'none'; onDone(); } }),
        el('button', { class: 'c-choice', type: 'button', text: 'Yes, briefly',
          onclick: function () { answers.woke = 'brief'; onDone(); } }),
        el('button', { class: 'c-choice', type: 'button', text: 'Yes, for Fajr',
          onclick: function () { answers.woke = 'fajr'; fajrBack(onDone); } }),
        el('button', { class: 'c-choice', type: 'button', text: 'Yes, awake a long time',
          onclick: function () { answers.woke = 'long'; onDone(); } })
      ])
    ];
    sheet(null, nodes);
  }

  function fajrBack(onDone) {
    sheet(null, [
      t('p', 'c-step', 'After Fajr'),
      t('p', 'c-scale-q', 'Did you go back to sleep?'),
      el('div', { class: 'c-choices' }, [
        el('button', { class: 'c-choice', type: 'button', text: 'Yes, and I know roughly when',
          onclick: function () { answers.fajrReturn = 'known'; onDone(); } }),
        el('button', { class: 'c-choice', type: 'button', text: 'Yes, but I am not sure how long',
          onclick: function () { answers.fajrReturn = 'unknown'; onDone(); } }),
        el('button', { class: 'c-choice', type: 'button', text: 'No, I stayed up',
          onclick: function () { answers.fajrReturn = 'stayed'; onDone(); } })
      ]),
      t('p', 'c-note', 'If you are not sure, SleepSphere keeps the night and ' +
        'leaves the length unknown. It will not guess a number.')
    ]);
  }

  function finishRecord() { fragmentedSheet(saveRecord); }

  var AWAKE_FOR = { none: '0', brief: '15', fajr: '30', long: '120' };

  function saveRecord() {
    var plan = SS.engine.tonightsPlan();
    var payload = {
      rest: String(answers.rest || 3),
      energy: String(answers.energy || 3),
      focus: String(answers.focus || 3),
      awake: AWAKE_FOR[answers.woke] || '0',
      nap: '0',
      fajrStatus: answers.woke === 'fajr' ? 'ready' : undefined,
      factors: []
    };
    var saved = null;
    try {
      saved = SS.engine.recordMorning(payload, { quick: true });
    } catch (e) {
      sheet('That did not save', [t('p', 'c-sheet-p', String(e && e.message || e))]);
      return;
    }
    /* "Not sure how long" means the duration is genuinely unknown. The
       engine already represents that as null and exports it blank. */
    if (saved && answers.fajrReturn === 'unknown') {
      saved.sleepMinutes = null;
      saved.estimated = (saved.estimated || []).concat(['sleepMinutes']);
      SS.save();
    }
    closeSheet();
    acknowledge(saved);
  }

  function acknowledge(saved) {
    var line = 'Recorded.';
    var sub = 'Have a good morning.';
    if (saved && SS.engine.sleepMinutesOf(saved) === null) {
      sub = 'The times are kept. How much of it was sleep is not known, so nothing is estimated.';
    }
    sheet(null, [
      t('h2', 'c-sheet-h', line),
      t('p', 'c-sheet-p', sub),
      el('button', { class: 'c-go', type: 'button', id: 'calmRecorded', text: 'Start the day',
        onclick: function () { closeSheet(); render(); } }),
      el('button', { class: 'c-quiet', type: 'button', text: 'Add exact times',
        onclick: function () { closeSheet(); openClassic('morning'); } })
    ]);
  }

  /* --- evening: the statement, or the one question ------------------ */
  function evening(box, plan) {
    box.appendChild(t('p', 'c-eyebrow', 'Tonight'));

    if (plan) {
      /* The night is already settled, so there is genuinely nothing to do
         and no button is offered. A primary action that only re-renders
         the screen is worse than none: it teaches people that tapping is
         expected. The only thing left is the exception. */
      box.appendChild(t('h1', 'c-say', 'Wind down at ' + fmt(plan.windStart) + '.'));
      box.appendChild(t('p', 'c-sub', 'Asleep by ' + fmt(plan.sleepStart) +
        ', up at ' + fmt(SS.engine.toMinutes(SS.engine.planFinalWake(plan))) + '.'));
      box.appendChild(el('button', { class: 'c-quiet', type: 'button', id: 'calmAdjust',
        text: 'Something is different tonight', onclick: adjustSheet }));
      return box;
    }

    var p = proposeNight();
    if (p.plan) {
      box.appendChild(t('h1', 'c-say', 'Wind down at ' + fmt(p.plan.windStart) + '.'));
      box.appendChild(t('p', 'c-sub', 'Asleep by ' + fmt(p.plan.sleepStart) +
        ', up at ' + fmt(SS.engine.toMinutes(SS.engine.planFinalWake(p.plan))) + '.'));
      box.appendChild(el('button', { class: 'c-go', type: 'button', id: 'calmGo',
        text: 'Use this', onclick: function () {
          SS.engine.commitPlan(p.plan); render();
        } }));
      box.appendChild(el('button', { class: 'c-quiet', type: 'button', id: 'calmAdjust',
        text: 'Something is different tonight', onclick: adjustSheet }));
      return box;
    }

    /* The minimum necessary question, and nothing beyond it. */
    box.appendChild(t('h1', 'c-say', p.need === 'wake'
      ? 'When do you need to be up?'
      : 'After Fajr tomorrow?'));
    box.appendChild(t('p', 'c-sub', 'One answer and tonight is planned.'));
    box.appendChild(el('button', { class: 'c-go', type: 'button', id: 'calmGo',
      text: 'Answer', onclick: function () { askMinimum(p); } }));
    return box;
  }

  function askMinimum(p) {
    if (p.need === 'habit') {
      sheet(null, [
        t('p', 'c-scale-q', 'After Fajr tomorrow, will you go back to sleep?'),
        el('div', { class: 'c-choices' }, [
          el('button', { class: 'c-choice', type: 'button', text: 'Back to sleep',
            onclick: function () { applyMinimum(p, { afterFajr: 'return' }); } }),
          el('button', { class: 'c-choice', type: 'button', text: 'Stay up',
            onclick: function () { applyMinimum(p, { afterFajr: 'stay' }); } })
        ])
      ]);
      return;
    }
    var times = ['05:30', '06:00', '06:30', '07:00', '07:30', '08:00'];
    sheet(null, [
      t('p', 'c-scale-q', 'When do you need to be up?'),
      el('div', { class: 'c-choices' }, times.map(function (time) {
        return el('button', { class: 'c-choice', type: 'button',
          text: fmt(SS.engine.toMinutes(time)),
          onclick: function () { applyMinimum(p, { wake: time }); } });
      }))
    ]);
  }

  function applyMinimum(p, extra) {
    var k = p.knowledge;
    var plan = SS.engine.buildNight({
      target: k.target, settle: k.settle, wind: k.wind, fajr: k.fajr,
      wake: extra.wake || k.usualWake,
      afterFajr: extra.afterFajr || k.habit
    });
    closeSheet();
    if (!plan) {
      sheet('Not enough to plan a night', [
        t('p', 'c-sheet-p', 'SleepSphere will not invent the missing piece. ' +
          'You can set it yourself.'),
        el('button', { class: 'c-go', type: 'button', text: 'Set it myself',
          onclick: function () { closeSheet(); openClassic('plan'); } })
      ]);
      return;
    }
    SS.engine.commitPlan(plan);
    render();
  }

  /* --- adjust: four situations, then one confirmation --------------- */
  var SITUATIONS = [
    { id: 'later',  label: 'I will be up later', shift: 60 },
    { id: 'early',  label: 'Early start tomorrow', wake: '05:30' },
    { id: 'exam',   label: 'Exam or big day tomorrow', brain: 'exam' },
    { id: 'manual', label: 'Set it myself' }
  ];

  function adjustSheet() {
    sheet(null, [
      t('p', 'c-scale-q', 'What is different tonight?'),
      el('div', { class: 'c-choices' }, SITUATIONS.map(function (s) {
        return el('button', { class: 'c-choice', type: 'button', 'data-sit': s.id,
          text: s.label, onclick: function () { applySituation(s); } });
      }))
    ]);
  }

  function applySituation(s) {
    if (s.id === 'manual') { closeSheet(); openClassic('plan'); return; }
    var k = SS.engine.knowledge();
    var wake = s.wake || k.usualWake;
    var target = k.target - (s.shift || 0);
    var plan = SS.engine.buildNight({
      target: Math.max(240, target), settle: k.settle, wind: k.wind,
      fajr: k.fajr, wake: wake, afterFajr: k.habit
    });
    if (!plan) { closeSheet(); openClassic('plan'); return; }
    sheet(null, [
      t('p', 'c-step', s.label),
      t('h2', 'c-sheet-h', 'Then wind down at ' + fmt(plan.windStart) + '.'),
      t('p', 'c-sheet-p', 'Asleep by ' + fmt(plan.sleepStart) + ', up at ' +
        fmt(SS.engine.toMinutes(SS.engine.planFinalWake(plan))) + '.'),
      el('button', { class: 'c-go', type: 'button', id: 'calmUseAdjusted', text: 'Use this',
        onclick: function () { SS.engine.commitPlan(plan); closeSheet(); render(); } })
    ]);
  }

  /* --- daytime: deliberately almost empty --------------------------- */
  function daytime(box, plan) {
    box.appendChild(t('p', 'c-eyebrow', 'Today'));
    if (plan) {
      box.appendChild(t('h1', 'c-say', 'Tonight is handled.'));
      box.appendChild(t('p', 'c-sub', 'Wind down at ' + fmt(plan.windStart) +
        '. Nothing to do until then.'));
    } else {
      box.appendChild(t('h1', 'c-say', 'Nothing to do yet.'));
      box.appendChild(t('p', 'c-sub', 'SleepSphere will have tonight ready this evening.'));
    }
    box.appendChild(discoveryCard(phaseName()));
    return box;
  }

  /* One discovery, surfaced where it is relevant — the educational
     identity kept, the library removed. */
  function discoveryCard(phase) {
    var pool = DISCOVERIES.filter(function (d) { return d.when === phase; });
    if (!pool.length) pool = DISCOVERIES;
    var day = new Date().getDate();
    var d = pool[day % pool.length];
    var card = el('div', { class: 'c-disc' });
    card.appendChild(t('p', 'c-disc-s', d.short));
    card.appendChild(el('button', {
      class: 'c-quiet', type: 'button', 'data-disc': d.id, text: 'Why',
      onclick: function () { sheet(null, [t('p', 'c-scale-q', d.short), t('p', 'c-sheet-p', d.more)]); }
    }));
    return card;
  }

  /* ---------------------------------------------------------------- */
  /* MY SLEEP — the sentence first, the evidence under it              */
  /* ---------------------------------------------------------------- */
  function sleepScreen() {
    var box = el('div', { class: 'c-moment c-left' });
    var records = SS.engine.trustedMornings();
    var withDuration = SS.engine.withSleepDuration(records);

    box.appendChild(t('p', 'c-eyebrow', 'My Sleep'));

    if (records.length < 3) {
      box.appendChild(t('h1', 'c-say', 'Not enough nights yet.'));
      box.appendChild(t('p', 'c-sub', records.length === 0
        ? 'Record a morning and this fills in.'
        : records.length + ' recorded so far. A few more and patterns start to show.'));
      return box;
    }

    box.appendChild(t('h1', 'c-say', plainSentence(records, withDuration)));
    box.appendChild(strip(records));

    var last = records[records.length - 1];
    var mins = SS.engine.sleepMinutesOf(last);
    box.appendChild(t('p', 'c-last', 'Last night · ' +
      (mins === null ? 'length not known' : SS.engine.formatDuration(mins)) +
      ' · felt ' + (last.rest || '—') + ' out of 5'));

    box.appendChild(el('button', { class: 'c-quiet', type: 'button', id: 'calmMore',
      text: 'See more', onclick: function () { openClassic('twin'); } }));
    return box;
  }

  /* Plain language, and only claims the records support. */
  function plainSentence(records, withDuration) {
    if (withDuration.length < 4) return 'You have ' + records.length + ' nights recorded.';
    var half = Math.floor(withDuration.length / 2);
    var early = withDuration.slice(0, half).map(SS.engine.sleepMinutesOf);
    var late = withDuration.slice(half).map(SS.engine.sleepMinutesOf);
    var avg = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    var diff = Math.round(avg(late) - avg(early));
    if (Math.abs(diff) < 15) return 'Your nights are holding steady.';
    if (diff > 0) return 'You are sleeping about ' + diff + ' minutes longer than when you started.';
    return 'You are sleeping about ' + Math.abs(diff) + ' minutes less than when you started.';
  }

  function strip(records) {
    var last7 = records.slice(-7);
    var wrap = el('div', { class: 'c-strip', 'aria-hidden': 'true' });
    var longest = 1;
    last7.forEach(function (r) {
      var m = SS.engine.sleepMinutesOf(r);
      if (m !== null && m > longest) longest = m;
    });
    last7.forEach(function (r) {
      var m = SS.engine.sleepMinutesOf(r);
      var bar = el('div', { class: 'c-bar' + (m === null ? ' c-bar-unknown' : '') });
      bar.style.height = (m === null ? 8 : Math.max(8, Math.round(m / longest * 56))) + 'px';
      wrap.appendChild(bar);
    });
    return wrap;
  }

  /* ---------------------------------------------------------------- */
  /* DISCOVER — six short answers, depth on request                    */
  /* ---------------------------------------------------------------- */
  function discoverScreen() {
    var box = el('div', { class: 'c-moment c-left' });
    box.appendChild(t('p', 'c-eyebrow', 'Discover'));
    box.appendChild(t('h1', 'c-say-s', 'A few things worth knowing.'));
    DISCOVERIES.forEach(function (d) {
      var row = el('div', { class: 'c-disc' });
      row.appendChild(t('p', 'c-disc-s', d.short));
      row.appendChild(el('button', { class: 'c-quiet', type: 'button', 'data-disc': d.id,
        text: 'Why', onclick: function () {
          sheet(null, [t('p', 'c-scale-q', d.short), t('p', 'c-sheet-p', d.more)]);
        } }));
      box.appendChild(row);
    });
    return box;
  }

  /* ---------------------------------------------------------------- */
  /* YOU — a plain list. The only dense place, and nobody lives here.  */
  /* ---------------------------------------------------------------- */
  function youScreen() {
    var box = el('div', { class: 'c-moment c-left' });
    box.appendChild(t('p', 'c-eyebrow', 'You'));
    box.appendChild(t('h1', 'c-say-s', 'Settings and your data.'));

    var rows = [
      ['Prayer times and location', function () { openClassic('plan'); }],
      ['Your data and exports', function () { openClassic('data'); }],
      ['Research mode', researchSheet],
      ['Switch back to the classic app', function () {
        try { localStorage.setItem('ss_ui', 'classic'); } catch (e) {}
        location.search = '?ui=classic';
      }]
    ];
    rows.forEach(function (r) {
      box.appendChild(el('button', { class: 'c-row', type: 'button', text: r[0], onclick: r[1] }));
    });
    return box;
  }

  /* Research mode keeps the study workflows intact and one tap from here,
     rather than scattering them through the everyday interface. The export
     columns they feed are unchanged. */
  function researchSheet() {
    sheet('Research mode', [
      t('p', 'c-sheet-p', 'For enrolled participants. These feed the study export ' +
        'and are not part of everyday use.'),
      el('button', { class: 'c-row', type: 'button', text: 'Daily check-in',
        onclick: function () { closeSheet(); openClassic('bio'); } }),
      el('button', { class: 'c-row', type: 'button', text: 'Try one change',
        onclick: function () { closeSheet(); openClassic('experiment'); } }),
      el('button', { class: 'c-row', type: 'button', text: 'Full morning form',
        onclick: function () { closeSheet(); openClassic('morning'); } }),
      el('button', { class: 'c-row', type: 'button', text: 'Study data and export',
        onclick: function () { closeSheet(); openClassic('data'); } })
    ]);
  }

  /* The detail layer: the existing screens, reached deliberately and
     unchanged. Nothing is deleted — it stops being in the way. */
  function openClassic(view) {
    document.documentElement.dataset.ui = 'classic-detail';
    var btn = document.querySelector('.nav button[data-view="' + view + '"]');
    if (btn) { btn.click(); }
    else {
      var sections = document.querySelectorAll('section.view');
      for (var i = 0; i < sections.length; i++) sections[i].classList.remove('active');
      var target = document.getElementById(view);
      if (target) target.classList.add('active');
    }
    var back = el('button', { class: 'c-back', type: 'button', id: 'calmBack',
      text: '‹ Back', onclick: function () {
        document.documentElement.dataset.ui = 'calm';
        back.remove();
        render();
      } });
    document.body.appendChild(back);
    window.scrollTo(0, 0);
  }

  /* ---------------------------------------------------------------- */
  function render() {
    stage.innerHTML = '';
    var screen = current === 'today' ? todayScreen()
               : current === 'sleep' ? sleepScreen()
               : current === 'discover' ? discoverScreen()
               : youScreen();
    stage.appendChild(screen);
    Array.prototype.forEach.call(tabs.children, function (b) {
      b.setAttribute('aria-selected', String(b.dataset.tab === current));
    });
  }
  window.__calmRender = render;

  root.appendChild(stage);
  root.appendChild(tabs);
  document.body.appendChild(root);
  render();
})();
