/**
 * Jamea al Anwar — the courtyard at night.
 *
 * WHAT THIS IS, SAID FIRST AND SAID ON SCREEN.
 *
 * Every mark in here is drawn: original SVG, CSS and canvas written for
 * SleepSphere. Nothing is photographed, nothing is traced from a
 * photograph, and no measurement, proportion or ornament is taken from
 * the real building. It is a courtyard at night in the general language
 * of the architecture — arches, a ledge, lanterns, a sky — and it is
 * labelled as that on the screen, permanently, not in a credit nobody
 * opens. When verified photographs are supplied they replace the
 * drawing; until then this makes no claim it cannot support.
 *
 * So the module carries no history and no religious text. Both would be
 * claims, and the brief is explicit: do not invent historical or
 * religious claims, do not invent architectural details. What it carries
 * instead is a place to be, and the thing that actually makes such a
 * place feel alive at night, which is the birds.
 *
 * THE PIGEONS.
 *
 * Each bird is a small state machine, and the behaviour is modelled on
 * what pigeons actually do rather than on what looks busy:
 *
 *   ROOST    sitting. Still, mostly. Occasional head bob, occasional
 *            preen. This is where a bird spends almost all of its time
 *            at night, and the restraint is the point.
 *   SHUFFLE  a short sidestep along the ledge, which is what they do
 *            when a neighbour crowds them. Birds keep an individual
 *            distance and move to restore it.
 *   TAKEOFF  steep, with fast wingbeats. Expensive, so it is rare and
 *            needs a reason.
 *   CIRCLE   a loop out over the courtyard: beats, then a glide, then
 *            beats again.
 *   LAND     back to a free place on the ledge, not necessarily the one
 *            it left.
 *
 * A startle spreads. Tap the courtyard and the birds nearest the tap go
 * first, the others follow with a delay proportional to distance, and
 * some never go at all — a flock does not leave as one animal, and one
 * that does reads as an animation rather than as birds.
 *
 * Left alone, the courtyard gets quieter: the chance of a spontaneous
 * move decays the longer nothing has disturbed it. That is the whole
 * reason this screen exists at bedtime.
 *
 * WHAT IT DOES NOT OWN: audio and the wind-down. Sound comes from
 * SSExplore and the wind-down from SSAssist, both through their public
 * surfaces. There is no second audio engine and no second timer here.
 */
