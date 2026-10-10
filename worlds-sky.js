/**
 * SleepSphere — the sky engine.
 *
 * A real atmosphere, drawn to canvas: a graded sky, a sun that sets through
 * it, parallax cloud banks lit from the side, stars that emerge as the light
 * goes, and a film grain that kills the banding which makes gradients look
 * cheap.
 *
 * One number drives everything. `t` walks 0 → 3:
 *
 *      0  evening      golden, sun well above the horizon
 *      1  twilight     sun on the horizon, clouds catching the last light
 *      2  night        sun gone, stars out
 *      3  morning      light returning from the other side
 *
 * Every visible property is interpolated from that one number, so a descent,
 * a sunrise and a daypart change are all the same operation at different
 * speeds. Nothing here knows about sleep.
 *
 * Performance rules, because this runs on a phone at bedtime:
 *   · each cloud's silhouette is unioned once at build time, and its shaded
 *     sprite is re-lit only when the sky's cloud colours actually change
 *   · the backdrop is only re-gradiented when `t` actually moves
 *   · the loop stops itself when nothing is changing and nothing drifts
 *   · prefers-reduced-motion removes drift and twinkle entirely
 */
(function () {
  'use strict';

  /* Observed skies rather than invented ones: each is four stops from
     zenith to horizon, plus where the light is coming from. */
  var SKIES = [
    { /* 0 · evening */
      stops: [[0, 22, 50, 92], [0.30, 72, 108, 148], [0.58, 186, 136, 110], [0.82, 226, 160, 104], [1, 244, 198, 138]],
      sun: { x: 0.70, y: 0.615, r: 0.34, core: [255, 236, 198], halo: [255, 172, 92] },
      cloudLit: [255, 206, 160], cloudBody: [96, 108, 132], cloudBase: [58, 70, 96],
      star: 0, haze: 0.5
    },
    { /* 1 · twilight */
      stops: [[0, 12, 24, 46], [0.32, 40, 60, 92], [0.60, 108, 80, 100], [0.84, 168, 110, 104], [1, 198, 140, 114]],
      sun: { x: 0.74, y: 0.78, r: 0.30, core: [255, 212, 168], halo: [216, 120, 88] },
      cloudLit: [206, 142, 128], cloudBody: [62, 70, 92], cloudBase: [34, 42, 62],
      star: 0.38, haze: 0.42
    },
    { /* 2 · night */
      stops: [[0, 4, 7, 15], [0.38, 6, 11, 23], [0.68, 11, 19, 35], [0.88, 16, 26, 46], [1, 24, 36, 60]],
      sun: null,
      cloudLit: [48, 60, 86], cloudBody: [22, 30, 48], cloudBase: [11, 16, 28],
      star: 1, haze: 0.16, moon: { x: 0.26, y: 0.2, r: 0.075 }
    },
    { /* 3 · morning */
      stops: [[0, 20, 50, 100], [0.30, 80, 122, 172], [0.58, 196, 160, 150], [0.82, 238, 190, 142], [1, 248, 216, 170]],
      sun: { x: 0.28, y: 0.665, r: 0.36, core: [255, 246, 220], halo: [255, 196, 124] },
      cloudLit: [255, 224, 186], cloudBody: [112, 128, 156], cloudBase: [70, 84, 112],
      star: 0, haze: 0.56
    }
  ];

  function lerp(a, b, u) { return a + (b - a) * u; }
  function mixRGB(a, b, u) {
    return [Math.round(lerp(a[0], b[0], u)), Math.round(lerp(a[1], b[1], u)),
            Math.round(lerp(a[2], b[2], u))];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /* The sky at any point on the walk. */
  function skyAt(t) {
    var n = SKIES.length;
    var i = Math.max(0, Math.min(n - 1, Math.floor(t)));
    var j = Math.min(n - 1, i + 1);
    var u = Math.max(0, Math.min(1, t - i));
    u = u * u * (3 - 2 * u);                      /* smoothstep, so nothing snaps */
    var a = SKIES[i], b = SKIES[j];

    var stops = a.stops.map(function (s, k) {
      var o = b.stops[k];
      return [lerp(s[0], o[0], u)].concat(mixRGB(s.slice(1), o.slice(1), u));
    });

    /* The sun does not teleport when a keyframe has none: it keeps
       travelling on the same arc and simply goes out. */
    var sun = null;
    if (a.sun || b.sun) {
      var sa = a.sun || { x: b.sun.x, y: 1.25, r: b.sun.r, core: b.sun.core, halo: b.sun.halo };
      var sb = b.sun || { x: sa.x, y: 1.25, r: sa.r, core: sa.core, halo: sa.halo };
      sun = {
        x: lerp(sa.x, sb.x, u), y: lerp(sa.y, sb.y, u), r: lerp(sa.r, sb.r, u),
        core: mixRGB(sa.core, sb.core, u), halo: mixRGB(sa.halo, sb.halo, u)
      };
    }

    var moon = null;
    if (a.moon || b.moon) {
      var ma = a.moon || b.moon, mb = b.moon || a.moon;
      var moonA = (a.moon ? 1 - u : 0) + (b.moon ? u : 0);
      moon = { x: lerp(ma.x, mb.x, u), y: lerp(ma.y, mb.y, u),
               r: lerp(ma.r, mb.r, u), a: moonA };
    }

    return {
      stops: stops,
      sun: sun, moon: moon,
      cloudLit: mixRGB(a.cloudLit, b.cloudLit, u),
      cloudBody: mixRGB(a.cloudBody, b.cloudBody, u),
      cloudBase: mixRGB(a.cloudBase, b.cloudBase, u),
      /* Stars emerge late and fast rather than fading up through
         a bright sky, which looked like dust at golden hour. */
      star: Math.pow(lerp(a.star, b.star, u), 2.4),
      haze: lerp(a.haze, b.haze, u)
    };
  }

  /* A lobe stamp. The core is FULLY opaque out to 56% of the radius, which is
     what lets overlapping lobes union into one solid mass instead of reading
     as a row of separate circles; only the outer rim is feathered. */
  function puffSprite(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.56, 'rgba(255,255,255,1)');
    grad.addColorStop(0.74, 'rgba(255,255,255,0.72)');
    grad.addColorStop(0.89, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(r, r, r, 0, 6.2832); g.fill();
    return c;
  }

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var x = Math.imul(seed ^ seed >>> 15, 1 | seed);
      x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }

  function SkyScene(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.o = opts || {};
    this.t = this.o.t || 0;
    this.target = this.t;
    this.ease = this.o.ease || 0.055;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.puff = puffSprite(256);
    this.running = false;
    this.phase = 0;
    this.build();
    this.resize();
    this.mountGrain();
    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  /* One cloud's SILHOUETTE, built once as a single merged alpha mass.
     A row of lobes standing on a common baseline, a second tier billowing
     over the middle, then the base cut flat — which is what a cumulus
     actually is. Everything unions in one `source-over` pass, so the result
     is one shape with one outline, not a string of circles. */
  function buildCloudMask(rand, stamp, mw, mh, flat) {
    var c = document.createElement('canvas');
    c.width = mw; c.height = mh;
    var g = c.getContext('2d');
    var base = mh * (flat ? 0.88 : 0.84);
    var lobes = [];
    var span = mw * 0.86;
    /* Lobe COUNT follows from the cloud's proportions, so that the gap
       between neighbours is always smaller than a lobe: space them further
       apart than that and they stop unioning, and a cloud becomes a string
       of beads with a dark ball on each end. */
    var n = Math.max(4, Math.min(12, Math.round(span / (mh * 0.30))));
    var step = span / n;
    var rMax = mh * 0.44;
    var rMin = Math.min(rMax, Math.max(mh * 0.20, step * 0.62));

    /* A cumulus is not symmetrical: it has one dominant tower somewhere
       off-centre and falls away unevenly on each side. Everything is
       measured against the mask's HEIGHT, and the tallest lobe is sized so
       its crown lands just inside the top edge — a lobe that overflows the
       canvas gets clipped, and a clipped crown is a flat top. */
    var peak = 0.30 + rand() * 0.40;
    var reach = Math.max(peak, 1 - peak);
    for (var i = 0; i < n; i++) {
      var u = (i + 0.5) / n;
      var swell = Math.pow(Math.max(0, 1 - Math.abs(u - peak) / reach), 0.68);
      var r = Math.max(rMin, Math.min(rMax,
              mh * (0.22 + 0.19 * swell) * (0.90 + rand() * 0.20)));
      var lift = 0.58 + rand() * 0.16;
      lobes.push({
        x: mw * 0.07 + (i + 0.5) * step + (rand() - 0.5) * step * 0.3,
        y: base - r * lift,
        r: r, top: false
      });
    }
    /* the billow riding the tower — what breaks the top line into cauliflower
       rather than an arc */
    var m = 2 + Math.round(rand() * 2);
    for (var k = 0; k < m; k++) {
      var r2 = mh * (0.13 + rand() * 0.10);
      var rise = mh * (0.30 + rand() * 0.18);
      lobes.push({
        x: mw * peak + (k + rand() * 0.8 - m / 2) * step * 0.9,
        y: base - rise - r2 * 0.45,
        r: r2, top: true
      });
    }

    for (var j = 0; j < lobes.length; j++) {
      var p = lobes[j];
      g.drawImage(stamp, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }

    /* cut the base flat — the single most cumulus-making move there is */
    var top = base - mh * 0.07;
    var er = g.createLinearGradient(0, top, 0, base + mh * 0.11);
    er.addColorStop(0, 'rgba(0,0,0,0)');
    er.addColorStop(0.5, 'rgba(0,0,0,0.70)');
    er.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = er;
    g.fillRect(0, top, mw, mh - top);
    g.globalCompositeOperation = 'source-over';

    return { canvas: c, lobes: lobes, base: base };
  }

  /* Three parallax banks. The far one barely moves; the near one drifts
     enough to feel alive without ever asking to be watched. */
  SkyScene.prototype.build = function () {
    var rand = mulberry(20260910);
    var stamp = this.puff;
    this.layers = [];
    /* Banks of discrete clouds, each its own merged mass. Sized as a
       fraction of the screen width, never a multiple of it. */
    var spec = [
      { y: 0.452, n: 5, w: [0.18, 0.30], asp: [0.34, 0.44], speed: 0.0016, alpha: 0.38, flat: false },
      { y: 0.576, n: 4, w: [0.28, 0.44], asp: [0.40, 0.54], speed: 0.0035, alpha: 0.56, flat: true },
      { y: 0.712, n: 3, w: [0.42, 0.62], asp: [0.46, 0.62], speed: 0.0068, alpha: 0.74, flat: true }
    ];
    spec.forEach(function (s) {
      var clouds = [];
      for (var c = 0; c < s.n; c++) {
        var cw = s.w[0] + rand() * (s.w[1] - s.w[0]);
        var asp = s.asp[0] + rand() * (s.asp[1] - s.asp[0]);
        /* Mask resolution follows the cloud's share of the screen, so the
           near deck — the one actually read — is not a scaled-up thumbnail. */
        var mw = Math.max(200, Math.min(520, Math.round(cw * 1040)));
        var mh = Math.round(mw * asp);
        var built = buildCloudMask(rand, stamp, mw, mh, s.flat);
        clouds.push({
          x: (c + rand() * 0.72) / s.n * 1.6 - 0.3,
          y: s.y + (rand() - 0.5) * 0.030,
          w: cw,
          mask: built.canvas,
          lobes: built.lobes,
          base: built.base,
          shaded: null,
          key: ''
        });
      }
      this.layers.push({ clouds: clouds, speed: s.speed, alpha: s.alpha, off: rand() * 0.4 });
    }, this);

    this.stars = [];
    var r2 = mulberry(77001);
    for (var i = 0; i < 150; i++) {
      this.stars.push({ x: r2(), y: r2() * 0.72, m: 0.25 + r2() * 0.75, p: r2() * 6.28 });
    }
  };

  SkyScene.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.grain = null;
    this.dirty = true;
  };

  /* A still grain plate. Without it, a four-stop gradient on an OLED phone
     bands into visible stripes, which is most of why gradients read as
     cheap. Drawn once, reused every frame. */
  SkyScene.prototype.grainPlate = function () {
    if (this.grain) return this.grain;
    var s = 128;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var img = g.createImageData(s, s);
    var rand = mulberry(4242);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 118 + rand() * 20;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.grain = c;
    return c;
  };

  SkyScene.prototype.set = function (t, opts) {
    this.target = t;
    if (opts && opts.immediate) this.t = t;
    this.dirty = true;
    this.start();
  };

  SkyScene.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    var self = this;
    var last = performance.now();
    (function loop(now) {
      if (!self.running) return;
      var dt = Math.min(64, now - last); last = now;
      self.step(dt, now);
      self.raf = requestAnimationFrame(loop);
    })(last);
  };

  SkyScene.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  };

  SkyScene.prototype.destroy = function () {
    this.stop();
    if (this.grainEl && this.grainEl.parentNode) this.grainEl.parentNode.removeChild(this.grainEl);
    window.removeEventListener('resize', this._onResize);
  };

  SkyScene.prototype.step = function (dt, now) {
    var moved = Math.abs(this.target - this.t) > 0.0004;
    if (moved) {
      this.t += (this.target - this.t) * (this.reduced ? 1 : this.ease);
    } else {
      this.t = this.target;
    }
    if (!this.reduced) this.phase += dt * 0.001;
    this.draw(now);

    /* Idle out when there is genuinely nothing happening. Under reduced
       motion that is most of the time, which is the point. */
    if (!moved && this.reduced) this.stop();
  };

  SkyScene.prototype.draw = function (now) {
    var g = this.ctx, w = this.w, h = this.h;
    var s = skyAt(this.t);

    var grad = g.createLinearGradient(0, 0, 0, h);
    s.stops.forEach(function (st) {
      grad.addColorStop(Math.max(0, Math.min(1, st[0])), 'rgb(' + st[1] + ',' + st[2] + ',' + st[3] + ')');
    });
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    /* Stars behind everything, so cloud banks occlude them properly. */
    if (s.star > 0.01) {
      var tw = this.reduced ? 0 : 1;
      for (var i = 0; i < this.stars.length; i++) {
        var st2 = this.stars[i];
        var a = s.star * st2.m * (0.72 + 0.28 * Math.sin(this.phase * 1.1 + st2.p) * tw);
        if (a <= 0.02) continue;
        g.globalAlpha = a;
        g.fillStyle = '#fff';
        var r = st2.m > 0.82 ? 1.5 : 1;
        g.fillRect(st2.x * w, st2.y * h, r, r);
      }
      g.globalAlpha = 1;
    }

    if (s.moon && s.moon.a > 0.01) this.drawMoon(g, w, h, s);
    if (s.sun && s.sun.y < 1.12) this.drawSun(g, w, h, s);

    /* A band of lighter air sitting on the horizon. Cheap, and it is most
       of what separates a painted sky from a CSS gradient. */
    var hz = g.createLinearGradient(0, h * 0.44, 0, h);
    hz.addColorStop(0, rgba(s.cloudLit, 0));
    hz.addColorStop(1, rgba(s.cloudLit, s.haze * 0.30));
    g.fillStyle = hz;
    g.fillRect(0, h * 0.44, w, h * 0.56);

    this.drawClouds(g, w, h, s);
  };

  SkyScene.prototype.drawSun = function (g, w, h, s) {
    var x = s.sun.x * w, y = s.sun.y * h, R = s.sun.r * w;
    var halo = g.createRadialGradient(x, y, 0, x, y, R);
    halo.addColorStop(0, rgba(s.sun.core, 0.85));
    halo.addColorStop(0.18, rgba(s.sun.halo, 0.42));
    halo.addColorStop(0.55, rgba(s.sun.halo, 0.12));
    halo.addColorStop(1, rgba(s.sun.halo, 0));
    g.fillStyle = halo;
    g.beginPath(); g.arc(x, y, R, 0, 6.2832); g.fill();

    var disc = g.createRadialGradient(x, y, 0, x, y, R * 0.12);
    disc.addColorStop(0, rgba(s.sun.core, 0.95));
    disc.addColorStop(1, rgba(s.sun.core, 0));
    g.fillStyle = disc;
    g.beginPath(); g.arc(x, y, R * 0.12, 0, 6.2832); g.fill();
  };

  SkyScene.prototype.drawMoon = function (g, w, h, s) {
    var x = s.moon.x * w, y = s.moon.y * h, R = s.moon.r * w;
    var glow = g.createRadialGradient(x, y, 0, x, y, R * 4.5);
    glow.addColorStop(0, 'rgba(206,218,244,' + (0.17 * s.moon.a) + ')');
    glow.addColorStop(1, 'rgba(206,218,244,0)');
    g.fillStyle = glow;
    g.beginPath(); g.arc(x, y, R * 4.5, 0, 6.2832); g.fill();

    g.globalAlpha = s.moon.a;
    var body = g.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.08, x, y, R);
    body.addColorStop(0, '#f6f8ff');
    body.addColorStop(0.72, '#d8deef');
    body.addColorStop(0.93, '#b7c0d8');
    body.addColorStop(1, 'rgba(183,192,216,0)');   /* no hard rim */
    g.fillStyle = body;
    g.beginPath(); g.arc(x, y, R, 0, 6.2832); g.fill();
    g.globalAlpha = 1;
  };

  /* Cloud banks: one merged mass per cloud, shaded ONCE.
     The earlier version shaded every lobe separately — a lit crescent above
     each and a dark crescent below — which made each cloud read as a row of
     layered, curved segments. A pastry, in other words. Light does not work
     per-lobe; it falls across the whole form. So the silhouette is unioned
     first and lit afterwards, with one directional gradient over the body
     and soft internal touches clipped INSIDE the mass, where they can never
     become an outside edge. */
  SkyScene.prototype.drawClouds = function (g, w, h, s) {
    var lightX = s.sun ? s.sun.x : (s.moon ? s.moon.x : 0.5);
    /* One light direction for the whole sky, not one per cloud: a per-cloud
       side flips as it drifts past the sun, and the flip pops. */
    var side = lightX >= 0.5 ? 1 : -1;
    var deck = this.deck || 0;

    for (var L = 0; L < this.layers.length; L++) {
      var layer = this.layers[L];
      var drift = this.reduced ? 0 : (this.phase * layer.speed);

      for (var i = 0; i < layer.clouds.length; i++) {
        var cl = layer.clouds[i];
        var px = ((cl.x + layer.off + drift) % 1.6 + 1.6) % 1.6 - 0.3;
        var pw = cl.w * w;
        var ph = pw * cl.mask.height / cl.mask.width;
        var X = px * w;
        var Y = (cl.y + deck) * h - ph * (cl.base / cl.mask.height);
        if (X + pw < -48 || X > w + 48) continue;

        g.globalAlpha = layer.alpha;
        g.drawImage(this.shadeCloud(cl, s, side), X, Y, pw, ph);
      }
    }
    g.globalAlpha = 1;
  };

  /* Quantised to steps of four so the easing between skies does not force a
     re-shade on literally every frame; four parts in 255 is invisible on a
     low-contrast cloud. */
  function shadeKey(c) { return (c[0] >> 2) + '.' + (c[1] >> 2) + '.' + (c[2] >> 2); }

  SkyScene.prototype.shadeCloud = function (cloud, s, side) {
    var key = shadeKey(s.cloudLit) + '|' + shadeKey(s.cloudBody) + '|' +
              shadeKey(s.cloudBase) + '|' + side;
    if (cloud.key === key) return cloud.shaded;

    var mw = cloud.mask.width, mh = cloud.mask.height;
    if (!cloud.shaded) {
      cloud.shaded = document.createElement('canvas');
      cloud.shaded.width = mw;
      cloud.shaded.height = mh;
    }
    var g = cloud.shaded.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, mw, mh);
    g.drawImage(cloud.mask, 0, 0);

    /* The form light: one gradient tilted from the lit shoulder down to the
       shadowed base, filled through the mask so it only ever colours the
       cloud. Its axis is scaled to the cloud's HEIGHT, not its width — tie
       the lean to the width and on a wide cloud the horizontal component
       swamps the vertical, which paints the whole crown in body grey. */
    var lean = mh * 0.5 * side;
    var grad = g.createLinearGradient(mw * 0.5 + lean, -mh * 0.04,
                                      mw * 0.5 - lean, mh * 0.94);
    grad.addColorStop(0, rgba(s.cloudLit, 1));
    grad.addColorStop(0.34, rgba(mixRGB(s.cloudLit, s.cloudBody, 0.42), 1));
    grad.addColorStop(0.66, rgba(s.cloudBody, 1));
    grad.addColorStop(1, rgba(s.cloudBase, 1));
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = grad;
    g.fillRect(0, 0, mw, mh);

    /* Internal volume. `source-atop` keeps the mask's alpha, so these touches
       live strictly inside the silhouette: crowns pick up light, the hollows
       between lobes fall away, and nothing can escape to form a rim. */
    g.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < cloud.lobes.length; i++) {
      var p = cloud.lobes[i];
      var lit = p.top || (side > 0 ? p.x > mw * 0.42 : p.x < mw * 0.58);
      /* A shadow touch on a small end lobe just turns it into a dark ball;
         only lobes with real volume get one. Highlights are always safe. */
      if (!lit && p.r < mh * 0.26) continue;
      var r = p.r * (lit ? 0.92 : 1.08);
      var cx = p.x + side * r * 0.10;
      var cy = p.y - (lit ? r * 0.28 : -r * 0.34);
      var rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, rgba(lit ? s.cloudLit : s.cloudBase, lit ? 0.44 : 0.32));
      rg.addColorStop(1, rgba(lit ? s.cloudLit : s.cloudBase, 0));
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill();
    }
    g.globalCompositeOperation = 'source-over';

    cloud.key = key;
    return cloud.shaded;
  };

  /* The grain is a still plate, so it has no business being composited
     every frame: as a per-frame full-screen 'overlay' fill it cost a third
     of the frame budget (40fps against 61 without it). It becomes a static
     sibling element blended by the compositor instead, which is free. */
  SkyScene.prototype.mountGrain = function () {
    var host = this.canvas.parentNode;
    if (!host || this.o.grain === false) return;
    var d = document.createElement('div');
    d.className = 'sky-grain';
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:absolute;inset:0;pointer-events:none;' +
      'background-image:url(' + this.grainPlate().toDataURL() + ');' +
      'background-repeat:repeat;background-size:128px 128px;' +
      'mix-blend-mode:overlay;opacity:.05;';
    host.appendChild(d);
    this.grainEl = d;
  };

  window.SSSky = SkyScene;
  window.SSSkyAt = skyAt;
})();
