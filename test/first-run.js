/**
 * What a person meets when they open the link.
 *
 * Reported as "nothing works, it's not user friendly". It was accurate,
 * and the cause was not any one feature: the app opened on the field
 * study enrolment, whose third step demands a participant code that only
 * an enrolled student has. There was no way past it. Anyone else — a
 * supervisor, an examiner, the person who built it — met a dead end on
 * step 3 and never reached the app at all. Sounds and Flight Mode were
 * working the whole time and unreachable.
 *
 * These checks are about reachability, measured in taps from a cold
 * open with empty storage, which is exactly what a deploy preview gives
 * a first-time visitor.
 *
 * Needs the repository served at :8099.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = 'http://localhost:8099/index.html';

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
};

const clockAt = h => `(()=>{const R=Date;const f=new R(2026,9,17,${h},30,0);
 class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
 static now(){return f.getTime();}} window.Date=D;})()`;

/* No seeding. A genuinely cold open. */
async function coldOpen(browser, w, h, hour) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 2,
    isMobile: w < 900, hasTouch: true
  });
  if (typeof hour === 'number') await ctx.addInitScript(clockAt(hour));
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  return { ctx, p, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });

  /* ================================================================
     1. There is a way into the app without joining the study.
     ================================================================ */
  for (const [name, w, h] of [['iPhone', 390, 844], ['iPad', 834, 1112]]) {
    const { ctx, p, errs } = await coldOpen(browser, w, h);

    const landing = await p.evaluate(() => {
      const fw = document.getElementById('fieldwork');
      const skip = document.getElementById('fwSkip');
      return {
        enrolment: Boolean(fw && fw.classList.contains('active')),
        skip: Boolean(skip && skip.offsetParent !== null),
        skipTap: skip ? Math.round(skip.getBoundingClientRect().height) : 0,
        skipText: skip ? skip.textContent.trim() : null
      };
    });
    check('1 · ' + name + ': the study enrolment is what opens', landing.enrolment);
    check('1 · ' + name + ': a way past it is visible immediately', landing.skip);
    check('1 · ' + name + ': and is tappable', landing.skipTap >= 44, landing.skipTap + 'px');
    check('1 · ' + name + ': it says what it does',
      /just use the app/i.test(landing.skipText || ''), landing.skipText);

    /* Tap 1. */
    await p.evaluate(() => document.getElementById('fwSkip').click());
    await p.waitForTimeout(1100);
    const after = await p.evaluate(() => {
      let study = {};
      try { study = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}').study || {}; } catch (e) {}
      return {
        enrolment: Boolean((document.getElementById('fieldwork') || {}).classList?.contains('active')),
        welcome: Boolean((document.getElementById('welcomeOverlay') || {}).classList?.contains('active')),
        tabs: document.querySelectorAll('.nav button[data-view]').length,
        study
      };
    });
    check('1 · ' + name + ': one tap clears it', !after.enrolment && !after.welcome);
    check('1 · ' + name + ': the app is there underneath', after.tabs === 5, String(after.tabs));

    /* The thing that must NOT happen: inventing a research subject. */
    check('1 · ' + name + ': no participant code is invented',
      after.study.participantId === '', JSON.stringify(after.study.participantId));
    check('1 · ' + name + ': no consent is claimed',
      after.study.consentAck === false, String(after.study.consentAck));
    check('1 · ' + name + ': and no enrolment date',
      !after.study.enrolledAt, String(after.study.enrolledAt));

    /* Tap 2 and 3: a sound. */
    await p.evaluate(() => document.querySelector('.nav button[data-view="learn"]').click());
    await p.waitForTimeout(1000);
    await p.evaluate(() => document.querySelector('.ex-sound').click());
    await p.waitForTimeout(1500);
    const sound = await p.evaluate(() => ({
      playing: window.SSExplore.playing(),
      player: !!document.getElementById('ssPlayer')
    }));
    check('1 · ' + name + ': three taps from a cold open to a playing sound',
      sound.playing.length === 1, sound.playing.join(','));
    check('1 · ' + name + ': with a player to stop it', sound.player);
    check('1 · ' + name + ': no console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. The code step is not a dead end either.

     Someone who taps Continue and only then finds out a code is
     needed must still have a way out, from where they are.
     ================================================================ */
  {
    const { ctx, p } = await coldOpen(browser, 834, 1112);
    const reached = await p.evaluate(async () => {
      document.querySelector('.fw-panel[data-fw="1"] [data-fw-next]').click();
      await new Promise(r => setTimeout(r, 400));
      const cb = document.getElementById('fwConsent');
      cb.click();
      await new Promise(r => setTimeout(r, 300));
      document.getElementById('fwConsentNext').click();
      await new Promise(r => setTimeout(r, 400));
      const panel = [...document.querySelectorAll('.fw-panel')].find(x => !x.hidden);
      const out = document.getElementById('fwSkipId');
      return {
        step: panel.dataset.fw,
        forwardDisabled: document.getElementById('fwIdNext').disabled === false,
        skip: Boolean(out && out.offsetParent !== null),
        skipText: out ? out.textContent.trim() : null
      };
    });
    check('2 · The code step is reached', reached.step === '3', reached.step);
    check('2 · It offers a way out', reached.skip);
    check('2 · Worded for someone who has no code',
      /don.t have a code/i.test(reached.skipText || ''), reached.skipText);

    await p.evaluate(() => document.getElementById('fwSkipId').click());
    await p.waitForTimeout(1000);
    const out = await p.evaluate(() => ({
      enrolment: Boolean((document.getElementById('fieldwork') || {}).classList?.contains('active')),
      code: (JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}').study || {}).participantId
    }));
    check('2 · And it works', out.enrolment === false);
    check('2 · Still inventing no code', out.code === '', JSON.stringify(out.code));
    await ctx.close();
  }

  /* ================================================================
     3. Enrolling properly still works, and still records the truth.
     ================================================================ */
  {
    const { ctx, p } = await coldOpen(browser, 834, 1112);
    const enrolled = await p.evaluate(async () => {
      document.querySelector('.fw-panel[data-fw="1"] [data-fw-next]').click();
      await new Promise(r => setTimeout(r, 350));
      document.getElementById('fwConsent').click();
      await new Promise(r => setTimeout(r, 250));
      document.getElementById('fwConsentNext').click();
      await new Promise(r => setTimeout(r, 350));
      document.getElementById('fwId').value = '14';
      document.getElementById('fwIdNext').click();
      await new Promise(r => setTimeout(r, 400));
      const panel = [...document.querySelectorAll('.fw-panel')].find(x => !x.hidden);
      return { step: panel.dataset.fw, id: document.getElementById('fwId').value };
    });
    check('3 · A real code advances past the code step',
      enrolled.step === '4', enrolled.step);
    check('3 · And is normalised', /^P/.test(enrolled.id), enrolled.id);
    await ctx.close();
  }

  /* ================================================================
     4. Flight Mode opens on a view that actually has footage.

        Opening on Day — which has no licensed clip — meant a daytime
        visitor's first impression of Flight Mode was an error message.
     ================================================================ */
  for (const hour of [10, 13, 18, 23]) {
    const { ctx, p } = await coldOpen(browser, 834, 1112, hour);
    await p.evaluate(() => document.getElementById('fwSkip').click());
    await p.waitForTimeout(800);
    await p.evaluate(() => window.SSFlightCabin.open());
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => {
      const host = document.getElementById('flightCabin');
      return {
        scene: host.dataset.scene,
        video: !!host.querySelector('.fc-video'),
        covered: window.SSFlightCabin.covered()
      };
    });
    check('4 · At ' + hour + ':30 it opens on a view with footage',
      r.covered.indexOf(r.scene) > -1 && r.video === true,
      r.scene + ', video=' + r.video);
    await ctx.close();
  }

  /* Day is still selectable, and still tells the truth when chosen. */
  {
    const { ctx, p } = await coldOpen(browser, 834, 1112, 13);
    await p.evaluate(() => document.getElementById('fwSkip').click());
    await p.waitForTimeout(800);
    await p.evaluate(() => { window.SSFlightCabin.open(); window.SSFlightCabin.setScene('day'); });
    await p.waitForTimeout(900);
    const day = await p.evaluate(() => ({
      head: (document.querySelector('.fc-missing-head') || {}).textContent,
      video: document.querySelectorAll('.fc-video').length
    }));
    check('4 · Day still says footage is unavailable',
      day.head === 'Video footage unavailable', day.head);
    check('4 · And still shows nothing in its place', day.video === 0, String(day.video));
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
