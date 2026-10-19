/**
 * Records a walkthrough of what SleepSphere does.
 *
 * Run:  node tools/explainer.js          (repository served at :8099)
 * Out:  explainer/sleepsphere-explainer.webm
 *
 * Deliberately not the trailer. test/trailer.js is a film — it holds on
 * the sky, pushes in, and is trying to make someone feel something. This
 * is the other thing: what the app is, in the order a person meets it,
 * with the screens doing the talking.
 *
 * Rules it is written to:
 *
 *   · Every screen is the real app. Nothing is mocked, staged or
 *     re-enacted. The morning record below is typed into the real form
 *     and saved through the real button, and the figure that appears
 *     afterwards is the one the app derived from it.
 *   · Captions name what is on screen. No promises about sleep, no
 *     adjectives doing work the screen is not doing, nothing that would
 *     embarrass the person showing it to a supervisor.
 *   · Taps are visible, because a cut with no cause looks like a bug.
 *   · One caption per beat, and the beat is as long as it takes to read
 *     it once.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'explainer');
const BASE = 'http://localhost:8099/index.html';

/* 20:40, the evening phase: the night console is up, which is the state
   someone opening the app before bed actually sees. */
const FREEZE = () => {
  const fixed = new Date(); fixed.setHours(20, 40, 0, 0);
  const Real = Date;
  window.Date = class extends Real {
    constructor(...a) { return a.length ? new Real(...a) : new Real(fixed); }
    static now() { return fixed.getTime(); }
  };
};

/* A caption bar and a tap ripple. That is the whole apparatus — no
   scrim over the app, no drift, no push. The app is the subject. */
const CAPTION = () => {
  const bar = document.createElement('div');
  bar.id = '__cap';
  bar.innerHTML = '<span></span>';
  const css = document.createElement('style');
  css.textContent = `
    #__cap { position:fixed; left:0; right:0; bottom:0; z-index:99999;
      display:flex; justify-content:center; pointer-events:none;
      padding:0 18px calc(env(safe-area-inset-bottom,0px) + 18px);
      opacity:0; transform:translateY(8px);
      transition:opacity .22s ease, transform .22s ease; }
    #__cap.on { opacity:1; transform:none; }
    #__cap span { display:block; max-width:340px; text-align:center;
      font:500 16px/1.45 var(--font-body, system-ui, sans-serif);
      letter-spacing:-.005em; color:#f4f1ea;
      background:rgba(8,12,20,.86); border-radius:13px;
      padding:11px 16px; border:1px solid rgba(255,255,255,.1);
      -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); }
    .__tap { position:fixed; z-index:99998; width:26px; height:26px;
      margin:-13px 0 0 -13px; border-radius:50%;
      background:rgba(255,255,255,.55); pointer-events:none;
      animation:__ripple .6s cubic-bezier(.2,.7,.3,1) forwards; }
    @keyframes __ripple { from { transform:scale(.3); opacity:.7; }
                          to   { transform:scale(4.4); opacity:0; } }`;
  document.head.appendChild(css);
  document.body.appendChild(bar);
  window.__say = text => {
    bar.querySelector('span').textContent = text;
    bar.classList.add('on');
  };
  window.__quiet = () => bar.classList.remove('on');
  window.__tap = sel => {
    const n = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!n) return;
    const r = n.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = '__tap';
    d.style.left = (r.left + r.width / 2) + 'px';
    d.style.top = (r.top + r.height / 2) + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 650);
  };
};

