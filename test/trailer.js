/**
 * A trailer for testers — a real screen recording, not a mockup.
 *
 * Everything here is the actual app running: the verse, the sky, the prayer
 * times, the Lazy mode tap. Nothing is faked, staged, or drawn in afterwards,
 * because a trailer that shows something the app can't do is a promise you
 * then have to break in front of the person testing it.
 *
 * What it deliberately does NOT show: My pattern, Trends, the sleep guide,
 * the apnea screen, records, experiments. Those are the payoff. A tester who
 * has already watched the payoff has nothing left to discover, and discovery
 * is most of what you are testing for.
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

// Three nights. Enough that the app looks lived in rather than empty, not so
// much that the trailer starts showing patterns the tester should find.
const night = (date, bed, sleep, wake, rest) => ({
  id: 'demo-' + date, date, createdAt: date + 'T07:00:00.000Z',
  bedTime: bed, sleepTime: sleep, wakeTime: wake, awakeMinutes: 10, napMinutes: 0,
  rest, energy: rest, focus: rest, calm: rest, fajr: 'woke_on_time',
  factors: [], note: '', targetMinutes: 480, intent: 'restore',
  planSnapshot: null, bioHarmonyId: null, bioHarmonySnapshot: null,
  experimentId: null, adherence: 'not_applicable', demo: false
});

const SEED = `(()=>{localStorage.setItem('sleepsphere_state_v2', JSON.stringify(${JSON.stringify({
  version: 2,
  settings: { name:'', age:'adult', target:480, faith:'on', installDismissed:true,
              openingOff:false, lastZone:'Asia/Dubai', locationGranted:true, dim:false,
              intent:'restore', welcomeSeen:true, mode:'dark', useCycle:false,
              healthLinked:false, place:PLACE, highLatRule:'seventh', fajrEdited:false },
  mornings: [ night('2026-09-08','22:50','23:15','06:20',3),
              night('2026-09-09','23:30','23:55','06:15',2),
              night('2026-09-10','22:40','23:00','06:30',4) ],
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

/* Title cards live inside the page, so one recording captures both the app
   and the words — no editing step and no second tool.

   The scrim is the part that matters. Type laid straight over a working
   screen reads as a mistake: the first cut had a sentence sitting across the
   buttons. Darkening the bottom of the frame under the words separates the
   two, and the app's own display serif keeps the cards feeling like the app
   rather than like a caption added later. */
const CINEMA = () => {
  const el = document.createElement('div');
  el.id = '__cine';
  el.innerHTML = '<div><p class="__l1"></p><p class="__l2"></p></div>';
  const css = document.createElement('style');
  css.textContent = `
    #__cine { position:fixed; inset:0; z-index:99999; display:flex;
      align-items:flex-end; justify-content:center; pointer-events:none;
      opacity:0; transition:opacity .55s ease; }
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
      padding:0 22px 116px; }
    #__cine.full > div { padding-bottom:0; }
    #__cine .__l1 { margin:0; font-family:var(--font-display); font-weight:500;
      font-size:29px; line-height:1.24; letter-spacing:-.02em; color:#f4f1ea;
      text-wrap:balance; text-shadow:0 2px 30px rgba(0,0,0,.95); }
    #__cine .__l2 { margin:13px 0 0; font-size:14.5px; line-height:1.55;
      color:rgba(226,222,212,.8); white-space:pre-line;
      text-shadow:0 2px 22px rgba(0,0,0,.9); }
    #__cine.full .__l1 { font-size:34px; }
    /* Nothing should be mid-fade when a beat is meant to be still. */
    #__cine * { transition:none; }`;
  document.head.appendChild(css);
  document.body.appendChild(el);

  window.__card = (l1, l2, full) => {
    el.querySelector('.__l1').textContent = l1 || '';
    el.querySelector('.__l2').textContent = l2 || '';
    el.classList.toggle('full', !!full);
    el.classList.add('on');
  };
  window.__uncard = () => el.classList.remove('on');

  // Everything except the sky. The app's own canvas sits outside .app-shell,
  // so fading the shell leaves the starfield running underneath.
  window.__shell = on => {
    const shell = document.querySelector('.app-shell');
    shell.style.transition = 'opacity .75s ease';
    shell.style.opacity = on ? '1' : '0';
  };
};

