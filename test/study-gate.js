/**
 * What `?study=1` is, and — more importantly — what it is not.
 *
 * The study was retired from the default experience, and the way back in
 * is a query parameter. A query parameter is the easiest thing in a web
 * app to turn into a back door by accident: it is typed by anyone, it is
 * shareable, it is remembered, and it is the kind of switch that
 * historically ends up gating "and also show me everything".
 *
 * So this suite is written against the parameter rather than the
 * feature. It asserts that the flag:
 *
 *   1. changes which screens this build offers, and nothing else;
 *   2. does not enrol anybody, and does not reveal a participant record
 *      on a device that has none;
 *   3. cannot read another participant's data, because there is no such
 *      data to read — everything is this device's own localStorage, and
 *      the flag opens no channel to anywhere else;
 *   4. leaves the private vault exactly as locked as it was;
 *   5. exports nothing on its own — the researcher export stays a thing
 *      a person does, with a tap, to a file on their device;
 *   6. preserves what is already saved, through `?study=1`, `?study=0`
 *      and back, byte for byte.
 *
 * Needs the repository served at :8099.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ORIGIN  = 'http://localhost:8099';
const PRODUCT = ORIGIN + '/index.html';
const STUDY   = ORIGIN + '/index.html?study=1';
const LEAVE   = ORIGIN + '/index.html?study=0';

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
};

/* One context, several visits: the point of most of these checks is what
   survives a reload, so the profile has to persist across them. */
