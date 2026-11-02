/**
 * Jamea al Anwar — the courtyard.
 *
 * THE PLATE
 *
 * The scene is a photograph of the actual building: the sahn of
 * al-Jami al-Anwar, the Mosque of al-Hakim, in Cairo. The arcade of
 * pointed arches, the stepped crenellation along the parapet, the
 * marble of the courtyard and the minaret with its mabkhara head rising
 * behind the north-west riwaq are all in the frame because they are
 * there, not because anyone drew them. Nothing about the architecture
 * is invented, because nothing about it is authored.
 *
 * It is Francisco Anzola's, CC BY 2.0, carrying no watermark, and the
 * attribution the licence requires is in CREDITS.md and on one short
 * line beside the controls. See ANWAR.md for the sourcing and for what
 * replaces it if a higher-resolution plate is cleared.
 *
 * WHAT IS DONE TO IT
 *
 * Grading, not drawing. The plate is a bright morning; the courtyard is
 * opened at night. So the whole stack is graded towards the hour it
 * actually is, using the same continuously interpolated sky the rest of
 * the app runs on — `--stars` is the app's own day-to-night number, and
 * the courtyard reads it rather than keeping a clock of its own. At
 * three in the afternoon it is a bright courtyard; at eleven at night
 * it is a dark one, and it crosses between them over the evening
 * without a step.
 *
 * Above it: a pre-blurred wash of the same frame so the colour runs to
 * every edge, atmospheric haze over the far arcade, a slow drift, film
 * grain, and a vignette whose weight follows the app's own light
 * position. All of it is light on the photograph. None of it adds
 * architecture.
 *
 * THE BIRDS
 *
 * The flock is already in the photograph — several dozen real pigeons,
 * standing on real marble. So nothing roosting is drawn, which is the
 * whole reason this reads as a place rather than as an illustration.
 * What is drawn is the few that are in the air: small, soft-edged,
 * dust-coloured rather than black, fading with distance, lifting out of
 * the courtyard and settling back into it. They are far away and there
 * are rarely more than a handful.
 *
 * WHAT IT DOES NOT OWN: audio and the wind-down. Sound comes from
 * SSExplore and the wind-down from SSAssist, through their public
 * surfaces. There is no second audio engine and no second timer here.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     THE PLATE, and where things are in it.

     The fractions are measured off the frame, not guessed, and the
     birds are placed against them: anything flying is in the sky band,
     anything landing goes back to the floor the real flock is standing
     on. Swapping the photograph means re-measuring these four numbers
     and nothing else.
     ------------------------------------------------------------------ */
  var PLATE = {
    src: './media/anwar/courtyard-1920.webp',
    srcset: './media/anwar/courtyard-1280.webp 1280w, ./media/anwar/courtyard-1920.webp 1920w',
    wash: './media/anwar/courtyard-wash.webp',
    w: 1920, h: 1277,
    credit: 'Francisco Anzola',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    /* Fractions of the plate's height, measured off this frame.
       Swapping the photograph means re-measuring these and nothing
       else: every bird is placed against them. */
    skyTop: 0.05,
    parapet: 0.40,          /* where the arcade's crenellation begins */
    floorLine: 0.65,        /* the base of the columns */
    floorFar: 0.71,         /* the nearest the real flock stands */
    minaretX: 0.495
  };

  var host = null, canvas = null, ctx = null, raf = 0;
  var flock = [], lastFrame = 0, sinceLift = 0, grade = 0;
  var W = 0, H = 0, box = null;      /* where the plate actually sits */

  function calm() {
    return Boolean(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
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
     THE HOUR.

     --stars is the app's own day-to-night number, interpolated
     continuously from the real clock by the sky engine. Reading it
     rather than keeping a second clock means the courtyard can never
     disagree with the rest of the app about what time it is.
     ------------------------------------------------------------------ */
  /* --stars is tuned for how many stars to show, and peaks well below
     1 even at midnight. The courtyard needs the same curve mapped onto
     a full day-to-night swing, so it is scaled rather than re-derived:
     one clock, one interpolation, one place to change the response. */
  var NIGHT_GAIN = 2.1;

  function nightness() {
    try {
      var v = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--stars'));
      if (isFinite(v)) return Math.min(1, Math.max(0, v * NIGHT_GAIN));
    } catch (e) {}
    var h = new Date().getHours();
    return (h >= 20 || h < 5) ? 1 : (h >= 18 || h < 7) ? 0.55 : 0;
  }

  /* ------------------------------------------------------------------
     THREE KEYS, FROM ONE CLOCK.

     A single darkness number can only take light away, and taking light
     away from a bright photograph gives you a murky bright photograph.
     Real evenings do something else: the sun leaves, the sky turns over
     from blue to amber to blue again, and the lamps come on — three
     separate things, each with its own colour and its own direction.

     So the one number is split into three weights. Night is the number
     itself. Day is its complement. Golden hour is 4n(1-n) cubed: the
     parabola alone is one at dusk but still a half at one in the
     afternoon, which put a sunset over the middle of the day. Cubing
     it keeps the peak where it was and collapses the shoulders, so the
     warm hour is an hour rather than a mood that never quite leaves.
     One clock still, one interpolation still, and nothing here invents
     a second opinion about what time it is.
     ------------------------------------------------------------------ */
  function keys(n) {
    var arc = Math.max(0, Math.min(1, 4 * n * (1 - n)));
    return { night: n, day: 1 - n, gold: arc * arc * arc };
  }

  /* The lamps along the riwaq, as discrete pools rather than one wide
     wash. They are built here because they have to sit on the arcade
     wherever the crop puts it, and because the courtyard turns a corner
     behind the minaret: the arcade is furthest away at the middle of
     the frame, so pools there are smaller, dimmer and closer together
     than the ones at the edges. */
  function lampPools() {
    var parts = [];
    for (var i = 0; i <= 10; i++) {
      var x = 0.04 + (0.92 * i) / 10;
      var near = Math.abs(x - 0.5) * 2;        /* 0 at the far corner */
      var w = (4.6 + near * 5.0).toFixed(1);
      var h = (2.1 + near * 2.3).toFixed(1);
      var a = (0.20 + near * 0.32).toFixed(3);
      parts.push('radial-gradient(' + w + '% ' + h + '% at ' +
        (x * 100).toFixed(1) + '% var(--an-arcade), ' +
        'rgba(255, 198, 122, ' + a + ') 0%, transparent 74%)');
    }
    /* The light that falls out of the arcade onto the marble, and the
       soffit glow just under the arches. Both are what make the
       courtyard read as lit rather than as merely less dark. */
    parts.push('radial-gradient(74% 15% at 50% calc(var(--an-floor) + 5%), ' +
      'rgba(246, 196, 128, .24) 0%, transparent 76%)');
    parts.push('linear-gradient(to bottom, transparent calc(var(--an-arcade) - 3%), ' +
      'rgba(255, 206, 140, .17) var(--an-arcade), transparent calc(var(--an-floor) + 1%))');
    return parts.join(', ');
  }

  function applyGrade(instant) {
    if (!host) return;
    grade = nightness();
    var k = keys(grade);
    host.style.setProperty('--an-night', k.night.toFixed(3));
    host.style.setProperty('--an-day', k.day.toFixed(3));
    host.style.setProperty('--an-gold', k.gold.toFixed(3));
    if (instant) host.style.setProperty('--an-settle', '0ms');
    else host.style.removeProperty('--an-settle');
  }

  /* ------------------------------------------------------------------
     THE PLATE'S GEOMETRY ON SCREEN.

     The photograph is covered into the viewport, so where the horizon
     lands depends on the device. The birds have to know, or they fly
     through the arcade on a phone and above the sky on a tablet.
     ------------------------------------------------------------------ */
  function measure() {
    if (!canvas) return;
    var DPR = Math.min(2, window.devicePixelRatio || 1);
    var r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    /* object-fit: cover, worked out rather than assumed. */
    var scale = Math.max(W / PLATE.w, H / PLATE.h);
    var dw = PLATE.w * scale, dh = PLATE.h * scale;
    /* object-position: 50% var(--an-focus). Read it back so the two
       cannot drift apart. */
    var focus = 0.46;
    try {
      var fv = parseFloat(getComputedStyle(host).getPropertyValue('--an-focus'));
      if (isFinite(fv)) focus = fv / 100;
    } catch (e) {}
    box = {
      x: (W - dw) / 2,
      y: (H - dh) * focus,
      w: dw, h: dh,
      at: function (fx, fy) { return { x: this.x + fx * this.w, y: this.y + fy * this.h }; }
    };

    /* Where the architecture lands, in viewport percent, so the lighting
       can sit ON the arcade instead of near it. The crop moves with the
       device; these move with the crop, and the CSS reads them. One
       measurement, used by both halves. */
    var pct = function (f) {
      return (((box.y + f * box.h) / H) * 100).toFixed(2) + '%';
    };
    host.style.setProperty('--an-horizon', pct(PLATE.parapet));
    host.style.setProperty('--an-arcade', pct((PLATE.parapet + PLATE.floorLine) / 2));
    host.style.setProperty('--an-floor', pct(PLATE.floorLine));
    /* Built after the anchors, because every pool is positioned on
       --an-arcade. */
    host.style.setProperty('--an-lamps', lampPools());
  }

  /* ------------------------------------------------------------------
     THE BIRDS IN THE AIR.

     Nothing roosting is drawn — the flock on the marble is in the
     photograph. A bird exists only between leaving it and returning.
     ------------------------------------------------------------------ */
  function lift(count, atX) {
    if (calm()) return 0;
    var made = 0;
    for (var i = 0; i < count; i++) {
      if (flock.length > 30) break;
      var from = box.at(
        atX != null ? atX + (Math.random() - 0.5) * 0.18
                    : 0.12 + Math.random() * 0.76,
        PLATE.floorFar + Math.random() * 0.26);
      var ceiling = box.at(0.5, PLATE.skyTop + Math.random() * 0.26).y;
      flock.push({
        x: from.x, y: from.y,
        /* Where it will wheel, and how big it is there. Birds that end
           up higher in the frame are further away, so they are smaller
           and thinner — which is the only honest way to sit a drawn
           thing on a photograph. */
        cx: box.at(0.2 + Math.random() * 0.6, 0).x,
        cy: ceiling,
        r: box.w * (0.08 + Math.random() * 0.14),
        a: Math.random() * Math.PI * 2,
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5),
        phase: 'up',
        t: 0,
        /* Staggered, because a flock does not leave on one frame. */
        hold: i * (0.06 + Math.random() * 0.14),
        life: 9 + Math.random() * 11,
        beat: Math.random() * Math.PI * 2,
        rate: 9 + Math.random() * 4,
        glide: 0,
        size: 0.8 + Math.random() * 0.5,
        seed: Math.random() * 6.28,
        bob: 0,
        fade: 0
      });
      made++;
    }
    sinceLift = 0;
    return made;
  }

  function stepBird(b, dt) {
    b.t += dt;
    if (b.hold > 0) { b.hold -= dt; return; }

    /* Beats, then a glide. A bird that flaps without pause is a moth.
       Climbing costs more, so the beat is faster going up and slower
       once it is riding; and the body rises on the downstroke, which is
       the small vertical bob that reads as flying rather than as
       sliding. */
    b.glide = (b.t * 0.85) % 1 > 0.58 ? 1 : 0;
    if (!b.glide) b.beat += dt * b.rate * (b.phase === 'up' ? 1.35 : 1);
    b.bob = b.glide ? b.bob * 0.9 : Math.sin(b.beat) * 0.9;

    if (b.phase === 'up') {
      var target = b.cy;
      b.y += (target - b.y) * Math.min(1, dt * 1.5);
      b.x += (b.cx + Math.cos(b.a) * b.r - b.x) * Math.min(1, dt * 1.1);
      b.fade = Math.min(1, b.fade + dt * 1.6);
      if (Math.abs(b.y - target) < box.h * 0.012) { b.phase = 'wheel'; b.t = 0; }
    } else if (b.phase === 'wheel') {
      b.a += b.spin * dt * (1 + Math.sin(b.a * 1.7 + b.seed) * 0.16);
      /* An ellipse seen almost edge on, breathing slightly: a circle
         held to four decimal places is the thing that reads as a
         machine rather than as a bird riding air. */
      var wobble = 1 + Math.sin(b.a * 2.3 + b.seed) * 0.09;
      b.x = b.cx + Math.cos(b.a) * b.r * wobble;
      b.y = b.cy + Math.sin(b.a) * b.r * 0.22 * wobble
            + Math.sin(b.t * 0.7 + b.seed) * box.h * 0.004;
      if (b.t > b.life) {
        b.phase = 'down'; b.t = 0;
        var home = box.at(0.1 + Math.random() * 0.8,
                          PLATE.floorFar + Math.random() * 0.26);
        b.toX = home.x; b.toY = home.y;
        b.fromX = b.x; b.fromY = b.y;
      }
    } else {
      /* A flared descent, fading as it reaches the flock that is
         already standing there — so a drawn bird is never seen to
         become a photographed one. */
      var k = Math.min(1, b.t / 2.2);
      var e = 1 - Math.pow(1 - k, 3);
      b.x = b.fromX + (b.toX - b.fromX) * e;
      b.y = b.fromY + (b.toY - b.fromY) * e;
      b.glide = k > 0.5 ? 1 : b.glide;
      b.fade = Math.max(0, 1 - Math.max(0, (k - 0.72) / 0.28));
      if (k >= 1) b.dead = true;
    }
  }

  function drawBird(b) {
    if (b.hold > 0 || b.fade <= 0.01) return;
    /* Distance: high in the frame is far away. Far birds are smaller,
       paler and softer, which is atmospheric perspective and is the
       difference between a bird in the scene and a sticker on it. */
    var depth = Math.min(1, Math.max(0,
      (b.y - box.y - box.h * PLATE.skyTop) / (box.h * (PLATE.floorLine - PLATE.skyTop))));
    /* Scale checked against the flock already in the frame: a pigeon
       standing on the marble is about eight CSS pixels across, and one
       in the air above the arcade is further away, so it is smaller.
       The first cut was three times that and read as paper aeroplanes. */
    var s = box.w * 0.0038 * b.size * (0.62 + depth * 0.8);
    var air = 0.40 + depth * 0.34;

    ctx.save();
    ctx.globalAlpha = Math.min(1, b.fade * air * (0.86 + grade * 0.16));
    /* The bob is vertical in the world, not along the bird's axis. */
    ctx.translate(b.x, b.y - (b.bob || 0) * s * 0.3);
    if (b.spin < 0) ctx.scale(-1, 1);
    /* Dust, not ink. At night a bird over a city is lighter than the
       sky behind it; by day it is darker than the marble. Near-black on
       near-black was the first cut and it was invisible. */
    /* A bird reads against what is behind it. Over a night sky it is
       lit from the city and sits lighter than the sky; against a bright
       or golden one it is a silhouette. The first cut used near-black
       at night and the birds were simply not there. */
    ctx.fillStyle = grade > 0.62 ? '#847f74'
                  : grade > 0.38 ? '#655e51'
                  : '#423c2f';
    ctx.shadowColor = ctx.fillStyle;
    /* Just enough to soften the edge. A wide bloom turned the glide
       pose into a lit disc with a bar across it. */
    ctx.shadowBlur = s * 0.3;

    /* Two swept wings meeting at a short body — no separate blob for
       the body, because at this distance a pigeon is wings and a dot,
       and an ellipse under two straight wings reads as a saucer. */
    var open = b.glide ? -0.22 : Math.sin(b.beat);
    var tip = s * (b.glide ? 1.72 : 1.45 + open * 0.75);
    var rise = -open * s * 1.15;          /* where the wingtips are */
    var bend = s * 0.34;                  /* the wrist, so wings curve */

    function wing(dir) {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.06);
      /* out to the wrist, then swept back and down to the tip */
      ctx.quadraticCurveTo(dir * tip * 0.42, rise * 0.55 - bend * 0.2,
                           dir * tip * 0.78, rise * 0.86);
      ctx.quadraticCurveTo(dir * tip * 0.96, rise * 0.98,
                           dir * tip, rise * 0.72 + s * 0.14);
      /* and back along the trailing edge */
      ctx.quadraticCurveTo(dir * tip * 0.5, rise * 0.34 + s * 0.3,
                           0, s * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    wing(-1);
    wing(1);
    /* The body: a short taper, not a disc. */
    ctx.beginPath();
    ctx.moveTo(-s * 0.46, s * 0.04);
    ctx.quadraticCurveTo(0, -s * 0.2, s * 0.5, -s * 0.02);
    ctx.quadraticCurveTo(0, s * 0.3, -s * 0.46, s * 0.04);
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
    lastFrame = now;
    if (!box) return;

    ctx.clearRect(0, 0, W, H);
    if (!calm()) {
      sinceLift += dt;
      /* Left alone, the courtyard stays still for a long time and then
         something small happens. Not a metronome: the chance builds. */
      if (sinceLift > 26 && Math.random() < dt * (sinceLift - 26) * 0.012) {
        lift(2 + Math.floor(Math.random() * 4));
      }
      for (var i = flock.length - 1; i >= 0; i--) {
        stepBird(flock[i], dt);
        if (flock[i].dead) flock.splice(i, 1);
      }
    }
    flock.forEach(drawBird);
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

  var SOUND = 'night';

  function soundAvailable() {
    var E = window.SSExplore;
    return Boolean(E && E.LAYERS && E.LAYERS.some(function (l) { return l.id === SOUND; }));
  }
  function paintSound(button) {
    var E = window.SSExplore;
    var on = Boolean(E && E.playing && E.playing().indexOf(SOUND) > -1);
    button.setAttribute('aria-pressed', String(on));
  }

  /* ------------------------------------------------------------------
     OPEN / CLOSE
     ------------------------------------------------------------------ */
  var ticker = 0;
  function onKey(e) { if (e.key === 'Escape') close(); }
  function onVisibility() {
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    else if (host && !raf) { lastFrame = 0; raf = requestAnimationFrame(frame); }
  }
  function onResize() { measure(); }

  function close() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (ticker) { clearInterval(ticker); ticker = 0; }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null; canvas = null; ctx = null; box = null; flock = [];
    document.documentElement.classList.remove('anwar-open');
  }

  function open() {
    if (host) return host;
    host = el('div', 'an');
    host.id = 'anwar';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Jamea al Anwar');

    var stage = el('div', 'an-stage');

    /* 1 — the wash: the same frame, pre-blurred, so the colour reaches
       every edge of every screen shape without a 50px CSS blur on a
       full-screen element. */
    var wash = el('img', 'an-wash');
    wash.src = PLATE.wash;
    wash.alt = '';
    wash.setAttribute('aria-hidden', 'true');
    wash.decoding = 'async';
    stage.appendChild(wash);

    /* 2 — the photograph. */
    var plate = el('img', 'an-plate');
    plate.src = PLATE.src;
    plate.srcset = PLATE.srcset;
    /* A phone has no use for the 1920 plate and a tablet does. */
    plate.sizes = '100vw';
    plate.decoding = 'async';
    plate.alt = 'The courtyard of al-Jami al-Anwar in Cairo: an arcade of ' +
      'pointed arches under a stepped parapet, a minaret rising behind it, ' +
      'and pigeons standing across the marble.';
    stage.appendChild(plate);

    /* 3 — the hour, the air, and the grain. Light on the photograph;
       none of it adds anything that is not there. */
    stage.appendChild(el('div', 'an-haze'));
    stage.appendChild(el('div', 'an-grade'));
    stage.appendChild(el('div', 'an-gold-cool'));
    stage.appendChild(el('div', 'an-gold'));
    stage.appendChild(el('div', 'an-lamps'));

    canvas = el('canvas', 'an-birds');
    canvas.setAttribute('aria-hidden', 'true');
    stage.appendChild(canvas);

    stage.appendChild(el('div', 'an-grain'));
    stage.appendChild(el('div', 'an-vignette'));

    /* The courtyard is the control. No instructions: a tap near the
       flock does what a tap near a flock does. */
    var touch = el('button', 'an-touch');
    touch.type = 'button';
    touch.setAttribute('aria-label', 'Cross the courtyard');
    touch.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect();
      var fx = box ? (e.clientX - r.left - box.x) / box.w : 0.5;
      lift(2 + Math.floor(Math.random() * 4), Math.min(0.9, Math.max(0.1, fx)));
    });
    stage.appendChild(touch);
    host.appendChild(stage);

    /* ---- the interface: a title, a way out, two controls ---- */
    var title = el('p', 'an-title', 'Jamea al Anwar');
    host.appendChild(title);

    var shut = btn('×', 'an-close', close);
    shut.setAttribute('aria-label', 'Close');
    host.appendChild(shut);

    var bar = el('div', 'an-bar');
    var sound = btn('Night air', 'an-btn', function () {
      var E = window.SSExplore;
      if (!E || !soundAvailable()) { say('That sound is not available on this build.'); return; }
      try { E.toggleSound(SOUND); } catch (err) { say('The sound could not start.'); }
      setTimeout(function () { paintSound(sound); }, 120);
    });
    sound.setAttribute('aria-pressed', 'false');
    if (!soundAvailable()) sound.disabled = true;
    bar.appendChild(sound);

    var wind = btn('Start wind-down', 'an-btn an-primary', async function () {
      if (!window.SSAssist) { say('The wind-down is not loaded on this page.'); return; }
      wind.disabled = true;
      var was = wind.textContent;
      wind.textContent = 'Starting…';
      try {
        /* Awaited inside the tap. Assist owns the sound, the timer and
           the duʿāʾ; this screen owns none of them. */
        await window.SSAssist.start();
        wind.textContent = 'Running';
      } catch (err) {
        wind.textContent = was;
        say(err && err.message ? err.message : 'The wind-down could not start.');
      } finally { wind.disabled = false; }
    });
    bar.appendChild(wind);
    host.appendChild(bar);

    /* The attribution CC BY requires. One line, small, and it is a
       licence term rather than a note about how the screen was built. */
    var credit = el('p', 'an-credit');
    credit.appendChild(document.createTextNode('Photograph ' + PLATE.credit + ' · '));
    var a = document.createElement('a');
    a.href = PLATE.licenceUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = PLATE.licence;
    credit.appendChild(a);
    host.appendChild(credit);

    document.body.appendChild(host);
    document.documentElement.classList.add('anwar-open');

    measure();
    applyGrade(true);
    requestAnimationFrame(function () {
      host.classList.add('on');
      applyGrade(false);
    });

    lastFrame = 0; sinceLift = 14;
    raf = requestAnimationFrame(frame);
    /* The hour moves while the courtyard is open, and the light follows
       it. Once a minute is far more often than it needs. */
    ticker = setInterval(function () { applyGrade(false); }, 60000);

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    setTimeout(function () { wind.focus({ preventScroll: true }); }, 420);
    return host;
  }

  function snapshot() {
    return {
      open: Boolean(host),
      flying: flock.length,
      night: Number(grade.toFixed(3)),
      calm: calm(),
      sinceLift: Math.round(sinceLift),
      plate: { src: PLATE.src, credit: PLATE.credit, licence: PLATE.licence }
    };
  }

  window.SSAnwar = {
    open: open,
    close: close,
    state: snapshot,
    /* So a test can disturb the flock without synthesising a tap at a
       pixel, which would be testing the hit box rather than the birds. */
    lift: function (n, atX) {
      if (!host) return 0;
      return lift(n || 3, typeof atX === 'number' ? atX : 0.5);
    }
  };
})();
