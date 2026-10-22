/**
 * SleepSphere Worlds — the shared shell.
 *
 * ONE engine, many worlds. A world is a renderer and a vocabulary. It owns
 * no state, performs no sleep arithmetic, and cannot write a record. The
 * shell reads SS.engine once, builds a world-agnostic night model, and
 * hands it to whichever world is selected.
 *
 * The consequence is the product promise: changing world changes nothing
 * but the look. Records, schedule and preferences are untouched, because a
 * world is never given the means to touch them. test/worlds.js asserts the
 * stored state is byte-identical across a switch.
 *
 * ── The inversion ─────────────────────────────────────────────────────
 * Flighty is absorbing because you check it DURING the flight. Sleep is the
 * opposite: the best night is the one where you never look at the phone.
 * So this shell deliberately inverts the loop it is learning from —
 * rich before departure, rich after arrival, and ENFORCED EMPTY in between.
 *
 * That rule lives here, in the shell, not in the worlds, so that no world
 * can ever make the night interesting. See nightGuard().
 */
(function () {
  'use strict';
  var SS = window.SS;
  if (!SS) return;

  var params = new URLSearchParams(location.search);
  var asked = params.get('world');
  if (asked) { try { localStorage.setItem('ss_world', asked); } catch (e) {} }
  var active = asked;
  if (!active) { try { active = localStorage.getItem('ss_world'); } catch (e) {} }
  if (!active || active === 'off') return;

  document.documentElement.dataset.ui = 'world';

  var E = SS.engine;

  /* ------------------------------------------------------------------ */
  /* DOM helpers, shared by every world so they look like one product.   */
  /* ------------------------------------------------------------------ */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function t(tag, cls, text) { return el(tag, { class: cls, text: text }); }

  /* ------------------------------------------------------------------ */
  /* THE NIGHT MODEL                                                     */
  /*                                                                     */
  /* The single thing a world is allowed to see. Built from the engine,  */
  /* frozen, and world-agnostic: no aviation words, no colours, nothing  */
  /* a theme could disagree with. Every world renders THIS.              */
  /* ------------------------------------------------------------------ */
  function buildModel() {
    var resolved = E.phase();
    var phase = resolved && resolved.phase ? resolved.phase : String(resolved);
    /* Morning ends the night on its own, so nobody wakes to a screen still
       telling them to put the phone down. */
    if (phase === 'WAKE' && sessionGet('ss_settled')) sessionDel('ss_settled');
    var plan = E.tonightsPlan();
    var knowledge = E.knowledge();
    var proposed = null, need = null;

    if (!plan) {
      if (knowledge.missing.length || knowledge.asksTonight) {
        need = knowledge.missing[0] || 'habit';
      } else {
        proposed = E.buildNight({
          target: knowledge.target, settle: knowledge.settle, wind: knowledge.wind,
          fajr: knowledge.fajr, wake: knowledge.usualWake, afterFajr: knowledge.habit
        });
        if (!proposed) need = 'wake';
      }
    }

    var shown = plan || proposed;
    var nowMin = (function () { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();

    /* The night as ordered stages. Worlds rename these; they do not
       reorder them and they cannot invent one. */
    var stages = [];
    if (shown) {
      var finalWake = E.planFinalWake(shown);
      stages.push({ key: 'wind',   minutes: shown.windStart });
      stages.push({ key: 'sleep',  minutes: shown.sleepStart });
      if (shown.mode === 'fajr' && shown.fajr) {
        stages.push({ key: 'fajr', minutes: E.toMinutes(shown.fajr) });
        if (shown.returnSleep) stages.push({ key: 'return', minutes: E.toMinutes(shown.returnSleep) });
      }
      if (finalWake) stages.push({ key: 'wake', minutes: E.toMinutes(finalWake) });

      /* "Reached" is measured against the clock the same way the app's own
         phase engine does — forward from wind-down, wrapping midnight. */
      var from = shown.windStart;
      var since = function (m) { return ((m - from) + 1440) % 1440; };
      var elapsed = since(nowMin);
      stages.forEach(function (s) { s.elapsed = since(s.minutes); });

      /* Only inside the night itself does a stage become current. Measuring
         forward from wind-down alone made every hour of the afternoon look
         like it was past arrival, so an evening screen lit "Arrival" hours
         before bed. Outside the window, every stage is simply ahead. */
      var nightLength = stages[stages.length - 1].elapsed;
      var inNight = elapsed <= nightLength;
      var currentIndex = -1;
      if (inNight) {
        stages.forEach(function (s, i) { if (s.elapsed <= elapsed) currentIndex = i; });
      }
      stages.forEach(function (s, i) {
        s.state = i < currentIndex ? 'done' : i === currentIndex ? 'now' : 'ahead';
        s.time = E.formatTime(s.minutes);
      });
    }

    var history = E.trustedMornings();
    var today = E.studyToday();

    return Object.freeze({
      phase: phase,
      plan: plan, proposed: proposed, shown: shown,
      saved: Boolean(plan), need: need, knowledge: knowledge,
      stages: stages,
      total: shown ? shown.total : null,
      history: history,
      lastNight: history.length ? history[history.length - 1] : null,
      needsRecord: !history.some(function (m) { return m.date === today; }),
      /* After Goodnight the shell stops being interesting. See nightGuard.
         Not gated on the SLEEP phase: finishing the Descent IS the act of
         going to bed, and someone who does it at nine o'clock has gone to
         bed at nine o'clock. The morning clears it either way. */
      settled: phase !== 'WAKE' && Boolean(sessionGet('ss_settled'))
    });
  }

  function sessionGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function sessionDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }

  /* ------------------------------------------------------------------ */
  /* ACTIONS — the only way a world changes anything.                    */
  /*                                                                     */
  /* Worlds call these. They do not reach past them. Every one of them   */
  /* goes through SS.engine, which goes through the app's own save path. */
  /* ------------------------------------------------------------------ */
  var actions = {
    acceptPlan: function (model) {
      if (model.saved || !model.shown) return;
      E.commitPlan(model.shown);
      render();
    },
    answerWake: function (model, time) {
      var k = model.knowledge;
      var built = E.buildNight({ target: k.target, settle: k.settle, wind: k.wind,
        fajr: k.fajr, wake: time, afterFajr: k.habit });
      if (built) { E.commitPlan(built); render(); }
    },
    adjust: function (model, situation) {
      var k = model.knowledge;
      var wake = situation.wake || k.usualWake;
      var target = Math.max(240, k.target + (situation.shift || 0));
      var built = E.buildNight({ target: target, settle: k.settle, wind: k.wind,
        fajr: k.fajr, wake: wake, afterFajr: k.habit });
      if (!built) return null;
      return built;
    },
    commit: function (plan) { E.commitPlan(plan); render(); },
    settle: function () { sessionSet('ss_settled', '1'); render(); },
    wake: function () { sessionDel('ss_settled'); render(); },
    /* Recording goes through the engine's single write path. A world
       supplies answers; it never constructs a record. */
    record: function (answers) {
      return E.recordMorning({
        rest: String(answers.rest || 3),
        energy: String(answers.energy || 3),
        focus: String(answers.focus || 3),
        awake: answers.awake || '0',
        nap: '0',
        factors: []
      }, { quick: true });
    },
    go: function (journey) { current = journey; render(); },
    setWorld: function (id) {
      try { localStorage.setItem('ss_world', id); } catch (e) {}
      location.search = '?world=' + id;
    }
  };

  /* ------------------------------------------------------------------ */
  /* THE WORLD REGISTRY                                                  */
  /* ------------------------------------------------------------------ */
  var WORLDS = {};
  window.SSWorlds = {
    register: function (world) { WORLDS[world.id] = world; },
    list: function () { return Object.keys(WORLDS).map(function (k) { return WORLDS[k]; }); },
    el: el, t: t, actions: actions,
    fmt: function (m) { return E.formatTime(m); },
    dur: function (m) { return E.formatDuration(m); },
    engine: E
  };

  /* ------------------------------------------------------------------ */
  /* PLAIN — a world with no theme at all.                               */
  /*                                                                     */
  /* It exists to prove the contract. If the shared system only works    */
  /* when something decorative is layered on it, it is not a system; and */
  /* a participant who wants none of this must still have a product.     */
  /* ------------------------------------------------------------------ */
  SSWorlds.register({
    id: 'plain',
    name: 'Plain',
    blurb: 'No theme. Times, plainly.',
    lexicon: { tonight: 'Tonight', logbook: 'My Sleep', learn: 'Discover', you: 'You' },
    stageLabel: { wind: 'Wind down', sleep: 'Asleep by', fajr: 'Fajr',
                  return: 'Back to sleep', wake: 'Up' },
    scene: function (model, journey, api) {
      var box = el('div', { class: 'w-plain' });
      if (journey === 'tonight') {
        if (!model.shown) {
          box.appendChild(t('h1', 'w-plain-h', 'When do you need to be up?'));
          var row = el('div', { class: 'w-plain-choices' });
          ['05:30', '06:30', '07:30'].forEach(function (time) {
            row.appendChild(el('button', { class: 'w-plain-btn', type: 'button',
              text: api.fmt(api.engine.toMinutes(time)),
              onclick: function () { actions.answerWake(model, time); } }));
          });
          box.appendChild(row);
          return box;
        }
        box.appendChild(t('h1', 'w-plain-h', 'Wind down at ' + model.stages[0].time + '.'));
        var list = el('dl', { class: 'w-plain-list' });
        model.stages.forEach(function (s) {
          list.appendChild(el('dt', { text: this.stageLabel[s.key] }));
          list.appendChild(el('dd', { text: s.time }));
        }, this);
        box.appendChild(list);
        if (!model.saved) box.appendChild(el('button', { class: 'w-plain-go', type: 'button',
          id: 'wGo', text: 'Use this', onclick: function () { actions.acceptPlan(model); } }));
        box.appendChild(el('button', { class: 'w-plain-btn', type: 'button', id: 'wAdjust',
          text: 'Something is different tonight', onclick: function () { actions.go('adjust'); } }));
        return box;
      }
      box.appendChild(t('h1', 'w-plain-h', journey === 'logbook' ? 'Your nights'
        : journey === 'adjust' ? 'What is different?' : 'Settings'));
      box.appendChild(t('p', 'w-plain-p', 'The plain world keeps the same journeys with no imagery.'));
      return box;
    }
  });

  /* ------------------------------------------------------------------ */
  /* THE SHELL                                                           */
  /* ------------------------------------------------------------------ */
  var current = params.get('journey') || 'tonight';
  var root = el('div', { id: 'world' });
  var stage = el('div', { class: 'w-stage', id: 'worldStage' });
  var tabs = el('nav', { class: 'w-tabs', id: 'worldTabs', role: 'tablist' });

  /* The anti-engagement rule, enforced for every world.
     Once the participant has said goodnight, the shell replaces whatever
     the world wanted to draw with one line and one way back. There is no
     live progress through the night, by construction — a world cannot
     opt out of this, because it never gets the chance to render. */
  function nightGuard(model, world) {
    if (!model.settled) return null;
    var box = el('div', { class: 'w-settled' });
    box.appendChild(t('p', 'w-settled-k', (world.lexicon.settledKicker || 'Good night')));
    box.appendChild(t('p', 'w-settled-l',
      world.lexicon.settledLine || 'Nothing more tonight. Put the phone down.'));
    box.appendChild(el('button', { class: 'w-settled-b', type: 'button', id: 'wMorning',
      text: 'I am awake', onclick: function () { actions.wake(); } }));
    box.appendChild(t('p', 'w-settled-n',
      'This screen will not change until morning. There is nothing to check.'));
    return box;
  }

  function render() {
    var world = WORLDS[active] || WORLDS.plain;
    var model = buildModel();

    /* A world may own a persistent layer — a canvas sky, say — that must
       survive the stage being cleared on every render. It is mounted once,
       under #world and behind the stage, and the world keeps the handle. */
    if (world.mount && !world._mounted) { world.mount(root, SSWorlds); world._mounted = true; }
    if (world.sync) world.sync(model, current, SSWorlds);

    document.documentElement.dataset.world = world.id;
    document.documentElement.dataset.daypart =
      model.phase === 'WAKE' ? 'morning' : model.phase === 'DAY' ? 'afternoon'
      : model.phase === 'EVENING' ? 'evening' : 'night';

    stage.innerHTML = '';
    var guarded = nightGuard(model, world);
    stage.appendChild(guarded || world.scene(model, current, SSWorlds));

    tabs.innerHTML = '';
    /* A world may declare itself in an immersive moment — the Descent —
       and navigation is withdrawn for it, not merely hidden. Hiding would
       have left four reachable controls behind a CSS rule. */
    var immersive = document.documentElement.dataset.descending === 'yes';
    if (!guarded && !immersive) {
      [['tonight', world.lexicon.tonight], ['logbook', world.lexicon.logbook],
       ['learn', world.lexicon.learn], ['you', world.lexicon.you]].forEach(function (pair) {
        tabs.appendChild(el('button', { type: 'button', role: 'tab', 'data-journey': pair[0],
          text: pair[1], 'aria-selected': String(current === pair[0]),
          onclick: function () { actions.go(pair[0]); } }));
      });
    }
    window.scrollTo(0, 0);
  }

  SSWorlds.refresh = render;
  SSWorlds.model = buildModel;
  window.__world = {
    render: render,
    model: buildModel,
    go: function (j) { actions.go(j); },
    worlds: function () { return Object.keys(WORLDS); },
    active: function () { return active; },
    settle: function () { actions.settle(); },
    wake: function () { actions.wake(); }
  };

  root.appendChild(stage);
  root.appendChild(tabs);
  document.body.appendChild(root);

  /* Worlds register themselves on load; render after they have. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    setTimeout(render, 0);
  }
})();
