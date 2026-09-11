/**
 * A trailer for testers — a real screen recording, not a mockup.
 *
 * Everything here is the actual app running: the verse, the sky, the prayer
 * times, the Lazy mode tap. Nothing is faked, staged, or drawn in afterwards,
 * because a trailer that shows something the app can't do is a promise you
 * then have to break in front of the person testing it.
 *
 * The first cut of this was a slideshow with captions: ten still frames, each
 * held three seconds, forty seconds long. It was boring, and the reasons are
 * worth writing down because they are the whole design of this file now.
 *
 *   - Nothing moved inside a shot. A screen recording where the screen never
 *     moves is a screenshot that takes longer.
 *   - The cards did the talking and the app just sat behind them.
 *   - It gave nothing to want. Holding back the payoff was right; holding it
 *     back *silently* meant there was no reason to open the app.
 *
 * So: half the length, shots under two seconds, a push on every held frame,
 * taps you can see land, and a burst of the held-back screens too fast to
 * read. Withholding and teasing are different things — the flashes are the
 * tease, and what those screens actually do is still only findable in the app.
 *
 *   python3 -m http.server 8099        (in the repo root)
 *   node test/trailer.js               (add TRAILER_SHOTS=1 for beat stills)
 *
 * TRAILER_LINK puts the live address on the end card.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const LINK = process.env.TRAILER_LINK || '';      // e.g. sleepsphere.netlify.app
const OUT  = process.env.TRAILER_OUT  || path.join(__dirname, '..', 'trailer');

// Dubai, because the prayer times were built and checked against a Dubai
// Dawat sheet — so what the video shows is the case that is known correct.
const PLACE = { latitude: 25.2048, longitude: 55.2708, name: 'Dubai' };

/* Two weeks of nights, so the screens that flash past have shape in them
   rather than an empty state. The derived fields have to be written too: the
   app stores them at save time and does not recompute on load, so a seed that
   leaves them out reports "about 0m of sleep a night" in the summary. */
const mins = hhmm => (+hhmm.slice(0, 2)) * 60 + (+hhmm.slice(3));
const night = (date, bed, sleep, wake, rest, awake) => {
  const span = (from, to) => (mins(to) - mins(from) + 1440) % 1440;
  const opportunityMinutes = span(bed, wake);
  const sleepMinutes = Math.max(0, span(sleep, wake) - awake);
  return {
    id: 'demo-' + date, date, createdAt: date + 'T07:00:00.000Z',
    bedTime: bed, sleepTime: sleep, wakeTime: wake, awakeMinutes: awake, napMinutes: 0,
    opportunityMinutes, sleepMinutes,
    efficiency: Math.round((sleepMinutes / opportunityMinutes) * 100),
    rest, energy: Math.max(1, rest - 1), focus: rest, calm: Math.min(5, rest + 1),
    fajr: 'woke_on_time', factors: [], note: '', targetMinutes: 480, intent: 'restore',
    planSnapshot: null, bioHarmonyId: null, bioHarmonySnapshot: null,
    experimentId: null, adherence: 'not_applicable', demo: false
  };
};
const NIGHTS = [
  ['2026-08-29','22:50','23:12','06:20',3,14], ['2026-08-30','23:40','00:05','06:15',2,26],
  ['2026-08-31','22:35','22:58','06:30',4,11], ['2026-09-01','23:10','23:35','06:10',3,18],
  ['2026-09-02','22:20','22:40','06:35',5,8],  ['2026-09-03','00:10','00:38','06:05',2,24],
  ['2026-09-04','22:45','23:05','06:25',4,12], ['2026-09-05','22:30','22:52','06:40',4,10],
  ['2026-09-06','23:25','23:52','06:12',3,19], ['2026-09-07','22:15','22:34','06:45',5,7],
  ['2026-09-08','23:05','23:30','06:18',3,16], ['2026-09-09','22:40','23:02','06:28',4,13],
  ['2026-09-10','23:50','00:18','06:02',2,27]
].map(row => night(...row));

