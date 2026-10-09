/**
 * SleepSphere — three interactive concepts, for direction only.
 *
 * Same four moments in all three: arriving in the evening, planning
 * tonight, recording a fragmented night, understanding the morning.
 * Three genuinely different interaction models, not three skins.
 *
 *   A · ORBIT      ambient instrument. One object, time is the navigation,
 *                  almost no chrome. Confirm by holding, not tapping.
 *   B · COMPANION  conversational. Everything is a reply; chips carry the
 *                  whole journey for anyone who will not type.
 *   C · ATLAS      structured cards. Apple-like hierarchy, strict one
 *                  decision per card, intelligence folded into disclosures.
 *
 * All three read the real engine (SS.engine) for plan times, Fajr and
 * records, and all three speak through ConceptAI, which is deterministic
 * local code with no network, no key and no cost. Nothing here writes to a
 * participant record: concepts propose, they never save.
 *
 * Entry: ?concept=a|b|c (or ?concept=pick). Off otherwise.
 */
(function () {
  'use strict';
  var SS = window.SS, AI = window.ConceptAI;
  if (!SS || !AI) return;

  var params = new URLSearchParams(location.search);
  var asked = params.get('concept');
  if (asked) { try { localStorage.setItem('ss_concept', asked); } catch (e) {} }
  var which = asked;
  if (!which) { try { which = localStorage.getItem('ss_concept'); } catch (e) {} }
  if (!which || which === 'off') return;

  document.documentElement.dataset.ui = 'concept';

  var CONCEPTS = [['a', 'Orbit'], ['b', 'Companion'], ['c', 'Atlas']];
  var SCENES = [['evening', 'Evening'], ['plan', 'Plan'], ['record', 'Night'], ['morning', 'Morning']];
  var scene = params.get('scene') || 'evening';
  if (!SCENES.some(function (s) { return s[0] === scene; })) scene = 'evening';

  /* ---------------------------------------------------------------- */
  var E = SS.engine;
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  var t = function (tag, cls, text) { return el(tag, { class: cls, text: text }); };
  var fmt = function (mins) { return E.formatTime(mins); };

  function aiBadge(label) {
    return el('p', { class: 'cx-ai', text: label || 'SleepSphere · simulated' });
  }

  /* The night the engine would actually propose tonight. Shared by all
     three so they are compared on identical facts. */
  function tonight() {
    var saved = E.tonightsPlan();
    if (saved) return { plan: saved, saved: true, knowledge: E.knowledge() };
    var k = E.knowledge();
    if (k.missing.length || k.asksTonight) return { plan: null, need: k.missing[0] || 'habit', knowledge: k };
    var built = E.buildNight({ target: k.target, settle: k.settle, wind: k.wind,
      fajr: k.fajr, wake: k.usualWake, afterFajr: k.habit });
    return { plan: built, saved: false, knowledge: k, need: built ? null : 'wake' };
  }

  function history() { return E.trustedMornings(); }

  /* A realistic fragmented night, used by the morning scene in all three.
     Not written to any record — it is a view model for the concept. */
  function lastNight() {
    var h = history();
    var real = h[h.length - 1];
    if (real) return real;
    return { date: E.studyToday(), bedTime: '22:30', sleepTime: '23:10',
             wakeTime: '06:30', awakeMinutes: 35, napMinutes: 0,
             opportunityMinutes: 480, sleepMinutes: 405, rest: 3, energy: 3,
             focus: 3, calm: null, factors: [], verified: 'entered' };
  }

  /* ================================================================ */
  /* A · ORBIT                                                         */
  /* ================================================================ */
  function dial(plan, markerFraction) {
    /* A 24-hour ring. The arc is tonight's opportunity, drawn from the
       engine's own minutes — not a decorative circle. */
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    var R = 42, CX = 50, CY = 50;
    var pt = function (min) {
      var a = (min / 1440) * Math.PI * 2 - Math.PI / 2;
      return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
    };
    var track = document.createElementNS(ns, 'circle');
    track.setAttribute('cx', CX); track.setAttribute('cy', CY);
    track.setAttribute('r', R); track.setAttribute('class', 'a-track');
    svg.appendChild(track);

    if (plan) {
      var from = plan.sleepStart, to = E.toMinutes(E.planFinalWake(plan) || '06:30');
      var sweep = ((to - from) + 1440) % 1440;
      var a0 = pt(from), a1 = pt(to);
      var arc = document.createElementNS(ns, 'path');
      arc.setAttribute('d', 'M ' + a0[0] + ' ' + a0[1] +
        ' A ' + R + ' ' + R + ' 0 ' + (sweep > 720 ? 1 : 0) + ' 1 ' + a1[0] + ' ' + a1[1]);
      arc.setAttribute('class', 'a-arc');
      svg.appendChild(arc);
      [[plan.windStart, 'wind'], [plan.sleepStart, 'sleep'], [to, 'up']].forEach(function (m) {
        var p = pt(m[0]);
        var dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]);
        dot.setAttribute('r', m[1] === 'sleep' ? 2.6 : 1.7);
        dot.setAttribute('class', 'a-knob');
        svg.appendChild(dot);
      });
    }
    ['12 am', '6', '12 pm', '6'].forEach(function (label, i) {
      var p = pt(i * 360);
      var txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', p[0]); txt.setAttribute('y', p[1] + (i === 0 ? -4 : i === 2 ? 7 : 1.6));
      txt.setAttribute('class', 'a-tick'); txt.textContent = label;
      svg.appendChild(txt);
    });
    return svg;
  }

  function conceptA(stage) {
    var wrap = el('div', { class: 'a-wrap' });
    var n = tonight();

    if (scene === 'evening' || scene === 'plan') {
      var plan = n.plan;
      var ring = el('div', { class: 'a-dial' });
      ring.appendChild(dial(plan));
      var core = el('div', { class: 'a-core' });
      if (plan) {
        core.appendChild(el('b', { text: fmt(plan.windStart) }));
        core.appendChild(el('span', { text: 'wind down' }));
      } else {
        core.appendChild(el('b', { text: '—' }));
        core.appendChild(el('span', { text: 'one answer needed' }));
      }
      ring.appendChild(core);
      wrap.appendChild(ring);

      if (plan) {
        wrap.appendChild(t('p', 'a-line', scene === 'evening'
          ? 'Tonight is drawn.'
          : 'Asleep by ' + fmt(plan.sleepStart) + ', up at ' +
            fmt(E.toMinutes(E.planFinalWake(plan))) + '.'));
        wrap.appendChild(t('p', 'a-sub', scene === 'evening'
          ? 'Hold to accept. Turn the ring to change it.'
          : 'The outer ring is the whole day. The lit arc is your night.'));

        /* Hold-to-confirm: deliberate, quiet, and impossible to do by
           accident on a phone in bed. */
        var hold = el('button', { class: 'a-hold', type: 'button', id: 'aHold',
          'data-holding': 'no', 'aria-label': 'Hold to accept tonight' });
        hold.appendChild(el('div', { class: 'a-fill' }));
        hold.appendChild(el('span', { text: 'Hold' }));
        var timer = null;
        var start = function () {
          hold.dataset.holding = 'yes';
          timer = setTimeout(function () {
            hold.querySelector('span').textContent = 'Set';
            if (!n.saved && plan) E.commitPlan(plan);
          }, 900);
        };
        var stop = function () {
          hold.dataset.holding = 'no'; clearTimeout(timer);
        };
        ['pointerdown'].forEach(function (ev) { hold.addEventListener(ev, start); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
          hold.addEventListener(ev, stop);
        });
        /* Keyboard and screen-reader path: holding is a gesture, so there
           must be an ordinary activation too. */
        hold.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            hold.querySelector('span').textContent = 'Set';
            if (!n.saved && plan) E.commitPlan(plan);
          }
        });
        wrap.appendChild(hold);
      } else {
        wrap.appendChild(t('p', 'a-line', 'When do you need to be up?'));
        wrap.appendChild(t('p', 'a-sub', 'SleepSphere will not guess this one.'));
        var row = el('div', { class: 'b-chips', style: 'justify-content:center;margin-top:22px' });
        ['05:30', '06:30', '07:30'].forEach(function (time) {
          row.appendChild(el('button', { class: 'b-chip', type: 'button',
            text: fmt(E.toMinutes(time)), onclick: function () {
              var k = n.knowledge;
              var built = E.buildNight({ target: k.target, settle: k.settle, wind: k.wind,
                fajr: k.fajr, wake: time, afterFajr: k.habit });
              if (built) { E.commitPlan(built); render(); }
            } }));
        });
        wrap.appendChild(row);
      }

      if (plan) {
        var why = el('div', { style: 'margin-top:26px;max-width:32ch' });
        why.appendChild(aiBadge());
        why.appendChild(t('p', 'a-sub', AI.explainPlan(plan, n.knowledge, E)[1] ||
          AI.explainPlan(plan, n.knowledge, E)[0] || ''));
        wrap.appendChild(why);
      }
    }

    if (scene === 'record') {
      wrap.appendChild(t('p', 'a-line', 'Say what happened.'));
      wrap.appendChild(t('p', 'a-sub',
        'Or tap the ring where you woke. Both end in the same place.'));
      var box = el('div', { style: 'width:100%;max-width:340px;margin-top:22px' });
      var ta = el('textarea', { id: 'aSay', rows: '3',
        placeholder: 'woke for Fajr, back to sleep around 5:30, up at 7',
        style: 'width:100%;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:inherit;font:400 15px/1.4 inherit;resize:none' });
      box.appendChild(ta);
      var out = el('div', { id: 'aOut', style: 'margin-top:14px;text-align:left' });
      box.appendChild(el('button', { class: 'b-chip', type: 'button', id: 'aRead',
        text: 'Read it', style: 'margin-top:10px;width:100%',
        onclick: function () { out.innerHTML = ''; out.appendChild(proposalCard(ta.value)); } }));
      box.appendChild(out);
      wrap.appendChild(box);
    }

    if (scene === 'morning') {
      var rec = lastNight();
      var read = AI.readMorning(rec, history(), E);
      var ring2 = el('div', { class: 'a-dial' });
      ring2.appendChild(dial(n.plan));
      var core2 = el('div', { class: 'a-core' });
      var mins = E.sleepMinutesOf(rec);
      core2.appendChild(el('b', { text: mins === null ? '—' : E.formatDuration(mins) }));
      core2.appendChild(el('span', { text: mins === null ? 'length unknown' : 'last night' }));
      ring2.appendChild(core2);
      wrap.appendChild(ring2);
      wrap.appendChild(aiBadge());
      wrap.appendChild(t('p', 'a-line', read.line));
      if (read.warm) wrap.appendChild(t('p', 'a-sub', read.warm));
    }

    stage.appendChild(wrap);
  }

  /* The proposal card — shared by A and B, because the rule is shared:
     intelligence proposes, the person confirms, nothing is written here. */
  function proposalCard(text) {
    var n = tonight();
    var p = AI.readNight(text, { fajr: n.knowledge && n.knowledge.fajr });
    var card = el('div', { class: 'b-card' });
    card.appendChild(el('h4', { text: 'What I would record' }));
    var rows = [
      ['In bed', p.bedTime],
      ['Up', p.wakeTime],
      ['Awake in the night', p.awakeMinutes === null ? null : p.awakeMinutes + ' min'],
      ['Woke for Fajr', p.wokeForFajr ? 'yes' : null],
      ['How much was sleep', p.durationUnknown ? null : 'calculated from the times']
    ];
    rows.forEach(function (r) {
      var row = el('div', { class: 'b-row' });
      row.appendChild(el('b', { text: r[0] }));
      row.appendChild(el('i', { class: r[1] ? '' : 'b-unknown',
        text: r[1] || 'not known — left blank' }));
      card.appendChild(row);
    });
    p.notes.forEach(function (note) { card.appendChild(t('p', 'cx-note', note)); });
    card.appendChild(t('p', 'cx-note',
      'Nothing is saved until you confirm, and anything marked “not known” stays blank in the record and in the research export.'));
    var actions = el('div', { class: 'b-chips', style: 'margin-top:12px' });
    actions.appendChild(el('button', { class: 'b-chip', type: 'button', id: 'aConfirm',
      text: 'That is right', onclick: function () {
        card.innerHTML = '';
        card.appendChild(el('h4', { text: 'Recorded' }));
        card.appendChild(t('p', 'cx-note',
          'In the real app this writes through the existing morning save, so supersession, provenance and the export behave exactly as they do today. The concept does not write.'));
      } }));
    actions.appendChild(el('button', { class: 'b-chip', type: 'button',
      text: 'Let me fix it', onclick: function () {
        card.appendChild(t('p', 'cx-note',
          'Each line above becomes editable here — the plain form, with the parsed values already filled in. The non-AI path is the same screen with nothing pre-filled.'));
      } }));
    card.appendChild(actions);
    return card;
  }

  /* ================================================================ */
  /* B · COMPANION                                                     */
  /* ================================================================ */
  function conceptB(stage) {
    var thread = el('div', { class: 'b-thread', id: 'bThread' });
    var n = tonight();

    function say(text, opts) {
      var o = opts || {};
      var wrap = el('div', { style: 'display:flex;flex-direction:column;align-items:' +
        (o.mine ? 'flex-end' : 'flex-start') });
      if (!o.mine && o.badge !== false) wrap.appendChild(aiBadge());
      wrap.appendChild(el('div', { class: 'b-msg' + (o.mine ? ' b-mine' : '') + (o.big ? ' b-big' : ''),
        text: text }));
      thread.appendChild(wrap);
      return wrap;
    }
    function chips(list, onPick) {
      var row = el('div', { class: 'b-chips' });
      list.forEach(function (label) {
        row.appendChild(el('button', { class: 'b-chip', type: 'button', text: label,
          onclick: function () { row.remove(); say(label, { mine: true }); onPick(label); } }));
      });
      thread.appendChild(row);
      return row;
    }

    if (scene === 'evening' || scene === 'plan') {
      if (n.plan) {
        say('Good evening.', { big: true });
        say('Tonight: wind down at ' + fmt(n.plan.windStart) + ', asleep by ' +
            fmt(n.plan.sleepStart) + ', up at ' +
            fmt(E.toMinutes(E.planFinalWake(n.plan))) + '.', { badge: false });
        chips(AI.chipsFor('evening'), function (pick) {
          if (pick === 'That works') {
            if (!n.saved) E.commitPlan(n.plan);
            say('Set. Nothing else tonight.');
            return;
          }
          var k = n.knowledge;
          var wake = pick === 'Early start tomorrow' ? '05:30' : k.usualWake;
          var target = pick === 'I will be up later' ? k.target - 60 : k.target;
          var built = E.buildNight({ target: Math.max(240, target), settle: k.settle,
            wind: k.wind, fajr: k.fajr, wake: wake, afterFajr: k.habit });
          if (!built) { say('I cannot work that out without knowing when you need to be up.'); return; }
          say('Then wind down at ' + fmt(built.windStart) + ' instead, asleep by ' +
              fmt(built.sleepStart) + '.');
          chips(['Use that', 'Leave it as it was'], function (c) {
            if (c === 'Use that') { E.commitPlan(built); say('Changed.'); }
            else say('Left as it was.');
          });
        });
      } else {
        say('Good evening.', { big: true });
        say('I have everything except one thing — when do you need to be up?', { badge: false });
        chips(['05:30', '06:30', '07:30', 'Something else'], function (pick) {
          if (pick === 'Something else') {
            say('Tell me the time and I will build around it.');
            return;
          }
          var k = n.knowledge;
          var built = E.buildNight({ target: k.target, settle: k.settle, wind: k.wind,
            fajr: k.fajr, wake: pick, afterFajr: k.habit });
          if (built) { E.commitPlan(built); say('Then wind down at ' + fmt(built.windStart) + '. Done.'); }
        });
      }
    }

    if (scene === 'record') {
      say('Good morning.', { big: true });
      say('How was the night?', { badge: false });
      chips(AI.chipsFor('record'), function (pick) {
        if (pick === 'Not sure') {
          say('That is a real answer. I will keep the times I know and leave the length blank.');
          thread.appendChild(proposalCard('not sure'));
          return;
        }
        if (pick === 'Up for Fajr') {
          say('Did you go back to sleep after?');
          chips(['Yes, I know roughly when', 'Yes, but not sure how long', 'No, stayed up'],
            function (c) {
              thread.appendChild(proposalCard(
                c === 'Yes, but not sure how long'
                  ? 'woke for fajr, back to sleep, not sure how long'
                  : c === 'No, stayed up'
                    ? 'woke for fajr at 4:45 and stayed up, got up at 6:30'
                    : 'woke for fajr, back to sleep around 5:10, up at 6:30'));
            });
          return;
        }
        thread.appendChild(proposalCard(
          pick === 'Slept straight through'
            ? 'in bed 22:30, up at 6:30, slept straight through'
            : 'in bed 22:30, up at 6:30, awake about an hour'));
      });
    }

    if (scene === 'morning') {
      var rec = lastNight();
      var read = AI.readMorning(rec, history(), E);
      say('Good morning.', { big: true });
      say(read.line, { badge: false });
      if (read.warm) say(read.warm, { badge: false });
      var card = el('div', { class: 'b-card' });
      card.appendChild(el('h4', { text: 'What that is based on' }));
      read.basis.forEach(function (b) {
        var row = el('div', { class: 'b-row' });
        row.appendChild(el('b', { text: b })); card.appendChild(row);
      });
      thread.appendChild(card);
      chips(AI.chipsFor('morning'), function (pick) { say(AI.answer(pick)); });
    }

    stage.appendChild(thread);

    /* Typing and voice are both optional. The chips above complete every
       journey on their own, which is the point. */
    var input = el('div', { class: 'b-input' });
    var ta = el('textarea', { id: 'bInput', rows: '1', 'aria-label': 'Write to SleepSphere',
      placeholder: 'Or just say it…' });
    var mic = el('button', { class: 'b-mic', type: 'button', id: 'bMic',
      'aria-pressed': 'false', 'aria-label': 'Dictate', text: '🎙' });
    mic.addEventListener('click', function () {
      var on = mic.getAttribute('aria-pressed') === 'true';
      mic.setAttribute('aria-pressed', String(!on));
      if (!on) {
        /* Simulated dictation: no microphone is opened. On iOS this would
           be the keyboard's own dictation key, which runs on-device and
           costs nothing — not a third-party speech service. */
        ta.value = 'woke for fajr, back to sleep around 5:10, up at 6:30';
        setTimeout(function () { mic.setAttribute('aria-pressed', 'false'); }, 600);
      }
    });
    var send = el('button', { class: 'b-send', type: 'button', id: 'bSend',
      'aria-label': 'Send', text: '↑' });
    send.addEventListener('click', function () {
      var text = ta.value.trim(); if (!text) return;
      say(text, { mine: true }); ta.value = '';
      if (/\d|fajr|woke|awake|bed|slept/i.test(text)) thread.appendChild(proposalCard(text));
      else say(AI.answer(text));
      stage.scrollTop = stage.scrollHeight;
    });
    input.appendChild(ta); input.appendChild(mic); input.appendChild(send);
    stage.appendChild(input);
    stage.appendChild(t('p', 'cx-note', AI.privacy.onDevice));
  }

  /* ================================================================ */
  /* C · ATLAS                                                         */
  /* ================================================================ */
  function conceptC(stage) {
    var n = tonight();

    if (scene === 'evening' || scene === 'plan') {
      stage.appendChild(t('p', 'c2-head', 'Tonight'));
      if (n.plan) {
        stage.appendChild(t('h1', 'c2-title', 'Wind down at ' + fmt(n.plan.windStart) + '.'));
        var lead = el('div', { class: 'c2-card c2-lead' });
        var steps = el('div', { class: 'c2-steps' });
        [['Wind down', fmt(n.plan.windStart), true],
         ['Asleep', fmt(n.plan.sleepStart), false],
         ['Up', fmt(E.toMinutes(E.planFinalWake(n.plan))), false]].forEach(function (s) {
          var col = el('div', { class: 'c2-step' + (s[2] ? ' on' : '') });
          col.appendChild(el('b', { text: s[1] }));
          col.appendChild(el('span', { text: s[0] }));
          steps.appendChild(col);
        });
        lead.appendChild(steps);
        stage.appendChild(lead);

        if (!n.saved) {
          stage.appendChild(el('button', { class: 'c2-go', type: 'button', id: 'cGo',
            text: 'Use this', onclick: function () { E.commitPlan(n.plan); render(); } }));
        }
        stage.appendChild(el('button', { class: 'c2-alt', type: 'button', id: 'cAdjust',
          text: 'Something is different tonight', onclick: function () {
            var sheet = el('div', { class: 'c2-card' });
            sheet.appendChild(el('p', { class: 'c2-k', text: 'What changed' }));
            [['I will be up later', -60, null], ['Early start', 0, '05:30']].forEach(function (s) {
              sheet.appendChild(el('button', { class: 'c2-alt', type: 'button', text: s[0],
                onclick: function () {
                  var k = n.knowledge;
                  var built = E.buildNight({ target: Math.max(240, k.target + s[1]),
                    settle: k.settle, wind: k.wind, fajr: k.fajr,
                    wake: s[2] || k.usualWake, afterFajr: k.habit });
                  if (built) { E.commitPlan(built); render(); }
                } }));
            });
            stage.appendChild(sheet);
          } }));

        /* Intelligence as a disclosure, never a conversation. Closed by
           default, so the screen stays a statement. */
        var det = el('details', { class: 'c2-disc' });
        det.appendChild(el('summary', { text: 'Why this?' }));
        var body = el('div', { class: 'c2-body' });
        body.appendChild(aiBadge());
        var ul = el('ul');
        AI.explainPlan(n.plan, n.knowledge, E).forEach(function (line) {
          ul.appendChild(el('li', { text: line }));
        });
        body.appendChild(ul);
        det.appendChild(body);
        stage.appendChild(det);
      } else {
        stage.appendChild(t('h1', 'c2-title', 'When do you need to be up?'));
        var card = el('div', { class: 'c2-card' });
        card.appendChild(el('p', { class: 'c2-k', text: 'One answer and tonight is planned' }));
        ['05:30', '06:30', '07:30'].forEach(function (time) {
          card.appendChild(el('button', { class: 'c2-alt', type: 'button',
            text: fmt(E.toMinutes(time)), onclick: function () {
              var k = n.knowledge;
              var built = E.buildNight({ target: k.target, settle: k.settle, wind: k.wind,
                fajr: k.fajr, wake: time, afterFajr: k.habit });
              if (built) { E.commitPlan(built); render(); }
            } }));
        });
        stage.appendChild(card);
      }
    }

    if (scene === 'record') {
      stage.appendChild(t('p', 'c2-head', 'Last night'));
      stage.appendChild(t('h1', 'c2-title', 'How did it leave you?'));
      var picked = { rest: null };
      var card2 = el('div', { class: 'c2-card c2-lead' });
      card2.appendChild(el('p', { class: 'c2-k', text: 'Rested' }));
      var seg = el('div', { class: 'c2-seg' });
      for (var i = 1; i <= 5; i++) (function (v) {
        seg.appendChild(el('button', { type: 'button', text: String(v),
          'aria-pressed': 'false', 'aria-label': 'Rested ' + v + ' of 5',
          onclick: function (e) {
            picked.rest = v;
            Array.prototype.forEach.call(seg.children, function (b) {
              b.setAttribute('aria-pressed', String(b === e.currentTarget));
            });
          } }));
      })(i);
      card2.appendChild(seg);
      var ends = el('div', { class: 'c2-ends' });
      ends.appendChild(el('span', { text: 'Not at all' }));
      ends.appendChild(el('span', { text: 'Very' }));
      card2.appendChild(ends);
      stage.appendChild(card2);

      var frag = el('div', { class: 'c2-card' });
      frag.appendChild(el('p', { class: 'c2-k', text: 'Were you up in the night?' }));
      ['No, straight through', 'Yes, for Fajr', 'Yes, a long time', 'Not sure'].forEach(function (o) {
        frag.appendChild(el('button', { class: 'c2-alt', type: 'button', text: o,
          onclick: function () {
            var existing = stage.querySelector('#cProposal');
            if (existing) existing.remove();
            var box = el('div', { id: 'cProposal' });
            box.appendChild(proposalCard(
              o === 'Not sure' ? 'not sure'
              : o === 'Yes, for Fajr' ? 'woke for fajr, back to sleep around 5:10, up at 6:30'
              : o === 'Yes, a long time' ? 'in bed 22:30, up at 6:30, awake about an hour'
              : 'in bed 22:30, up at 6:30, slept straight through'));
            stage.appendChild(box);
          } }));
      });
      stage.appendChild(frag);

      var det2 = el('details', { class: 'c2-disc' });
      det2.appendChild(el('summary', { text: 'Or describe it in your own words' }));
      var b2 = el('div', { class: 'c2-body' });
      b2.appendChild(el('p', { text: 'Optional. Everything above works without it.' }));
      var ta2 = el('textarea', { rows: '2', id: 'cSay',
        placeholder: 'woke for Fajr, back to sleep around 5:30, up at 7',
        style: 'width:100%;margin-top:8px;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:inherit;font:400 15px/1.4 inherit;resize:none' });
      b2.appendChild(ta2);
      b2.appendChild(el('button', { class: 'c2-alt', type: 'button', text: 'Read it',
        onclick: function () {
          var existing = stage.querySelector('#cProposal');
          if (existing) existing.remove();
          var box = el('div', { id: 'cProposal' });
          box.appendChild(proposalCard(ta2.value));
          stage.appendChild(box);
        } }));
      det2.appendChild(b2);
      stage.appendChild(det2);
    }

    if (scene === 'morning') {
      var rec = lastNight();
      var read = AI.readMorning(rec, history(), E);
      var mins = E.sleepMinutesOf(rec);
      stage.appendChild(t('p', 'c2-head', 'This morning'));
      stage.appendChild(t('h1', 'c2-title', read.line));
      var lead2 = el('div', { class: 'c2-card c2-lead' });
      lead2.appendChild(el('p', { class: 'c2-k', text: 'Last night' }));
      lead2.appendChild(el('p', { class: 'c2-v',
        text: mins === null ? 'Length not known' : E.formatDuration(mins) }));
      lead2.appendChild(el('p', { class: 'c2-vs',
        text: mins === null
          ? 'The times are kept. Nothing is estimated from them.'
          : 'Felt ' + (rec.rest || '—') + ' out of 5.' }));
      stage.appendChild(lead2);
      if (read.warm) {
        var warm = el('div', { class: 'c2-card' });
        warm.appendChild(aiBadge());
        warm.appendChild(el('p', { class: 'c2-vs', text: read.warm }));
        stage.appendChild(warm);
      }
      var det3 = el('details', { class: 'c2-disc' });
      det3.appendChild(el('summary', { text: 'What this is based on' }));
      var b3 = el('div', { class: 'c2-body' });
      var ul3 = el('ul');
      read.basis.forEach(function (x) { ul3.appendChild(el('li', { text: x })); });
      b3.appendChild(ul3);
      b3.appendChild(el('p', { text: AI.privacy.onDevice }));
      det3.appendChild(b3);
      stage.appendChild(det3);
    }
  }

  /* ================================================================ */
  var root = el('div', { id: 'concept' });
  var stage = el('div', { class: 'c-stage', id: 'conceptStage' });

  var bar = el('div', { class: 'cx-bar', id: 'conceptBar' });
  CONCEPTS.forEach(function (c) {
    bar.appendChild(el('button', { type: 'button', text: c[1], 'data-concept': c[0],
      'aria-pressed': String(which === c[0]),
      onclick: function () { location.search = '?concept=' + c[0] + '&scene=' + scene; } }));
  });
  bar.appendChild(el('button', { type: 'button', text: 'Exit', 'data-concept': 'off',
    onclick: function () {
      try { localStorage.setItem('ss_concept', 'off'); } catch (e) {}
      location.search = '?concept=off';
    } }));

  var sceneBar = el('div', { class: 'cx-scenes', id: 'conceptScenes' });
  SCENES.forEach(function (s) {
    sceneBar.appendChild(el('button', { type: 'button', text: s[1], 'data-scene': s[0],
      'aria-pressed': String(scene === s[0]),
      onclick: function () { scene = s[0]; render(); } }));
  });

  function render() {
    stage.innerHTML = '';
    if (which === 'a') conceptA(stage);
    else if (which === 'b') conceptB(stage);
    else conceptC(stage);
    Array.prototype.forEach.call(sceneBar.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.scene === scene));
    });
    window.scrollTo(0, 0);
  }
  window.__conceptRender = render;
  window.__conceptScene = function (s) { scene = s; render(); };

  root.appendChild(stage);
  root.appendChild(bar);
  root.appendChild(sceneBar);
  document.body.appendChild(root);
  render();
})();
