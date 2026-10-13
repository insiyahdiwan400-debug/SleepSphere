/**
 * SleepSphere Living Sky — recorded footage.
 *
 * THE TESTING LIMITATION, STATED FIRST BECAUSE IT SHAPES EVERYTHING BELOW.
 * This project's Chromium is built without H.264: `canPlayType` for
 * avc1.42E01E returns the empty string, and the two shipped clips —
 * genuinely H.264, read from the `avc1` sample-description box in the files
 * themselves — cannot be decoded here at all. So this suite proves:
 *
 *   · the shipped files really are H.264 in MP4            (bytes on disk)
 *   · the adapter builds the right element for iPhone       (DOM)
 *   · the adapter actually PLAYS a real video               (WebM fixture)
 *   · every failure path degrades to the drawn sky          (DOM + status)
 *   · a sky failure cannot touch sleep tracking or nav      (app state)
 *
 * It does NOT prove that H.264 decodes on iPhone Safari. Nothing in this
 * container can. That is reported as unverified rather than assumed, and
 * it is the one thing that needs a real device.
 *
 * The WebM fixture is a recorded canvas gradient. It exists so the play
 * path runs against a real decodable video rather than a mock. It is not
 * sky footage, is never shipped, and is never presented as one.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8099/index.html';
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
};

const clockAt = h => `(()=>{const R=Date;const f=new R(2026,9,13,${h},30,0);
  class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
  static now(){return f.getTime();}} window.Date=D;})()`;

async function open(browser, hour, opts) {
  const ctx = await browser.newContext(Object.assign({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  }, opts || {}));
  const errs = [];
  if (typeof hour === 'number') await ctx.addInitScript(clockAt(hour));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => { const e = document.getElementById('previewBar'); if (e) e.remove(); });
  await p.waitForTimeout(600);
  return { ctx, p, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  /* ================================================================
     1. The shipped files. Read the bytes, not the filename.
     ================================================================ */
  {
    const clips = ['assets/sky/night-sky.mp4', 'assets/sky/evening-clouds.mp4'];
    for (const rel of clips) {
      const file = path.join(ROOT, rel);
      const exists = fs.existsSync(file);
      check('12 · ' + rel + ' is in the repository', exists);
      if (!exists) continue;
      const buf = fs.readFileSync(file);
      const head = buf.subarray(0, 262144).toString('latin1');
      /* `ftyp` is the MP4 container. `avc1` in the sample description is
         H.264 — as opposed to `mp4v`, which is MPEG-4 Part 2 and will not
         play on an iPhone. The distinction is the whole requirement. */
      check('12 · ' + rel + ' is an MP4 container', /ftyp/.test(head.slice(0, 32)));
      check('12 · ' + rel + ' is H.264, not MPEG-4 Part 2',
        head.includes('avc1') && !/mp4v/.test(head), head.includes('avc1') ? 'avc1' : 'NO avc1');
      const mb = buf.length / 1048576;
      check('12 · ' + rel + ' is a sane size for mobile', mb > 0.2 && mb < 20,
        mb.toFixed(1) + 'MB');
    }
  }

  /* ================================================================
     2. The manifest names only footage that exists. (Requirement 4)
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 23);
    const manifest = await p.evaluate(() => window.SSLivingSky.FOOTAGE);
    const keys = Object.keys(manifest);
    check('4 · Every daypart in the manifest names a real file',
      keys.every(k => manifest[k].mp4 && /^\.\/assets\/sky\/.+\.mp4$/.test(manifest[k].mp4)),
      keys.join('/'));
    for (const k of keys) {
      const rel = manifest[k].mp4.replace(/^\.\//, '');
      check('4 · ' + k + ' → ' + rel + ' exists on disk', fs.existsSync(path.join(ROOT, rel)));
      check('4 · ' + k + ' carries its licence credit',
        /CC BY/.test(manifest[k].credit) && /^https:\/\//.test(manifest[k].source),
        manifest[k].credit);
    }
    /* There must be NO entry for a daypart with no footage. */
    const uncovered = ['dawn', 'morning', 'day'].filter(k => k in manifest);
    check('4 · No placeholder entry for a daypart without footage',
      uncovered.length === 0, uncovered.join(',') || 'none');
    await ctx.close();
  }

  /* ================================================================
     3. The element the iPhone needs. (Requirement: playsinline etc.)
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 23);
    await p.waitForTimeout(700);
    const v = await p.evaluate(() => {
      const el = document.querySelector('.ss-living-sky-video');
      if (!el) return null;
      return {
        playsinline: el.hasAttribute('playsinline'),
        webkit: el.hasAttribute('webkit-playsinline'),
        muted: el.muted, defaultMuted: el.defaultMuted,
        loop: el.loop, autoplay: el.autoplay,
        preload: el.preload,
        sources: [...el.querySelectorAll('source')].map(s => s.type),
        firstSource: (el.querySelector('source') || {}).type
      };
    });
    check('3 · A video element is built for a covered daypart', v !== null);
    if (v) {
      check('3 · playsinline and webkit-playsinline are both set',
        v.playsinline && v.webkit);
      check('3 · muted, and muted as an attribute too', v.muted && v.defaultMuted);
      check('3 · loop and autoplay', v.loop && v.autoplay);
      check('3 · MP4 is offered FIRST, so Safari takes the hardware path',
        v.firstSource === 'video/mp4', v.sources.join(' then '));
    }
    await ctx.close();
  }

  /* ================================================================
     4. The play path, against a real decodable video. (Scenario 12,
        as far as this container can go.)
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 23);
    const canH264 = await p.evaluate(() =>
      document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'));
    check('12 · (context) this browser cannot decode H.264 at all',
      canH264 === '', '"' + canH264 + '"');

    /* So the play path is proved with a format it CAN decode. Same adapter,
       same code path, real video, real frames. */
    const played = await p.evaluate(async () => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;z-index:-1';
      document.body.appendChild(host);
      const h = window.SSLivingSky.mount(host, {
        webmUrl: './test/fixtures/playback-probe.webm', timeoutMs: 8000
      });
      await new Promise(r => setTimeout(r, 2000));
      const v = host.querySelector('video');
      /* Two samples, because the fixture is about a second long and loops:
         a single reading can land just after a wrap and read ~0 on a video
         that is playing perfectly well. What matters is that the playhead
         MOVES. */
      const t1 = v ? v.currentTime : 0;
      await new Promise(r => setTimeout(r, 400));
      const t2 = v ? v.currentTime : 0;
      let frame = null;
      if (v && v.videoWidth) {
        const c = document.createElement('canvas');
        c.width = 32; c.height = 18;
        c.getContext('2d').drawImage(v, 0, 0, 32, 18);
        const d = c.getContext('2d').getImageData(0, 0, 32, 18).data;
        let sum = 0; const uniq = new Set();
        for (let i = 0; i < d.length; i += 4) { sum += d[i] + d[i+1] + d[i+2]; uniq.add(d[i] + ',' + d[i+1] + ',' + d[i+2]); }
        frame = { meanLuma: Math.round(sum / (32 * 18 * 3)), distinct: uniq.size };
      }
      const out = { status: h.getStatus(), w: v && v.videoWidth, h: v && v.videoHeight,
                    t1: +t1.toFixed(2), t2: +t2.toFixed(2), moved: t2 !== t1,
                    paused: v ? v.paused : true, frame };
      h.destroy(); host.remove();
      return out;
    });
    check('12 · The adapter reaches "playing" with a real video',
      played.status === 'playing', played.status);
    check('12 · The video has real dimensions', played.w > 0 && played.h > 0,
      played.w + 'x' + played.h);
    check('12 · And the playhead is actually moving',
      played.moved && played.paused === false, played.t1 + ' -> ' + played.t2);
    /* A real decoded frame, not a black rectangle. */
    check('12 · A real frame rendered, with actual picture in it',
      played.frame && played.frame.distinct > 2 && played.frame.meanLuma > 5,
      played.frame ? played.frame.distinct + ' distinct colours, luma ' + played.frame.meanLuma : 'no frame');
    await ctx.close();
  }

  /* ================================================================
     5. Failure degrades to the drawn sky. (Scenario 13)
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser, 13);     /* a daypart with no footage */
    const day = await p.evaluate(() => ({
      key: window.SSLivingSky.dayKey(),
      status: window.SSLivingSky.status(),
      video: document.querySelectorAll('.ss-living-sky-video').length,
      credit: document.getElementById('skyCredit') !== null,
      /* The drawn sky must still be there and still be the thing showing. */
      starfield: Boolean(document.getElementById('starfield')),
      starsVisible: getComputedStyle(document.getElementById('starfield')).opacity !== '0'
    }));
    check('13 · A daypart with no footage reports unavailable',
      day.status === 'unavailable', day.key + ' → ' + day.status);
    check('13 · No video element is created for it', day.video === 0);
    check('13 · And no credit is shown for footage that is not playing', day.credit === false);
    check('13 · The drawn sky is still present and visible',
      day.starfield && day.starsVisible);

    /* The app itself must be untouched by any of this. */
    const app = await p.evaluate(() => ({
      tabs: document.querySelectorAll('.nav button[data-view]').length,
      engine: typeof window.SS.engine.mornings === 'function',
      phase: Boolean(window.SS.engine.phase())
    }));
    check('13 · All four destinations still present', app.tabs === 4, String(app.tabs));
    check('13 · The sleep engine is untouched', app.engine && app.phase);
    check('13 · No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  {
    /* A source that 404s must fail to the drawn sky, not hang or throw. */
    const { ctx, p, errs } = await open(browser, 23);
    const broken = await p.evaluate(async () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const h = window.SSLivingSky.mount(host, {
        mp4Url: './assets/sky/does-not-exist.mp4', timeoutMs: 3000
      });
      await new Promise(r => setTimeout(r, 4200));
      const s = h.getStatus();
      h.destroy(); host.remove();
      return s;
    });
    check('13 · A missing file fails to "unavailable"', broken === 'unavailable', broken);
    /* The 404 itself is expected — the whole point is to request something
       that is not there — and the browser logs it. What must not happen is
       an exception reaching the page, so that is what is asserted, with the
       one console line this check deliberately provokes allowed through. */
    const unexpected = errs.filter(e => !/does-not-exist\.mp4|404|Failed to load resource/i.test(e));
    check('13 · Without throwing anything at the page',
      unexpected.length === 0, unexpected.join(' | ') || 'only the expected 404');
    await ctx.close();
  }
  {
    /* And a bad URL is refused outright rather than attempted. */
    const { ctx, p } = await open(browser, 23);
    const refused = await p.evaluate(async () => {
      const out = {};
      for (const [name, opts] of [
        ['no source', {}],
        ['not a url', { mp4Url: 'sky.mp4' }],
        ['not mp4', { mp4Url: './assets/sky/night-sky.gif' }],
        ['http not https', { mp4Url: 'http://example.com/sky.mp4' }],
        ['a data uri', { mp4Url: 'data:video/mp4;base64,AAAA' }]
      ]) {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = window.SSLivingSky.mount(host, opts);
        out[name] = { status: h.getStatus(), video: host.querySelectorAll('video').length };
        h.destroy(); host.remove();
      }
      return out;
    });
    const names = Object.keys(refused);
    check('4 · Every non-media source is refused without a video element',
      names.every(n => refused[n].status === 'unavailable' && refused[n].video === 0),
      names.map(n => n + ':' + refused[n].status).join(' '));
    await ctx.close();
  }

  /* ================================================================
     6. Reduced motion. (Scenario 14)
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 23, { reducedMotion: 'reduce' });
    await p.waitForTimeout(900);
    const r = await p.evaluate(async () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const h = window.SSLivingSky.mount(host, {
        webmUrl: './test/fixtures/playback-probe.webm', timeoutMs: 8000
      });
      await new Promise(x => setTimeout(x, 2200));
      const v = host.querySelector('video');
      const out = { status: h.getStatus(), paused: v && v.paused, time: v && +v.currentTime.toFixed(2),
                    autoplay: v && v.autoplay };
      h.destroy(); host.remove();
      return out;
    });
    check('14 · Under reduced motion the sky does not autoplay',
      r.status === 'paused', r.status);
    check('14 · The video is genuinely paused', r.paused === true);
    check('14 · And autoplay was never requested', r.autoplay === false);
    /* It must still be a sky, not a blank rectangle — a still first frame. */
    const anim = await p.evaluate(() =>
      document.getAnimations().filter(a => a.playState === 'running').length);
    check('14 · Nothing else is animating either', anim === 0, String(anim));
    await ctx.close();
  }

  /* ================================================================
     7. The app keeps working with footage in place. (Scenario 15,
        and requirement 3.)
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser, 23);
    await p.waitForTimeout(800);
    const nav = [];
    for (const v of ['today', 'twin', 'learn', 'data']) {
      await p.evaluate(x => document.querySelector(`.nav button[data-view="${x}"]`).click(), v);
      await p.waitForTimeout(320);
      nav.push(await p.evaluate(x => {
        const s = document.getElementById(x);
        return s && s.classList.contains('active') && s.innerText.trim().length > 40 ? x : 'BROKEN:' + x;
      }, v));
    }
    check('15 · All four tabs still work with the sky layer mounted',
      nav.every(x => !x.startsWith('BROKEN')), nav.join(' '));

    const intact = await p.evaluate(() => ({
      motherhood: Boolean(document.getElementById('mhEntry')),
      explore: (() => { document.querySelector('.nav button[data-view="learn"]').click();
                        return document.querySelectorAll('.ex-tile').length; })(),
      insights: (() => { document.querySelector('.nav button[data-view="twin"]').click();
                         return Boolean(document.getElementById('insights')); })(),
      engineMornings: typeof window.SS.engine.mornings === 'function',
      skyBehind: (() => {
        const sky = document.getElementById('livingSky');
        const shell = document.querySelector('.app-shell');
        if (!sky || !shell) return false;
        return getComputedStyle(sky).pointerEvents === 'none' &&
               Number(getComputedStyle(sky).zIndex) < Number(getComputedStyle(shell).zIndex || 1);
      })()
    }));
    check('15 · Motherhood is still reachable', intact.motherhood);
    check('15 · Explore still has its practices', intact.explore === 6, String(intact.explore));
    check('15 · Insights is still mounted', intact.insights);
    check('15 · Sleep tracking is untouched', intact.engineMornings);
    check('15 · The sky sits behind the app and takes no taps', intact.skyBehind);
    check('15 · No console errors across the pass', errs.length === 0, errs.join(' | '));

    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('15 · No horizontal scroll', over <= 1, over + 'px');
    await ctx.close();
  }

  /* ================================================================
     8. The honest labelling. (Requirements 1 and 6.)
     ================================================================ */
  {
    const src = fs.readFileSync(path.join(ROOT, 'living-sky.js'), 'utf8');
    check('1 · The drawn sky is never called footage',
      !/canvas[^.\n]{0,40}footage|footage[^.\n]{0,40}canvas/i.test(
        src.replace(/never[\s\S]{0,80}footage/gi, '')),
      'no claim found');
    check('6 · The H.264-on-iPhone limitation is written down, not hidden',
      /UNVERIFIED/.test(src) && /without H\.264/.test(src));
    const credits = fs.existsSync(path.join(ROOT, 'CREDITS.md'))
      ? fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8') : '';
    check('5 · Both clips are credited in CREDITS.md',
      /Chris Waits/.test(credits) && /CC BY 2\.0/.test(credits) && /archive\.org/.test(credits));
  }

  await browser.close();
  console.log('');
  console.log(fail ? `${fail} FAILED, ${pass} passed` : 'ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
