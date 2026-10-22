/**
 * SleepSphere Motherhood — the module.
 *
 * test/motherhood.js already proves the BOUNDARY: separate namespace, the
 * flag outside `state`, deny-by-default export, erase. This suite proves
 * the MODULE built on top of it — the vault, the records, the arithmetic,
 * and the three promises the interface makes that would be worth nothing
 * if only a human ever checked them:
 *
 *   · what is written to the device is ciphertext, not fields
 *   · a figure nobody entered is reported as missing, never as zero
 *   · nothing Motherhood-shaped reaches a research export
 *
 * It drives the real page, not a mock, because the encryption, the storage
 * and the interface all have to agree for any of it to be true.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = 'http://localhost:8099/index.html';
const PASS = 'a quiet harbour';

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
}

async function open(browser, opts) {
  const ctx = await browser.newContext(Object.assign({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true
  }, opts || {}));
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => { const e = document.getElementById('previewBar'); if (e) e.remove(); });
  return { ctx, p, errs };
}

/* Build a vault straight through the data layer. The interface is driven
   separately; mixing the two would make a data failure look like a layout
   failure. */
async function seed(p, stage, detail, entries) {
  return p.evaluate(async ({ pass, stage, detail, entries }) => {
    const M = window.SSMotherhood;
    await M.createVault(pass);
    await M.setStage(stage, detail);
    for (const e of entries) await M.addEntry(e);
    return M.liveEntries(M.vault()).length;
  }, { pass: PASS, stage, detail, entries });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });

  /* ================================================================
     1. OFF means absent.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser);
    const off = await p.evaluate(() => ({
      enabled: window.SSMotherhood.isEnabled(),
      elements: document.querySelectorAll('.mh-layer, .mh-card, .mh-entry').length,
      stored: localStorage.getItem(window.__motherhood.key),
      entry: Boolean(document.getElementById('mhEntry'))
    }));
    check('Off by default', off.enabled === false);
    check('No Motherhood element exists when off', off.elements === 0, String(off.elements));
    check('No storage key exists when off', off.stored === null);
    check('The door is there on every device, enabled or not', off.entry === true);
    check('No console errors with the module loaded and off', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. The vault: ciphertext at rest, and a passcode that matters.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await seed(p, 'pregnancy', { dueDate: '2027-01-15' }, [
      { kind: 'day', date: '2026-10-09', fatigue: 4, energy: 2, symptoms: ['Heartburn'], notes: 'sore back' }
    ]);

    const raw = await p.evaluate(() => localStorage.getItem(window.__motherhood.key));
    check('Something is stored', typeof raw === 'string' && raw.length > 40);
    /* The honest test of "encrypted at rest" is that none of the content is
       in the file — not the stage, not a date, not a field name, not a word
       the participant typed. */
    const leaks = ['pregnancy', 'dueDate', 'heartburn', 'sore back', 'fatigue',
                   'entries', 'symptoms', '2027-01-15', 'postpartum']
      .filter(w => new RegExp(w, 'i').test(raw));
    check('Nothing readable is stored on the device', leaks.length === 0, leaks.join(', ') || 'no leaks');
    check('What IS stored is a sealed envelope',
      /"cipher"/.test(raw) && /"kdf"/.test(raw) && /"enabled":true/.test(raw));

    const wrong = await p.evaluate(async () => {
      window.SSMotherhood.lock();
      try { await window.SSMotherhood.unlock('not the passcode'); return 'opened'; }
      catch { return 'refused'; }
    });
    check('A wrong passcode does not open it', wrong === 'refused');
    check('And the vault stays locked after a failure',
      (await p.evaluate(() => window.SSMotherhood.isUnlocked())) === false);

    const right = await p.evaluate(async pass => {
      await window.SSMotherhood.unlock(pass);
      const v = window.SSMotherhood.vault();
      return { stage: v.stage, entries: v.entries.length, note: v.entries[0].notes };
    }, PASS);
    check('The right passcode opens it', right.stage === 'pregnancy');
    check('With every record intact', right.entries === 1 && right.note === 'sore back');
    await ctx.close();
  }

  /* ================================================================
     3. The research export never carries any of it.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await seed(p, 'postpartum', { birthDate: '2026-09-01', feeding: 'mixed' }, [
      { kind: 'feed', date: '2026-10-09', at: '03:10', method: 'breast', minutes: 22 },
      { kind: 'weight', date: '2026-10-09', value: 68.4, unit: 'kg' }
    ]);
    const exported = await p.evaluate(() => JSON.stringify(window.__motherhood.exported()));
    const found = ['motherhood', 'postpartum', 'breast', 'feeding', '68.4', 'birthDate']
      .filter(w => new RegExp(w, 'i').test(exported));
    check('A research export carries nothing Motherhood-shaped', found.length === 0, found.join(', ') || 'clean');
    check('And it is still a real export', /"mornings"/.test(exported) && /"study"/.test(exported));
    await ctx.close();
  }

  /* ================================================================
     4. Arithmetic, and the refusal to invent.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    const today = await p.evaluate(() => new Date().toISOString().slice(0, 10));
    await seed(p, 'postpartum', { birthDate: '2026-09-20' }, [
      { kind: 'night', date: today, wakings: 3, restIntervals: [
        { from: '22:40', to: '01:10' },   // 150
        { from: '01:50', to: '03:30' },   // 100
        { from: '04:10', to: '06:20' }    // 130
      ] }
    ]);
    const s = await p.evaluate(() => window.SSMotherhood.summarise(window.SSMotherhood.vault()));
    check('Rest intervals total correctly across midnight', s.meanRestMinutes === 380,
      String(s.meanRestMinutes));
    check('Wakings are carried through', s.meanWakings === 3, String(s.meanWakings));
    /* The one that matters most. Nobody recorded a fatigue score, so the
       module must say so rather than average an empty list into 0. */
    check('A figure nobody entered reads as missing, not zero',
      s.meanFatigue === null, String(s.meanFatigue));
    check('And a day nobody recorded is not counted as a day',
      s.daysRecorded === 0, String(s.daysRecorded));

    const dur = await p.evaluate(() => window.SSMotherhood.fmtDuration(380));
    check('Duration is shown the way a person would say it', dur === '6h 20m', dur);

    /* Progress is derived from a date the participant typed, and silent
       without one. */
    const prog = await p.evaluate(() => {
      const M = window.SSMotherhood;
      const withDate = M.postpartumProgress(M.vault(), new Date('2026-10-10T12:00:00'));
      const v = JSON.parse(JSON.stringify(M.vault()));
      v.postpartum.birthDate = '';
      return { days: withDate && withDate.days, blank: M.postpartumProgress(v) };
    });
    check('Progress counts from the recorded date', prog.days === 20, String(prog.days));
    check('And is silent when no date was given', prog.blank === null);
    await ctx.close();
  }

  /* ================================================================
     5. Corrections supersede; they do not overwrite.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await seed(p, 'pregnancy', { dueDate: '2027-02-01' }, [
      { kind: 'day', date: '2026-10-08', fatigue: 2 }
    ]);
    const after = await p.evaluate(async () => {
      const M = window.SSMotherhood;
      const first = M.liveEntries(M.vault())[0];
      await M.addEntry({ kind: 'day', date: '2026-10-08', fatigue: 5, supersedes: first.id });
      const live = M.liveEntries(M.vault());
      return { live: live.length, fatigue: live[0].fatigue, kept: M.vault().entries.length };
    });
    check('A correction leaves one live entry', after.live === 1, String(after.live));
    check('Showing the corrected value', after.fatigue === 5, String(after.fatigue));
    check('With the original still on the chain', after.kept === 2, String(after.kept));
    await ctx.close();
  }

  /* ================================================================
     6. A stage change keeps everything.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await seed(p, 'pregnancy', { dueDate: '2026-10-01' }, [
      { kind: 'day', date: '2026-09-10', fatigue: 3 },
      { kind: 'night', date: '2026-09-11', wakings: 1 }
    ]);
    const moved = await p.evaluate(async () => {
      const M = window.SSMotherhood;
      await M.setStage('postpartum', { birthDate: '2026-10-02' });
      const v = M.vault();
      return { stage: v.stage, entries: M.liveEntries(v).length, due: v.pregnancy.dueDate };
    });
    check('Moving to postpartum keeps every record', moved.entries === 2, String(moved.entries));
    check('And the pregnancy it followed', moved.due === '2026-10-01', moved.due);
    check('The stage really changed', moved.stage === 'postpartum');
    await ctx.close();
  }

  /* ================================================================
     7. Erase means erase.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await seed(p, 'pregnancy', { dueDate: '2027-03-03' }, [{ kind: 'day', date: '2026-10-09', fatigue: 1 }]);
    const gone = await p.evaluate(async () => {
      await window.SSMotherhood.erase();
      return {
        stored: localStorage.getItem(window.__motherhood.key),
        enabled: window.SSMotherhood.isEnabled(),
        unlocked: window.SSMotherhood.isUnlocked()
      };
    });
    check('Erase removes the namespace', gone.stored === null);
    check('And the flag with it', gone.enabled === false);
    check('And locks the session', gone.unlocked === false);
    await ctx.close();
  }

  /* ================================================================
     8. The interface, on a phone.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser);
    await seed(p, 'postpartum', { birthDate: '2026-09-20' }, [
      { kind: 'night', date: '2026-10-09', wakings: 2,
        restIntervals: [{ from: '23:00', to: '02:00' }, { from: '02:40', to: '06:00' }] }
    ]);
    await p.evaluate(() => window.__mhUI.open());
    await p.waitForTimeout(400);

    const home = await p.evaluate(() => ({
      title: document.querySelector('.mh-bar-title').textContent,
      text: document.querySelector('.mh-body').innerText,
      tiles: document.querySelectorAll('.mh-tile').length
    }));
    check('An unlocked vault opens on its home screen', /Motherhood/.test(home.title), home.title);
    check('Which offers the ways to record', home.tiles >= 4, String(home.tiles));
    check('And states that the figures are the participant\'s own',
      /did not measure/i.test(home.text));
    check('Feeding is offered after birth', /feed/i.test(home.text));

    /* The fault a screenshot caught once already: a row of native time
       controls pushing its last button off the edge of the phone. */
    await p.evaluate(() => {
      const t = [...document.querySelectorAll('.mh-tile')].find(x => /rest|night/i.test(x.textContent));
      t.click();
    });
    await p.waitForTimeout(200);
    await p.evaluate(() => {
      const b = [...document.querySelectorAll('.mh-intervals button')]
        .find(x => /Add a stretch/.test(x.textContent));
      b.click(); b.click();
    });
    await p.waitForTimeout(150);
    const fit = await p.evaluate(() => {
      const body = document.querySelector('.mh-body');
      const widest = [...document.querySelectorAll('.mh-interval *')]
        .reduce((w, n) => Math.max(w, n.getBoundingClientRect().right), 0);
      return {
        scrollX: body.scrollWidth - body.clientWidth,
        docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        widest: Math.round(widest), vw: window.innerWidth
      };
    });
    check('No horizontal scroll in the layer', fit.scrollX <= 1, String(fit.scrollX));
    check('No horizontal scroll on the page', fit.docScroll <= 1, String(fit.docScroll));
    check('Every interval control fits the phone', fit.widest <= fit.vw,
      fit.widest + ' / ' + fit.vw);

    /* Touch targets. A parent is using this one-handed at 3am. */
    const small = await p.evaluate(() =>
      [...document.querySelectorAll('.mh-layer button')]
        .filter(b => b.offsetParent !== null)
        .map(b => ({ t: b.textContent.trim().slice(0, 18), h: Math.round(b.getBoundingClientRect().height) }))
        .filter(b => b.h < 32));
    check('No button is too small to hit', small.length === 0,
      small.map(s => s.t + ':' + s.h).join(', ') || 'all >= 32px');

    check('No console errors driving the interface', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     9. Closing locks. A passcode you can walk away from is decorative.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await seed(p, 'pregnancy', { dueDate: '2027-01-01' }, []);
    await p.evaluate(() => window.__mhUI.open());
    await p.waitForTimeout(250);
    check('Open and unlocked', await p.evaluate(() => window.SSMotherhood.isUnlocked()));
    await p.evaluate(() => window.__mhUI.close());
    await p.waitForTimeout(150);
    const closed = await p.evaluate(() => ({
      unlocked: window.SSMotherhood.isUnlocked(),
      layer: document.querySelectorAll('.mh-layer').length,
      vault: window.SSMotherhood.vault()
    }));
    check('Closing locks the vault', closed.unlocked === false);
    check('And removes the layer entirely', closed.layer === 0);
    check('And drops the decrypted copy from memory', closed.vault === null);
    await ctx.close();
  }

  /* ================================================================
     10. Reduced motion, and a sane tablet/desktop width.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, { reducedMotion: 'reduce' });
    await seed(p, 'pregnancy', { dueDate: '2027-01-01' }, []);
    await p.evaluate(() => window.__mhUI.open());
    await p.waitForTimeout(300);
    const animating = await p.evaluate(() =>
      document.getAnimations().filter(a => a.playState === 'running').length);
    check('Nothing animates under reduced motion', animating === 0, String(animating));
    await ctx.close();
  }
  {
    const { ctx, p } = await open(browser, { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
    await seed(p, 'postpartum', { birthDate: '2026-09-20' }, []);
    await p.evaluate(() => window.__mhUI.open());
    await p.waitForTimeout(300);
    const wide = await p.evaluate(() => {
      const card = document.querySelector('.mh-card');
      return { w: Math.round(card.getBoundingClientRect().width), vw: window.innerWidth };
    });
    check('On a desktop it does not stretch to the full width',
      wide.w < wide.vw * 0.75, wide.w + ' of ' + wide.vw);
    await ctx.close();
  }

  await browser.close();
  console.log('');
  console.log(fail ? `${fail} FAILED, ${pass} passed` : 'ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
