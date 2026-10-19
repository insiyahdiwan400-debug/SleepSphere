/**
 * The Motherhood scenery, end to end in a browser.
 *
 * Two things this is really guarding.
 *
 * The first is the no-aircraft rule. An asset patch supplied two
 * photographs for this feature that were taken through an aircraft cabin
 * window, one with a wing and winglet in frame, and they were named
 * aurora.webp and firstlight.webp — exactly the filenames the design
 * calls for. A filename proves nothing about what is in a file, so this
 * pins the four scenes to the specific images that were reviewed, by
 * content hash. If a scene's bytes change, this fails and someone looks
 * at the picture again.
 *
 * The second is that the scene is private. It is a preference, which is
 * normally the most harmless thing in an app — but this one says a person
 * uses the Motherhood module, and that is the fact the whole module is
 * built to keep. It must live in the encrypted vault and nowhere else:
 * not localStorage, not a data attribute that survives locking.
 *
 * Needs the repository served at :8099.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://localhost:8099/index.html';
const SCENES = ['aurora', 'starlake', 'firstlight', 'moonmeadow'];

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
};

/* The reviewed images, by content: the first 16 hex of each file's
   SHA-256. Update these deliberately, when a photograph is genuinely
   being replaced and someone has looked at the replacement — never to
   make a red test go green. A changed hash means the picture changed,
   and the picture is the thing nobody can check by reading the diff. */
const APPROVED = {
  'aurora.webp': '73f225ba2cd7595a',
  'aurora-thumb.webp': '59ddfd8728d75e8d',
  'starlake.webp': 'aad77f66450929f1',
  'starlake-thumb.webp': 'a486aa397ff8cf00',
  'firstlight.webp': 'd4d85be89ed0c8c2',
  'firstlight-thumb.webp': 'a4785973055483a3',
  'moonmeadow.webp': 'fad649117e9a8a63',
  'moonmeadow-thumb.webp': '226ee5552df29263'
};
const hashOf = file =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);

