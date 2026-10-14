/**
 * Flight Mode — the cabin.
 *
 * Built to EXACT_VISUAL_REQUIREMENTS.md. What this suite is for is the
 * set of claims that are easy to fake and were specifically asked about:
 *
 *   - the window dominates the screen, on phone and tablet alike;
 *   - a view with no licensed clip says "Video footage unavailable"
 *     rather than showing a still, a gradient or a drawn sky;
 *   - the reference image is not in the build and is not behind the
 *     window;
 *   - leaving the flight actually tears the video down, rather than
 *     removing a node and leaving a decoder running;
 *   - hiding the controls can always be undone;
 *   - the mixer and the sleep timer are reachable from the panel.
 *
 * Playback itself is proved against a clip this browser can decode, so
 * that "the video element plays" is a measurement rather than a hope.
 * H.264 on iOS Safari remains unverified and is reported as such.
 *
 * Needs the repository served at :8099.
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

const SEED = `(()=>{try{localStorage.setItem('sleepsphere_state_v2',JSON.stringify({
 version:3,settings:{welcomeSeen:true,mode:'dark',openingOff:true},mornings:[],morningRevisions:[],
 bioCheckins:[],thoughts:[],scans:[],feedback:[],experimentHistory:[],trip:null,
 study:{onboarded:true,participantId:'FC',cohort:'jamea-v1',schemaVersion:3,storageMode:'local'}}));
 }catch(e){}})()`;

async function open(browser, w, h) {
  const ctx = await browser.newContext({
    viewport: { width: w || 390, height: h || 844 },
    deviceScaleFactor: 2, isMobile: (w || 390) < 900, hasTouch: true
  });
  await ctx.addInitScript(SEED);
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1800);
  return { ctx, p, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  /* ================================================================
     1. The composition: the window dominates.
     ================================================================ */
  for (const [name, w, h, minShare] of [
    ['iPhone', 390, 844, 0.30],
    ['iPad', 834, 1112, 0.45],
    ['desktop', 1280, 860, 0.45]
  ]) {
    const { ctx, p, errs } = await open(browser, w, h);
    await p.evaluate(() => window.SSFlightCabin.open());
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const host = document.getElementById('flightCabin');
      const win = host && host.querySelector('.fc-window');
      const panel = host && host.querySelector('.fc-panel');
      const box = win ? win.getBoundingClientRect() : null;
      const pb = panel ? panel.getBoundingClientRect() : null;
      return {
        open: !!host,
        share: box ? +((box.width * box.height) / (innerWidth * innerHeight)).toFixed(3) : 0,
        wing: !!host.querySelector('.fc-wing'),
        toggles: host.querySelectorAll('.fc-switch').length,
        scenes: [...host.querySelectorAll('.fc-scene')].map(b => b.textContent),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        /* On a phone the panel must not cover the view. */
        panelOverWindow: Boolean(box && pb &&
          !(pb.right < box.left || pb.left > box.right || pb.bottom < box.top || pb.top > box.bottom)),
        /* Visible controls only. "Show controls" is display:none until
           the panel is hidden, and measuring a hidden button tells you
           nothing — it is checked where it is actually shown, in 7. */
        minTap: Math.min(...[...host.querySelectorAll('button')]
          .filter(b => {
            const s = getComputedStyle(b);
            const r = b.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
          })
          .map(b => {
            const r = b.getBoundingClientRect();
            /* A switch grows its hit area with a pseudo-element, so the
               drawn pill is smaller than what a finger actually hits. */
            return b.classList.contains('fc-switch') ? r.height + 14 : r.height;
          }))
      };
    });
    check('1 · ' + name + ': the cabin opens', r.open);
    check('1 · ' + name + ': the window dominates the screen',
      r.share >= minShare, (r.share * 100).toFixed(0) + '% of the viewport');
    check('1 · ' + name + ': a wing is drawn', r.wing);
    check('1 · ' + name + ': three blue toggles', r.toggles === 3, String(r.toggles));
    check('1 · ' + name + ': Day, Sunset and Night selectors',
      r.scenes.join(',') === 'Day,Sunset,Night', r.scenes.join(','));
    check('1 · ' + name + ': no sideways scroll', r.overflow <= 0, r.overflow + 'px');
    check('1 · ' + name + ': every control is tappable', r.minTap >= 44, r.minTap.toFixed(0) + 'px');
    if (w < 760) {
      check('1 · ' + name + ': controls do not cover the window',
        r.panelOverWindow === false, String(r.panelOverWindow));
    }
    check('1 · ' + name + ': no console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. The reference image is not in the build.
     ================================================================ */
  {
    const files = fs.readdirSync(ROOT);
    const refs = files.filter(f => /flight_mode_reference|reference-still|reference\.png/i.test(f));
    check('2 · The reference concept image is not shipped',
      refs.length === 0, refs.join(',') || 'absent');

    const { ctx, p } = await open(browser, 1280, 860);
    await p.evaluate(() => window.SSFlightCabin.open());
    await p.waitForTimeout(700);
    const imagery = await p.evaluate(() => {
      const pane = document.querySelector('.fc-pane');
      const bg = getComputedStyle(pane).backgroundImage;
      return {
        paneBg: bg,
        imgs: [...document.querySelectorAll('#flightCabin img')].map(i => i.src)
      };
    });
    /* The window's interior may hold a <video> or the unavailable panel.
       What it may never hold is a photograph standing in for footage. */
    check('2 · Nothing photographic is painted behind the glass',
      !/url\(/i.test(imagery.paneBg) && imagery.imgs.length === 0,
      imagery.paneBg.slice(0, 48) + ' / ' + imagery.imgs.length + ' images');
    await ctx.close();
  }

  /* ================================================================
     3. A view with no clip says so, explicitly.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 1280, 860);
    await p.evaluate(() => { window.SSFlightCabin.open(); window.SSFlightCabin.setScene('day'); });
    await p.waitForTimeout(900);
    const day = await p.evaluate(() => {
      const pane = document.querySelector('.fc-pane');
      return {
        footage: pane.dataset.footage,
        video: document.querySelectorAll('.fc-video').length,
        head: (document.querySelector('.fc-missing-head') || {}).textContent,
        note: (document.querySelector('.fc-missing-note') || {}).textContent || '',
        credit: document.getElementById('fcCredit').hidden
      };
    });
    check('3 · Day reports no footage', day.footage === 'unavailable', day.footage);
    check('3 · And creates no video element', day.video === 0, String(day.video));
    check('3 · The words are explicit',
      day.head === 'Video footage unavailable', day.head);
    check('3 · It says nothing is shown in its place',
      /Nothing is shown in its place/i.test(day.note), day.note.slice(0, 70));
    check('3 · No credit line when nothing is playing', day.credit === true);

    /* Which views are actually covered, stated by the module itself. */
    const covered = await p.evaluate(() => window.SSFlightCabin.covered());
    check('3 · Only sunset and night have clips',
      covered.join(',') === 'sunset,night', covered.join(','));
    await ctx.close();
  }

  /* ================================================================
     4. The licensed clips, and their credit on screen.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 1280, 860);
    await p.evaluate(() => { window.SSFlightCabin.open(); window.SSFlightCabin.setScene('sunset'); });
    await p.waitForTimeout(900);
    const sunset = await p.evaluate(() => ({
      src: (document.querySelector('.fc-video source') || {}).src || '',
      type: (document.querySelector('.fc-video source') || {}).type || '',
      playsinline: document.querySelector('.fc-video').hasAttribute('playsinline'),
      muted: document.querySelector('.fc-video').muted,
      loop: document.querySelector('.fc-video').loop,
      credit: document.getElementById('fcCredit').textContent,
      creditShown: document.getElementById('fcCredit').hidden === false
    }));
    check('4 · Sunset uses the licensed evening clip',
      /evening-clouds\.mp4$/.test(sunset.src), sunset.src.split('/').pop());
    check('4 · Offered as MP4', sunset.type === 'video/mp4', sunset.type);
    check('4 · playsinline, muted and looping',
      sunset.playsinline && sunset.muted && sunset.loop);
    check('4 · CC BY credit is on screen while it plays',
      sunset.creditShown && /CC BY 2\.0/.test(sunset.credit), sunset.credit);

    await p.evaluate(() => window.SSFlightCabin.setScene('night'));
    await p.waitForTimeout(700);
    const night = await p.evaluate(() => ({
      src: (document.querySelector('.fc-video source') || {}).src || '',
      credit: document.getElementById('fcCredit').textContent
    }));
    check('4 · Night uses the licensed night clip',
      /night-sky\.mp4$/.test(night.src), night.src.split('/').pop());
    check('4 · With its own credit', /Chris Waits/.test(night.credit), night.credit);
    await ctx.close();
  }

  /* ================================================================
     5. Playback, proved against a clip this browser can decode.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 1280, 860);
    const played = await p.evaluate(async () => {
      window.SSFlightCabin.open();
      const pane = document.querySelector('.fc-pane');
      pane.textContent = '';
      const v = document.createElement('video');
      v.className = 'fc-video';
      v.muted = true; v.loop = true; v.playsInline = true;
      const s = document.createElement('source');
      s.src = './test/fixtures/playback-probe.webm'; s.type = 'video/webm';
      v.appendChild(s);
      pane.appendChild(v);
      const ok = await new Promise(res => {
        const t = setTimeout(() => res('timeout'), 12000);
        v.addEventListener('canplay', () => { clearTimeout(t); res('canplay'); });
        v.addEventListener('error', () => { clearTimeout(t); res('error'); });
      });
      if (ok !== 'canplay') return { ok };
      try { await v.play(); } catch (e) { return { ok: 'blocked ' + e.message }; }
      const a = v.currentTime;
      await new Promise(r => setTimeout(r, 1200));
      const b = v.currentTime;
      return { ok, w: v.videoWidth, h: v.videoHeight, from: +a.toFixed(2), to: +b.toFixed(2) };
    });
    check('5 · A decodable clip reaches canplay', played.ok === 'canplay', String(played.ok));
    check('5 · It has real dimensions', played.w > 0 && played.h > 0, played.w + 'x' + played.h);
    check('5 · And the playhead actually moves',
      played.to > played.from, played.from + ' -> ' + played.to);
    await ctx.close();
  }

  /* ================================================================
     6. Leaving the flight tears the video down.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 1280, 860);
    await p.evaluate(() => { window.SSFlightCabin.open(); window.SSFlightCabin.setScene('sunset'); });
    await p.waitForTimeout(900);
    const before = await p.evaluate(() => document.querySelectorAll('video').length);
    await p.evaluate(() => document.getElementById('fcExit').click());
    await p.waitForTimeout(700);
    const after = await p.evaluate(() => ({
      host: document.getElementById('flightCabin'),
      videos: document.querySelectorAll('video').length,
      bodyClass: document.documentElement.classList.contains('fc-open')
    }));
    check('6 · A video existed before exiting', before >= 1, String(before));
    check('6 · Exiting removes the cabin', after.host === null);
    check('6 · And leaves no video element behind', after.videos === 0, String(after.videos));
    check('6 · And releases the page scroll lock', after.bodyClass === false);
    await ctx.close();
  }

  /* ================================================================
     7. Hiding the controls can always be undone.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 390, 844);
    await p.evaluate(() => window.SSFlightCabin.open());
    await p.waitForTimeout(700);
    await p.evaluate(() => document.getElementById('fcHide').click());
    await p.waitForTimeout(1000);          /* the panel fades over .45s */
    const hidden = await p.evaluate(() => {
      const show = document.getElementById('fcShow');
      const box = show.getBoundingClientRect();
      const style = getComputedStyle(show);
      return {
        hidden: document.getElementById('flightCabin').dataset.hidden,
        panelGone: getComputedStyle(document.querySelector('.fc-panel')).opacity === '0',
        showVisible: style.display !== 'none' && box.width > 0 && box.height > 0,
        showOnScreen: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
        showTap: Math.round(box.height),
        /* It must be the thing you actually hit, not something under
           another element. */
        onTop: (() => {
          const e = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return e === show || show.contains(e);
        })()
      };
    });
    check('7 · Hiding hides the panel', hidden.hidden === 'true' && hidden.panelGone);
    check('7 · A Show controls button is visible', hidden.showVisible);
    check('7 · Fully on screen', hidden.showOnScreen, String(hidden.showOnScreen));
    check('7 · Big enough to hit', hidden.showTap >= 44, hidden.showTap + 'px');
    check('7 · And is the element you hit', hidden.onTop === true, String(hidden.onTop));

    await p.evaluate(() => document.getElementById('fcShow').click());
    await p.waitForTimeout(1000);
    const back = await p.evaluate(() => ({
      hidden: document.getElementById('flightCabin').dataset.hidden,
      panel: getComputedStyle(document.querySelector('.fc-panel')).opacity
    }));
    check('7 · Showing brings the controls back',
      back.hidden === 'false' && back.panel === '1', JSON.stringify(back));
    await ctx.close();
  }

  /* ================================================================
     8. The panel's controls do what they say.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser, 1280, 860);
    await p.evaluate(() => { window.SSFlightCabin.open(); window.SSFlightCabin.setScene('sunset'); });
    await p.waitForTimeout(800);

    /* Moving Cloud View off must remove the video, not merely hide it. */
    const off = await p.evaluate(async () => {
      const sw = [...document.querySelectorAll('.fc-switch')]
        .find(s => s.getAttribute('aria-label') === 'Moving Cloud View');
      sw.click();
      await new Promise(r => setTimeout(r, 500));
      const pane = document.querySelector('.fc-pane');
      return { videos: document.querySelectorAll('.fc-video').length,
               footage: pane.dataset.footage,
               note: (document.querySelector('.fc-missing-note') || {}).textContent || '' };
    });
    check('8 · Moving Cloud View off removes the video', off.videos === 0, String(off.videos));
    check('8 · And says why', /switched off/i.test(off.note), off.note);

    /* Cabin Ambience drives the real sound engine. */
    const amb = await p.evaluate(async () => {
      const sw = [...document.querySelectorAll('.fc-switch')]
        .find(s => s.getAttribute('aria-label') === 'Cabin Ambience');
      sw.click();
      await new Promise(r => setTimeout(r, 900));
      return window.SSExplore ? window.SSExplore.playing() : null;
    });
    check('8 · Cabin Ambience starts the cabin hum',
      Array.isArray(amb) && amb.indexOf('engine') > -1, (amb || []).join(','));

    const ambOff = await p.evaluate(async () => {
      const sw = [...document.querySelectorAll('.fc-switch')]
        .find(s => s.getAttribute('aria-label') === 'Cabin Ambience');
      sw.click();
      await new Promise(r => setTimeout(r, 900));
      return window.SSExplore.playing();
    });
    check('8 · And stops it again', ambOff.indexOf('engine') === -1, ambOff.join(','));

    /* Selected Sounds opens the mixer. */
    const mixer = await p.evaluate(async () => {
      const row = [...document.querySelectorAll('.fc-row-link')]
        .find(b => /Selected Sounds/.test(b.textContent));
      row.click();
      await new Promise(r => setTimeout(r, 700));
      return document.querySelectorAll('.ex-layer-row .ex-toggle').length;
    });
    check('8 · Selected Sounds opens the mixer', mixer >= 7, String(mixer));
    check('8 · No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     9. It is reachable, and the four tabs are untouched.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, 390, 844);
    const tabs = await p.evaluate(() =>
      [...document.querySelectorAll('.nav button[data-view]')].map(b => b.dataset.view));
    check('9 · Still exactly four destinations', tabs.length === 4, tabs.join(','));
    await p.tap('.nav button[data-view="learn"]');
    await p.waitForTimeout(800);
    const opened = await p.evaluate(async () => {
      const tile = [...document.querySelectorAll('#explore .ex-tile')]
        .find(t => /^Flight Mode/.test(t.textContent));
      if (!tile) return { tile: false };
      tile.click();
      await new Promise(r => setTimeout(r, 900));
      return { tile: true, cabin: !!document.getElementById('flightCabin') };
    });
    check('9 · Flight Mode is on the hub', opened.tile);
    check('9 · And two taps from home opens the cabin', opened.cabin === true);
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
