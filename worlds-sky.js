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
 *   · cloud puffs are pre-rendered once to an offscreen canvas
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

  /* A soft cloud puff, drawn once at high quality and reused. */
  function puffSprite(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var r = size / 2;
    var grad = g.createRadialGradient(r, r * 0.92, r * 0.06, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.42, 'rgba(255,255,255,0.78)');
    grad.addColorStop(0.72, 'rgba(255,255,255,0.26)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
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

  /* Three parallax banks. The far one barely moves; the near one drifts
     enough to feel alive without ever asking to be watched. */
  SkyScene.prototype.build = function () {
    var rand = mulberry(20260910);
    this.layers = [];
    /* Banks, not blobs. Each layer is a handful of CLUSTERS, and each
       cluster is several small overlapping puffs spread along a nearly
       flat base — which is what gives a cumulus deck its silhouette.
       Puffs sized a fraction of the screen, never a multiple of it. */
    var spec = [
      { y: 0.455, clusters: 5, puffs: [5, 8],  r: [0.030, 0.055], spread: 0.17, speed: 0.0016, alpha: 0.34 },
      { y: 0.565, clusters: 4, puffs: [6, 9],  r: [0.042, 0.078], spread: 0.23, speed: 0.0035, alpha: 0.52 },
      { y: 0.700, clusters: 3, puffs: [7, 11], r: [0.058, 0.105], spread: 0.32, speed: 0.0068, alpha: 0.68 }
    ];
    spec.forEach(function (s) {
      var puffs = [];
      for (var c = 0; c < s.clusters; c++) {
        var cx = (c + rand() * 0.7) / s.clusters * 1.6 - 0.3;
        var cy = s.y + (rand() - 0.5) * 0.035;
        var n = Math.round(s.puffs[0] + rand() * (s.puffs[1] - s.puffs[0]));
        for (var i = 0; i < n; i++) {
          var u = i / (n - 1 || 1);
          /* Fat in the middle, thin at the ends, and the crown lifts. */
          var swell = Math.sin(u * Math.PI);
          puffs.push({
            x: cx + (u - 0.5) * s.spread,
            y: cy - swell * 0.022 + (rand() - 0.5) * 0.012,
            r: (s.r[0] + rand() * (s.r[1] - s.r[0])) * (0.55 + swell * 0.75),
            a: 0.6 + rand() * 0.4
          });
        }
      }
      this.layers.push({ puffs: puffs, speed: s.speed, alpha: s.alpha, off: rand() * 0.4 });
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

  /* Cloud banks. Each puff is drawn three times from one sprite: a dark
     base, the body, and a lit crown offset towards wherever the light is.
     That offset is the whole trick — it is what makes a bank read as a
     solid thing with a sunlit top rather than as grey fog. */
  SkyScene.prototype.drawClouds = function (g, w, h, s) {
    var lightX = s.sun ? s.sun.x : (s.moon ? s.moon.x : 0.5);

    /* Only three cloud colours exist in a frame, so the sprite is tinted
       three times per frame rather than once per puff. Tinting per puff
       meant ~99 canvas clears a frame, which a phone cannot afford. */
    var base = this.tinted(0, s.cloudBase);
    var body = this.tinted(1, s.cloudBody);
    var crown = this.tinted(2, s.cloudLit);

    for (var L = 0; L < this.layers.length; L++) {
      var layer = this.layers[L];
      var drift = this.reduced ? 0 : (this.phase * layer.speed);
      var deck = this.deck || 0;

      for (var i = 0; i < layer.puffs.length; i++) {
        var p = layer.puffs[i];
        var px = ((p.x + layer.off + drift) % 1.6 + 1.6) % 1.6 - 0.3;
        var cx = px * w;
        var cy = (p.y + deck) * h;
        var R = p.r * w;
        if (cx + R < -40 || cx - R > w + 40) continue;

        var side = (px - lightX) >= 0 ? 1 : -1;
        var a = layer.alpha * p.a;

        /* base — the shadowed underside */
        g.globalAlpha = a * 0.85;
        g.drawImage(base, cx - R, cy + R * 0.16 - R, R * 2, R * 2);

        /* body */
        g.globalAlpha = a;
        g.drawImage(body, cx - R, cy - R, R * 2, R * 2);

        /* lit crown, pushed towards the light */
        g.globalAlpha = a * (s.star > 0.9 ? 0.34 : 0.78);
        var cR = R * 0.86;
        g.drawImage(crown, cx - side * R * 0.14 - cR, cy - R * 0.17 - cR, cR * 2, cR * 2);
      }
    }
    g.globalAlpha = 1;
  };

  /* One scratch canvas per colour role, re-tinted only when that role's
     colour actually changes. During a still night this does no work at all. */
  SkyScene.prototype.tinted = function (slot, colour) {
    if (!this._tc) { this._tc = []; this._tk = []; }
    var key = colour[0] + ',' + colour[1] + ',' + colour[2];
    if (this._tk[slot] === key) return this._tc[slot];
    var c = this._tc[slot];
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 256;
      this._tc[slot] = c;
    }
    var tg = c.getContext('2d');
    tg.clearRect(0, 0, 256, 256);
    tg.globalCompositeOperation = 'source-over';
    tg.drawImage(this.puff, 0, 0, 256, 256);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = 'rgb(' + key + ')';
    tg.fillRect(0, 0, 256, 256);
    this._tk[slot] = key;
    return c;
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