const wait = (p, ms) => p.waitForTimeout(ms);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
    recordVideo: { dir: OUT, size: { width: 390, height: 844 } }
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(FREEZE);
  await p.goto(BASE, { waitUntil: 'networkidle' });
  /* The app seeds, migrates and renders for well over a second after
     networkidle. A first recording tapped Skip at 1.4s, before the
     button was wired, and filmed ninety seconds of walkthrough against
     an onboarding screen that never went away — every later step
     clicking into a dialog. Wait for the real thing, then prove it
     worked before filming anything. */
  await p.waitForSelector('#fwSkip', { state: 'attached', timeout: 15000 });
  await wait(p, 2200);
  await p.evaluate(CAPTION);

  const say = async (text, ms) => { await p.evaluate(t => window.__say(t), text); await wait(p, ms || 2600); };
  const tapSel = async (sel, after) => {
    await p.evaluate(s => window.__tap(s), sel);
    await wait(p, 260);
    await p.evaluate(s => { const n = document.querySelector(s); if (n) n.click(); }, sel);
    await wait(p, after || 900);
  };
  const go = async view => tapSel(`.nav button[data-view="${view}"]`, 1100);

  /* ── 1. What it is ─────────────────────────────────────────────── */
  await p.evaluate(() => { document.getElementById('opening')?.remove(); });
  await tapSel('#fwSkip', 1600);
  const past = await p.evaluate(() =>
    !document.getElementById('fieldwork')?.classList.contains('active') &&
    document.querySelectorAll('.nav button[data-view]').length >= 4);
  if (!past) throw new Error('Onboarding did not clear — refusing to film a walkthrough of a dialog');
  await say('SleepSphere records how you slept and what it did to the day after.', 4000);

  /* ── 2. The loop ───────────────────────────────────────────────── */
  await say('Three things, once a day.', 2400);
  await say('1 — Check today.', 2600);
  await p.evaluate(() => window.scrollTo({ top: 420, behavior: 'smooth' }));
  await wait(p, 1400);

  await say('2 — Plan tonight. Wake time first, then the rest works backwards from it.', 4200);
  await tapSel('[data-go="plan"]', 1600);
  await p.evaluate(() => {
    const n = document.getElementById('prayerTimes');
    if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await wait(p, 1500);
  await say('Prayer times are calculated on the device, for your own location.', 4000);

  /* ── 3. The morning record, typed into the real form ───────────── */
  await say('3 — Record the morning.', 2600);
  await tapSel('[data-go="morning"]', 1500);
  await p.evaluate(() => {
    const set = (id, v) => { const n = document.getElementById(id); if (n) { n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('actualBed', '22:40');
    set('actualSleep', '23:05');
    set('actualWake', '05:10');
    set('awakeMinutes', '15');
  });
  await wait(p, 1200);
  await say('Times you can estimate. Nothing here needs a wearable.', 3800);
  await p.evaluate(() => {
    document.querySelectorAll('[data-rating]').forEach(group => {
      const b = group.querySelectorAll('button')[3];
      if (b) b.click();
    });
  });
  await wait(p, 1100);
  await say('Then four ratings: rest, energy, focus, calm.', 3400);

  await p.evaluate(() => {
    const n = document.getElementById('estimatedSleep');
    if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await wait(p, 1300);
  const derived = await p.evaluate(() => (document.getElementById('estimatedSleep') || {}).textContent || '');
  await say('The app works out the sleep figure. It never invents one.', 3800);

  await tapSel('#saveMorning', 1800);
  await say('Saved on this device.', 2400);

  /* ── 4. What it shows back ─────────────────────────────────────── */
  await go('twin');
  await say('Patterns appear once there are enough nights. Not before.', 3800);

  /* ── 5. Explore ────────────────────────────────────────────────── */
  await go('learn');
  await say('Sounds and wind-down practices. Generated on the device, so they work offline.', 4200);
  const sound = await p.evaluate(() => Boolean(document.querySelector('#explore .ex-sound')));
  if (sound) {
    await tapSel('#explore .ex-sound', 1800);
    await say('One tap to start. A player stays on screen to stop it.', 3600);
    await p.evaluate(() => {
      const b = document.querySelector('#ssPlayer button[aria-label="Stop all sound"]');
      if (b) { window.__tap(b); b.click(); }
    });
    await wait(p, 1200);
  }

  /* ── 6. Private ────────────────────────────────────────────────── */
  await go('private');
  await say('A separate space, kept apart from the study data.', 3600);
  await say('Off until you turn it on, and locked behind its own passcode.', 3800);

  /* ── 7. Your data ──────────────────────────────────────────────── */
  await go('data');
  await say('Everything stays in this browser. Export it, print it, or erase it.', 4200);
  await say('Nothing is sent anywhere automatically.', 3000);

  await p.evaluate(() => window.__quiet());
  await wait(p, 1200);

  console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors');
  console.log('derived sleep figure shown: ' + (derived.trim() || '(none)'));

  const video = p.video();
  await ctx.close();
  const raw = await video.path();
  const final = path.join(OUT, 'sleepsphere-explainer.webm');
  fs.renameSync(raw, final);
  await browser.close();
  console.log(final + '  (' + (fs.statSync(final).size / 1024).toFixed(0) + ' KB)');
})();