/* Checking a trailer by watching it back is slow, and a decoded webm frame is
   awkward to look at from a script. TRAILER_SHOTS=1 drops a still at each beat
   instead, which is what you actually want to check: what is on screen, and
   whether the words sit clear of it. */
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

  // ---- 1. The verse. The app's own opening, left to run at its own pace —
  //         it closes itself after 3.2s, which is the pace it was designed at.
  await wait(p, 1900, 'verse');
  await wait(p, 2100);

  // ---- 2. Tonight, with the sky behind it.
  await p.evaluate(() => window.__card('A sleep app built around our nights.'));
  await wait(p, 2600, 'tonight');
  await p.evaluate(() => window.__uncard());
  await wait(p, 700);

  // ---- 3. The prayer times. A glance, not a tour.
  await p.evaluate(() => document.querySelector('.nav button[data-view="plan"]').click());
  await wait(p, 900);
  await p.evaluate(() => document.getElementById('prayerTimes')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await wait(p, 1300);
  await p.evaluate(() => window.__card('Our times, on your own phone.',
                                       'Nothing is sent anywhere.'));
  await wait(p, 3100, 'prayer');
  await p.evaluate(() => window.__uncard());
  await wait(p, 700);

  // ---- 4 & 5. The two kinds of night.
  await p.evaluate(() => {
    document.querySelector('.nav button[data-view="today"]').click();
    window.scrollTo({ top: 0 });
  });
  await wait(p, 1100);
  await p.evaluate(() => window.__card('Some nights you have it in you to plan.'));
  await wait(p, 2200, 'plan-night');
  await p.evaluate(() => window.__card('Some nights you really don’t.'));
  await wait(p, 2100, 'tired-night');
  await p.evaluate(() => window.__uncard());
  await wait(p, 600);

  const tired = p.locator('#lazyStart');
  await tired.scrollIntoViewIfNeeded();
  await wait(p, 800);
  await tired.click();
  await wait(p, 2600, 'goodnight');           // the Goodnight sheet, held
  await p.evaluate(() => window.__card('One tap. Then put the phone down.'));
  await wait(p, 2300, 'one-tap');
  await p.evaluate(() => { window.__uncard(); document.getElementById('lazyVeil').hidden = true; });
  await wait(p, 900);

  // ---- 6. The morning, named but not shown. This is the part the tester
  //         should meet for the first time in the app, not in a video.
  await p.evaluate(() => window.__shell(false));
  await wait(p, 800);
  await p.evaluate(() => window.__card('In the morning it asks you one question.',
                                       'That is the whole of it.', true));
  await wait(p, 2700, 'morning');

  // ---- 7. End card.
  await p.evaluate(link => window.__card('SleepSphere',
    'Prototype · now testing' + (link ? '\n' + link : ''), true), LINK);
  await p.evaluate(() => { document.querySelector('#__cine .__l1').style.fontSize = '42px'; });
  await wait(p, 2700, 'endcard');
  await p.evaluate(() => {
    document.querySelector('#__cine .__l1').style.fontSize = '';
    window.__card('Tell me what it gets wrong.',
                  'Every answer changes the next version.', true);
  });
  await wait(p, 2800, 'ask');
  await p.evaluate(() => window.__uncard());
  await wait(p, 900);

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
     for the same reason: the trim already lands on the verse, and a fade
     would make frame zero black — which is the frame a messaging app picks
     as the preview. */
  try {
    const { execFileSync } = require('child_process');
    // 1.5s in, the opening overlay is reliably opaque; earlier than that and
    // the app is still showing through it, which reads as a rendering fault
    // rather than as depth. Load timing varies a little between runs, so the
    // trim is set where it is safe rather than where it is tightest.
    const HEAD = 1.5, OUT_FADE = 0.7;
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
