/**
 * SleepSphere — preview harness. NOT part of the app.
 *
 * This file exists only on the preview build. It is loaded by one added
 * <script> line in index.html and nothing in the app knows it is here, so
 * the application code on this branch stays byte-identical to the commit
 * being reviewed.
 *
 * It does two things, both required to review a time-of-day interface on a
 * real phone without resetting the phone's clock:
 *
 *   1. Shifts the clock. The daypart buttons move `Date` by a fixed offset
 *      so the app believes it is dawn, midday, evening or bedtime. The
 *      offset is a shift, not a freeze — the clock still ticks forwards, so
 *      current-time behaviour (a wind-down that arrives, an evening that
 *      quietens towards the planned sleep time) still happens while you
 *      watch it.
 *
 *   2. Seeds a night plan, and ONLY a night plan. No morning records, no
 *      Bio Harmony check-ins, no research data, no participant code that
 *      means anything. The evening and bedtime screens need a planned night
 *      to draw; nothing else here needs any history, so there is none. This
 *      is synthetic data created on your device, not a copy of anything.
 *
 * Remove this file and the one <script> line and the build is the commit.
 */
(function () {
  'use strict';

  var DAYPARTS = {
    dawn:    { hour: 6,  minute: 40, label: 'Dawn' },
    day:     { hour: 13, minute: 30, label: 'Day' },
    evening: { hour: 20, minute: 40, label: 'Evening' },
    night:   { hour: 22, minute: 50, label: 'Night' }
  };
  var CHOICE_KEY = 'ss_preview_daypart';
  var STATE_KEY  = 'sleepsphere_state_v2';

  function readChoice() {
    try { return window.localStorage.getItem(CHOICE_KEY); } catch (e) { return null; }
  }
  function writeChoice(value) {
    try {
      if (value) window.localStorage.setItem(CHOICE_KEY, value);
      else window.localStorage.removeItem(CHOICE_KEY);
    } catch (e) { /* private mode: the URL parameter still works */ }
  }

  /* A ?daypart= in the URL wins and is remembered, so the choice survives
     navigation inside the app and an add-to-Home-Screen launch. */
  var requested = null;
  try { requested = new URLSearchParams(window.location.search).get('daypart'); } catch (e) {}
  if (requested === 'live') writeChoice(null);
  else if (requested && DAYPARTS[requested]) writeChoice(requested);

  var choice = readChoice();
  if (choice && !DAYPARTS[choice]) { choice = null; writeChoice(null); }

  /* ------------------------------------------------------------------
     1. The clock.
     ------------------------------------------------------------------ */
  /* Framed previews (the artifact host) cannot register a service worker,
     which leaves a 404 and a console error on every load. Stub it there,
     and there only — a preview served at the top level is a real PWA and
     has to keep its real service worker so Add to Home Screen behaves the
     way it will in production. */
  var framed = (function () {
    try { return window.top !== window.self; } catch (e) { return true; }
  })();
  if (framed && window.navigator && window.navigator.serviceWorker) {
    try {
      window.navigator.serviceWorker.register = function () {
        return Promise.resolve({ scope: location.href, update: function () {} });
      };
    } catch (e) { /* locked down: the 404 is cosmetic either way */ }
  }

  var RealDate = window.Date;
  var offset = 0;

  if (choice) {
    var target = new RealDate();
    target.setHours(DAYPARTS[choice].hour, DAYPARTS[choice].minute, 0, 0);
    offset = target.getTime() - RealDate.now();

    window.Date = class extends RealDate {
      constructor() {
        if (arguments.length === 0) { super(RealDate.now() + offset); return; }
        super(...arguments);
      }
      static now() { return RealDate.now() + offset; }
    };
    window.Date.parse = RealDate.parse;
    window.Date.UTC = RealDate.UTC;
  }

  /* ------------------------------------------------------------------
     2. The night plan, and nothing else.

     Written only when this device has no SleepSphere state at all, so
     anything you do inside the preview survives a daypart switch and a
     reload. "Reset preview" below puts it back.
     ------------------------------------------------------------------ */
  function shiftedToday() {
    return new RealDate(RealDate.now() + offset).toISOString().slice(0, 10);
  }

  function demoState() {
    return {
      version: 3,
      settings: {
        name: '', age: 'adult', target: 480, faith: 'on', installDismissed: false,
        openingOff: true, lastZone: '', locationGranted: false, dim: false,
        intent: 'restore', welcomeSeen: true, mode: 'dark', useCycle: false,
        healthLinked: false, highLatRule: 'seventh', fajrEdited: false,
        usualWake: '06:30', fajrHabit: 'return',
        place: { latitude: 25.2048, longitude: 55.2708, name: 'Dubai' }
      },
      /* A planned night so the evening and bedtime screens have something
         to draw. Wind down 21:50, settle 22:20, asleep 22:35, Fajr 04:45,
         back to sleep until 06:30. */
      plan: {
        mode: 'fajr', fajr: '04:45', returnSleep: '05:10', finalWake: '06:30',
        wakeAnchor: '04:45', savedDate: shiftedToday(), settle: 15, wind: 30,
        windStart: 1310, settleStart: 1340, sleepStart: 1355,
        blockOne: 400, blockTwo: 80, total: 480, target: 480,
        afterFajr: 'return', brainDay: 'hifz',
        obligation: { kind: 'jamea', time: '07:30' }, source: 'build-my-night'
      },
      brainDays: {},
      /* Deliberately empty. A preview has no history to show and none to
         borrow. */
      mornings: [], morningRevisions: [], bioCheckins: [], thoughts: [],
      scans: [], feedback: [], experimentHistory: [], trip: null,
      study: {
        onboarded: true, participantId: 'PREVIEW', startDate: shiftedToday(),
        enrolledAt: new RealDate(RealDate.now() + offset).toISOString(),
        consentAck: true, consentAt: new RealDate(RealDate.now() + offset).toISOString(),
        cohort: 'preview', schemaVersion: 3, storageMode: 'local', lastSeenDay: 1
      }
    };
  }

  function seedIfEmpty() {
    try {
      if (window.localStorage.getItem(STATE_KEY)) return;
      window.localStorage.setItem(STATE_KEY, JSON.stringify(demoState()));
    } catch (e) { /* private mode: the app will show its own storage banner */ }
  }
  seedIfEmpty();

  /* The plan is dated, and the preview is meant to be opened again
     tomorrow. Re-date it rather than letting the evening quietly lose its
     night overnight. */
  function refreshPlanDate() {
    try {
      var raw = window.localStorage.getItem(STATE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      /* Strictly the preview's own seeded plan and nothing else. Anything
         without the PREVIEW participant code belongs to somebody, and this
         function does not touch data that belongs to somebody. */
      if (!parsed || !parsed.study || parsed.study.participantId !== 'PREVIEW') return;
      if (!parsed.plan || parsed.plan.source !== 'build-my-night') return;
      if (parsed.plan.savedDate === shiftedToday()) return;
      parsed.plan.savedDate = shiftedToday();
      window.localStorage.setItem(STATE_KEY, JSON.stringify(parsed));
    } catch (e) {}
  }
  refreshPlanDate();

  /* ------------------------------------------------------------------
     3. The switcher.

     Fixed, small, and collapsible to a dot, because the thing being
     reviewed is the screen underneath it. It never participates in the
     page's layout, so nothing it does changes what you are judging.
     ------------------------------------------------------------------ */
  function build() {
    if (document.getElementById('previewBar')) return;

    var css = document.createElement('style');
    css.textContent = [
      '#previewBar{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:8px;',
      'z-index:2147483647;font:600 11px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;',
      '-webkit-user-select:none;user-select:none;}',
      '#previewBar .pv-panel{display:flex;align-items:center;gap:4px;padding:5px;',
      'background:rgba(10,12,24,.82);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);',
      'border:1px solid rgba(255,255,255,.16);border-radius:999px;',
      'box-shadow:0 6px 20px -10px rgba(0,0,0,.9);}',
      '#previewBar[data-open="no"] .pv-panel{display:none;}',
      '#previewBar button{appearance:none;-webkit-appearance:none;border:0;margin:0;cursor:pointer;',
      'font:inherit;color:#d6d8ea;background:transparent;border-radius:999px;',
      'min-height:30px;padding:0 10px;}',
      '#previewBar button[aria-pressed="true"]{background:#e8eaf8;color:#12152b;}',
      '#previewBar .pv-dot{display:grid;place-items:center;width:30px;height:30px;padding:0;',
      'background:rgba(10,12,24,.82);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);',
      'border:1px solid rgba(255,255,255,.16);box-shadow:0 6px 20px -10px rgba(0,0,0,.9);',
      'color:#d6d8ea;font-size:13px;}',
      '#previewBar[data-open="yes"] .pv-dot{display:none;}',
      '#previewBar .pv-reset{color:#9ea2bd;font-weight:500;padding:0 8px;}',
      '@media (prefers-reduced-motion: no-preference){#previewBar .pv-panel{transition:opacity .15s}}'
    ].join('');
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'previewBar';
    bar.setAttribute('data-open', 'yes');

    var dot = document.createElement('button');
    dot.className = 'pv-dot';
    dot.type = 'button';
    dot.textContent = '◐';
    dot.setAttribute('aria-label', 'Show the preview daypart switcher');
    dot.addEventListener('click', function () { bar.setAttribute('data-open', 'yes'); });

    var panel = document.createElement('div');
    panel.className = 'pv-panel';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Preview daypart');

    Object.keys(DAYPARTS).forEach(function (key) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = DAYPARTS[key].label;
      b.setAttribute('aria-pressed', String(choice === key));
      b.addEventListener('click', function () {
        writeChoice(key);
        /* A full reload, because the clock has to be wrong before the app
           starts rather than after. */
        window.location.search = '?daypart=' + key;
      });
      panel.appendChild(b);
    });

    var live = document.createElement('button');
    live.type = 'button';
    live.textContent = 'Live';
    live.setAttribute('aria-pressed', String(!choice));
    live.addEventListener('click', function () {
      writeChoice(null);
      window.location.search = '?daypart=live';
    });
    panel.appendChild(live);

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'pv-reset';
    reset.textContent = 'Reset';
    reset.setAttribute('aria-label', 'Reset the preview data');
    reset.addEventListener('click', function () {
      if (!window.confirm('Clear everything entered in this preview and start again?')) return;
      try { window.localStorage.removeItem(STATE_KEY); } catch (e) {}
      window.location.reload();
    });
    panel.appendChild(reset);

    var hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'pv-reset';
    hide.textContent = '×';
    hide.setAttribute('aria-label', 'Hide the preview daypart switcher');
    hide.addEventListener('click', function () { bar.setAttribute('data-open', 'no'); });
    panel.appendChild(hide);

    bar.appendChild(panel);
    bar.appendChild(dot);
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
