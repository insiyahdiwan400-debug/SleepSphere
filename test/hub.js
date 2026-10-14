/**
 * The Sounds & Experiences hub, the persistent player, and the in-flight
 * controls.
 *
 * The complaint this answers was that sounds and modules were impossible
 * to find: sounds sat three taps inside a practice called "Sounds" inside
 * a tab called Explore, Flight Mode was a URL parameter, Living Sky was
 * another one, and the Sabat Compass was behind a button on a different
 * screen. The requirement is two or three taps from home.
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

const SEED = `(()=>{try{localStorage.setItem('sleepsphere_state_v2',JSON.stringify({
 version:3,settings:{welcomeSeen:true,mode:'dark',openingOff:true},mornings:[],morningRevisions:[],
 bioCheckins:[],thoughts:[],scans:[],feedback:[],experimentHistory:[],trip:null,
 study:{onboarded:true,participantId:'HB',cohort:'jamea-v1',schemaVersion:3,storageMode:'local'}}));
 }catch(e){}})()`;

async function open(browser, opts) {
  const ctx = await browser.newContext(Object.assign({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  }, opts || {}));
  await ctx.addInitScript(SEED);
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  return { ctx, p, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });

  /* ================================================================
     1. Two taps from home to a playing sound.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser);
    /* The four-tab architecture is unchanged — no fifth destination. */
    const tabs = await p.evaluate(() =>
      [...document.querySelectorAll('.nav button[data-view]')].map(b => b.dataset.view));
    check('1 · Still exactly four destinations', tabs.length === 4, tabs.join(','));

    await p.tap('.nav button[data-view="learn"]');           /* tap 1 */
    await p.waitForTimeout(900);
    const hub = await p.evaluate(() => ({
      heading: (document.querySelector('#explore h3') || {}).textContent,
      groups: [...document.querySelectorAll('#explore .ex-group-head h4')].map(h => h.textContent),
      sounds: [...document.querySelectorAll('.ex-sound strong')].map(s => s.textContent),
      experiences: [...document.querySelectorAll('#explore .ex-tile strong')].map(s => s.textContent),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      minTap: Math.min(...[...document.querySelectorAll('.ex-sound, #explore .ex-tile')]
        .map(e => e.getBoundingClientRect().height))
    }));
    check('1 · One tap reaches a hub that says what it is',
      hub.heading === 'Sounds & Experiences', hub.heading);
    check('1 · With two labelled groups',
      hub.groups.join(' / ') === 'Sounds / Experiences', hub.groups.join(' / '));
    check('1 · Every sound is on it', hub.sounds.length === 7, hub.sounds.join(','));
    check('1 · Cabin hum among them for Flight Mode',
      hub.sounds.some(s => /Cabin hum/i.test(s)), hub.sounds.join(','));
    check('1 · The experiences are on it too',
      hub.experiences.length >= 8, hub.experiences.join(','));
    check('1 · Including the ones that were URL parameters',
      hub.experiences.includes('Flight Mode') && hub.experiences.includes('Living Sky'),
      hub.experiences.join(','));
    check('1 · And the Sabat Compass, which was behind another screen',
      hub.experiences.includes('Sabat Compass'), hub.experiences.join(','));
    check('1 · Touch targets are large', hub.minTap >= 44, hub.minTap.toFixed(0) + 'px');
    check('1 · No sideways scroll', hub.overflow <= 0, hub.overflow + 'px');

    /* Nothing may be playing before the second tap. */
    const before = await p.evaluate(() => window.SSExplore.playing());
    check('1 · Nothing plays until asked', before.length === 0, before.join(','));

    await p.evaluate(() => document.querySelector('.ex-sound').scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(300);
    await p.tap('.ex-sound >> nth=0');                        /* tap 2 */
    await p.waitForTimeout(1200);
    const after = await p.evaluate(() => ({
      playing: window.SSExplore.playing(),
      player: !!document.getElementById('ssPlayer')
    }));
    check('1 · Two taps from home and a sound is playing',
      after.playing.length === 1, after.playing.join(','));
    check('1 · And a player appears with it', after.player);
    check('1 · No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. The player is persistent, and survives navigation.

        Sound used to be owned by the mixer screen and die with it.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await p.tap('.nav button[data-view="learn"]');
    await p.waitForTimeout(800);
    await p.evaluate(() => window.SSExplore.startSound('rain'));
    await p.waitForTimeout(700);
    await p.tap('.nav button[data-view="today"]');
    await p.waitForTimeout(900);
    const moved = await p.evaluate(() => ({
      playing: window.SSExplore.playing(),
      player: !!document.getElementById('ssPlayer'),
      clearOfTabs: (() => {
        const bar = document.getElementById('ssPlayer');
        const nav = document.querySelector('.nav');
        if (!bar || !nav) return null;
        return bar.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top + 1;
      })()
    }));
    check('2 · Sound survives changing tab', moved.playing.join(',') === 'rain', moved.playing.join(','));
    check('2 · The player comes with it', moved.player);
    check('2 · And sits clear of the tab bar', moved.clearOfTabs === true, String(moved.clearOfTabs));

    /* Layering, and stopping everything. */
    await p.evaluate(() => { window.SSExplore.startSound('engine'); });
    await p.waitForTimeout(700);
    const two = await p.evaluate(() => window.SSExplore.playing());
    check('2 · Sounds layer', two.length === 2, two.join(','));
    await p.evaluate(() => window.SSExplore.stopEverySound());
    await p.waitForTimeout(900);
    const none = await p.evaluate(() => ({
      playing: window.SSExplore.playing(), player: !!document.getElementById('ssPlayer')
    }));
    check('2 · Stop stops all of it', none.playing.length === 0, none.playing.join(','));
    check('2 · And the player goes away when silent', none.player === false);
    await ctx.close();
  }

  /* ================================================================
     2b. A card can never disagree with the sound.

     The cards paint themselves from the registry rather than from their
     own click, so starting or stopping a sound anywhere else — the
     mixer, the player's stop button, the sleep timer fading out — is
     reflected on the hub. Before this, two sounds could be audible
     while both cards read "Tap to play".
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await p.tap('.nav button[data-view="learn"]');
    await p.waitForTimeout(900);
    const read = () => p.evaluate(() => [...document.querySelectorAll('.ex-sound')]
      .map(c => c.dataset.sound + ':' + (c.classList.contains('on') ? 'on' : 'off')));

    await p.evaluate(() => { window.SSExplore.startSound('rain'); window.SSExplore.startSound('engine'); });
    await p.waitForTimeout(800);
    const started = await read();
    check('2b · Sounds started elsewhere light their cards',
      started.includes('rain:on') && started.includes('engine:on'), started.join(' '));

    await p.evaluate(() => window.SSExplore.stopSound('rain'));
    await p.waitForTimeout(700);
    const partial = await read();
    check('2b · Stopping one clears only that card',
      partial.includes('rain:off') && partial.includes('engine:on'), partial.join(' '));

    await p.evaluate(() => window.SSExplore.stopEverySound());
    await p.waitForTimeout(700);
    const cleared = await read();
    check('2b · Stopping all clears every card',
      cleared.every(s => /:off$/.test(s)), cleared.join(' '));
    await ctx.close();
  }

  /* ================================================================
     3. The sleep timer fades rather than cutting.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await p.evaluate(() => { window.SSExplore.startSound('rain'); });
    await p.waitForTimeout(600);
    const set = await p.evaluate(() => {
      window.SSExplore.setSleepTimer(45);
      return { ends: window.SSExplore.timerEndsAt(), text: document.getElementById('ssPlayer').innerText };
    });
    check('3 · A sleep timer can be set', set.ends > Date.now(), String(set.ends > 0));
    check('3 · And the player says so', /Fading out/.test(set.text), set.text.replace(/\n/g, ' | '));
    const cleared = await p.evaluate(() => {
      window.SSExplore.setSleepTimer(0);
      return window.SSExplore.timerEndsAt();
    });
    check('3 · And can be cancelled', cleared === 0, String(cleared));
    await p.evaluate(() => window.SSExplore.stopEverySound());
    await ctx.close();
  }

  /* ================================================================
     4. The body scan is hands-free, and silent until asked.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser);
    await p.tap('.nav button[data-view="learn"]');
    await p.waitForTimeout(800);
    await p.evaluate(() => window.SSExplore.open('Body scan'));
    await p.waitForTimeout(700);
    const scan = await p.evaluate(() => {
      const voice = [...document.querySelectorAll('.ex-controls button')]
        .find(b => /Speak the steps/.test(b.textContent));
      return {
        voice: !!voice,
        voicePressed: voice ? voice.getAttribute('aria-pressed') : null,
        speaking: Boolean(window.speechSynthesis && window.speechSynthesis.speaking),
        autoNote: /moves on its own/.test(document.body.innerText),
        noTapNote: /do not\s+have to tap anything/.test(document.body.innerText.replace(/\s+/g, ' '))
      };
    });
    check('4 · Spoken guidance is offered', scan.voice);
    check('4 · But is OFF until asked', scan.voicePressed === 'false', String(scan.voicePressed));
    check('4 · Nothing is being spoken on arrival', scan.speaking === false);
    check('4 · It advances on its own', scan.autoNote);
    check('4 · And says so, so eyes can stay shut', scan.noTapNote);
    check('4 · No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
