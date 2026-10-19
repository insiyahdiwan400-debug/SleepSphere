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
      const body = panel.querySelector('.mh-body');
      const bg = getComputedStyle(body).backgroundColor;
      const rgb = bg.match(/\d+/g).map(Number);
      const heading = panel.querySelector('h2');
      return {
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
    check('6 · The page is still light, not black',
      blind.light === true, 'rgb(' + blind.bodyBackground.join(',') + ')');
    check('6 · The heading is still readable', blind.headingVisible === true);
    check('6 · And the records are still reachable', blind.tiles > 0, String(blind.tiles));
    check('6 · Nothing threw when the media failed', e3.length === 0, e3.join(' | '));
    await c3.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