const SEED = `(()=>{localStorage.setItem('sleepsphere_state_v2', JSON.stringify(${JSON.stringify({
  version: 2,
  settings: { name:'', age:'adult', target:480, faith:'on', installDismissed:true,
              openingOff:false, lastZone:'Asia/Dubai', locationGranted:true, dim:false,
              intent:'restore', welcomeSeen:true, mode:'dark', useCycle:false,
              healthLinked:false, place:PLACE, highLatRule:'seventh', fajrEdited:false },
  mornings: NIGHTS,
  bioCheckins: [], thoughts: [], scans: [], feedback: [], experimentHistory: []
})}));})()`;

/* The clock is held at 23:10 so the sky is the night sky for the whole
   recording. The app reads the time constantly — for the sky, the prayer
   card and the bed stamp — so it has to be held, not nudged. */
const FREEZE = () => {
  const fixed = new Date(); fixed.setHours(23, 10, 0, 0);
  const Real = Date;
  window.Date = class extends Real {
    constructor(...a) { return a.length ? new Real(...a) : new Real(fixed); }
    static now() { return fixed.getTime(); }
  };
};

/* Title cards and camera moves both live inside the page, so one recording
   captures the app and the words together — no editing step, no second tool.
   The app's own display serif keeps the cards feeling like the app rather
   than like captions added afterwards, and the scrim under them is what stops
   type laid over a working screen reading as a mistake. */
const CINEMA = () => {
  const el = document.createElement('div');
  el.id = '__cine';
  el.innerHTML = '<div><p class="__l1"></p><p class="__l2"></p></div>';
  const css = document.createElement('style');
  css.textContent = `
    #__cine { position:fixed; inset:0; z-index:99999; display:flex;
      align-items:flex-end; justify-content:center; pointer-events:none;
      opacity:0; transition:opacity .26s ease; }
    #__cine.on { opacity:1; }
    #__cine::before { content:''; position:absolute; inset:0;
      background:linear-gradient(to top, rgba(4,5,12,.985) 0%, rgba(4,5,12,.965) 38%,
                                 rgba(4,5,12,.72) 55%, rgba(4,5,12,0) 76%); }
    #__cine.full { align-items:center; }
    /* The closing cards fade the app itself away instead, so the scrim here
       only has to settle the sky — a near-solid one would take the stars with
       it, and the stars are the last thing the trailer should be showing. */
    #__cine.full::before {
      background:radial-gradient(120% 78% at 50% 46%, rgba(3,4,10,.32), rgba(3,4,10,.78)); }
    #__cine > div { position:relative; text-align:center; max-width:330px;
      padding:0 22px 116px; transform:translateY(15px); transition:transform .3s ease; }
    #__cine.on > div { transform:none; }
    #__cine.full > div { padding-bottom:0; }
    #__cine .__l1 { margin:0; font-family:var(--font-display); font-weight:500;
      font-size:31px; line-height:1.22; letter-spacing:-.02em; color:#f4f1ea;
      text-wrap:balance; text-shadow:0 2px 30px rgba(0,0,0,.95); }
    #__cine .__l2 { margin:12px 0 0; font-size:14.5px; line-height:1.5;
      color:rgba(226,222,212,.8); white-space:pre-line;
      text-shadow:0 2px 22px rgba(0,0,0,.9); }
    #__cine.full .__l1 { font-size:35px; }

    /* A tap you cannot see is a cut that looks like a glitch. */
    .__tap { position:fixed; z-index:99998; width:26px; height:26px; margin:-13px 0 0 -13px;
      border-radius:50%; background:rgba(255,255,255,.5); pointer-events:none;
      animation:__ripple .62s cubic-bezier(.2,.7,.3,1) forwards; }
    @keyframes __ripple { from { transform:scale(.3); opacity:.65; }
                          to   { transform:scale(4.6); opacity:0; } }`;
  document.head.appendChild(css);
  document.body.appendChild(el);
  const shell = document.querySelector('.app-shell');

  window.__card = (l1, l2, full) => {
    el.querySelector('.__l1').textContent = l1 || '';
    el.querySelector('.__l2').textContent = l2 || '';
    el.classList.toggle('full', !!full);
    el.classList.add('on');
  };
  window.__uncard = () => el.classList.remove('on');

  // A slow drift on a held frame. Without it, a recording of a screen nobody
  // is touching is a screenshot that takes longer.
  window.__push = (to, ms) => {
    shell.style.transition = `transform ${ms}ms linear`;
    shell.style.transform = `scale(${to})`;
  };
  // A quick settle, for the cuts in the burst.
  window.__pop = () => {
    shell.style.transition = 'none';
    shell.style.transform = 'scale(1.055)';
    requestAnimationFrame(() => {
      shell.style.transition = 'transform .42s cubic-bezier(.2,.8,.3,1)';
      shell.style.transform = 'scale(1)';
    });
  };
  window.__tap = sel => {
    const box = document.querySelector(sel).getBoundingClientRect();
    const dot = document.createElement('div');
    dot.className = '__tap';
    dot.style.left = (box.left + box.width / 2) + 'px';
    dot.style.top  = (box.top + box.height / 2) + 'px';
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  };
  // Everything except the sky. The app's own canvas sits outside .app-shell,
  // so fading the shell leaves the starfield running underneath.
  window.__shell = on => {
    shell.style.transition = 'opacity .6s ease, transform .6s ease';
    shell.style.opacity = on ? '1' : '0';
  };
};

