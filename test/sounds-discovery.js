/**
 * Sounds discoverability regression: reproduces the path a tester takes.
 *
 * A preview can load successfully yet appear to have no Sounds feature.
 * This test starts at Today (not ?go=learn), follows the visible Explore
 * navigation, opens the Sounds tile, and checks that the existing sleep
 * record remains intact. It does not claim to verify audible output on iOS.
 *
 * Run with the repository served at http://localhost:8099/index.html:
 *   node test/sounds-discovery.js
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
  if (!ok) failures++;
}

const SEED = `(() => {
  localStorage.setItem('sleepsphere_state_v2', JSON.stringify({
    version: 3,
    settings: { welcomeSeen: true, openingOff: true, mode: 'dark', target: 480 },
    study: { onboarded: true, participantId: 'TEST', cohort: 'jamea-v1',
      schemaVersion: 3, storageMode: 'local', consentAck: true },
    mornings: [{ id: 'sounds-regression-record', date: '2026-10-12',
      bedTime: '23:30', sleepTime: '23:45', wakeTime: '06:45',
      opportunityMinutes: 435, sleepMinutes: 420, rest: 4, demo: false }],
    morningRevisions: [], bioCheckins: [], thoughts: [], scans: [],
    feedback: [], experimentHistory: []
  }));
})()`;

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
    });
    await context.addInitScript(SEED);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    const before = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
      return { record: state.mornings.find(r => r.id === 'sounds-regression-record'),
        motherhoodKeys: Object.keys(localStorage).filter(k => /motherhood/i.test(k)) };
    });
    check('Existing sleep record loaded', Boolean(before.record));

    const exploreNav = page.locator('.nav button[data-view="learn"]');
    check('Explore is in main navigation', await exploreNav.count() === 1);
    await exploreNav.click();
    await page.waitForTimeout(250);
    check('Explore page is active', await page.locator('#learn.view.active').count() === 1);

    /* Sounds is no longer one tile among the practices: Explore is now a
       hub with a labelled Sounds group whose cards each start a sound
       directly. That serves this check's intent better — it is one tap
       from Explore to a playing sound instead of three — so the
       assertion follows the structure rather than the other way round.
       The mixer is still reachable, from the group's own link, and
       everything below still exercises it. */
    const soundsGroup = page.locator('#explore .ex-group-head h4').filter({ hasText: 'Sounds' });
    const soundCards = page.locator('#explore .ex-sound');
    const found = await soundsGroup.count() === 1 && await soundsGroup.isVisible()
      && await soundCards.count() >= 6 && await soundCards.first().isVisible();
    check('Sounds is visible from Explore', found);
    if (found) {
      await page.locator('#explore .ex-link').filter({ hasText: 'Open the mixer' }).click();
      check('Sounds dialog opens', await page.locator('.ex-layer[role="dialog"][aria-label="Sounds"]').count() === 1);
      check('Opening Sounds does not autoplay audio',
        await page.evaluate(() => window.SSExplore.audioRunning() === false));
      /* Seven since Cabin hum was added for Flight Mode. */
      check('Every sound layer is independently available',
        await page.locator('.ex-layer-row:not(.ex-master) .ex-toggle').count() === 7);
      await page.locator('.ex-layer-row:not(.ex-master) .ex-toggle').first().click();
      await page.waitForTimeout(700);
      check('Tapping a layer starts its audio graph',
        await page.evaluate(() => window.SSExplore.audioRunning() === true));
      await page.locator('.ex-layer .ex-close').click();
      await page.waitForTimeout(250);
      check('Closing Sounds stops the audio graph',
        await page.evaluate(() => window.SSExplore.audioRunning() === false));
    }

    const after = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
      return { record: state.mornings.find(r => r.id === 'sounds-regression-record'),
        motherhoodKeys: Object.keys(localStorage).filter(k => /motherhood/i.test(k)) };
    });
    check('Visiting Sounds preserves the existing sleep record',
      JSON.stringify(after.record) === JSON.stringify(before.record));
    check('Visiting Sounds does not create a Motherhood vault',
      JSON.stringify(after.motherhoodKeys) === JSON.stringify(before.motherhoodKeys));
    check('No uncaught page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error('FATAL', error); process.exit(1); });