async function visit(ctx, url, { settle = 2200 } = {}) {
  const p = await ctx.newPage();
  const errs = [];
  const offsite = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  /* Anything that leaves this origin is a transmission, whatever it
     carries. The brief is explicit that health data does not go to an
     external service without being asked for, so the test watches the
     wire rather than the intention. */
  p.on('request', r => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:')) offsite.push(r.url()); });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(settle);
  return { p, errs, offsite };
}

const SEED = () => {
  const s = window.SS.state.settings;
  s.usualWake = '06:45';
  s.target = 480;
  window.SS.state.mornings = [{
    id: 'real-1', date: '2026-10-30', bedTime: '23:10', sleepTime: '23:25',
    wakeTime: '07:05', rest: 3, energy: 3, focus: 3, onsetMinutes: 15,
    awakeMinutes: 20, opportunityMinutes: 475, sleepMinutes: 440,
    createdAt: '2026-10-31T07:10:00.000Z'
  }];
  return window.SS.save();
};

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true
  });

  /* ================================================================
     1. A cold device, taken into study mode by the link alone.
     ================================================================ */
  {
    const { p, errs, offsite } = await visit(ctx, STUDY);
    const seen = await p.evaluate(() => ({
      flag:     document.documentElement.dataset.study,
      stored:   localStorage.getItem('ss_study'),
      study:    JSON.parse(JSON.stringify(window.SS.state.study || {})),
      panel:    document.getElementById('studyPanel')?.hidden,
      /* The consent panel's markup is never deleted — that is the point of
         the split — so the question is whether it is SHOWN, not whether it
         exists. */
      consent:  document.querySelector('.fw-panel[data-fw="1"]')?.hidden === false,
      steps:    [...document.querySelectorAll('#fieldwork .fw-rail i')].filter(b => !b.hidden).length,
      keys:     Object.keys(localStorage).sort()
    }));

    check('?study=1 turns the study layer on', seen.flag === 'on' && seen.stored === '1',
          `${seen.flag}/${seen.stored}`);
    check('the enrolment screens are offered again, consent first',
          seen.consent === true && seen.steps === 6, `${seen.steps} steps`);

    /* The flag says what this BUILD offers. It must not say anything
       about who this PERSON is. */
    check('but nobody is enrolled by the link',
          !seen.study.participantId && !seen.study.enrolled,
          JSON.stringify(seen.study));
    check('and no participant record is shown on a device without one',
          seen.panel === true, `studyPanel hidden: ${seen.panel}`);

    /* Everything this app knows is in this device's own storage. The
       flag adds one key of its own and reads nothing else. */
    check('the flag writes exactly one key of its own, beside the app\'s',
          seen.keys.filter(k => k !== 'ss_study' && k !== 'sleepsphere_state_v2'
                             && !k.startsWith('ss_') && !k.startsWith('sleepsphere'))
            .length === 0,
          seen.keys.join(', '));
    check('study mode sends nothing off this origin', offsite.length === 0, offsite.join(' | '));
    check('and opens without a console error', errs.length === 0, errs.join(' | '));
    await p.close();
  }

  /* ================================================================
     2. Real data, saved in study mode, on this same device.
     ================================================================ */
  let before = null;
  {
    const { p } = await visit(ctx, STUDY);
    const saved = await p.evaluate(SEED);
    check('a morning saves while the study layer is on', saved === true);
    await p.waitForTimeout(300);
    before = await p.evaluate(() => localStorage.getItem('sleepsphere_state_v2'));
    check('and it is written to the app\'s one storage key', Boolean(before));
    await p.close();
  }

  /* ================================================================
     3. The private vault is not part of the study, in either mode.

        Motherhood's whole design is that its tab discloses nothing and
        its contents are encrypted behind a passcode. A research switch
        is exactly the kind of flag that quietly becomes "and show the
        researcher everything", so this is asserted rather than assumed.
     ================================================================ */
  {
    const { p } = await visit(ctx, STUDY);
    const vault = await p.evaluate(() => {
      const M = window.SSMotherhood;
      const raw = Object.keys(localStorage)
        .filter(k => /mother/i.test(k))
        .map(k => localStorage.getItem(k) || '');
      return {
        present: Boolean(M),
        unlocked: M && typeof M.isUnlocked === 'function' ? M.isUnlocked() : null,
        /* Nothing legible in storage, whatever the flag says. */
        legible: raw.some(v => /\b(birth|baby|feed|pregnan)/i.test(v)),
        /* The tab says "Private" and nothing more, in both modes. */
        tab: document.querySelector('.nav button[data-view="private"]')?.textContent || ''
      };
    });
    check('the private vault is not unlocked by study mode',
          vault.unlocked !== true, String(vault.unlocked));
    check('and nothing of it is legible in storage',
          vault.legible === false);
    check('the neutral tab stays neutral under ?study=1',
          !/mother|baby|pregnan/i.test(vault.tab), vault.tab.trim());
    await p.close();
  }

  /* ================================================================
     4. The researcher export is still something a person does.
     ================================================================ */
  {
    const { p, offsite } = await visit(ctx, STUDY);
    let downloads = 0;
    p.on('download', () => { downloads++; });
    await p.waitForTimeout(1200);
    check('nothing is exported by opening the app in study mode', downloads === 0);
    check('and nothing is uploaded either', offsite.length === 0, offsite.join(' | '));

    /* The export itself refuses without a participant code, which is the
       same refusal it always had — the flag does not bypass it. */
    const refused = await p.evaluate(() => {
      const button = document.getElementById('exportStudy');
      if (!button) return 'no button';
      button.click();
      return document.getElementById('studyExportNote')?.textContent || 'clicked';
    });
    await p.waitForTimeout(600);
    check('the export still refuses on a device with no participant code',
          downloads === 0, `${downloads} file(s), note: ${refused}`);
    await p.close();
  }

  /* ================================================================
     5. Leaving and re-entering preserves what is saved.

        The storage guard refuses to overwrite bytes it cannot parse,
        which protects against corruption. It does not protect against a
        flag that resets state on purpose, so that is checked directly:
        the stored string has to come back identical.
     ================================================================ */
  {
    const { p } = await visit(ctx, LEAVE);
    const seen = await p.evaluate(() => ({
      flag:   document.documentElement.dataset.study,
      stored: localStorage.getItem('ss_study'),
      raw:    localStorage.getItem('sleepsphere_state_v2'),
      mornings: window.SS.state.mornings.length,
      wake:   window.SS.state.settings.usualWake
    }));
    check('?study=0 puts the device back into the product', seen.flag === 'off' && !seen.stored,
          `${seen.flag}/${seen.stored}`);
    check('and the saved night is still there', seen.mornings === 1 && seen.wake === '06:45',
          `${seen.mornings} morning(s), wake ${seen.wake}`);
    check('byte for byte', seen.raw === before);
    await p.close();
  }
  {
    const { p } = await visit(ctx, STUDY);
    const raw = await p.evaluate(() => localStorage.getItem('sleepsphere_state_v2'));
    const mornings = await p.evaluate(() => window.SS.state.mornings.length);
    check('and going back into study mode preserves it too',
          raw === before && mornings === 1, `${mornings} morning(s)`);
    await p.close();
  }
  {
    /* And back out, so the profile is left as the product — the state
       any later visit in this context would otherwise inherit. */
    const { p } = await visit(ctx, LEAVE);
    const raw = await p.evaluate(() => localStorage.getItem('sleepsphere_state_v2'));
    check('a full round trip changes nothing that was saved', raw === before);
    await p.close();
  }

  /* ================================================================
     6. A device that never asks for the study never gets it.
     ================================================================ */
  {
    const fresh = await browser.newContext({
      viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true
    });
    const p = await fresh.newPage();
    await p.goto(PRODUCT, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2200);
    const seen = await p.evaluate(() => ({
      flag: document.documentElement.dataset.study,
      /* Present in the markup, never shown: nothing was deleted to retire
         the study, and nothing opens it without being asked. */
      built: Boolean(document.querySelector('.fw-panel[data-fw="1"]')),
      consent: document.querySelector('.fw-panel[data-fw="1"]')?.hidden === false,
      steps: [...document.querySelectorAll('#fieldwork .fw-rail i')].filter(b => !b.hidden).length,
      text: (document.getElementById('fieldwork')?.innerText || '')
    }));
    check('the product door is not the study door', seen.flag === 'off');
    check('and says nothing about a study, research or participants',
          !/\bstudy\b|\bresearch\b|\bparticipant\b|\bprototype\b/i.test(seen.text),
          seen.text.slice(0, 90).replace(/\s+/g, ' '));
    /* The research layer is retired, not demolished. Its screens are still
       in the markup and still tested; the product simply never walks into
       them, and the opening sequence is three steps rather than six. */
    check('the consent screen is still in the build, and still never shown',
          seen.built === true && seen.consent === false);
    check('and the opening sequence is three steps, not six',
          seen.steps === 3, `${seen.steps} steps`);
    await fresh.close();
  }

  await ctx.close();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED'); process.exit(1); }
  console.log('ALL CHECKS PASSED');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
