/**
 * SleepSphere — the October 20 integration fixes.
 *
 * Six corrections, each of which is a data-loss or privacy fault rather
 * than a cosmetic one, and each of which is invisible until the exact
 * moment it costs somebody something:
 *
 *   A  createVault marked the session unlocked BEFORE the ciphertext was
 *      on the device. A failed write left a working-looking module whose
 *      contents existed only in memory.
 *   B  addEntry mutated the live vault and then saved. Two saves close
 *      together each sealed the vault as it was when they began, and the
 *      last to finish overwrote the other — a record reported saved, and
 *      gone. The spread also came last, so a caller-supplied id replaced
 *      the generated one.
 *   C  removeEntry deleted one entry from a correction chain, which
 *      un-superseded what it corrected: delete a record, watch an older
 *      draft of it reappear.
 *   D  setStage mutated in place, so a failed save left the screen saying
 *      "postpartum" over a device that still said "pregnant".
 *   E  exportableState swept the top level and `settings` only. A
 *      Motherhood field on a morning record would have left the device in
 *      a research export.
 *   F  The service worker answered ANY failed sub-resource request with
 *      the cached index.html — so an offline .js or .mp4 request received
 *      HTML, and the browser either executed it or silently failed.
 *
 * Run against the pre-fix code, 12 of these checks fail: A leaves the
 * module unlocked over nothing; B lets a caller-supplied id replace the
 * generated one; C resurrects the superseded original; D leaves the
 * session disagreeing with the device; E leaks at three nested depths;
 * F answers a missing sub-resource with index.html. Verified by stashing
 * the fixes and re-running, not assumed.
 *
 * One honest exception. The five-overlapping-saves check PASSES on the old
 * code, so it is not a regression test for that bug — the old addEntry
 * mutated the vault synchronously before its first await, which happens to
 * serialise the pushes. It is kept because it is load-bearing for the NEW
 * design: the new addEntry seals before it publishes and refuses a write
 * whose vault moved underneath it, so without the write queue those five
 * saves would throw rather than lose data. The check proves the queue is
 * doing its job.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = 'http://localhost:8099/index.html';
const PASS = 'a quiet harbour';

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
};

async function open(browser, opts) {
  const ctx = await browser.newContext(Object.assign({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  }, opts || {}));
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => { const e = document.getElementById('previewBar'); if (e) e.remove(); });
  return { ctx, p, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });

  /* ================================================================
     A. Vault creation — succeeds, and fails safely. (Scenarios 1, 2)
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    const ok = await p.evaluate(async pass => {
      await window.SSMotherhood.createVault(pass);
      return {
        unlocked: window.SSMotherhood.isUnlocked(),
        stored: Boolean(localStorage.getItem(window.__motherhood.key))
      };
    }, PASS);
    check('1 · Vault creation succeeds and unlocks', ok.unlocked === true);
    check('1 · And the ciphertext is on the device', ok.stored === true);
    await ctx.close();
  }
  {
    const { ctx, p } = await open(browser);
    /* Make the write fail the way a full or blocked storage would. The
       session must come back locked, not unlocked-over-nothing. */
    const safe = await p.evaluate(async pass => {
      const real = window.__motherhood.set;
      window.__motherhood.set = () => { throw new Error('QuotaExceededError'); };
      let threw = false;
      try { await window.SSMotherhood.createVault(pass); } catch { threw = true; }
      window.__motherhood.set = real;
      return {
        threw,
        unlocked: window.SSMotherhood.isUnlocked(),
        vault: window.SSMotherhood.vault(),
        stored: localStorage.getItem(window.__motherhood.key)
      };
    }, PASS);
    check('2 · A failed write is reported, not swallowed', safe.threw === true);
    check('2 · And does NOT leave the module unlocked over nothing',
      safe.unlocked === false, 'unlocked=' + safe.unlocked);
    check('2 · With no decrypted vault left in memory', safe.vault === null);
    check('2 · And nothing written to the device', safe.stored === null);
    await ctx.close();
  }
  {
    /* An existing vault must survive a failed creation attempt — never be
       replaced by an empty default. */
    const { ctx, p } = await open(browser);
    const kept = await p.evaluate(async pass => {
      const M = window.SSMotherhood;
      await M.createVault(pass);
      await M.setStage('pregnancy', { dueDate: '2027-01-15' });
      await M.addEntry({ kind: 'day', date: '2026-10-09', fatigue: 4 });
      const before = localStorage.getItem(window.__motherhood.key);
      const real = window.__motherhood.set;
      window.__motherhood.set = () => { throw new Error('disk full'); };
      try { await M.createVault('a different passcode'); } catch {}
      window.__motherhood.set = real;
      const after = localStorage.getItem(window.__motherhood.key);
      M.lock();
      await M.unlock(pass);
      return { same: before === after, stage: M.vault().stage, entries: M.liveEntries(M.vault()).length };
    }, PASS);
    check('2 · An existing vault is not replaced by a failed creation', kept.same === true);
    check('2 · And still opens with its original passcode', kept.stage === 'pregnancy', kept.stage);
    check('2 · With its records intact', kept.entries === 1, String(kept.entries));
    await ctx.close();
  }

  /* ================================================================
     B. Saving — survives reload, survives overlap. (Scenarios 3, 4)
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await p.evaluate(async pass => {
      const M = window.SSMotherhood;
      await M.createVault(pass);
      await M.setStage('postpartum', { birthDate: '2026-09-20' });
      await M.addEntry({ kind: 'night', date: '2026-10-11', wakings: 3,
        restIntervals: [{ from: '22:40', to: '01:10' }] });
    }, PASS);
    await p.reload({ waitUntil: 'networkidle' });
    const after = await p.evaluate(async pass => {
      const M = window.SSMotherhood;
      await M.unlock(pass);
      const live = M.liveEntries(M.vault());
      return { n: live.length, wakings: live[0] && live[0].wakings, stage: M.vault().stage };
    }, PASS);
    check('3 · A saved record survives a full reload', after.n === 1, String(after.n));
    check('3 · With its values intact', after.wakings === 3, String(after.wakings));
    check('3 · And its stage', after.stage === 'postpartum', after.stage);
    await ctx.close();
  }
  {
    const { ctx, p } = await open(browser);
    /* The original failure: both calls read the same vault, both sealed it,
       the second write won, and the first record was gone — with no error
       anywhere. Five at once, started without awaiting, is the honest
       version of "the person tapped save twice". */
    const race = await p.evaluate(async pass => {
      const M = window.SSMotherhood;
      await M.createVault(pass);
      await M.setStage('postpartum', { birthDate: '2026-09-20' });
      const results = await Promise.all([
        M.addEntry({ kind: 'day', date: '2026-10-01', fatigue: 1 }),
        M.addEntry({ kind: 'day', date: '2026-10-02', fatigue: 2 }),
        M.addEntry({ kind: 'day', date: '2026-10-03', fatigue: 3 }),
        M.addEntry({ kind: 'day', date: '2026-10-04', fatigue: 4 }),
        M.addEntry({ kind: 'day', date: '2026-10-05', fatigue: 5 })
      ]);
      M.lock();
      await M.unlock(pass);          /* read back from the ciphertext */
      const live = M.liveEntries(M.vault());
      return {
        returned: results.length,
        persisted: live.length,
        ids: new Set(results.map(r => r.id)).size,
        fatigues: live.map(e => e.fatigue).sort().join(',')
      };
    }, PASS);
    check('4 · Five overlapping saves all return', race.returned === 5, String(race.returned));
    check('4 · And ALL FIVE are actually on the device', race.persisted === 5,
      race.persisted + ' of 5 survived');
    check('4 · Each with a distinct id', race.ids === 5, String(race.ids));
    check('4 · And none silently replaced', race.fatigues === '1,2,3,4,5', race.fatigues);
    await ctx.close();
  }
  {
    const { ctx, p } = await open(browser);
    /* A caller-supplied id must not become the record's id. The spread used
       to come last, so it did. */
    const ids = await p.evaluate(async pass => {
      const M = window.SSMotherhood;
      await M.createVault(pass);
      await M.setStage('pregnancy', { dueDate: '2027-01-01' });
      const a = await M.addEntry({ kind: 'day', date: '2026-10-01', fatigue: 1, id: 'collide' });
      const b = await M.addEntry({ kind: 'day', date: '2026-10-02', fatigue: 2, id: 'collide' });
      return { a: a.id, b: b.id, distinct: a.id !== b.id, neither: a.id !== 'collide' && b.id !== 'collide' };
    }, PASS);
    check('4 · A supplied id cannot overwrite the generated one', ids.neither === true,
      ids.a + ' / ' + ids.b);
    check('4 · So two records cannot collide on id', ids.distinct === true);
    await ctx.close();
  }

  /* ================================================================
     C. Deletion — the old revision stays dead. (Scenario 5)
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    const del = await p.evaluate(async pass => {
      const M = window.SSMotherhood;
      await M.createVault(pass);
      await M.setStage('pregnancy', { dueDate: '2027-02-01' });
      const first = await M.addEntry({ kind: 'day', date: '2026-10-08', fatigue: 2, notes: 'original' });
      const corrected = await M.addEntry({ kind: 'day', date: '2026-10-08', fatigue: 5,
                                           notes: 'corrected', supersedes: first.id });
      const other = await M.addEntry({ kind: 'day', date: '2026-10-09', fatigue: 3, notes: 'unrelated' });
      await M.removeEntry(corrected.id);
      M.lock();
      await M.unlock(pass);          /* the real test: after a reopen */
      const live = M.liveEntries(M.vault());
      return {
        live: live.length,
        notes: live.map(e => e.notes).join(','),
        rawEntries: M.vault().entries.length,
        revisions: (M.vault().revisions || []).length,
        otherKept: live.some(e => e.id === other.id)
      };
    }, PASS);
    check('5 · Deleting a correction leaves one record, not two', del.live === 1, String(del.live));
    check('5 · And the superseded original does NOT reappear',
      !/original/.test(del.notes), del.notes);
    check('5 · The unrelated record is untouched', del.otherKept === true);
    check('5 · The chain is gone from the vault, not merely hidden',
      del.rawEntries === 1, del.rawEntries + ' raw entries');
    check('5 · And its revision reference with it', del.revisions === 0, String(del.revisions));
    await ctx.close();
  }

  /* ================================================================
     D. Stage transition — persists, or changes nothing. (Scenarios 6, 7)
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await p.evaluate(async pass => {
      const M = window.SSMotherhood;
      await M.createVault(pass);
      await M.setStage('pregnancy', { dueDate: '2026-10-01' });
      await M.addEntry({ kind: 'day', date: '2026-09-10', fatigue: 3 });
      await M.addEntry({ kind: 'night', date: '2026-09-11', wakings: 1 });
      await M.setStage('postpartum', { birthDate: '2026-10-02', feeding: 'mixed' });
    }, PASS);
    await p.reload({ waitUntil: 'networkidle' });
    const moved = await p.evaluate(async pass => {
      const M = window.SSMotherhood;
      await M.unlock(pass);
      const v = M.vault();
      return { stage: v.stage, due: v.pregnancy.dueDate, born: v.postpartum.birthDate,
               feeding: v.postpartum.feeding, entries: M.liveEntries(v).length };
    }, PASS);
    check('6 · The transition survives a reload', moved.stage === 'postpartum', moved.stage);
    check('6 · The pregnancy history is kept', moved.due === '2026-10-01', moved.due);
    check('6 · The new detail is kept', moved.born === '2026-10-02' && moved.feeding === 'mixed');
    check('6 · And every record from before the birth', moved.entries === 2, String(moved.entries));
    await ctx.close();
  }
  {
    const { ctx, p } = await open(browser);
    const failed = await p.evaluate(async pass => {
      const M = window.SSMotherhood;
      await M.createVault(pass);
      await M.setStage('pregnancy', { dueDate: '2027-03-03' });
      const real = window.__motherhood.set;
      window.__motherhood.set = () => { throw new Error('disk full'); };
      let threw = false;
      try { await M.setStage('postpartum', { birthDate: '2026-10-02' }); } catch { threw = true; }
      window.__motherhood.set = real;
      const inMemory = M.vault().stage;
      M.lock();
      await M.unlock(pass);
      return { threw, inMemory, onDevice: M.vault().stage, due: M.vault().pregnancy.dueDate };
    }, PASS);
    check('7 · A failed transition is reported', failed.threw === true);
    check('7 · The session still says what the device says',
      failed.inMemory === 'pregnancy', failed.inMemory);
    check('7 · And the device still says pregnancy', failed.onDevice === 'pregnancy', failed.onDevice);
    check('7 · With the due date untouched', failed.due === '2027-03-03', failed.due);
    await ctx.close();
  }

  /* ================================================================
     E. Exports — nested, not just top level. (Scenario 8)
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    /* Plant Motherhood-shaped fields at every depth an export could carry
       them: top level, settings, inside an array of records, and inside a
       nested object within one of those records. */
    const ex = await p.evaluate(() => {
      const source = {
        version: 3,
        settings: { name: 'A', target: 480, motherhoodEnabled: true },
        motherhoodVault: 'TOP LEVEL SECRET',
        mornings: [
          { id: 'm1', date: '2026-10-01', sleepMinutes: 400, rest: 4 },
          { id: 'm2', date: '2026-10-02', sleepMinutes: 410, motherhoodNote: 'NESTED IN ARRAY',
            detail: { mood: 3, motherhoodStage: 'DEEPER STILL' } }
        ],
        bioCheckins: [{ id: 'b1', values: { calm: 3, motherhoodFlag: 'IN A SUB-OBJECT' } }],
        thoughts: [{ id: 't1', text: 'ordinary note', type: 'reflection' }],
        study: { participantId: 'P007', cohort: 'jamea-v1' }
      };
      const out = window.__motherhood.exported(source);
      const json = JSON.stringify(out);
      return {
        json,
        leaked: ['TOP LEVEL SECRET', 'NESTED IN ARRAY', 'DEEPER STILL', 'IN A SUB-OBJECT']
          .filter(s => json.includes(s)),
        keptMornings: out.mornings.length,
        keptSleep: out.mornings[1] && out.mornings[1].sleepMinutes,
        keptMood: out.mornings[1] && out.mornings[1].detail && out.mornings[1].detail.mood,
        keptCalm: out.bioCheckins[0].values.calm,
        keptThought: out.thoughts[0].text,
        keptStudy: out.study.participantId,
        keptSettings: out.settings.target,
        /* the original must be untouched */
        sourceIntact: Boolean(source.motherhoodVault) &&
                      Boolean(source.mornings[1].motherhoodNote) &&
                      Boolean(source.mornings[1].detail.motherhoodStage)
      };
    });
    check('8 · Nothing Motherhood-shaped leaks at ANY depth',
      ex.leaked.length === 0, ex.leaked.join(' | ') || 'clean');
    check('8 · Ordinary sleep records are preserved',
      ex.keptMornings === 2 && ex.keptSleep === 410, ex.keptMornings + ' / ' + ex.keptSleep);
    check('8 · Including non-Motherhood fields beside the scrubbed ones',
      ex.keptMood === 3 && ex.keptCalm === 3);
    check('8 · Journals, study data and settings survive',
      ex.keptThought === 'ordinary note' && ex.keptStudy === 'P007' && ex.keptSettings === 480);
    check('8 · And the source object is not mutated', ex.sourceIntact === true);
    await ctx.close();
  }

  /* ================================================================
     F. Service worker. (Scenario 11)
     ================================================================ */
  {
    const fs = require('fs');
    const sw = fs.readFileSync(require('path').join(__dirname, '..', 'sw.js'), 'utf8');
    /* Read as source, because the failure is a branch that only runs when
       the network is down and the cache misses — a condition a headless
       browser cannot be put into reliably, and which a wrong answer here
       would make look fine. */
    const navigate = /mode === 'navigate'[\s\S]*?caches\.match\('\.\/'\)/.test(sw);
    check('11 · The app shell still falls back for navigations', navigate === true);
    const subresourceFallsBackToHtml =
      /respondWith\(caches\.match\(event\.request\)[\s\S]*?catch\(\(\) => caches\.match\('\.\/'\)\)/.test(sw);
    check('11 · A missing script or video no longer receives index.html',
      subresourceFallsBackToHtml === false);
    check('11 · It receives a network error instead',
      /Response\.error\(\)/.test(sw));
    check('11 · The cache version moved, so old shells are replaced',
      /const CACHE = '[^']*v1[0-9]/.test(sw), (sw.match(/const CACHE = '([^']*)'/) || [])[1]);
    check('11 · Motherhood files are still precached offline',
      /motherhood\.js/.test(sw) && /motherhood-ui\.js/.test(sw));

    /* The checks above all passed while the bug was live, because they
       ask what the worker contains rather than which way round it tries
       things. Code used to be cache-first while index.html was
       network-first, so a deploy reached a returning phone as new HTML
       running old scripts: the markup had a Private destination and the
       cached motherhood-ui.js was still mounting its entry card into
       the Me tab, so the new screen rendered empty. Reported as the
       feature not being there.

       These pin the order. The last respondWith — everything that is
       not a navigation and not the content-addressed font — must open
       with fetch, and may only reach the cache from the failure path. */
    const subresource = sw.slice(sw.lastIndexOf('event.respondWith'));
    check('11 · Code is fetched before it is remembered',
      /^event\.respondWith\(fetch\(/.test(subresource.trim()),
      subresource.trim().slice(0, 46));
    check('11 · And the cache answers only when the network does not',
      /catch\(\(\) => caches\.match/.test(subresource));
    check('11 · A successful fetch still refreshes the cache for offline',
      /cache\.put\(event\.request, copy\)/.test(subresource));
    /* The font is the one thing allowed to stay cache-first: it is
       content-addressed, so a cached copy can never be the wrong one. */
    check('11 · The content-addressed font may still come from cache',
      /fonts\/.*woff2[\s\S]*?caches\.match\(event\.request\)/.test(sw));
    await 0;
  }

  /* ================================================================
     Core features still work. (Scenarios 9, 10, 15)
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser);
    /* Existing sleep records must survive the update untouched. */
    const survived = await p.evaluate(() => {
      const KEY = 'sleepsphere_state_v2';
      const before = {
        version: 3,
        settings: { welcomeSeen: true, openingOff: true, mode: 'dark', target: 480,
                    faith: 'on', usualWake: '06:30', fajrHabit: 'return', name: 'Insiyah' },
        plan: null, brainDays: {},
        mornings: [{ id: 'keep1', supersedes: null, date: '2026-10-01',
                     createdAt: '2026-10-01T07:00:00.000Z', bedTime: '22:40', sleepTime: '23:00',
                     wakeTime: '06:30', awakeMinutes: 15, napMinutes: 0, opportunityMinutes: 450,
                     sleepMinutes: 405, efficiency: 90, rest: 4, energy: 3, focus: 3, calm: 3,
                     fajr: 'ready', factors: [], note: 'keep me', targetMinutes: 480,
                     intent: 'restore', planSnapshot: null, brainDay: 'normal',
                     bioHarmonyId: null, bioHarmonySnapshot: null, experimentId: null,
                     adherence: 'not_applicable', demo: false, verified: 'entered' }],
        morningRevisions: [],
        study: { onboarded: true, participantId: 'P007', startDate: '2026-09-01',
                 enrolledAt: '2026-09-01T06:00:00.000Z', consentAck: true,
                 consentAt: '2026-09-01T06:00:00.000Z', cohort: 'jamea-v1',
                 schemaVersion: 3, storageMode: 'local', lastSeenDay: 40 },
        bioCheckins: [], thoughts: [], scans: [], feedback: [], experimentHistory: []
      };
      localStorage.setItem(KEY, JSON.stringify(before));
      return before.mornings[0];
    });
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    const now = await p.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
      const m = raw.mornings[0];
      return { n: raw.mornings.length, id: m.id, sleep: m.sleepMinutes, note: m.note,
               version: raw.version, participant: raw.study.participantId,
               engine: window.SS.engine.mornings().length };
    });
    check('9 · Existing sleep records survive the update',
      now.n === 1 && now.id === 'keep1', now.n + ' record(s)');
    check('9 · Byte-for-byte, not migrated into something else',
      now.sleep === survived.sleepMinutes && now.note === 'keep me');
    check('9 · SCHEMA_VERSION unchanged', now.version === 3, String(now.version));
    check('9 · Study enrolment intact', now.participant === 'P007');
    check('9 · And the engine reads them', now.engine === 1, String(now.engine));

    /* Navigation, on a phone. (Scenarios 10, 15) */
    const nav = [];
    for (const v of ['today', 'twin', 'learn', 'data']) {
      await p.evaluate(x => document.querySelector(`.nav button[data-view="${x}"]`).click(), v);
      await p.waitForTimeout(350);
      nav.push(await p.evaluate(x => {
        const sec = document.getElementById(x);
        return sec && sec.classList.contains('active') && sec.innerText.trim().length > 40 ? x : 'BROKEN:' + x;
      }, v));
    }
    check('15 · Every destination still opens on a phone',
      nav.every(x => !x.startsWith('BROKEN')), nav.join(' '));
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('15 · With no horizontal scroll', over <= 1, over + 'px');
    check('15 · And the Motherhood door still present',
      await p.evaluate(() => Boolean(document.getElementById('mhEntry'))));
    check('15 · No console errors across the whole pass', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     Motherhood stays optional, and disabling is not erasing. (Section 5)
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    const optional = await p.evaluate(() => ({
      enabled: window.SSMotherhood.isEnabled(),
      stored: localStorage.getItem(window.__motherhood.key),
      elements: document.querySelectorAll('.mh-layer, .mh-card').length
    }));
    check('5 · Off until the person turns it on', optional.enabled === false);
    check('5 · With nothing stored and nothing rendered',
      optional.stored === null && optional.elements === 0);

    /* Closing the module must lock it, not erase it. */
    const afterClose = await p.evaluate(async pass => {
      const M = window.SSMotherhood;
      await M.createVault(pass);
      await M.setStage('pregnancy', { dueDate: '2027-01-01' });
      await M.addEntry({ kind: 'day', date: '2026-10-09', fatigue: 2 });
      window.__mhUI.open();
      window.__mhUI.close();
      const stillStored = Boolean(localStorage.getItem(window.__motherhood.key));
      await M.unlock(pass);
      return { stillStored, entries: M.liveEntries(M.vault()).length, enabled: M.isEnabled() };
    }, PASS);
    check('5 · Closing the module locks it rather than erasing it',
      afterClose.stillStored === true && afterClose.enabled === true);
    check('5 · The records are still there afterwards', afterClose.entries === 1,
      String(afterClose.entries));
    await ctx.close();
  }

  await browser.close();
  console.log('');
  console.log(fail ? `${fail} FAILED, ${pass} passed` : 'ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
