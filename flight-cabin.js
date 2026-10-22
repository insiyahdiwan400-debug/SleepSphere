/**
 * SleepSphere Flight Mode — the cabin.
 *
 * Built to EXACT_VISUAL_REQUIREMENTS.md: a massive rounded window with
 * thick cabin trim dominating a deep midnight cabin, a wing out to the
 * right, and a floating translucent charcoal panel on the left carrying
 * the wordmark, the heading, blue pill toggles and the flight controls.
 *
 * THREE RULES THIS FILE EXISTS TO HOLD.
 *
 * 1. The reference image is a static AI-generated concept. It is not in
 *    this build, it is not behind the window, and nothing here is ever
 *    presented as being it. The window shows recorded video or it says
 *    it has none.
 *
 * 2. Only genuine licensed footage may be a source. Two clips ship with
 *    this app, both CC BY 2.0 and both confirmed H.264 by reading the
 *    `avc1` entry out of the files themselves. Credits are in
 *    CREDITS.md and on screen while a clip plays.
 *
 * 3. A daypart with no clip shows an explicit "Video footage
 *    unavailable" panel. It does not fall back to a still, a gradient,
 *    or a drawn sky dressed up as a view, because any of those would be
 *    a claim of fidelity this build cannot make.
 *
 * WHAT IS DRAWN RATHER THAN FILMED, said plainly: the window frame, the
 * cabin, the trim and the WING are interface chrome, drawn in CSS and
 * SVG. They are not footage and are not claimed to be. The only
 * photographic thing on this screen is what is inside the glass.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     The footage. Only real files, named with their licence.
     ------------------------------------------------------------------ */
  var SCENES = {
    day: {
      label: 'Day',
      mp4: null,                       /* no clip — see CREDITS.md */
      credit: null,
      scrim: 0.18
    },
    sunset: {
      label: 'Sunset',
      mp4: './assets/sky/evening-clouds.mp4',
      credit: 'Evening clouds timelapse — Simon Harrod, CC BY 2.0',
      source: 'https://archive.org/details/Flickr-29145546388',
      scrim: 0.30
    },
    night: {
      label: 'Night',
      mp4: './assets/sky/night-sky.mp4',
      credit: 'Night sky timelapse — Chris Waits, CC BY 2.0',
      source: 'https://archive.org/details/Flickr-8101876985',
      scrim: 0.22
    }
  };

  /* Refuses anything that is not a same-origin media file, so a future
     edit cannot quietly point this at a still image. */
  var MEDIA = /^\.\/[\w\-/]+\.(mp4|webm)$/i;

  var host = null, video = null, state = {
    scene: 'sunset', playing: false, hidden: false,
    cloud: true, dayToNight: true, cabin: false, timer: 0
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function sceneForClock(now) {
    var h = (now || new Date()).getHours();
    if (h >= 7 && h < 16) return 'day';
    if (h >= 16 && h < 20) return 'sunset';
    return 'night';
  }

  /* Which view to OPEN on.
     The honest answer for the hour is not always a usable first
     impression: Day has no licensed clip, so anyone opening Flight Mode
     in the afternoon met "Video footage unavailable" and reasonably
     concluded the whole thing was broken. Opening on the nearest view
     that actually has footage is not a lie — the selector still shows
     all three and Day still tells the truth when chosen. */
  function openingScene() {
    var wanted = sceneForClock();
    if (SCENES[wanted] && SCENES[wanted].mp4) return wanted;
    var order = wanted === 'day' ? ['sunset', 'night'] : ['sunset', 'night', 'day'];
    for (var i = 0; i < order.length; i++) {
      if (SCENES[order[i]] && SCENES[order[i]].mp4) return order[i];
    }
    return wanted;
  }

  /* ------------------------------------------------------------------
     The view inside the glass.
     ------------------------------------------------------------------ */
  function teardownVideo() {
    if (!video) return;
    /* Order matters. Pausing and emptying the source before removing the
       element is what actually releases the decoder; removing the node
       alone leaves it buffering, which on a phone keeps the radio and
       the decoder awake after the screen has gone. This is the cleanup
       that was reported missing. */
    try {
      video.pause();
      video.removeAttribute('src');
      while (video.firstChild) video.removeChild(video.firstChild);
      video.load();
    } catch (e) { /* already gone */ }
    if (video.parentNode) video.parentNode.removeChild(video);
    video = null;
  }

  function buildView(pane) {
    teardownVideo();
    pane.textContent = '';
    var scene = SCENES[state.scene];
    var ok = scene && scene.mp4 && MEDIA.test(scene.mp4) && state.cloud;

    if (!ok) {
      /* The explicit, required fallback. It says which of the two
         reasons applies rather than one vague message. */
      var miss = el('div', 'fc-missing');
      miss.appendChild(el('p', 'fc-missing-head', 'Video footage unavailable'));
      miss.appendChild(el('p', 'fc-missing-note',
        !state.cloud
          ? 'Moving Cloud View is switched off.'
          : 'No licensed clip has been sourced for the ' + (scene ? scene.label : 'this') +
            ' view. Nothing is shown in its place: a still image or a drawn sky ' +
            'here would be a claim this build cannot make.'));
      pane.appendChild(miss);
      pane.dataset.footage = state.cloud ? 'unavailable' : 'off';
      return;
    }

    video = document.createElement('video');
    video.className = 'fc-video';
    video.muted = true; video.defaultMuted = true;
    video.loop = true; video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.setAttribute('disablepictureinpicture', '');
    var src = document.createElement('source');
    src.src = scene.mp4; src.type = 'video/mp4';
    video.appendChild(src);

    pane.dataset.footage = 'loading';
    var waiting = el('div', 'fc-waiting');
    waiting.appendChild(el('p', 'fc-waiting-note', 'Loading recorded footage…'));
    pane.appendChild(waiting);

    /* A clip that never decodes must not leave a black hole where the
       view should be. Some browsers never fire `error` for a codec they
       simply cannot handle — this container's Chromium has no H.264 at
       all and sits in `loading` for ever — so a timeout turns silence
       into the same explicit statement a missing file gets. */
    var timeout = setTimeout(function () {
      if (pane.dataset.footage === 'loading') {
        pane.dataset.footage = 'unavailable';
        buildMissingOver(pane,
          'The clip did not decode in this browser. It is H.264 in an MP4, ' +
          'which iPhone and iPad play; some desktop browsers ship without ' +
          'that decoder. Nothing is shown in its place.');
      }
    }, 12000);

    video.addEventListener('canplay', function () {
      clearTimeout(timeout);
      if (waiting.parentNode) waiting.parentNode.removeChild(waiting);
      pane.dataset.footage = 'ready';
      if (state.playing) tryPlay();
    });
    video.addEventListener('error', function () {
      clearTimeout(timeout);
      pane.dataset.footage = 'error';
      buildMissingOver(pane, 'The clip for this view did not load.');
    });
    pane.appendChild(video);
    pane.style.setProperty('--fc-scrim', String(scene.scrim));
  }

  function buildMissingOver(pane, why) {
    teardownVideo();
    var w = pane.querySelector('.fc-waiting');
    if (w && w.parentNode) w.parentNode.removeChild(w);
    var miss = el('div', 'fc-missing');
    miss.appendChild(el('p', 'fc-missing-head', 'Video footage unavailable'));
    miss.appendChild(el('p', 'fc-missing-note', why));
    pane.appendChild(miss);
  }

  function tryPlay() {
    if (!video) return;
    var p;
    try { p = video.play(); } catch (e) { return; }
    if (p && p.catch) p.catch(function () {
      /* Autoplay refused. Not an error to hide: the button says Start
         Flight and a tap is a gesture, so this usually resolves itself. */
      state.playing = false;
      paint();
    });
  }

  /* ------------------------------------------------------------------
     The panel.
     ------------------------------------------------------------------ */
  function toggleRow(icon, label, key, onChange) {
    var row = el('div', 'fc-row');
    row.appendChild(el('span', 'fc-ico', icon));
    row.appendChild(el('span', 'fc-label', label));
    var sw = el('button', 'fc-switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(Boolean(state[key])));
    sw.setAttribute('aria-label', label);
    sw.appendChild(el('span', 'fc-knob'));
    sw.addEventListener('click', function () {
      state[key] = !state[key];
      sw.setAttribute('aria-checked', String(state[key]));
      if (onChange) onChange(state[key]);
      paint();
    });
    row.appendChild(sw);
    return row;
  }

  function linkRow(icon, label, value, onClick) {
    var b = el('button', 'fc-row fc-row-link');
    b.type = 'button';
    b.appendChild(el('span', 'fc-ico', icon));
    var mid = el('span', 'fc-label');
    mid.appendChild(el('span', 'fc-label-main', label));
    mid.appendChild(el('span', 'fc-label-sub', value));
    b.appendChild(mid);
    b.appendChild(el('span', 'fc-chev', '›'));
    b.addEventListener('click', onClick);
    return b;
  }

  function sessionLine() {
    /* The reference shows an airline route. This shows the session,
       because a sleep app inventing LHR → JFK would be stating a fact
       about a flight nobody is on. The number is the plan's own. */
    var e = window.SS && window.SS.engine;
    var plan = e && e.tonightsPlan ? e.tonightsPlan() : null;
    var mins = plan && plan.total ? plan.total : null;
    return {
      head: 'Tonight’s rest',
      sub: mins && e.formatDuration ? e.formatDuration(mins) + ' · time to rest'
                                    : 'A quiet place to settle'
    };
  }

  function paint() {
    if (!host) return;
    host.dataset.scene = state.scene;
    host.dataset.hidden = String(state.hidden);
    var play = host.querySelector('#fcPlay');
    if (play) {
      play.textContent = state.playing ? '❚❚  Pause Flight' : '▶  Start Flight';
      play.setAttribute('aria-label', state.playing ? 'Pause the flight' : 'Start the flight');
    }
    host.querySelectorAll('.fc-scene').forEach(function (b) {
      var on = b.dataset.scene === state.scene;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    var credit = host.querySelector('#fcCredit');
    var sc = SCENES[state.scene];
    if (credit) {
      if (sc && sc.credit && state.cloud) {
        credit.hidden = false;
        credit.textContent = sc.credit;
        credit.href = sc.source || '#';
      } else { credit.hidden = true; }
    }
  }

  function setScene(next) {
    if (!SCENES[next]) return;
    state.scene = next;
    var pane = host && host.querySelector('.fc-pane');
    if (pane) buildView(pane);
    if (state.playing) tryPlay();
    paint();
  }

  /* ------------------------------------------------------------------
     Open and close.
     ------------------------------------------------------------------ */
  function close() {
    teardownVideo();
    if (state.cabin && window.SSExplore) {
      try { window.SSExplore.stopSound('engine'); } catch (e) {}
    }
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    document.documentElement.classList.remove('fc-open');
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  function open() {
    if (host) return host;
    state.scene = openingScene();
    state.hidden = false;
    state.playing = false;

    host = el('div', 'fc');
    host.id = 'flightCabin';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Flight Mode');

    /* --- the window --- */
    var win = el('div', 'fc-window');
    var pane = el('div', 'fc-pane');
    win.appendChild(pane);
    win.appendChild(el('div', 'fc-glass'));          /* reflection */
    win.appendChild(el('div', 'fc-trim'));           /* thick cabin trim */

    /* The wing. Drawn, and labelled as drawn. */
    var wing = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wing.setAttribute('class', 'fc-wing');
    wing.setAttribute('viewBox', '0 0 300 220');
    wing.setAttribute('aria-hidden', 'true');
    wing.innerHTML =
      '<defs><linearGradient id="fcWingG" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#e8eef6"/><stop offset=".55" stop-color="#9fb0c6"/>' +
      '<stop offset="1" stop-color="#5d6b80"/></linearGradient></defs>' +
      '<path d="M300 70 L120 148 L132 160 L300 108 Z" fill="url(#fcWingG)" opacity=".88"/>' +
      '<path d="M300 108 L132 160 L146 168 L300 130 Z" fill="#2b3545" opacity=".72"/>' +
      '<path d="M272 58 L300 70 L300 52 Z" fill="#33405a" opacity=".8"/>';
    win.appendChild(wing);
    host.appendChild(win);

    /* --- the panel --- */
    var panel = el('aside', 'fc-panel');
    panel.setAttribute('aria-label', 'Flight controls');

    var brand = el('div', 'fc-brand');
    brand.appendChild(el('p', 'fc-word', 'SleepSphere'));
    var h = el('h2', 'fc-head');
    h.appendChild(el('span', 'fc-plane', '✈'));
    h.appendChild(el('span', null, 'Flight Mode'));
    brand.appendChild(h);
    brand.appendChild(el('p', 'fc-sub', 'Relax. Drift. Arrive.'));
    panel.appendChild(brand);

    var card = el('div', 'fc-card');
    var s = sessionLine();
    var top = el('div', 'fc-card-top');
    top.appendChild(el('span', 'fc-ico', '◉'));
    var topText = el('span', 'fc-label');
    topText.appendChild(el('span', 'fc-label-main', s.head));
    topText.appendChild(el('span', 'fc-label-sub', s.sub));
    top.appendChild(topText);
    card.appendChild(top);

    card.appendChild(toggleRow('☁', 'Moving Cloud View', 'cloud', function () {
      buildView(pane);
      if (state.playing) tryPlay();
    }));
    card.appendChild(toggleRow('◑', 'Day to Night Transition', 'dayToNight'));
    card.appendChild(toggleRow('♪', 'Cabin Ambience', 'cabin', function (on) {
      if (!window.SSExplore) return;
      try {
        if (on) window.SSExplore.startSound('engine');
        else window.SSExplore.stopSound('engine');
      } catch (e) {}
    }));
    card.appendChild(linkRow('♫', 'Selected Sounds', 'Open the mixer', function () {
      if (window.SSExplore && window.SSExplore.openMixer) window.SSExplore.openMixer();
    }));
    card.appendChild(linkRow('☾', 'Sleep Timer',
      state.timer ? state.timer + ' minutes' : 'Off', function (ev) {
        var next = state.timer === 0 ? 45 : state.timer === 45 ? 90 : 0;
        state.timer = next;
        if (window.SSExplore && window.SSExplore.setSleepTimer) {
          try { window.SSExplore.setSleepTimer(next); } catch (e) {}
        }
        var sub = ev.currentTarget.querySelector('.fc-label-sub');
        if (sub) sub.textContent = next ? next + ' minutes' : 'Off';
      }));
    panel.appendChild(card);

    var play = el('button', 'fc-play');
    play.type = 'button'; play.id = 'fcPlay';
    play.addEventListener('click', function () {
      state.playing = !state.playing;
      if (state.playing) tryPlay(); else if (video) video.pause();
      paint();
    });
    panel.appendChild(play);

    var scenes = el('div', 'fc-scenes');
    scenes.setAttribute('role', 'group');
    scenes.setAttribute('aria-label', 'View');
    ['day', 'sunset', 'night'].forEach(function (k) {
      var b = el('button', 'fc-scene', SCENES[k].label);
      b.type = 'button'; b.dataset.scene = k;
      b.addEventListener('click', function () { setScene(k); });
      scenes.appendChild(b);
    });
    panel.appendChild(scenes);

    var tools = el('div', 'fc-tools');
    var hide = el('button', 'fc-tool', 'Hide controls');
    hide.type = 'button'; hide.id = 'fcHide';
    hide.addEventListener('click', function () { state.hidden = true; paint(); });
    tools.appendChild(hide);
    var exit = el('button', 'fc-tool', 'Exit flight');
    exit.type = 'button'; exit.id = 'fcExit';
    exit.addEventListener('click', close);
    tools.appendChild(exit);
    panel.appendChild(tools);

    host.appendChild(panel);

    /* The way back from hidden controls. A fixed, always-present button
       rather than a tap target on the backdrop: a backdrop tap is
       invisible, and someone who cannot find it is stuck in a screen
       with no way out. This is the reversal that was reported missing. */
    var show = el('button', 'fc-show', 'Show controls');
    show.type = 'button'; show.id = 'fcShow';
    show.addEventListener('click', function () { state.hidden = false; paint(); });
    host.appendChild(show);

    var credit = document.createElement('a');
    credit.id = 'fcCredit';
    credit.className = 'fc-credit';
    credit.target = '_blank'; credit.rel = 'noopener noreferrer';
    credit.hidden = true;
    host.appendChild(credit);

    document.body.appendChild(host);
    document.documentElement.classList.add('fc-open');
    document.addEventListener('keydown', onKey);

    buildView(pane);
    paint();
    return host;
  }

  window.SSFlightCabin = {
    open: open,
    close: close,
    setScene: setScene,
    scenes: function () { return Object.keys(SCENES); },
    /* Which views have a real clip behind them, for anyone asking what
       is actually footage rather than chrome. */
    covered: function () {
      return Object.keys(SCENES).filter(function (k) { return Boolean(SCENES[k].mp4); });
    },
    state: function () {
      return {
        scene: state.scene, playing: state.playing, hidden: state.hidden,
        cloud: state.cloud, cabin: state.cabin, timer: state.timer,
        video: Boolean(video),
        footage: host ? (host.querySelector('.fc-pane') || {}).dataset : null
      };
    }
  };
})();
