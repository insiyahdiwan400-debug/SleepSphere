/**
 * SleepSphere Worlds — FLIGHT.
 *
 * The night as a journey: a gate time, a departure, a long quiet stretch,
 * a waypoint at Fajr, an arrival. Four journeys, the shell's model, no
 * arithmetic of its own.
 *
 * ── On not copying Flighty ────────────────────────────────────────────
 * What is borrowed is the PRINCIPLE set the brief named — real-time
 * relevance, hierarchy, meaningful progress, microinteraction, enjoyable
 * history. What is deliberately not borrowed is their product: no live map,
 * no aircraft moving along a great circle, no flight card, no green
 * "on time" chip, none of their palette. The references here are older and
 * public: a split-flap departure board, a card boarding pass with a
 * perforation, a pilot's logbook, an arrival stamp.
 *
 * ── On not encouraging night-time screen use ──────────────────────────
 * The shell forbids live progress once the participant says goodnight, so
 * this world cannot show a night in flight even if it wanted to. What it
 * does instead is put the pleasure where it is harmless: ANTICIPATION
 * before bed, and HISTORY in the morning. The board below is rich at 9pm,
 * one line at 11pm, and generous again at 7am. That asymmetry is the whole
 * design.
 */
(function () {
  'use strict';
  var W = window.SSWorlds;
  if (!W) return;
  var el = W.el, t = W.t, A = W.actions;

  var STAGE = {
    wind:   { code: 'GATE',   label: 'Gate opens',    sub: 'Begin winding down' },
    sleep:  { code: 'DEP',    label: 'Departure',     sub: 'Asleep by' },
    fajr:   { code: 'WPT',    label: 'Fajr',          sub: 'Waypoint' },
    return: { code: 'CONT',   label: 'Continue',      sub: 'Back to sleep' },
    wake:   { code: 'ARR',    label: 'Arrival',       sub: 'Up' }
  };

  var SITUATIONS = [
    { id: 'later', label: 'Departing later', detail: 'Up an hour later than usual', shift: -60 },
    { id: 'early', label: 'Early arrival',   detail: 'Need to be up at 5:30',       wake: '05:30' },
    { id: 'exam',  label: 'Heavy day ahead', detail: 'Exam or a long morning',      shift: 0 }
  ];

  /* A split-flap row. The flap animation is one 160ms transform on the
     element that actually changed, and it is removed under reduced motion:
     a microinteraction, not an ambience. */
  function flapRow(stage, label) {
    var row = el('div', { class: 'f-row', 'data-state': stage.state });
    row.appendChild(t('span', 'f-code', STAGE[stage.key].code));
    var mid = el('div', { class: 'f-mid' });
    mid.appendChild(t('b', 'f-label', label));
    mid.appendChild(t('span', 'f-sub', STAGE[stage.key].sub));
    row.appendChild(mid);
    var time = t('span', 'f-time', stage.time);
    if (stage.state === 'now') time.classList.add('f-flap');
    row.appendChild(time);
    return row;
  }

  /* The night drawn once, to scale, as a route line rather than a ring.
     Positions come from the model's own minutes — nothing is eyeballed. */
  function routeStrip(model) {
    if (!model.stages.length) return null;
    var first = model.stages[0], last = model.stages[model.stages.length - 1];
    var span = ((last.minutes - first.minutes) + 1440) % 1440 || 1;
    var at = function (s) { return (((s.minutes - first.minutes) + 1440) % 1440) / span; };

    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 320 46');
    svg.setAttribute('class', 'f-route');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Tonight from ' + first.time + ' to ' + last.time);

    var line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 12); line.setAttribute('y1', 30);
    line.setAttribute('x2', 308); line.setAttribute('y2', 30);
    line.setAttribute('class', 'f-route-line');
    svg.appendChild(line);

    model.stages.forEach(function (s) {
      var x = 12 + at(s) * 296;
      var tick = document.createElementNS(ns, 'line');
      tick.setAttribute('x1', x); tick.setAttribute('x2', x);
      tick.setAttribute('y1', s.key === 'fajr' ? 20 : 25);
      tick.setAttribute('y2', s.key === 'fajr' ? 40 : 35);
      tick.setAttribute('class', 'f-tick f-tick-' + s.key);
      svg.appendChild(tick);
      if (s.key === 'fajr') {
        var lab = document.createElementNS(ns, 'text');
        lab.setAttribute('x', x); lab.setAttribute('y', 13);
        lab.setAttribute('class', 'f-route-lab');
        lab.setAttribute('text-anchor', 'middle');
        lab.textContent = 'FAJR';
        svg.appendChild(lab);
      }
    });
    return svg;
  }

  function header(kicker, title) {
    var h = el('header', { class: 'f-head' });
    h.appendChild(t('p', 'f-kicker', kicker));
    h.appendChild(t('h1', 'f-title', title));
    return h;
  }

  /* ------------------------------------------------------------------ */
  W.register({
    id: 'flight',
    name: 'Flight',
    blurb: 'Your night as a journey — a gate, a departure, an arrival.',
    lexicon: {
      tonight: 'Tonight', logbook: 'Logbook', learn: 'Briefing', you: 'You',
      settledKicker: 'Departed',
      settledLine: 'Cabin lights are off. Nothing to watch until morning.'
    },

    scene: function (model, journey, api) {
      var box = el('div', { class: 'f-wrap' });

      /* ---------------- TONIGHT ---------------- */
      if (journey === 'tonight') {
        if (model.need) {
          box.appendChild(header('Tonight', 'One thing before we can file it.'));
          box.appendChild(t('p', 'f-lede', model.need === 'wake'
            ? 'What time do you need to be up?'
            : 'After Fajr tomorrow, back to sleep or stay up?'));
          var opts = el('div', { class: 'f-opts' });
          (model.need === 'wake' ? ['05:30', '06:30', '07:30'] : ['Back to sleep', 'Stay up'])
            .forEach(function (o) {
              opts.appendChild(el('button', { class: 'f-opt', type: 'button',
                text: model.need === 'wake' ? api.fmt(api.engine.toMinutes(o)) : o,
                onclick: function () {
                  if (model.need === 'wake') A.answerWake(model, o);
                } }));
            });
          box.appendChild(opts);
          return box;
        }

        /* The boarding pass. Rich on purpose — this is the moment where
           anticipation is useful, because it happens before bed. */
        var pass = el('section', { class: 'f-pass' });
        var stub = el('div', { class: 'f-stub' });
        stub.appendChild(t('span', 'f-stub-k', 'TONIGHT'));
        stub.appendChild(t('b', 'f-stub-v', api.dur(model.total)));
        stub.appendChild(t('span', 'f-stub-s', model.shown.mode === 'fajr'
          ? 'two blocks' : 'one block'));
        pass.appendChild(stub);

        var body = el('div', { class: 'f-pass-body' });
        body.appendChild(t('p', 'f-kicker', model.saved ? 'Filed' : 'Proposed'));
        body.appendChild(t('h1', 'f-title', 'Gate opens ' + model.stages[0].time + '.'));
        var r = routeStrip(model);
        if (r) body.appendChild(r);

        var board = el('div', { class: 'f-board', role: 'list' });
        model.stages.forEach(function (s) {
          board.appendChild(flapRow(s, STAGE[s.key].label));
        });
        body.appendChild(board);
        pass.appendChild(body);
        box.appendChild(pass);

        if (!model.saved) {
          box.appendChild(el('button', { class: 'f-go', type: 'button', id: 'wGo',
            text: 'File this night', onclick: function () { A.acceptPlan(model); } }));
        } else if (model.phase === 'SLEEP') {
          box.appendChild(el('button', { class: 'f-go', type: 'button', id: 'wGo',
            text: 'Good night', onclick: function () { A.settle(); } }));
        }
        box.appendChild(el('button', { class: 'f-alt', type: 'button', id: 'wAdjust',
          text: 'Something is different tonight',
          onclick: function () { A.go('adjust'); } }));
        box.appendChild(t('p', 'f-foot',
          'Built from your usual waking hour and tonight’s Fajr. Nothing is measured.'));
        return box;
      }

      /* ---------------- LOGBOOK ---------------- */
      if (journey === 'logbook') {
        box.appendChild(header('Logbook', model.history.length
          ? model.history.length + ' nights recorded.'
          : 'No nights yet.'));

        if (model.needsRecord && model.phase === 'WAKE') {
          var card = el('section', { class: 'f-arrival' });
          card.appendChild(t('p', 'f-kicker', 'Arrival report'));
          card.appendChild(t('p', 'f-lede', 'How did last night leave you?'));
          var seg = el('div', { class: 'f-seg', role: 'group', 'aria-label': 'Rested' });
          for (var i = 1; i <= 5; i++) (function (v) {
            seg.appendChild(el('button', { type: 'button', text: String(v),
              'aria-label': 'Rested ' + v + ' of 5', 'data-v': v,
              onclick: function () {
                var saved = A.record({ rest: v, energy: v, focus: v });
                card.innerHTML = '';
                card.classList.add('f-stamped');
                card.appendChild(t('p', 'f-kicker', 'Logged'));
                card.appendChild(t('p', 'f-lede', saved
                  ? 'Arrival recorded. Nothing else this morning.'
                  : 'Could not record that.'));
              } }));
          })(i);
          card.appendChild(seg);
          box.appendChild(card);
        }

        var list = el('ol', { class: 'f-log' });
        model.history.slice(-7).reverse().forEach(function (n) {
          var mins = api.engine.sleepMinutesOf(n);
          var li = el('li', { class: 'f-log-row' });
          li.appendChild(t('span', 'f-log-date', n.date.slice(5)));
          li.appendChild(t('b', 'f-log-dur', mins === null ? 'unknown' : api.dur(mins)));
          li.appendChild(t('span', 'f-log-felt', 'felt ' + (n.rest || '—') + '/5'));
          list.appendChild(li);
        });
        if (model.history.length) box.appendChild(list);
        else box.appendChild(t('p', 'f-foot', 'Record a morning and this fills in.'));
        return box;
      }

      /* ---------------- BRIEFING ---------------- */
      if (journey === 'learn') {
        box.appendChild(header('Briefing', 'A few things worth knowing.'));
        [['Two blocks is a normal shape',
          'Sleeping either side of Fajr has been ordinary across most of human history. What matters is the total opportunity and a steady waking hour, not whether the night arrived in one piece.'],
         ['The hour before the gate does the work',
          'Falling asleep is something the body gets ready for. That is why the night starts with a gate time rather than a bedtime.'],
         ['There is no score here',
          'A phone cannot measure your sleep. It can hold the times you gave it and be honest about the difference.']
        ].forEach(function (pair) {
          var d = el('details', { class: 'f-disc' });
          d.appendChild(el('summary', { text: pair[0] }));
          d.appendChild(t('p', 'f-disc-b', pair[1]));
          box.appendChild(d);
        });
        return box;
      }

      /* ---------------- ADJUST ---------------- */
      if (journey === 'adjust') {
        box.appendChild(header('Schedule change', 'What is different tonight?'));
        SITUATIONS.forEach(function (s) {
          box.appendChild(el('button', { class: 'f-opt f-opt-wide', type: 'button',
            'data-sit': s.id,
            onclick: function () {
              var built = A.adjust(model, s);
              var out = box.querySelector('.f-revised');
              if (out) out.remove();
              var panel = el('section', { class: 'f-revised' });
              if (!built) {
                panel.appendChild(t('p', 'f-lede', 'Not enough to re-file that night.'));
              } else {
                panel.appendChild(t('p', 'f-kicker', 'Revised'));
                panel.appendChild(t('h2', 'f-title',
                  'Gate opens ' + api.fmt(built.windStart) + '.'));
                panel.appendChild(t('p', 'f-lede', 'Departure ' + api.fmt(built.sleepStart) +
                  ', arrival ' + api.fmt(api.engine.toMinutes(api.engine.planFinalWake(built))) + '.'));
                panel.appendChild(el('button', { class: 'f-go', type: 'button', id: 'wRefile',
                  text: 'Re-file tonight', onclick: function () { A.commit(built); A.go('tonight'); } }));
              }
              box.appendChild(panel);
            } }, [t('b', 'f-opt-l', s.label), t('span', 'f-opt-d', s.detail)]));
        });
        return box;
      }

      /* ---------------- YOU ---------------- */
      box.appendChild(header('You', 'Settings, data and worlds.'));
      var worldBox = el('section', { class: 'f-worlds' });
      worldBox.appendChild(t('p', 'f-kicker', 'World'));
      worldBox.appendChild(t('p', 'f-foot',
        'Changing world changes how SleepSphere looks. Your nights, your schedule and your settings stay exactly as they are.'));
      W.list().forEach(function (world) {
        worldBox.appendChild(el('button', {
          class: 'f-opt f-opt-wide', type: 'button', 'data-world': world.id,
          'aria-pressed': String(world.id === 'flight'),
          onclick: function () { A.setWorld(world.id); }
        }, [t('b', 'f-opt-l', world.name), t('span', 'f-opt-d', world.blurb)]));
      });
      box.appendChild(worldBox);
      box.appendChild(t('p', 'f-foot',
        'Prayer times, your records and the study export are unchanged by any of this.'));
      return box;
    }
  });
})();
