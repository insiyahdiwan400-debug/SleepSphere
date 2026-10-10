/**
 * SleepSphere — the sky engine.
 *
 * A real atmosphere, drawn to canvas: a graded sky, a sun that sets through
 * it, a cloud FIELD receding to a horizon, stars that emerge as the light
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
 * What a sky actually looks like, from the photographs this was built
 * against, and what each observation costs here:
 *
 *   · It is a FIELD, not a few objects. Dozens of clouds shrinking and
 *     crowding towards a horizon. A handful of lumps floating at three
 *     fixed heights reads as a cartoon however well each lump is drawn.
 *   · Cloud edges are fractal. Lobes carry lobes carry lobes. One octave
 *     is a cartoon; three is a cloud.
 *   · A sky is not one kind of cloud. Towering cumulus, torn stratus
 *     sheets and high cirrus wisps all share it, and the mix is most of
 *     what makes one sky differ from another.
 *   · The tonal range inside a single cloud is enormous — near-white
 *     crowns over near-black bases — and far more of it comes from the
 *     sun's direction than from the cloud's own colour.
 *
 * Performance rules, because this runs on a phone at bedtime:
 *   · clouds are a small LIBRARY of sprites instanced many times, so the
 *     number of shading operations is fixed however many clouds are drawn
 *   · each sprite's silhouette is unioned once at build time, and its
 *     shaded copy is re-lit only when the sky's cloud colours change
 *   · the backdrop is only re-gradiented when `t` actually moves
 *   · the loop stops itself when nothing is changing and nothing drifts
 *   · prefers-reduced-motion removes drift and twinkle entirely
 */