(function () {
  'use strict';

  var host = null, canvas = null, ctx = null, raf = 0;
  var birds = [], lastFrame = 0, calmFor = 0;
  var W = 0, H = 0, DPR = 1;
  /* Where the ledge sits, as a fraction of the stage height. The
     near silhouette's height in anwar.css is 1 - LEDGE, so the
     birds stand on the band the SVG draws rather than near it. */
  var LEDGE = 0.58;

  function calm() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(label, cls, onClick) {
    var b = el('button', cls, label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  /* ------------------------------------------------------------------
     THE LEDGE

     Birds roost in slots. Slots rather than free positions because that
     is how a ledge actually fills: a bird lands in a gap, and the gaps
     are set by how much room the birds beside it leave. Modelling the
     gap directly is less code than modelling the avoidance that creates
     it, and it cannot produce two birds in the same place.
     ------------------------------------------------------------------ */
  var SLOTS = 14;
  function slotX(i) { return (0.08 + (0.84 * i) / (SLOTS - 1)) * W; }
  function ledgeY() { return H * LEDGE; }

  function freeSlot(except) {
    var taken = {};
    birds.forEach(function (b) {
      if (b !== except && (b.mode === 'roost' || b.mode === 'shuffle' || b.mode === 'land')) {
        taken[b.slot] = true;
      }
    });
    var open = [];
    for (var i = 0; i < SLOTS; i++) if (!taken[i]) open.push(i);
    if (!open.length) return except ? except.slot : 0;
    return open[(Math.random() * open.length) | 0];
  }

  function makeBirds(n) {
    birds = [];
    var used = {};
    for (var i = 0; i < n; i++) {
      var slot;
      do { slot = (Math.random() * SLOTS) | 0; } while (used[slot]);
      used[slot] = true;
      birds.push({
        slot: slot,
        x: slotX(slot), y: ledgeY(),
        tx: slotX(slot), ty: ledgeY(),
        mode: 'roost',
        /* Which way it faces. Pigeons on a ledge do not all face the
           same way, and a row that does looks printed. */
        dir: Math.random() < 0.5 ? -1 : 1,
        t: 0,                     /* time in the current mode */
        wait: 2 + Math.random() * 8,
        beat: Math.random() * Math.PI * 2,
        bob: 0,
        /* Individual nerve. Some birds go at the first sign of
           anything; some sit through it. */
        jumpy: 0.25 + Math.random() * 0.7,
        size: 0.86 + Math.random() * 0.3
      });
    }
  }

  /* ------------------------------------------------------------------
     BEHAVIOUR
     ------------------------------------------------------------------ */
  function startle(x, y) {
    /* Someone who asked for no motion gets a still picture, and a tap
       does not quietly rearrange it behind their back. */
    if (calm()) return;
    calmFor = 0;
    birds.forEach(function (b) {
      if (b.mode !== 'roost' && b.mode !== 'shuffle') return;
      /* Distance along the ledge, mostly. The birds are all at one
         height, so vertical distance says little about who is near the
         disturbance — and weighting it equally meant a tap anywhere
         above the ledge was already too far away to reach anyone,
         which made most of the screen a dead control. */
      var dx = (b.x - x) / W;
      var dy = ((b.y - y) / H) * 0.45;
      var d = Math.sqrt(dx * dx + dy * dy);
      var near = Math.max(0, 1 - d * 1.5);
      /* Near birds go, far birds mostly don't, and the nervous ones
         lower the bar for themselves. The floor is what makes a far
         corner of the flock occasionally go anyway. */
      if (Math.random() > near * b.jumpy + 0.06) return;
      b.mode = 'wait-takeoff';
      b.t = 0;
      /* The delay is the spread: it travels outward rather than
         everything leaving on the same frame. */
      b.wait = d * (0.9 + Math.random() * 0.8);
    });
  }

  function step(bird, dt) {
    bird.t += dt;
    bird.beat += dt * (bird.mode === 'circle' || bird.mode === 'takeoff' ? 13 : 0);

    switch (bird.mode) {
      case 'roost':
        /* Almost nothing, which is correct. A head bob, a preen, and
           the occasional decision to move one place along — and all of
           it gets rarer the longer the courtyard has been left alone. */
        bird.bob = Math.max(0, bird.bob - dt * 3);
        if (bird.t > bird.wait) {
          bird.t = 0;
          var settled = Math.min(1, calmFor / 90);
          bird.wait = (3 + Math.random() * 9) * (1 + settled * 3);
          var roll = Math.random();
          if (roll < 0.5) { bird.bob = 1; }
          else if (roll < 0.72) { bird.dir = -bird.dir; }
          else if (roll < 0.82 - settled * 0.2 && !calm()) {
            var next = freeSlot(bird);
            if (next !== bird.slot) {
              bird.slot = next;
              bird.tx = slotX(next);
              bird.dir = bird.tx > bird.x ? 1 : -1;
              bird.mode = 'shuffle';
            }
          }
        }
        break;

      case 'shuffle': {
        /* A walk, not a glide: pigeons step, and the step is visible. */
        var vx = bird.tx - bird.x;
        var move = Math.sign(vx) * Math.min(Math.abs(vx), dt * 26);
        bird.x += move;
        bird.bob = 0.4 + 0.4 * Math.abs(Math.sin(bird.t * 11));
        if (Math.abs(bird.tx - bird.x) < 0.6) {
          bird.x = bird.tx; bird.mode = 'roost'; bird.t = 0; bird.bob = 0;
          bird.wait = 3 + Math.random() * 9;
        }
        break;
      }

      case 'wait-takeoff':
        if (bird.t >= bird.wait) {
          bird.mode = 'takeoff'; bird.t = 0;
          bird.vx = (Math.random() - 0.5) * 60;
          bird.vy = -(150 + Math.random() * 70);
          bird.dir = bird.vx >= 0 ? 1 : -1;
          /* Where it will turn into the circle. */
          bird.apex = H * (0.16 + Math.random() * 0.18);
        }
        break;

      case 'takeoff':
        bird.x += bird.vx * dt;
        bird.y += bird.vy * dt;
        bird.vy += 150 * dt;                 /* the climb costs it */
        if (bird.y <= bird.apex || bird.t > 1.6) {
          bird.mode = 'circle'; bird.t = 0;
          bird.cx = W * (0.25 + Math.random() * 0.5);
          bird.cy = bird.y;
          bird.r = W * (0.14 + Math.random() * 0.16);
          bird.a = Math.atan2(bird.y - bird.cy, bird.x - bird.cx);
          bird.spin = bird.dir * (0.9 + Math.random() * 0.7);
          bird.loops = 0.7 + Math.random() * 1.1;
          /* Angle TRAVELLED, not angle reached. Half the birds circle
             anticlockwise, and against an absolute threshold their
             angle only ever decreased — so they flew until the screen
             was closed. */
          bird.turned = 0;
        }
        break;

      case 'circle': {
        bird.a += bird.spin * dt;
        bird.turned += Math.abs(bird.spin) * dt;
        bird.x = bird.cx + Math.cos(bird.a) * bird.r;
        bird.y = bird.cy + Math.sin(bird.a) * bird.r * 0.42;
        bird.dir = Math.sin(bird.a) * bird.spin >= 0 ? -1 : 1;
        /* Beats, then a glide, then beats. A bird that flaps without
           pause is a moth. */
        var phase = (bird.t * 0.9) % 1;
        bird.gliding = phase > 0.55;
        if (bird.gliding) bird.beat = 0;
        /* The cap is a second lock on the same thing: whatever the
           arithmetic does, no bird stays in the air for half a minute. */
        if (bird.turned > Math.PI * 2 * bird.loops || bird.t > 26) {
          bird.mode = 'land'; bird.t = 0;
          bird.slot = freeSlot(bird);
          bird.tx = slotX(bird.slot);
          bird.ty = ledgeY();
          bird.fromX = bird.x; bird.fromY = bird.y;
          bird.dir = bird.tx > bird.x ? 1 : -1;
        }
        break;
      }

      case 'land': {
        /* A flared approach: fast at first, then almost stopped, which
           is what the braking looks like. */
        var k = Math.min(1, bird.t / 1.25);
        var e = 1 - Math.pow(1 - k, 3);
        bird.x = bird.fromX + (bird.tx - bird.fromX) * e;
        bird.y = bird.fromY + (bird.ty - bird.fromY) * e;
        bird.gliding = k > 0.45;
        if (k >= 1) {
          bird.mode = 'roost'; bird.t = 0; bird.bob = 1;
          bird.wait = 4 + Math.random() * 8;
        }
        break;
      }
    }
  }

  /* ------------------------------------------------------------------
     DRAWING

     A silhouette, because at this size that is all a pigeon is. The
     shape is drawn from primitives rather than a traced path: a traced
     path would be traced from something.
     ------------------------------------------------------------------ */
  function drawBird(b) {
    var s = 11 * b.size;
    var flying = b.mode === 'takeoff' || b.mode === 'circle' || b.mode === 'land';
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(b.dir, 1);
    ctx.fillStyle = 'rgba(16, 24, 36, .92)';

    if (flying && !b.gliding) {
      var lift = Math.sin(b.beat) * s * 1.05;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.1);
      ctx.quadraticCurveTo(-s * 0.9, -s * 0.2 - lift, -s * 1.7, -lift * 0.6);
      ctx.quadraticCurveTo(-s * 0.8, s * 0.2, 0, s * 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.1);
      ctx.quadraticCurveTo(s * 0.9, -s * 0.2 - lift, s * 1.7, -lift * 0.6);
      ctx.quadraticCurveTo(s * 0.8, s * 0.2, 0, s * 0.18);
      ctx.fill();
    } else if (flying) {
      /* The glide: wings out and still. */
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.08);
      ctx.quadraticCurveTo(-s * 1.1, -s * 0.5, -s * 1.9, -s * 0.1);
      ctx.quadraticCurveTo(-s * 0.9, s * 0.16, 0, s * 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.08);
      ctx.quadraticCurveTo(s * 1.1, -s * 0.5, s * 1.9, -s * 0.1);
      ctx.quadraticCurveTo(s * 0.9, s * 0.16, 0, s * 0.18);
      ctx.fill();
    }

    /* Body: the deep chest and the up-tilted tail that make a pigeon a
       pigeon rather than a generic bird. */
    var sit = flying ? 0 : -s * 0.42;
    ctx.beginPath();
    ctx.ellipse(0, sit, s * 0.78, s * 0.52, flying ? 0 : -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, sit - s * 0.1);
    ctx.lineTo(-s * 1.5, sit - (flying ? s * 0.12 : s * 0.42));
    ctx.lineTo(-s * 0.5, sit + s * 0.3);
    ctx.closePath();
    ctx.fill();

    /* Head, on a neck that shortens when it hunches — which is what a
       roosting bird does, and what the bob animates. */
    var neck = flying ? s * 0.52 : s * (0.5 - b.bob * 0.22);
    ctx.beginPath();
    ctx.arc(s * 0.62, sit - neck * 0.62, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.86, sit - neck * 0.66);
    ctx.lineTo(s * 1.18, sit - neck * 0.58);
    ctx.lineTo(s * 0.86, sit - neck * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
    lastFrame = now;
    calmFor += dt;

    ctx.clearRect(0, 0, W, H);
    if (!calm()) birds.forEach(function (b) { step(b, dt); });
    birds.forEach(drawBird);
  }

  function resize() {
    if (!canvas) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    var rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    /* Keep roosting birds on the ledge after a rotation. */
    birds.forEach(function (b) {
      if (b.mode === 'roost' || b.mode === 'shuffle') {
        b.x = slotX(b.slot); b.y = ledgeY(); b.tx = b.x;
      }
    });
  }

  /* ------------------------------------------------------------------
     THE COURTYARD — drawn, and said on screen to be drawn.

     Two silhouettes. The far one keeps its aspect ratio, because a
     stretched dome is a claim about a shape; the near one does not,
     because an arcade reads as an arcade at any width and it has to
     meet both edges of the screen.
     ------------------------------------------------------------------ */
  function svgNode(cls, viewBox, ratio, markup) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', cls);
    s.setAttribute('viewBox', viewBox);
    s.setAttribute('preserveAspectRatio', ratio);
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = markup;
    return s;
  }

  function farScenery() {
    /* A dome between two slender towers. Generic forms in the broad
       language of the architecture, at proportions chosen to sit
       quietly behind the birds — not measured from anything. */
    var m =
      '<g fill="#0a1120">' +
      '<rect x="6" y="38" width="9" height="62" rx="1.4"/>' +
      '<path d="M6 40 Q10.5 30 15 40 Z"/>' +
      '<circle cx="10.5" cy="31" r="2.1"/>' +
      '<rect x="85" y="34" width="9" height="66" rx="1.4"/>' +
      '<path d="M85 36 Q89.5 25 94 36 Z"/>' +
      '<circle cx="89.5" cy="27" r="2.1"/>' +
      '<rect x="22" y="62" width="56" height="38"/>' +
      '<path d="M27 62 A 23 25 0 0 1 50 37 A 23 25 0 0 1 73 62 Z"/>' +
      '<path d="M48.7 38 Q50 29 51.3 38 Z"/>' +
      '<path d="M49.1 31 h1.8 v-8 h-1.8 Z"/>' +
      '</g>';
    return svgNode('anwar-far', '0 0 100 100', 'xMidYMax meet', m);
  }

  function nearScenery() {
    /* A wall with arched openings cut into it, not a row of pillars.
       The first cut drew the piers as solid shapes and left the sky
       showing between them, which made the ledge look as though it were
       floating above nothing. */
    var openings = '';
    for (var i = -1; i < 9; i++) {
      var x = 1 + i * 13;
      openings +=
        '<path d="M' + x + ' 100 L' + x + ' 44 Q' + (x + 4) + ' 25 ' + (x + 8) +
        ' 44 L' + (x + 8) + ' 100 Z" fill="#03060c"/>';
    }
    var m =
      '<rect x="-2" y="9" width="104" height="91" fill="#0a1222"/>' +
      '<g>' + openings + '</g>' +
      '<rect x="-2" y="0" width="104" height="9" fill="#101b2d"/>' +
      '<rect x="-2" y="9" width="104" height="1.6" fill="#05090f"/>';
    return svgNode('anwar-near', '0 0 100 100', 'none', m);
  }

  function lantern(left, delay, scale) {
    var l = el('div', 'anwar-lantern');
    l.style.left = left;
    l.style.setProperty('--anwar-delay', delay);
    l.style.setProperty('--anwar-scale', scale);
    l.appendChild(el('span', 'anwar-cord'));
    l.appendChild(el('span', 'anwar-glass'));
    return l;
  }

  function stars(n) {
    var box = el('div', 'anwar-stars');
    for (var i = 0; i < n; i++) {
      var s = el('span');
      s.style.left = (Math.random() * 100).toFixed(2) + '%';
      s.style.top = (Math.random() * 52).toFixed(2) + '%';
      s.style.setProperty('--anwar-twinkle', (3 + Math.random() * 5).toFixed(1) + 's');
      s.style.setProperty('--anwar-delay', (Math.random() * 5).toFixed(1) + 's');
      s.style.opacity = (0.25 + Math.random() * 0.6).toFixed(2);
      box.appendChild(s);
    }
    return box;
  }

  /* ------------------------------------------------------------------
     SOUND AND THE WIND-DOWN — both borrowed, neither owned.
     ------------------------------------------------------------------ */
  function say(message) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(say.handle);
    say.handle = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  var SOUND = 'night';             /* an SSExplore layer, not a file here */

  function soundAvailable() {
    var E = window.SSExplore;
    return Boolean(E && E.LAYERS && E.LAYERS.some(function (l) { return l.id === SOUND; }));
  }

  function paintSound(button) {
    var E = window.SSExplore;
    var on = Boolean(E && E.playing && E.playing().indexOf(SOUND) > -1);
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? 'Night air playing' : 'Night air';
  }

  /* ------------------------------------------------------------------
     OPEN / CLOSE
     ------------------------------------------------------------------ */
  function onKey(e) { if (e.key === 'Escape') close(); }

  function onVisibility() {
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    else if (host && !raf) { lastFrame = 0; raf = requestAnimationFrame(frame); }
  }

  function close() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null; canvas = null; ctx = null; birds = [];
    document.documentElement.classList.remove('anwar-open');
  }

  function open() {
    if (host) return host;
    host = el('div', 'anwar');
    host.id = 'anwar';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Jamea al Anwar — the courtyard at night');

    var stage = el('div', 'anwar-stage');
    stage.appendChild(el('div', 'anwar-sky'));
    stage.appendChild(stars(46));
    stage.appendChild(el('div', 'anwar-moon'));
    stage.appendChild(farScenery());
    stage.appendChild(nearScenery());
    /* The arcade is the nearest thing on the screen and the darkest, so
       the eye stays on the ledge and the sky. Without this it reads as a
       flat band taking a quarter of the screen. */
    stage.appendChild(el('div', 'anwar-court'));
    stage.appendChild(lantern('16%', '0s', '1'));
    stage.appendChild(lantern('50%', '-1.9s', '1.18'));
    stage.appendChild(lantern('83%', '-3.4s', '.92'));

    canvas = el('canvas', 'anwar-birds');
    canvas.setAttribute('aria-hidden', 'true');
    stage.appendChild(canvas);

    /* The tap target is the courtyard itself. A button marked "scare
       the birds" would be a toy; reaching into the space is the
       interaction. */
    var touch = el('button', 'anwar-touch');
    touch.type = 'button';
    touch.setAttribute('aria-label', 'Disturb the courtyard — the nearest birds will lift');
    touch.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect();
      var x = e.clientX ? e.clientX - r.left : W * Math.random();
      var y = e.clientY ? e.clientY - r.top : H * LEDGE;
      startle(x, y);
    });
    stage.appendChild(touch);

    var shut = btn('\u00d7', 'anwar-close', close);
    shut.setAttribute('aria-label', 'Close the courtyard');
    stage.appendChild(shut);
    host.appendChild(stage);

    /* ---- the panel ---- */
    var panel = el('div', 'anwar-panel');
    panel.appendChild(el('p', 'anwar-eyebrow', 'Jamea al Anwar'));
    panel.appendChild(el('h2', 'anwar-title', 'The courtyard, after dark'));
    panel.appendChild(el('p', 'anwar-note',
      'Tap anywhere in the courtyard and the birds nearest you will lift. ' +
      'Left alone, they settle, and the longer you leave them the less they move.'));

    var row = el('div', 'anwar-row');
    var sound = btn('Night air', 'anwar-btn', function () {
      var E = window.SSExplore;
      if (!E || !soundAvailable()) { say('That sound is not available on this build.'); return; }
      try { E.toggleSound(SOUND); } catch (err) { say('The sound could not start.'); }
      setTimeout(function () { paintSound(sound); }, 120);
    });
    if (!soundAvailable()) { sound.disabled = true; sound.textContent = 'No sound on this build'; }
    row.appendChild(sound);

    var wind = btn('Start my wind-down', 'anwar-btn anwar-primary', async function () {
      if (!window.SSAssist) { say('The wind-down is not loaded on this page.'); return; }
      wind.disabled = true;
      var was = wind.textContent;
      wind.textContent = 'Starting…';
      try {
        /* Awaited inside the tap. Assist owns the sound, the timer and
           the duʿāʾ; this screen owns none of them and starts none of
           them itself. */
        await window.SSAssist.start();
        wind.textContent = 'Wind-down running';
        say('Your wind-down is running. The courtyard stays where it is.');
      } catch (err) {
        wind.textContent = was;
        say(err && err.message ? err.message : 'The wind-down could not start.');
      } finally { wind.disabled = false; }
    });
    row.appendChild(wind);
    panel.appendChild(row);

    /* Permanent, not a credit nobody opens. */
    panel.appendChild(el('p', 'anwar-provenance',
      'Everything you can see here is drawn — original SVG, CSS and canvas ' +
      'made for SleepSphere. It is a courtyard at night, not a picture of ' +
      'the building: no proportion, ornament or detail is taken from it, and ' +
      'none is claimed. Verified photographs will replace this drawing.'));
    host.appendChild(panel);

    document.body.appendChild(host);
    document.documentElement.classList.add('anwar-open');
    requestAnimationFrame(function () { host.classList.add('on'); });

    resize();
    makeBirds(calm() ? 9 : 11);
    paintSound(sound);
    lastFrame = 0; calmFor = 0;
    raf = requestAnimationFrame(frame);

    window.addEventListener('resize', resize);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    setTimeout(function () { wind.focus({ preventScroll: true }); }, 360);
    return host;
  }

  /* What is true right now, for anything that needs to ask — and for
     the suite, which checks behaviour rather than pixels. */
  function snapshot() {
    return {
      open: Boolean(host),
      birds: birds.length,
      roosting: birds.filter(function (b) {
        return b.mode === 'roost' || b.mode === 'shuffle';
      }).length,
      flying: birds.filter(function (b) {
        return b.mode === 'takeoff' || b.mode === 'circle' || b.mode === 'land';
      }).length,
      modes: birds.map(function (b) { return b.mode; }),
      slots: birds.filter(function (b) { return b.mode === 'roost'; })
                  .map(function (b) { return b.slot; }),
      calm: calm(),
      calmFor: Math.round(calmFor)
    };
  }

  window.SSAnwar = {
    open: open,
    close: close,
    state: snapshot,
    /* So a test can disturb the courtyard without synthesising a tap at
       a pixel, which would be testing the hit box rather than the
       flock. */
    startle: function (x, y) {
      if (!host) return false;
      startle(typeof x === 'number' ? x : W / 2,
              typeof y === 'number' ? y : H * LEDGE);
      return true;
    }
  };
})();