/* Checking a trailer by watching it back is slow, and a decoded frame is
   awkward to look at from a script. TRAILER_SHOTS=1 drops a still at each beat
   instead, which is what you actually want to check: what is on screen, and
   whether the words sit clear of it. The stills add about a second each to
   the recording, so the cut you ship is the one recorded without them. */
const SHOTS = process.env.TRAILER_SHOTS === '1';
let beat = 0;
const wait = async (p, ms, label) => {
  await p.waitForTimeout(ms);
  if (SHOTS && label) {
    beat++;
    await p.screenshot({ path: path.join(OUT, `beat-${String(beat).padStart(2,'0')}-${label}.png`) });
  }
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    // Without this the container's clock is UTC and the prayer card shows
    // Maghrib in the afternoon — right arithmetic, wrong zone, and a viewer
    // who knows the times would spot it instantly.
    timezoneId: 'Asia/Dubai',
    locale: 'en-GB',
    // The video size has to match the viewport in CSS pixels. Asking for a
    // larger frame does not render the page at 2x — it draws the same 390pt
    // surface into the corner of a bigger canvas and leaves the rest grey.
    recordVideo: { dir: OUT, size: { width: 390, height: 844 } }
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(FREEZE);
  await p.addInitScript(SEED);
  await p.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
  await p.evaluate(CINEMA);

  const go = (view, y = 0) => p.evaluate(([v, top]) => {
    document.querySelector(`.nav button[data-view="${v}"]`).click();
    window.scrollTo({ top, behavior: 'instant' });
    window.__pop();
  }, [view, y]);

  // ---- The verse. The one still moment, and it earns the pace that follows.
  await wait(p, 2500, 'verse');

  // ---- Tonight, drifting in.
  await p.evaluate(() => { window.__push(1.05, 9000); window.__card('Made for our nights.'); });
  await wait(p, 1700, 'tonight');

  // ---- Our times.
  await go('plan');
  await p.evaluate(() => {
    document.getElementById('prayerTimes').scrollIntoView({ behavior:'instant', block:'center' });
    window.__push(1.06, 6000);
    window.__card('Our times. On your own phone.');
  });
  await wait(p, 2100, 'prayer');

  // ---- The tap. This is the beat the whole app is really about.
  await go('today');
  await p.evaluate(() => window.__card('Too tired to log it?'));
  await wait(p, 1400, 'too-tired');
  await p.evaluate(() => { window.__uncard(); window.__tap('#lazyStart'); });
  await wait(p, 380);
  await p.locator('#lazyStart').click();
  await wait(p, 1300, 'goodnight');
  await p.evaluate(() => window.__card('One tap. Put the phone down.'));
  await wait(p, 1700, 'one-tap');

  /* ---- The burst. Screens the trailer is otherwise keeping back, each on
     for half a second — long enough to register as something, far too short
     to read. That is the difference between withholding and teasing: what
     these screens actually do is still only findable in the app. */
  await p.evaluate(() => {
    window.__uncard();
    document.getElementById('lazyVeil').hidden = true;
  });
  await wait(p, 420);
  await p.evaluate(() => window.__card('Stay with it and it starts noticing things.'));
  for (const [view, y] of [['compass', 360], ['twin', 420], ['data', 520], ['compass', 60]]) {
    await go(view, y);
    await wait(p, 520, `burst-${view}`);
  }

  // ---- The morning, named but not shown. This is the part the tester should
  //      meet for the first time in the app, not in a video.
  await p.evaluate(() => { window.__uncard(); window.__shell(false); });
  await wait(p, 700);
  await p.evaluate(() => window.__card('In the morning it asks you one question.',
                                       'That is the whole of it.', true));
  await wait(p, 2200, 'morning');

  // ---- End card.
  await p.evaluate(link => {
    window.__card('SleepSphere', 'Prototype · now testing' + (link ? '\n' + link : ''), true);
    document.querySelector('#__cine .__l1').style.fontSize = '44px';
  }, LINK);
  await wait(p, 2300, 'endcard');
  await p.evaluate(() => {
    document.querySelector('#__cine .__l1').style.fontSize = '';
    window.__card('Tell me what it gets wrong.',
                  'Every answer changes the next version.', true);
  });
  await wait(p, 2300, 'ask');
  await p.evaluate(() => window.__uncard());
  await wait(p, 700);

  const video = p.video();
  await ctx.close();
  const raw = await video.path();
  const final = path.join(OUT, 'sleepsphere-trailer.webm');
  fs.renameSync(raw, final);
  await browser.close();

  console.log(errs.length ? `page errors: ${errs.join(' | ')}` : 'no page errors');
  console.log(`${final}  (${(fs.statSync(final).size / 1024).toFixed(0)} KB)`);

  /* Playwright writes VP8 in a .webm, which plenty of phones and most
     messaging apps will not play. H.264 in an .mp4 plays everywhere, so the
     thing you actually send people is the mp4 — the webm is the master.

     The trim matters as much as the format: recording starts when the page
     does, so the first second is the app mid-load, and the first frame is
     the thumbnail everyone sees before they press play. There is no fade in
     for the same reason — it would make frame zero black, which is the frame
     a messaging app picks as the preview. */
  try {
    const { execFileSync } = require('child_process');
    // 1.5s in, the opening overlay is reliably opaque; earlier than that and
    // the app is still showing through it, which reads as a rendering fault
    // rather than as depth. Load timing varies a little between runs, so the
    // trim is set where it is safe rather than where it is tightest.
    const HEAD = 1.5, OUT_FADE = 0.6;
    const probe = execFileSync('ffprobe', ['-v','error','-show_entries','format=duration',
      '-of','default=nw=1:nk=1', final], { encoding:'utf8' });
    const end = parseFloat(probe) - HEAD - OUT_FADE;
    const mp4 = path.join(OUT, 'sleepsphere-trailer.mp4');
    execFileSync('ffmpeg', ['-y','-loglevel','error','-ss', String(HEAD), '-i', final,
      '-vf', `scale=780:1688:flags=lanczos,unsharp=5:5:0.35:5:5:0,`
           + `fade=t=out:st=${end.toFixed(2)}:d=${OUT_FADE}`,
      '-c:v','libx264','-profile:v','high','-pix_fmt','yuv420p','-crf','20',
      '-preset','slow','-movflags','+faststart','-an', mp4]);
    console.log(`${mp4}  (${(fs.statSync(mp4).size / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.log('no mp4 — ffmpeg not available; the webm above is the trailer');
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