(function () {
  'use strict';

  /* Observed skies rather than invented ones: each is five stops from
     zenith to horizon, plus where the light is coming from. */
  var SKIES = [
    { /* 0 · evening */
      stops: [[0, 22, 50, 92], [0.30, 72, 108, 148], [0.58, 186, 136, 110], [0.82, 226, 160, 104], [1, 244, 198, 138]],
      sun: { x: 0.70, y: 0.615, r: 0.34, core: [255, 236, 198], halo: [255, 172, 92] },
      cloudLit: [255, 214, 170], cloudBody: [104, 110, 132], cloudBase: [52, 62, 88],
      star: 0, haze: 0.5, rim: 0.35
    },
    { /* 1 · twilight */
      stops: [[0, 12, 24, 46], [0.32, 40, 60, 92], [0.60, 108, 80, 100], [0.84, 168, 110, 104], [1, 198, 140, 114]],
      sun: { x: 0.74, y: 0.78, r: 0.30, core: [255, 212, 168], halo: [216, 120, 88] },
      cloudLit: [226, 152, 130], cloudBody: [58, 64, 88], cloudBase: [26, 32, 52],
      star: 0.38, haze: 0.42, rim: 1
    },
    { /* 2 · night — nearly black, as a real one is */
      stops: [[0, 2, 4, 9], [0.38, 3, 6, 14], [0.68, 6, 11, 23], [0.88, 10, 17, 32], [1, 15, 24, 42]],
      sun: null,
      cloudLit: [40, 50, 74], cloudBody: [16, 22, 37], cloudBase: [7, 10, 19],
      star: 1, haze: 0.14, rim: 0.12, moon: { x: 0.26, y: 0.2, r: 0.075 }
    },
    { /* 3 · morning */
      stops: [[0, 20, 50, 100], [0.30, 80, 122, 172], [0.58, 196, 160, 150], [0.82, 238, 190, 142], [1, 248, 216, 170]],
      sun: { x: 0.28, y: 0.665, r: 0.36, core: [255, 246, 220], halo: [255, 196, 124] },
      cloudLit: [255, 232, 198], cloudBody: [118, 130, 158], cloudBase: [62, 74, 104],
      star: 0, haze: 0.56, rim: 0.40
    }
  ];

  /* Where the cloud field vanishes, and how high it reaches. The band above
     TOP stays open sky: it is where a world puts its words, and a headline
     set over towering cumulus cannot be read. */
  var HORIZON = 0.885;
  var TOP = 0.285;

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
      haze: lerp(a.haze, b.haze, u),
      rim: lerp(a.rim, b.rim, u)
    };
  }

  /* Two stamps, because the sky wants two different things from them.
     The VEIL stamp has no opaque core at all — it falls away from its
     centre immediately, so stacking a hundred of them builds depth by
     accumulation rather than by union. That accumulation is what makes
     cloud you can see through, which is the whole of a wispy sky: the
     colour behind never stops showing. A stamp with a hard core would
     union into a solid shape instead, and a solid shape is weather. */
  function veilStamp(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.52)');
    grad.addColorStop(0.30, 'rgba(255,255,255,0.33)');
    grad.addColorStop(0.58, 'rgba(255,255,255,0.14)');
    grad.addColorStop(0.80, 'rgba(255,255,255,0.04)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(r, r, r, 0, 6.2832); g.fill();
    return c;
  }

  /* The heap stamp keeps a core, but a soft one: enough that a drift of
     them reads as a body with some substance, not so much that it acquires
     an outline. */
  function puffSprite(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.18, 'rgba(255,255,255,0.86)');
    grad.addColorStop(0.44, 'rgba(255,255,255,0.56)');
    grad.addColorStop(0.68, 'rgba(255,255,255,0.24)');
    grad.addColorStop(0.86, 'rgba(255,255,255,0.06)');
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

  function stamp(g, s, x, y, rx, ry) {
    g.drawImage(s, x - rx, y - ry, rx * 2, ry * 2);
  }

  /* The edge light, baked once from the silhouette: the mass minus a copy of
     itself shifted down, which leaves a band along everything facing up.
     Half the drama in a real sky is this burning crown, and it is the one
     thing a body gradient can never produce — but it is pure geometry, so
     it has no business being recomputed when only the colours moved.
     It traces the fractal outline, which is what separates it from the
     per-lobe crescent this engine used to draw: that one followed a circle
     nothing could see, and turned every cloud into a pastry. */
  function rimOf(mask) {
    var mw = mask.width, mh = mask.height;
    var c = document.createElement('canvas');
    c.width = mw; c.height = mh;
    var g = c.getContext('2d');
    g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(mask, 0, Math.max(2, mh * 0.055));
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';                 /* a backlit crown is white-hot */
    g.fillRect(0, 0, mw, mh);
    return c;
  }

  /* ---------------------------------------------------------------
     Cloud sprites. Three families, because a sky is never one shape
     repeated. Each returns a single merged alpha mass plus the lobes
     worth lighting individually.
     --------------------------------------------------------------- */

  /* A VEIL: the long, soft, drifting kind of cloud. Several strata laid
     over one another, each a train of flattened stamps following its own
     slow curve, each thinning to nothing at both ends.

     Nothing here has a base, an outline or a silhouette, which is the
     point — a wispy cloud is not a shape with soft edges, it is an
     accumulation with no edge at all. Its form comes from where the
     strata happen to overlap, so it reads as depth rather than as an
     object, and the sky behind is never fully hidden. */
  function veilMask(rand, veil, iw, ih) {
    var padX = Math.round(ih * 0.22), padY = Math.round(ih * 0.30);
    var mw = iw + padX * 2, mh = ih + padY * 2;
    var c = document.createElement('canvas');
    c.width = mw; c.height = mh;
    var g = c.getContext('2d');
    var strata = 5 + Math.round(rand() * 4);

    for (var L = 0; L < strata; L++) {
      /* each stratum has its own height, drift and bow */
      var y0 = padY + ih * (0.12 + rand() * 0.76);
      var len = iw * (0.52 + rand() * 0.48);
      var x0 = padX + rand() * (iw - len);
      var bow = (rand() - 0.5) * ih * 0.34;
      var thick = ih * (0.10 + rand() * 0.20);
      var n = 34 + Math.round(rand() * 26);
      for (var i = 0; i < n; i++) {
        var u = (i + 0.5) / n;
        /* fat somewhere along its length, frayed at both ends — never a
           band of even thickness, which reads as a painted stripe */
        var swell = Math.pow(Math.sin(Math.pow(u, 0.8) * Math.PI), 0.7);
        var rx = ih * (0.14 + rand() * 0.16);
        var ry = thick * swell * (0.45 + rand() * 0.75);
        if (ry < 0.6) continue;
        g.globalAlpha = 0.30 + rand() * 0.36;
        stamp(g, veil,
              x0 + u * len + (rand() - 0.5) * ih * 0.07,
              y0 + Math.sin(u * Math.PI) * bow + (rand() - 0.5) * thick * 0.65,
              rx, ry);
      }
    }
    g.globalAlpha = 1;

    /* Thin it where it leaves the sprite, so a veil drifts out of frame
       rather than stopping at an edge. */
    g.globalCompositeOperation = 'destination-out';
    var fade = g.createLinearGradient(0, 0, mw, 0);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.13, 'rgba(0,0,0,0)');
    fade.addColorStop(0.87, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade;
    g.fillRect(0, 0, mw, mh);
    g.globalCompositeOperation = 'source-over';

    return { canvas: c, lobes: [], base: padY + ih * 0.5, kind: 'veil' };
  }

  /* A soft HEAP. Still built from lobes, so it keeps some body and some
     cauliflower, but with the cumulus removed from it: no ruled base, no
     hard crown, and a gauze of veil stamps drifting off it. A sky of
     nothing but veils has no weight anywhere; a few of these give the eye
     something to settle on. */
  function cumulusMask(rand, puff, veilS, iw, ih) {
    /* Geometry lives in an INNER box with a margin all round. Without it the
       outermost lobes run off the canvas and come back as dead straight
       edges — a cloud with a ruled side, which is worse than any shading
       fault because nothing in a sky has a straight edge. */
    var padX = Math.round(ih * 0.34), padY = Math.round(ih * 0.38);
    var mw = iw + padX * 2, mh = ih + padY * 2;
    var c = document.createElement('canvas');
    c.width = mw; c.height = mh;
    var g = c.getContext('2d');
    var base = padY + ih * 0.88;
    var span = iw;
    var n = Math.max(4, Math.min(11, Math.round(span / (ih * 0.34))));
    var step = span / n;
    var rMax = ih * 0.34;
    var rMin = Math.min(rMax, Math.max(ih * 0.17, step * 0.60));
    var peak = 0.28 + rand() * 0.44;
    var reach = Math.max(peak, 1 - peak);
    var lobes = [], i, k;

    for (i = 0; i < n; i++) {
      var u = (i + 0.5) / n;
      var swell = Math.pow(Math.max(0, 1 - Math.abs(u - peak) / reach), 0.62);
      var r = Math.max(rMin, Math.min(rMax,
              ih * (0.19 + 0.16 * swell) * (0.90 + rand() * 0.20)));
      lobes.push({ x: padX + (i + 0.5) * step + (rand() - 0.5) * step * 0.34,
                   y: base - r * (0.58 + rand() * 0.16), r: r, top: false });
    }
    var m = 2 + Math.round(rand() * 2);
    for (k = 0; k < m; k++) {
      var r2 = ih * (0.10 + rand() * 0.07);
      lobes.push({ x: padX + iw * peak + (k + rand() * 0.8 - m / 2) * step * 0.85,
                   y: base - ih * (0.26 + rand() * 0.14) - r2 * 0.40,
                   r: r2, top: true });
    }

    /* A tall sprite is a TOWER, and a tower is built upwards: lobes stacked
       over the peak, narrowing as they climb. Without this a tall canvas
       just gives a wider slab, and every cloud in the sky has the same
       proportions however many sprites there are. */
    if (ih > iw * 0.70) {
      var ty = base - ih * 0.34, tr = ih * 0.26, tx = padX + iw * peak;
      for (k = 0; k < 5 && ty - tr > padY * 0.5; k++) {
        lobes.push({ x: tx + (rand() - 0.5) * tr * 0.55, y: ty, r: tr, top: k > 1 });
        ty -= tr * (0.82 + rand() * 0.22);
        tr *= 0.80 + rand() * 0.10;
      }
    }

    /* two octaves of detail, on the UPPER arc of each lobe only — the
       underside of a cumulus is smooth, the crown is not */
    for (i = 0; i < lobes.length; i++) {
      stamp(g, puff, lobes[i].x, lobes[i].y, lobes[i].r, lobes[i].r);
    }
    /* ONE octave of detail, and drawn with the veil stamp at low opacity so
       it softens the crown rather than studding it. Stacking hard little
       stamps around the top is what gave the first attempt a crown of
       bright beads — soap foam, not cloud. */
    for (i = 0; i < lobes.length; i++) {
      var p = lobes[i];
      var kids = 3 + Math.round(rand() * 3);
      for (k = 0; k < kids; k++) {
        var a1 = -Math.PI * (0.06 + rand() * 0.88);
        var rr = p.r * (0.34 + rand() * 0.26);
        g.globalAlpha = 0.40 + rand() * 0.30;
        stamp(g, veilS,
              p.x + Math.cos(a1) * p.r * (0.62 + rand() * 0.26),
              p.y + Math.sin(a1) * p.r * (0.62 + rand() * 0.26),
              rr, rr * (0.78 + rand() * 0.3));
      }
    }
    g.globalAlpha = 1;

    /* A long, soft fade under the mass instead of a flat cut. A ruled base
       is what makes a heap read as cumulus — as weather, as daylight — and
       that is exactly the character being taken out of it here. */
    g.globalCompositeOperation = 'destination-out';
    var top = base - ih * 0.30;
    var er = g.createLinearGradient(0, top, 0, base + ih * 0.16);
    er.addColorStop(0, 'rgba(0,0,0,0)');
    er.addColorStop(0.45, 'rgba(0,0,0,0.26)');
    er.addColorStop(0.78, 'rgba(0,0,0,0.74)');
    er.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = er;
    g.fillRect(0, top, mw, mh - top);
    /* and break the outline in a few places, so it has no continuous edge */
    for (i = 0; i < 5; i++) {
      var br = ih * (0.10 + rand() * 0.16);
      stamp(g, puff, padX + iw * (0.05 + rand() * 0.9),
            base - ih * rand() * 0.5, br * 1.7, br);
    }
    g.globalCompositeOperation = 'source-over';

    /* gauze drifting off the mass — the thing that stops a heap looking
       cut out of the sky */
    for (i = 0; i < 26; i++) {
      var a = rand() * 6.2832;
      var d = 0.5 + rand() * 0.6;
      g.globalAlpha = 0.16 + rand() * 0.22;
      stamp(g, puff,
            padX + iw * (0.1 + rand() * 0.8) + Math.cos(a) * iw * 0.18 * d,
            base - ih * (0.12 + rand() * 0.55) + Math.sin(a) * ih * 0.2 * d,
            ih * (0.14 + rand() * 0.22), ih * (0.05 + rand() * 0.10));
    }
    g.globalAlpha = 1;

    /* Only the lobes with real volume are worth lighting individually, and
       shading all of them is the engine's hot loop. Keep the biggest few. */
    lobes.sort(function (a, b) { return b.r - a.r; });
    return { canvas: c, lobes: lobes.slice(0, 7), base: base, kind: 'cumulus' };
  }

  /* Stratus sheet: a long torn layer. Flattened lobes along a drifting
     line, then horizontal streaks erased straight through it — the tearing
     is the whole character, and it is what the eye reads as "weather"
     rather than "a cloud". */
  function sheetMask(rand, puff, iw, ih) {
    var padX = Math.round(ih * 0.5), padY = Math.round(ih * 0.6);
    var mw = iw + padX * 2, mh = ih + padY * 2;
    var c = document.createElement('canvas');
    c.width = mw; c.height = mh;
    var g = c.getContext('2d');
    var mid = padY + ih * 0.50;
    /* the layer rides a slow bow rather than a ruled line */
    var bow = (rand() - 0.5) * ih * 0.9;
    var n = Math.round(14 + rand() * 10);
    var lobes = [], i;
    for (i = 0; i < n; i++) {
      var u = (i + 0.5) / n;
      var taper = Math.pow(Math.sin(u * Math.PI), 0.32);
      var rx = ih * (0.40 + rand() * 0.46);
      var ry = ih * (0.14 + rand() * 0.20) * taper;
      var x = padX + u * iw;
      var y = mid + Math.sin(u * Math.PI) * bow + (rand() - 0.5) * ih * 0.46;
      stamp(g, puff, x, y, rx, ry);
      if (ry > ih * 0.18) lobes.push({ x: x, y: y, r: ry, top: y < mid });
    }
    g.globalCompositeOperation = 'destination-out';
    /* tear it: the rips are the character of a stratus layer, and they are
       what stops a sheet reading as one long sausage */
    for (i = 0; i < 9; i++) {
      var tw = ih * (0.6 + rand() * 1.8);
      var th = ih * (0.05 + rand() * 0.09);
      stamp(g, puff, padX + rand() * iw, mid + (rand() - 0.5) * ih * 0.8, tw, th);
    }
    /* feather the ends so a sheet drifts out of frame instead of stopping */
    var fade = g.createLinearGradient(0, 0, mw, 0);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.17, 'rgba(0,0,0,0)');
    fade.addColorStop(0.83, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade;
    g.fillRect(0, 0, mw, mh);
    g.globalCompositeOperation = 'source-over';

    lobes.sort(function (a, b) { return b.r - a.r; });
    return { canvas: c, lobes: lobes.slice(0, 6), base: mid, kind: 'sheet' };
  }

  /* Cirrus wisp: a few long feathered strokes on a shallow rake. These
     carry almost no tone — they are structure in the upper sky, and
     without them the top of the frame is a flat wash. */
  function wispMask(rand, puff, mw, mh) {
    var c = document.createElement('canvas');
    c.width = mw; c.height = mh;
    var g = c.getContext('2d');
    /* Cirrus is blown ice: every stroke CURVES, thickens where it was torn
       from and frays to nothing at the trailing end. Straight strokes at an
       even pitch are contrails, not cirrus — and a sky full of contrails
       was exactly the first attempt's mistake. */
    var n = 2 + Math.round(rand() * 2);
    for (var i = 0; i < n; i++) {
      var y0 = mh * (0.16 + rand() * 0.66);
      var len = mw * (0.42 + rand() * 0.46);
      var x0 = rand() * (mw - len);
      var bow = (rand() - 0.5) * mh * 0.42;
      var hook = (rand() - 0.5) * mh * 0.5;
      var seg = 26;
      for (var k = 0; k < seg; k++) {
        var u = (k + 0.5) / seg;
        /* fat where it starts, frayed where it trails */
        var body = Math.pow(1 - u, 0.8) * Math.pow(Math.min(1, u * 7), 0.9);
        var y = y0 + Math.sin(u * Math.PI) * bow + Math.pow(u, 2.4) * hook;
        g.globalAlpha = (0.10 + rand() * 0.14) * body;
        stamp(g, puff,
              x0 + u * len + (rand() - 0.5) * mh * 0.05,
              y + (rand() - 0.5) * mh * 0.05,
              mh * (0.09 + rand() * 0.11),
              mh * (0.012 + rand() * 0.026) * body);
      }
    }
    g.globalAlpha = 1;
    return { canvas: c, lobes: [], base: mh * 0.5, kind: 'wisp' };
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
    this.veil = veilStamp(256);
    this.running = false;
    this.phase = 0;
    this.build();
    this.resize();
    this.mountGrain();
    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  SkyScene.prototype.build = function () {
    var rand = mulberry(20260910);
    var puff = this.puff, veil = this.veil;

    /* A small LIBRARY, instanced many times. Shading cost is then fixed by
       the library's size, not by how full the sky is — which is what makes
       a field of sixty clouds affordable on a phone. */
    /* Sprites are deliberately modest: they are blitted scaled, clouds are
       soft, and every pixel here is paid for again on every re-light. */
    this.sprites = [];
    var i;
    /* The library leans hard towards veils. Heaps are the seasoning, not
       the dish: a few, and soft, so the eye has somewhere to rest without
       the sky acquiring weather. */
    for (i = 0; i < 7; i++) {
      var vw = 260 + Math.round(rand() * 120);
      this.sprites.push(veilMask(rand, veil, vw,
        Math.round(vw * (0.26 + rand() * 0.26))));
    }
    var ASPECT = [0.34, 0.44, 0.58, 0.80];
    for (i = 0; i < ASPECT.length; i++) {
      var cw = 150 + Math.round(rand() * 60);
      this.sprites.push(cumulusMask(rand, puff, veil, cw,
        Math.round(cw * ASPECT[i] * (0.92 + rand() * 0.16))));
    }
    for (i = 0; i < 3; i++) {
      var sw = 240 + Math.round(rand() * 90);
      this.sprites.push(sheetMask(rand, veil, sw, Math.round(sw * (0.15 + rand() * 0.10))));
    }
    for (i = 0; i < 3; i++) {
      this.sprites.push(wispMask(rand, veil, 340, 125));
    }
    /* Only a heap has enough of an edge for an edge light to mean anything.
       A veil has no outline to catch the sun, so giving it one would draw
       the very hard rim this is meant to be free of. */
    this.sprites.forEach(function (sp) {
      if (sp.kind === 'cumulus') sp.rim = rimOf(sp.canvas);
    });
    this.cursor = 0;
    var cumulus = [], sheets = [], wisps = [], veils = [];
    this.sprites.forEach(function (s, k) {
      (s.kind === 'cumulus' ? cumulus : s.kind === 'sheet' ? sheets
        : s.kind === 'veil' ? veils : wisps).push(k);
    });

    /* The field. Depth `k` runs 0 at the horizon to 1 nearest; size, height,
       opacity and parallax speed all follow from it, which is the whole of
       the perspective. Far clouds are many, small and crowded into the
       haze; near ones are few, large and move. */
    this.field = [];
    /* Veils are large and translucent, so each one costs real fill: this
       scene pays for OVERDRAW, not for cloud count. Fifty denser veils
       cover the sky as well as sixty faint ones for less of it. */
    var N = 50;
    /* Weather clumps. Spreading clouds evenly across the width is the
       giveaway of a generated sky — real ones have crowded stretches and
       open ones, and the open stretches are what make the crowded ones
       read as distance. */
    var groups = [];
    for (i = 0; i < 6; i++) groups.push(rand() * 1.7 - 0.35);
    for (i = 0; i < N; i++) {
      var k = Math.pow((i + rand() * 0.9) / N, 1.5);
      /* Roughly three in four are veils at every depth. A heap turns up
         now and then, and only where it is near enough to be worth it. */
      var r0 = rand();
      var pool = r0 < 0.70 ? veils
               : (r0 < 0.86 ? sheets : (k > 0.45 ? cumulus : veils));
      var sp = pool[Math.floor(rand() * pool.length) % pool.length];
      var gx = groups[Math.floor(rand() * groups.length) % groups.length];
      this.field.push({
        s: sp,
        x: gx + (rand() - 0.5) * 0.62,
        y: HORIZON - (HORIZON - TOP) * Math.pow(k, 1.45) + (rand() - 0.5) * 0.012,
        /* Distant cloud is not a small sharp cloud, it is a pale one. Fade
           it hard with depth, or the far field reads as specks of dirt. */
        /* Veils run wider and much fainter than a heap would. They are
           meant to overlap each other, several deep, and build their
           weight by stacking rather than by any one of them being solid. */
        w: (0.10 + 0.92 * Math.pow(k, 1.85)) * (this.sprites[sp].kind === 'veil' ? 1.2 : 1),
        a: (0.18 + 0.82 * Math.pow(k, 0.78)) * (this.sprites[sp].kind === 'veil' ? 1 : 0.9),
        speed: 0.0004 + 0.0085 * k * k,
        flip: rand() < 0.5
      });
    }

    /* Cirrus sits above the field, faint enough to read as structure
       rather than as something in the way of the words. */
    this.cirrus = [];
    for (i = 0; i < 4; i++) {
      this.cirrus.push({
        s: wisps[i % wisps.length],
        x: rand() * 1.7 - 0.35,
        y: 0.03 + rand() * 0.22,
        w: 0.70 + rand() * 0.70,
        a: 0.26 + rand() * 0.22,
        speed: 0.0010 + rand() * 0.0013,
        flip: rand() < 0.5
      });
    }

    /* Stars on a magnitude law: a very few bright ones carry the sky and
       the rest are faint. Uniform specks read as dust. */
    this.stars = [];
    var r2 = mulberry(77001);
    for (i = 0; i < 260; i++) {
      var m = Math.pow(r2(), 2.6);
      this.stars.push({
        x: r2(), y: r2() * 0.80,
        m: 0.12 + m * 0.88,
        p: r2() * 6.28
      });
    }
  };

  SkyScene.prototype.resize = function () {
    /* 1.5x, not 2x. A sky has no hard edge and no text in it, so the extra
       78% of pixels buys nothing a person can see and costs a fifth of the
       frame — the one place in this app where dropping resolution is free. */
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.grain = null;
    this.dirty = true;
  };

  /* A still grain plate. Without it, a five-stop gradient on an OLED phone
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
        if (a <= 0.015) continue;
        var x = st2.x * w, y = st2.y * h;
        if (st2.m > 0.86) {                      /* the few that carry it */
          var gl = g.createRadialGradient(x, y, 0, x, y, 4.5);
          gl.addColorStop(0, 'rgba(226,236,255,' + (a * 0.5) + ')');
          gl.addColorStop(1, 'rgba(226,236,255,0)');
          g.fillStyle = gl;
          g.beginPath(); g.arc(x, y, 4.5, 0, 6.2832); g.fill();
        }
        g.globalAlpha = a;
        g.fillStyle = '#fff';
        var r = st2.m > 0.86 ? 1.8 : st2.m > 0.6 ? 1.3 : 1;
        g.fillRect(x, y, r, r);
      }
      g.globalAlpha = 1;
    }

    if (s.moon && s.moon.a > 0.01) this.drawMoon(g, w, h, s);
    if (s.sun && s.sun.y < 1.12) this.drawSun(g, w, h, s);

    var lightX = s.sun ? s.sun.x : (s.moon ? s.moon.x : 0.5);
    /* One light direction for the whole sky, not one per cloud: a per-cloud
       side flips as it drifts past the sun, and the flip pops. */
    var side = lightX >= 0.5 ? 1 : -1;
    this.relight(s, side);

    this.drawCirrus(g, w, h, s);

    /* A band of lighter air sitting on the horizon. Cheap, and it is most
       of what separates a painted sky from a CSS gradient. */
    var hz = g.createLinearGradient(0, h * 0.44, 0, h);
    hz.addColorStop(0, rgba(s.cloudLit, 0));
    hz.addColorStop(1, rgba(s.cloudLit, s.haze * 0.30));
    g.fillStyle = hz;
    g.fillRect(0, h * 0.44, w, h * 0.56);

    this.drawClouds(g, w, h, s, side);
    this.drawHorizon(g, w, h, s);
  };

  /* One frame's allowance for re-lighting, spent by `shade`, handed out
     round-robin so the same two sprites do not win it every frame and leave
     the rest permanently stale. A sprite with no shaded copy at all is
     drawn urgently and ignores the budget, so the first frame is complete
     rather than half-empty. */
  SkyScene.prototype.relight = function (s, side) {
    this.budget = 2;
    var n = this.sprites.length;
    for (var i = 0; i < n && this.budget > 0; i++) {
      this.shade((this.cursor + i) % n, s, side, false);
    }
    this.cursor = (this.cursor + 1) % n;
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

  /* Where the field vanishes. A luminous seam plus a wash below it: the
     photographs all have one, and without it the bottom of the frame is
     simply unused. */
  SkyScene.prototype.drawHorizon = function (g, w, h, s) {
    var y = HORIZON * h;
    var seam = g.createLinearGradient(0, y - h * 0.09, 0, y + h * 0.05);
    seam.addColorStop(0, rgba(s.cloudLit, 0));
    seam.addColorStop(0.62, rgba(s.cloudLit, s.haze * 0.26));
    seam.addColorStop(1, rgba(s.cloudLit, 0));
    g.fillStyle = seam;
    g.fillRect(0, y - h * 0.09, w, h * 0.14);
  };

  SkyScene.prototype.drawCirrus = function (g, w, h, s) {
    for (var i = 0; i < this.cirrus.length; i++) {
      var c = this.cirrus[i];
      var drift = this.reduced ? 0 : this.phase * c.speed;
      var px = ((c.x + drift) % 1.7 + 1.7) % 1.7 - 0.35;
      var pw = c.w * w;
      var sp = this.sprites[c.s];
      var ph = pw * sp.canvas.height / sp.canvas.width;
      if (px * w + pw < -40 || px * w > w + 40) continue;
      g.globalAlpha = c.a * (0.25 + 0.75 * (1 - Math.min(1, s.star)));
      this.blit(g, this.shade(c.s, s, 1, !this.sprites[c.s].shaded),
                px * w, c.y * h, pw, ph, c.flip);
    }
    g.globalAlpha = 1;
  };

  /* The cloud field, back to front. Each instance is one draw of a sprite
     that was lit once this frame — position, scale, opacity and a flip are
     all an instance owns. */
  SkyScene.prototype.drawClouds = function (g, w, h, s, side) {
    for (var i = 0; i < this.field.length; i++) {
      var c = this.field[i];
      var drift = this.reduced ? 0 : this.phase * c.speed;
      var px = ((c.x + drift) % 1.7 + 1.7) % 1.7 - 0.35;
      var X = px * w;
      var pw = c.w * w;
      var sp = this.sprites[c.s];
      var ph = pw * sp.canvas.height / sp.canvas.width;
      if (X + pw < -48 || X > w + 48) continue;
      var Y = c.y * h - ph * (sp.base / sp.canvas.height);
      g.globalAlpha = c.a;
      this.blit(g, this.shade(c.s, s, side, !sp.shaded), X, Y, pw, ph, c.flip);
    }
    g.globalAlpha = 1;
  };

  SkyScene.prototype.blit = function (g, img, x, y, w, h, flip) {
    if (!flip) { g.drawImage(img, x, y, w, h); return; }
    g.save();
    g.translate(x + w, y);
    g.scale(-1, 1);
    g.drawImage(img, 0, 0, w, h);
    g.restore();
  };

  /* Quantised to steps of eight so the easing between skies re-lights the
     library every few frames rather than every frame. Eight parts in 255 is
     invisible on a low-contrast cloud, and re-lighting thirteen sprites is
     the engine's single largest cost. */
  function shadeKey(c) { return (c[0] >> 3) + '.' + (c[1] >> 3) + '.' + (c[2] >> 3); }

  /* Light the whole mass ONCE.
     Shading each lobe separately — a lit copy offset up, a dark copy offset
     down — leaves a bright crescent on top of every lobe and a dark one
     beneath it, and a cloud becomes a stack of curved segments. Light does
     not fall on lobes; it falls on the cloud. So the silhouette is unioned
     at build time and lit here as one form: a directional gradient across
     the body, soft touches clipped INSIDE the mass for internal volume, and
     an edge light that follows the fractal outline rather than any one
     lobe's circle. */
  /* Lighting a sprite is four full passes over its pixels, and the library
     is thirteen sprites. Doing them all on whichever frame happens to cross
     a quantisation step cost 107ms — a stall, right in the middle of the
     Descent's easing. So a frame re-lights at most a couple of sprites and
     the rest keep last frame's colours for a beat, which across a
     two-second ease nobody can see. */
  SkyScene.prototype.shade = function (idx, s, side, urgent) {
    var sp = this.sprites[idx];
    var key = shadeKey(s.cloudLit) + '|' + shadeKey(s.cloudBody) + '|' +
              shadeKey(s.cloudBase) + '|' + side + '|' + Math.round(s.rim * 10);
    if (sp.key === key) return sp.shaded;
    if (sp.shaded && !urgent && this.budget <= 0) return sp.shaded;
    this.budget--;

    var mw = sp.canvas.width, mh = sp.canvas.height;
    if (!sp.shaded) {
      sp.shaded = document.createElement('canvas');
      sp.shaded.width = mw;
      sp.shaded.height = mh;
    }
    var g = sp.shaded.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, mw, mh);
    g.drawImage(sp.canvas, 0, 0);

    if (sp.kind === 'wisp') {
      /* Cirrus is ice catching light from above; it has no underside worth
         modelling, so one wash and nothing else. */
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = rgba(mixRGB(s.cloudLit, [255, 255, 255], 0.35), 1);
      g.fillRect(0, 0, mw, mh);
      g.globalCompositeOperation = 'source-over';
      sp.key = key;
      return sp.shaded;
    }

    /* The form light. Its axis is scaled to the sprite's HEIGHT, not its
       width — tie the lean to the width and on a wide cloud the horizontal
       component swamps the vertical, which paints the whole crown in body
       grey.

       How far the ramp is allowed to travel is what sets the cloud's
       character. A cumulus earns its full range, white crown to near-black
       base, because it is thick enough to stop the light. A veil is not:
       light goes through it, so it has no shadowed underside, and running
       the same ramp over one turns a wisp into a slab. Veils therefore
       live in the top half of the range and never reach the base colour at
       all. */
    var flat = sp.kind === 'sheet';
    var thin = sp.kind === 'veil';
    var dark = thin ? mixRGB(s.cloudLit, s.cloudBody, 0.72)
             : flat ? mixRGB(s.cloudBody, s.cloudBase, 0.55)
             : s.cloudBase;
    var mid = thin ? mixRGB(s.cloudLit, s.cloudBody, 0.34)
            : mixRGB(s.cloudLit, s.cloudBody, flat ? 0.62 : 0.38);
    var lean = mh * (thin ? 1.1 : flat ? 0.9 : 0.55) * side;
    var grad = g.createLinearGradient(mw * 0.5 + lean, -mh * 0.04,
                                      mw * 0.5 - lean, mh * (thin ? 1.35 : flat ? 1.20 : 0.94));
    grad.addColorStop(0, rgba(s.cloudLit, 1));
    grad.addColorStop(thin ? 0.46 : flat ? 0.42 : 0.30, rgba(mid, 1));
    grad.addColorStop(thin ? 0.80 : flat ? 0.74 : 0.64, rgba(s.cloudBody, 1));
    grad.addColorStop(1, rgba(dark, 1));
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = grad;
    g.fillRect(0, 0, mw, mh);

    /* The baked crown, added rather than painted: `lighter` is zero where
       the rim is transparent, so it can only brighten what is already
       cloud and can never leak outside the silhouette. */
    if (s.rim > 0.02 && sp.rim) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.min(1, s.rim) * (flat ? 0.28 : 0.42);
      g.drawImage(sp.rim, 0, 0);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'source-over';

    sp.key = key;
    return sp.shaded;
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