(async () => {
  /* ================================================================
     1. The files themselves.
     ================================================================ */
  const css = fs.readFileSync(path.join(ROOT, 'motherhood.css'), 'utf8');
  for (const scene of SCENES) {
    for (const [kind, rel] of [
      ['background', 'media/motherhood/' + scene + '.webp'],
      ['thumbnail', 'media/motherhood/' + scene + '-thumb.webp']
    ]) {
      const full = path.join(ROOT, rel);
      const exists = fs.existsSync(full);
      const size = exists ? fs.statSync(full).size : 0;
      check(`1 · ${scene} ${kind} exists and is a real image`,
        exists && size > 4000, size + ' bytes');
      if (exists) {
        const head = fs.readFileSync(full).subarray(0, 12);
        check(`1 · ${scene} ${kind} is really WebP`,
          head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP');
        const name = path.basename(rel);
        check(`1 · ${scene} ${kind} is the image that was reviewed`,
          hashOf(full) === APPROVED[name], hashOf(full));
      }
      check(`1 · the CSS points at ${rel}`, css.includes(rel));
    }
  }

  /* No scene may be drawn rather than photographed. A gradient or a
     radial-gradient star field standing in for one of the four is the
     failure this whole feature was rebuilt to avoid. */
  for (const scene of SCENES) {
    const rule = new RegExp('\\.mh-layer\\[data-scene="' + scene + '"\\][^}]*\\{[^}]*\\}', 'g');
    const blocks = css.match(rule) || [];
    const drawnSky = blocks.some(b => /radial-gradient\([^)]*#fff/.test(b));
    check(`1 · ${scene} is not an illustrated sky`, drawnSky === false);
  }

  /* ================================================================
     2. In the browser: every scene loads, and none is broken.
     ================================================================ */
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
  });
  const page = await ctx.newPage();
  const errs = [];
  const bad = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('response', r => {
    if (/media\/motherhood\//.test(r.url()) && r.status() >= 400) bad.push(r.status() + ' ' + r.url());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
  await page.waitForTimeout(700);

  /* Every scene's photograph decodes at its real size. decode() rejects
     on a broken image, which is the thing that must never reach a
     person: no broken-image icon, no empty black screen. */
  const decoded = await page.evaluate(async (scenes) => {
    const out = {};
    for (const scene of scenes) {
      for (const suffix of ['', '-thumb']) {
        const img = new Image();
        img.src = '/media/motherhood/' + scene + suffix + '.webp';
        try {
          await img.decode();
          out[scene + suffix] = img.naturalWidth + 'x' + img.naturalHeight;
        } catch (e) { out[scene + suffix] = 'FAILED'; }
      }
    }
    return out;
  }, SCENES);
  for (const scene of SCENES) {
    check(`2 · ${scene} decodes in the browser`,
      decoded[scene] !== 'FAILED' && /^\d+x\d+$/.test(decoded[scene] || ''), decoded[scene]);
    check(`2 · ${scene} background is big enough for a phone`,
      Math.max(...String(decoded[scene] || '0x0').split('x').map(Number)) >= 1400, decoded[scene]);
    check(`2 · ${scene} thumbnail is small enough to be worth having`,
      Math.max(...String(decoded[scene + '-thumb'] || '9999x9999').split('x').map(Number)) <= 600,
      decoded[scene + '-thumb']);
  }
  check('2 · No Motherhood media request failed', bad.length === 0, bad.join(' | '));

  /* ================================================================
     3. The scene is stored in the vault and nowhere else.
     ================================================================ */
  const stored = await page.evaluate(async () => {
    await window.SSMotherhood.createVault('a passcode for the test');
    await window.SSMotherhood.setScene('moonmeadow');
    const keys = Object.keys(localStorage);
    const everything = keys.map(k => k + '=' + localStorage.getItem(k)).join('\n');
    return {
      inVault: window.SSMotherhood.vault().scene,
      /* The word must not appear anywhere in plain storage. The vault's
         own record is ciphertext, so a hit here is a real leak. */
      leaked: /moonmeadow/i.test(everything),
      keys
    };
  });
  check('3 · The chosen scene is kept in the vault', stored.inVault === 'moonmeadow');
  check('3 · And does not appear anywhere in plain storage',
    stored.leaked === false, stored.keys.join(', '));

  /* It survives locking and unlocking, which is the thing a person would
     actually notice: come back tomorrow and it is still your place. */
  const roundTrip = await page.evaluate(async () => {
    window.SSMotherhood.lock();
    const whileLocked = document.querySelector('.mh-layer');
    await window.SSMotherhood.unlock('a passcode for the test');
    return {
      scene: window.SSMotherhood.vault().scene,
      attributeWhileLocked: whileLocked ? whileLocked.dataset.scene : null
    };
  });
  check('3 · The scene survives locking and unlocking', roundTrip.scene === 'moonmeadow');

  /* An unknown scene is refused rather than stored and rendered as a
     missing file later. */
  const refused = await page.evaluate(async () => {
    try { await window.SSMotherhood.setScene('aerodrome'); return 'accepted'; }
    catch (e) { return String(e.message); }
  });
  check('3 · An unknown scene is refused', /unknown scene/.test(refused), refused);

  /* ================================================================
     4. Records survive a scene change. Changing the wallpaper must not
        cost anyone an entry.
     ================================================================ */
  const kept = await page.evaluate(async () => {
    await window.SSMotherhood.addEntry({ kind: 'day', note: 'before the scene changed' });
    await window.SSMotherhood.setScene('starlake');
    await window.SSMotherhood.addEntry({ kind: 'babySleep', from: '13:00', to: '14:30' });
    await window.SSMotherhood.setScene('aurora');
    const v = window.SSMotherhood.vault();
    return {
      scene: v.scene,
      notes: window.SSMotherhood.liveEntries(v).map(e => e.kind).sort().join(',')
    };
  });
  check('4 · Changing scenery keeps every record',
    kept.notes === 'babySleep,day', kept.notes);
  check('4 · And the latest choice is the one kept', kept.scene === 'aurora');

  check('4 · No uncaught page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();

  /* ================================================================
     5. Where the choice is offered.

        Asked once, at the end of setting the module up, and available
        from Settings after that — not standing in front of the records
        every time someone opens them.
     ================================================================ */
  {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p2 = await c2.newPage();
    await p2.goto(BASE, { waitUntil: 'networkidle' });
    await p2.waitForTimeout(1800);
    await p2.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
    await p2.waitForTimeout(600);

    /* A brand-new vault, driven the way the setup flow drives it. */
    const firstRun = await p2.evaluate(async () => {
      await window.SSMotherhood.createVault('a passcode for the test');
      window.__mhUI.open();
      await new Promise(r => setTimeout(r, 400));
      /* Stage is the last question of setup; answering it should lead to
         the scenery step, not past it. */
      const panel = document.querySelector('.mh-layer');
      const picked = [...panel.querySelectorAll('button')].find(b => /after birth/i.test(b.textContent));
      if (picked) picked.click();
      await new Promise(r => setTimeout(r, 250));
      const save = [...panel.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save');
      if (save) save.click();
      await new Promise(r => setTimeout(r, 900));
      return {
        title: (panel.querySelector('.mh-bar-title') || {}).textContent || '',
        tiles: panel.querySelectorAll('.mh-scene-choice').length,
        hasContinue: [...panel.querySelectorAll('button')].some(b => b.textContent.trim() === 'Continue')
      };
    });
    check('5 · Setup ends on the scenery step', /your place/i.test(firstRun.title), firstRun.title);
    check('5 · Which offers all four scenes', firstRun.tiles === 4, String(firstRun.tiles));
    check('5 · And a way to continue without picking', firstRun.hasContinue === true);

    /* Continuing without touching a tile records the default as chosen,
       so the step does not reappear on every visit. */
    const after = await p2.evaluate(async () => {
      const panel = document.querySelector('.mh-layer');
      [...panel.querySelectorAll('button')].find(b => b.textContent.trim() === 'Continue').click();
      await new Promise(r => setTimeout(r, 900));
      return {
        chosen: window.SSMotherhood.vault().sceneChosen,
        title: (panel.querySelector('.mh-bar-title') || {}).textContent || ''
      };
    });
    check('5 · Continuing records that the choice was made', after.chosen === true);
    check('5 · And lands on the records', /motherhood/i.test(after.title), after.title);

    /* Opening again goes straight to the records. */
    const second = await p2.evaluate(async () => {
      window.__mhUI.close();
      await new Promise(r => setTimeout(r, 300));
      await window.SSMotherhood.unlock('a passcode for the test');
      window.__mhUI.open();
      await new Promise(r => setTimeout(r, 700));
      const panel = document.querySelector('.mh-layer');
      return {
        title: (panel.querySelector('.mh-bar-title') || {}).textContent || '',
        tiles: panel.querySelectorAll('.mh-scene-choice').length
      };
    });
    check('5 · Opening again does not ask again',
      /motherhood/i.test(second.title) && second.tiles === 0, second.title + ', ' + second.tiles + ' tiles');
    await c2.close();
  }

  /* ================================================================
     6. When the photographs do not arrive.

        A person on a bad connection, or a cache that dropped the media,
        must get a calm readable page — not a broken-image icon and not
        a black screen. Every scene request is failed outright here.
     ================================================================ */
  {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await c3.route('**/media/motherhood/*', r => r.abort());
    const p3 = await c3.newPage();
    const e3 = [];
    p3.on('pageerror', e => e3.push(e.message));
    await p3.goto(BASE, { waitUntil: 'networkidle' });
    await p3.waitForTimeout(1800);
    await p3.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
    await p3.waitForTimeout(600);
    const blind = await p3.evaluate(async () => {
      await window.SSMotherhood.createVault('a passcode for the test');
      await window.SSMotherhood.setStage('postpartum', { birthDate: '', feeding: '' });
      await window.SSMotherhood.setScene('moonmeadow');
      window.__mhUI.open();
      await new Promise(r => setTimeout(r, 900));
      const panel = document.querySelector('.mh-layer');
      /* The body is transparent now, so the ground is the layer's own
         background colour — what shows when no photograph loads. */
      const bg = getComputedStyle(panel).backgroundColor;
      const rgb = bg.match(/\d+/g).map(Number).slice(0, 3);
      const heading = panel.querySelector('h2');
      const ink = getComputedStyle(heading || panel).color.match(/\d+/g).map(Number).slice(0, 3);
      const lum = c => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const l1 = lum(ink), l2 = lum(rgb);
      const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return {
        contrast,
        /* No <img> means no broken-image icon is even possible: the
           scenery is painted as a background, which simply does not
           appear when it cannot load. */
        brokenImages: [...panel.querySelectorAll('img')]
          .filter(i => i.complete && i.naturalWidth === 0).length,
        bodyBackground: rgb,
        /* Not a black screen. */
        light: rgb[0] + rgb[1] + rgb[2] > 480,
        headingVisible: Boolean(heading && heading.offsetParent !== null && heading.textContent.trim()),
        tiles: panel.querySelectorAll('.mh-tile').length
      };
    });
    check('6 · No broken image is shown', blind.brokenImages === 0);
    /* This used to assert the page stayed LIGHT. That was right when the
       scenery was a strip above an ivory page; the module is now
       full-bleed photography with ivory text on a dark scrim, so a light
       fallback would be the unreadable outcome, not the safe one. What
       has to hold either way is contrast, so that is what is measured —
       the floor under a photograph that never loads is deep celestial
       blue, and ivory on it is still a legible screen. */
    check('6 · The fallback ground keeps the text readable',
      blind.contrast >= 4.5, blind.contrast.toFixed(2) + ':1 on rgb(' + blind.bodyBackground.join(',') + ')');
    check('6 · The heading is still readable', blind.headingVisible === true);
    check('6 · And the records are still reachable', blind.tiles > 0, String(blind.tiles));
    check('6 · Nothing threw when the media failed', e3.length === 0, e3.join(' | '));
    await c3.close();
  }

  /* ================================================================
     7. Text over photography, measured rather than judged.

        The module is now full-bleed: every word sits on a translucent
        panel over a photograph, so a card's effective background is
        whatever is behind it. Reading the CSS cannot tell you what that
        composites to — a dawn valley and a near-black meadow behind the
        same panel are two different backgrounds. So this screenshots
        each scene and samples the pixels actually drawn inside each
        panel, in a band with no glyphs in it, then computes the WCAG
        ratio against the real text colour.

        4.5:1 is the AA floor for body text. The hero is large serif and
        would only need 3:1, but it is held to the same line rather than
        given an exemption that would quietly licence a weaker scrim.
     ================================================================ */
  {
    const c4 = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true
    });
    const p4 = await c4.newPage();
    await p4.goto(BASE, { waitUntil: 'networkidle' });
    await p4.waitForTimeout(1700);
    await p4.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
    await p4.waitForTimeout(600);
    await p4.evaluate(async () => {
      await window.SSMotherhood.createVault('a passcode for the test');
      await window.SSMotherhood.setStage('postpartum', { birthDate: '', feeding: '' });
      await window.SSMotherhood.addEntry({ kind: 'night', from: '22:40', to: '06:10', wakes: 2 });
      window.__mhUI.open();
    });
    await p4.waitForTimeout(900);

    for (const scene of SCENES) {
      await p4.evaluate(async s => { await window.SSMotherhood.setScene(s); window.__mhUI.route(); }, scene);
      await p4.waitForTimeout(1100);
      const boxes = await p4.evaluate(() => {
        const out = [];
        const push = (node, label, inset) => {
          if (!node) return;
          const r = node.getBoundingClientRect();
          if (r.width < 40 || r.height < 30 || r.bottom < 0 || r.top > innerHeight) return;
          out.push({ label, x: Math.round(r.left + inset), y: Math.round(r.top + inset),
                     w: Math.min(60, Math.round(r.width - inset * 2)), h: 10 });
        };
        document.querySelectorAll('.mh-layer .mh-card').forEach((c, i) => push(c, 'card' + i, 10));
        push(document.querySelector('.mh-layer .mh-stagecard'), 'hero', 6);
        document.querySelectorAll('.mh-layer .mh-tile').forEach((t, i) => { if (i < 2) push(t, 'tile' + i, 6); });
        return out;
      });
      const shot = await p4.screenshot({ type: 'png' });
      const worst = await p4.evaluate(async ([b64, boxes]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const lum = v => {
          const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2]);
        };
        const ink = [245, 244, 239];
        let low = 99, where = '';
        for (const bx of boxes) {
          const d = g.getImageData(bx.x, bx.y, Math.max(1, bx.w), Math.max(1, bx.h)).data;
          let r = 0, gg = 0, bb = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
          const avg = [r / n, gg / n, bb / n];
          const l1 = lum(ink), l2 = lum(avg);
          const cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          if (cr < low) { low = cr; where = bx.label + ' rgb(' + avg.map(Math.round).join(',') + ')'; }
        }
        return { low, where };
      }, [shot.toString('base64'), boxes]);
      check(`7 · ${scene}: text stays readable over the photograph`,
        worst.low >= 4.5, worst.low.toFixed(2) + ':1 worst at ' + worst.where);
    }
    await c4.close();
  }

  /* ================================================================
     8. Motion.

        The interface moves. The landscape does not, and that is not a
        stylistic preference — "use authentic motion footage only when
        an actual video asset exists" and "do not fake moving nature by
        panning still photographs". There is no video asset. So this
        checks both halves: that the animation is really there, and that
        none of it is applied to the photograph.
     ================================================================ */
  {
    const c5 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p5 = await c5.newPage();
    await p5.goto(BASE, { waitUntil: 'networkidle' });
    await p5.waitForTimeout(1700);
    await p5.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
    await p5.waitForTimeout(600);
    await p5.evaluate(async () => {
      await window.SSMotherhood.createVault('a passcode for the test');
      await window.SSMotherhood.setStage('postpartum', { birthDate: '', feeding: '' });
      await window.SSMotherhood.setScene('aurora');
      window.__mhUI.open();
    });
    await p5.waitForTimeout(1200);

    /* The cards really animate in. Caught by re-rendering the screen and
       reading the running animations in the same frame. */
    const entrance = await p5.evaluate(async () => {
      window.__mhUI.route();
      await new Promise(r => requestAnimationFrame(r));
      const running = document.querySelectorAll('.mh-layer .mh-card')[0];
      const anims = running ? running.getAnimations().map(a => a.animationName || '') : [];
      return { names: anims.join(','), count: anims.length };
    });
    check('8 · Cards animate in', entrance.count > 0 && /mh-rise/.test(entrance.names), entrance.names);

    /* Nothing loops. An animation with infinite iterations is a phone
       being drained by a screen someone fell asleep looking at. */
    const infinite = await p5.evaluate(() => {
      const out = [];
      document.querySelectorAll('.mh-layer, .mh-layer *').forEach(n => {
        n.getAnimations().forEach(a => {
          const it = a.effect && a.effect.getTiming ? a.effect.getTiming().iterations : 1;
          if (it === Infinity) out.push((n.className || n.tagName) + ':' + (a.animationName || '?'));
        });
      });
      return out;
    });
    check('8 · Nothing animates forever', infinite.length === 0, infinite.join(', ') || 'none');

    /* Changing scenery cross-fades: two plates, the incoming one rising
       in opacity while the outgoing one falls. */
    const fade = await p5.evaluate(async () => {
      const plates = () => [...document.querySelectorAll('.mh-scene-plate')]
        .map(p => ({ scene: p.dataset.sceneName || '', o: Number(getComputedStyle(p).opacity).toFixed(2) }));
      const before = plates();
      await window.SSMotherhood.setScene('moonmeadow');
      window.__mhUI.route();
      await new Promise(r => setTimeout(r, 300));
      const during = plates();
      await new Promise(r => setTimeout(r, 1400));
      const after = plates();
      return { before, during, after, plateCount: document.querySelectorAll('.mh-scene-plate').length };
    });
    check('8 · There are two scenery plates to fade between', fade.plateCount === 2);
    check('8 · Mid-change both plates are partly visible',
      fade.during.filter(p => Number(p.o) > 0.02 && Number(p.o) < 0.98).length >= 1,
      JSON.stringify(fade.during));
    check('8 · The change settles on the chosen scene',
      fade.after.some(p => p.scene === 'moonmeadow' && Number(p.o) > 0.98),
      JSON.stringify(fade.after));

    /* And the photograph itself holds still. Sampled over a second and a
       half on one scene: no transform, no background-position drift, no
       size change. This is the check that would catch a Ken Burns creep
       being added later. */
    const still = await p5.evaluate(async () => {
      const read = () => {
        const p = document.querySelector('.mh-scene-plate.on');
        if (!p) return 'none';
        const s = getComputedStyle(p);
        const r = p.getBoundingClientRect();
        return [s.transform, s.backgroundPosition, s.backgroundSize, s.scale || '',
                Math.round(r.width), Math.round(r.height), Math.round(r.top), Math.round(r.left)].join('|');
      };
      const first = read();
      await new Promise(r => setTimeout(r, 750));
      const mid = read();
      await new Promise(r => setTimeout(r, 750));
      const last = read();
      return { first, mid, last, same: first === mid && mid === last };
    });
    check('8 · The landscape never moves while you sit on it',
      still.same === true, still.first + '  vs  ' + still.last);
    await c5.close();
  }

  /* Reduced motion means off, not merely gentler. */
  {
    const c6 = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      reducedMotion: 'reduce'
    });
    const p6 = await c6.newPage();
    await p6.goto(BASE, { waitUntil: 'networkidle' });
    await p6.waitForTimeout(1700);
    await p6.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
    await p6.waitForTimeout(600);
    const quiet = await p6.evaluate(async () => {
      await window.SSMotherhood.createVault('a passcode for the test');
      await window.SSMotherhood.setStage('postpartum', { birthDate: '', feeding: '' });
      window.__mhUI.open();
      await new Promise(r => setTimeout(r, 900));
      window.__mhUI.route();
      await new Promise(r => requestAnimationFrame(r));
      const nodes = [...document.querySelectorAll('.mh-layer, .mh-layer .mh-card, .mh-scene-plate, .mh-layer .mh-tile')];
      const moving = nodes.filter(n => n.getAnimations().length > 0)
        .map(n => (n.className || n.tagName).toString().slice(0, 30));
      const card = document.querySelector('.mh-layer .mh-card');
      const s = card ? getComputedStyle(card) : null;
      return {
        moving,
        opacity: s ? s.opacity : '',
        transitionDuration: s ? s.transitionDuration : '',
        visible: Boolean(card && card.getBoundingClientRect().height > 10)
      };
    });
    check('8 · Reduced motion stops every animation',
      quiet.moving.length === 0, quiet.moving.join(', ') || 'none running');
    check('8 · And the cards are simply there, fully opaque',
      quiet.opacity === '1' && quiet.visible === true, 'opacity ' + quiet.opacity);
    await c6.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
