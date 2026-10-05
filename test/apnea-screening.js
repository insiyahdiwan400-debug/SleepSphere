/**
 * STOP-BANG — screening, not diagnosis.
 *
 * This is the one screen in the app where getting the WORDING wrong is a
 * safety problem rather than a polish problem. Apnea is a medical diagnosis,
 * it needs a sleep study, and being wrong in the reassuring direction is the
 * dangerous one: untreated apnea raises stroke and heart risk, so an app that
 * reads as "you're fine" can delay a diagnosis that matters.
 *
 * So these checks are mostly about language, and they are deliberately hard
 * to satisfy by accident.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

// Seeded as an enrolled device: without a study block the app opens into
// fieldwork onboarding, which is correct behaviour and would block every
// check below. The seed stays at version 2 on purpose, so each run also
// exercises the v2 -> v3 migration.
const SEED = `(()=>{localStorage.setItem('sleepsphere_state_v2', JSON.stringify({
  version:2, settings:{welcomeSeen:true, openingOff:true, mode:'dark'}, study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}));})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(SEED);
  await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('.nav button[data-view="learn"]')?.click());
  await p.waitForTimeout(400);

  check('All eight questions are asked', await p.locator('.stopbang-q').count() === 8);

  const answerAll = yes => p.evaluate(v => document.querySelectorAll('[data-stopbang]')
    .forEach(g => g.querySelector(`[data-answer="${v ? 'yes' : 'no'}"]`).click()), yes);
  const answerOne = (key, yes) => p.evaluate(([k, v]) =>
    document.querySelector(`[data-stopbang="${k}"] [data-answer="${v ? 'yes' : 'no'}"]`).click(), [key, yes]);
  const result = async () => {
    await p.locator('#stopbangCheck').click();
    await p.waitForTimeout(250);
    return p.locator('#stopbangResult').innerText();
  };

  // An incomplete screen must not produce a band at all — a partial score is
  // not the instrument, and showing one would be inventing a result.
  await p.locator('#stopbangReset').click();
  await answerOne('snore', true);
  const partial = await result();
  check('A part-answered screen gives no band', /left/i.test(partial) && !/risk|doctor/i.test(partial),
        partial.split('\n')[0]);

  // The three published bands.
  await answerAll(false);
  const low = await result();
  await answerAll(false); await answerOne('snore', true); await answerOne('tired', true);
  await answerOne('observed', true);
  const mid = await result();
  await answerAll(true);
  const high = await result();
  check('Low band at 0 of 8', /low risk/i.test(low), low.split('\n')[0]);
  check('Intermediate band at 3 of 8', /doctor/i.test(mid), mid.split('\n')[0]);
  check('High band at 8 of 8', /sleep study/i.test(high), high.split('\n')[0]);

  /* Language. The claim must never be made in EITHER direction, and a
     reassuring false negative is the one that could actually hurt someone. */
  const claimsDiagnosis = text => {
    const t = text.toLowerCase().replace(/\s+/g, ' ');
    // Strip the hedged forms first, so a sentence like "this does not mean you
    // have apnea" is not mistaken for the claim it explicitly denies.
    const hedged = t
      .replace(/(does not|doesn't|does not necessarily|cannot|can't|never) mean (that )?you (have|do not have|don't have)[^.]*/g, '')
      .replace(/(not|no) a diagnosis/g, '')
      .replace(/cannot (tell you whether|diagnose)[^.]*/g, '');
    return /\byou have (obstructive )?(sleep )?apnea\b/.test(hedged)
        || /\byou (do not|don't) have (obstructive )?(sleep )?apnea\b/.test(hedged)
        || /\byou are fine\b/.test(hedged)
        || /\bdiagnosed with\b/.test(hedged);
  };
  check('Low band makes no claim', !claimsDiagnosis(low));
  check('Intermediate band makes no claim', !claimsDiagnosis(mid));
  check('High band makes no claim', !claimsDiagnosis(high));

  // A low score is the most dangerous place to sound final, because that is
  // where someone stops asking.
  check('Low band still points at a doctor', /doctor|sleep study/i.test(low));
  check('Low band refuses to be a clean bill of health',
        /not a clean bill|still|whatever this says|if you/i.test(low));

  // High risk must not be left sounding like a sentence.
  check('High band says it is treatable', /treatable/i.test(high));

  // The safety note is always on screen, not only after a result.
  await p.locator('#stopbangReset').click();
  check('The safety note is permanent', await p.locator('#stopbangCard .callout.safety').isVisible());
  check('Only a sleep study can diagnose, and it says so',
        /only a sleep study/i.test(await p.locator('#stopbangCard .callout.safety').innerText()));

  // A risk score is the most sensitive thing this app could hold. It is never
  // written down, so it cannot leak, and the screen says as much.
  await answerAll(true);
  const shown = await result();
  check('It tells you nothing is saved', /not saved/i.test(shown));
  const stored = await p.evaluate(() => localStorage.getItem('sleepsphere_state_v2') || '');
  check('And nothing is actually saved',
        !/snore|stopbang|apnea/i.test(stored));

  check('No console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
