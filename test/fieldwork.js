/**
 * The fieldwork foundation.
 *
 * These checks exist because of one line in the old loader: a saved state was
 * accepted ONLY if version === 2, and anything else fell through to defaults.
 * That is harmless with one version and catastrophic with two — it means every
 * participant silently loses the study on the day the schema changes. The
 * migration tests below are the reason v3 is safe to ship mid-fieldwork.
 *
 * The rest guard the things a study needs and an app does not: an ID that
 * cannot be blank, a day number that cannot walk backwards, an export that
 * admits what it does not know, and a device that says so when it cannot save.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

/* A representative v2 state: every array populated, a saved plan, a lazy
   night, a running experiment, settings a participant has changed, and a
   private thought. If any of this does not survive, the migration is wrong. */
const V2 = {
  version: 2,
  settings: { name:'Tester', age:'adult', target:450, faith:'on', installDismissed:true,
              openingOff:true, lastZone:'Asia/Dubai', locationGranted:true, dim:false,
              intent:'focus', welcomeSeen:true, mode:'dark', useCycle:false, healthLinked:false,
              place:{latitude:25.2048,longitude:55.2708,name:'Dubai'}, highLatRule:'seventh', fajrEdited:false },
  plan: { mode:'fajr', target:450, settle:15, wind:30, barrier:'Screens', fajr:'04:46',
          returnSleep:'05:30', finalWake:'07:30', blockOne:330, blockTwo:120, total:450,
          sleepStart:1140, settleStart:1125, windStart:1095, wakeAnchor:'04:46',
          savedDate:'2026-09-30' },
  scans: [{ id:'s1', createdAt:'2026-09-30T20:00:00.000Z', values:{mental:3}, strongest:'mental', suggestion:'Unload one thought' }],
  thoughts: [{ id:'t1', text:'SECRETTHOUGHT remember to call home', type:'Tomorrow', next:'' }],
  mornings: [
    { id:'m1', date:'2026-09-29', createdAt:'2026-09-29T06:00:00.000Z', bedTime:'22:50', sleepTime:'23:12',
      wakeTime:'06:20', awakeMinutes:14, napMinutes:0, opportunityMinutes:450, sleepMinutes:414,
      efficiency:92, rest:4, energy:3, focus:4, calm:4, fajr:'ready', factors:['Late screens'],
      note:'SECRETNOTE felt fine', targetMinutes:450, intent:'restore', planSnapshot:null,
      bioHarmonyId:'b1', bioHarmonySnapshot:null, experimentId:null, adherence:'not_applicable', demo:false },
    { id:'m2', date:'2026-09-30', createdAt:'2026-09-30T06:10:00.000Z', bedTime:'23:40', sleepTime:'00:05',
      wakeTime:'06:15', awakeMinutes:26, napMinutes:0, opportunityMinutes:395, sleepMinutes:344,
      efficiency:87, rest:2, energy:null, focus:null, calm:null, fajr:'woke_tired', factors:[],
      note:'', targetMinutes:450, intent:'restore', planSnapshot:null, bioHarmonyId:null,
      bioHarmonySnapshot:null, experimentId:'e1', adherence:'yes', demo:false,
      lazy:true, measured:['bedTime','wakeTime'], estimated:['sleepTime','awakeMinutes'] }
  ],
  bioCheckins: [{ id:'b1', date:'2026-09-29', createdAt:'2026-09-29T20:00:00.000Z', harmony:72,
    dimensions:{timing:70,pressure:75,nervous:60,physical:100,environment:75},
    inputs:{light:70,caffeine:90,movement:55,meal:85,stress:60,body:100,environment:75},
    timingBasis:'a steady wake time', cycle:'not_tracking', note:'' }],
  lazyNight: null,
  trip: null,
  activeExperiment: { id:'e1', catalogKey:'phone', name:'Earlier phone cutoff', action:'Phone away 45 min earlier',
                      metric:'rest', threshold:0.5, baselineIds:['m1'], startedAt:'2026-09-30' },
  experimentHistory: [],
  feedback: [{ id:'f1', createdAt:'2026-09-30T12:00:00.000Z', ratings:{clarity:4}, comment:'SECRETFEEDBACK nice', sent:false }]
};

const seed = blob => `(()=>{localStorage.setItem('sleepsphere_state_v2', ${JSON.stringify(JSON.stringify(blob))});})()`;
const THROWS = `Object.defineProperty(window,'localStorage',{configurable:true,
  get(){ throw new DOMException('The operation is insecure.','SecurityError'); }});`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });

  const open = async ({ blob, breakage, date } = {}) => {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true,
                                     timezoneId:'Asia/Dubai', locale:'en-GB' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    if (breakage) await p.addInitScript(breakage);
    if (date) await p.addInitScript(fixed => {
      const Real = Date; const at = new Real(fixed);
      window.Date = class extends Real {
        constructor(...a){ return a.length ? new Real(...a) : new Real(at); }
        static now(){ return at.getTime(); }
      };
    }, date);
    if (blob) await p.addInitScript(seed(blob));
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1200);
    await p.evaluate(() => document.getElementById('opening')?.remove());
    return { ctx, p, errs };
  };

  const stored = p => p.evaluate(() => JSON.parse(localStorage.getItem('sleepsphere_state_v2')));

  /* ---------------------------------------------------------------- 1, 2 */
  const mig = await open({ blob: V2 });
  const after = await mig.p.evaluate(() => window.__state ? window.__state : null);
  const live = await mig.p.evaluate(() => {
    // Nothing has saved yet, so read what the app actually loaded by forcing
    // one write through a harmless setting the participant controls.
    document.getElementById('fieldwork')?.classList.remove('active');
    return null;
  });
  // Force a save so the migrated shape lands on disk, the way any first
  // interaction would.
  await mig.p.evaluate(() => document.getElementById('settingsTarget') && document.getElementById('saveSettings')?.click());
  await mig.p.waitForTimeout(300);
  const m = await stored(mig.p);

  check('Migrated state reports version 3', Number(m.version) === 3, `v${m.version}`);
  check('Both morning records survive', m.mornings.length === 2, `${m.mornings.length} records`);
  check('A morning keeps its exact values',
        m.mornings[0].rest === 4 && m.mornings[0].sleepMinutes === 414 && m.mornings[0].bedTime === '22:50');
  check('Lazy-night provenance survives',
        m.mornings[1].lazy === true && Array.isArray(m.mornings[1].measured)
        && m.mornings[1].measured.includes('bedTime'));
  check('The saved plan survives intact',
        m.plan && m.plan.mode === 'fajr' && m.plan.total === 450 && m.plan.fajr === '04:46');
  check('Bio Harmony check-ins survive', m.bioCheckins.length === 1 && m.bioCheckins[0].harmony === 72);
  check('The running experiment survives',
        m.activeExperiment?.id === 'e1' && m.activeExperiment.baselineIds[0] === 'm1');
  check('Thoughts, scans and feedback survive',
        m.thoughts.length === 1 && m.scans.length === 1 && m.feedback.length === 1);
  check('Participant settings survive',
        m.settings.target === 450 && m.settings.intent === 'focus' && m.settings.place?.name === 'Dubai');
  check('v3 adds the study block', m.study && typeof m.study === 'object' && m.study.onboarded === false);
  check('Brain Day is added as null, not guessed',
        m.mornings.every(r => r.brainDay === null) && m.plan.brainDay === null);
  check('Migration is clean', mig.errs.length === 0, mig.errs.join(' | '));
  await mig.ctx.close();

  // Idempotence: loading the already-migrated state changes nothing material.
  const again = await open({ blob: JSON.parse(JSON.stringify({ ...V2, version: 3, study: { onboarded:false } })) });
  const m2 = await again.p.evaluate(() => JSON.parse(localStorage.getItem('sleepsphere_state_v2')));
  check('Re-loading a v3 state preserves it', m2.mornings.length === 2 && Number(m2.version) === 3);
  await again.ctx.close();

  const fresh = await open();
  const f = await fresh.p.evaluate(() => {
    // A brand-new device has written nothing yet; read the defaults the app
    // is holding by completing the smallest possible interaction.
    return null;
  });
  check('A fresh device opens straight into fieldwork onboarding',
        await fresh.p.locator('#fieldwork').evaluate(n => n.classList.contains('active')));
  check('Fresh start has no page errors', fresh.errs.length === 0, fresh.errs.join(' | '));

  /* ---------------------------------------------------------------- 3, 4, 5 */
  const idSays = () => fresh.p.locator('#fwIdSay').innerText();
  await fresh.p.locator('[data-fw="1"] [data-fw-next]').click();
  await fresh.p.locator('#fwConsent').check();
  await fresh.p.locator('#fwConsentNext').click();
  await fresh.p.waitForTimeout(250);

  await fresh.p.locator('#fwIdNext').click();
  await fresh.p.waitForTimeout(150);
  check('A blank participant code is refused',
        !(await fresh.p.locator('[data-fw="3"]').isHidden()) && /enter the code/i.test(await idSays()));

  await fresh.p.locator('#fwId').fill('banana');
  await fresh.p.locator('#fwIdNext').click();
  await fresh.p.waitForTimeout(150);
  check('A nonsense participant code is refused',
        !(await fresh.p.locator('[data-fw="3"]').isHidden()), await idSays());

  await fresh.p.locator('#fwId').fill('14');
  await fresh.p.waitForTimeout(120);
  check('A bare number is normalised to a real code', /P014/.test(await idSays()), await idSays());

  await fresh.p.locator('#fwIdNext').click();
  await fresh.p.waitForTimeout(500);
  check('Storage check passes on a working browser',
        !(await fresh.p.locator('#fwStorageNext').isDisabled()));
  await fresh.p.locator('#fwStorageNext').click();
  await fresh.p.waitForTimeout(200);
  await fresh.p.locator('#fwDone').click();
  await fresh.p.waitForTimeout(400);

  const enrolled = await stored(fresh.p);
  check('Onboarding completion persists', enrolled.study.onboarded === true);
  check('The participant code persists, normalised', enrolled.study.participantId === 'P014',
        enrolled.study.participantId);
  check('Voluntary participation is recorded with a timestamp',
        enrolled.study.consentAck === true && /^\d{4}-\d\d-\d\dT/.test(enrolled.study.consentAt));
  check('A start date is stamped', /^\d{4}-\d\d-\d\d$/.test(enrolled.study.startDate));
  check('Onboarding closes', await fresh.p.locator('#fieldwork').evaluate(n => !n.classList.contains('active')));
  await fresh.ctx.close();

  // And it does not come back on the next launch.
  const returning = await open({ blob: { ...V2, version:3, study:{ ...enrolled.study } } });
  check('Onboarding does not reappear on reopening',
        await returning.p.locator('#fieldwork').evaluate(n => !n.classList.contains('active')));
  await returning.ctx.close();

  /* ---------------------------------------------------------------- 6 */
  const studyAt = async (startDate, nowISO) => {
    const run = await open({
      blob: { ...V2, version:3, study:{ ...enrolled.study, startDate, lastSeenDay:0 } },
      date: nowISO
    });
    const day = await run.p.evaluate(() => {
      document.querySelector('.nav button[data-view="data"]').click();
      return document.getElementById('studyDay').textContent;
    });
    await run.ctx.close();
    return day;
  };
  check('Study day 1 on the start date', (await studyAt('2026-10-07','2026-10-07T09:00:00+04:00')) === 'Day 1');
  check('Study day 2 the next day',      (await studyAt('2026-10-07','2026-10-08T09:00:00+04:00')) === 'Day 2');
  check('Study day 14 a fortnight later',(await studyAt('2026-10-07','2026-10-20T09:00:00+04:00')) === 'Day 14');
  // A clock that moves backwards must not walk a participant back down.
  const back = await open({
    blob: { ...V2, version:3, study:{ ...enrolled.study, startDate:'2026-10-07', lastSeenDay:11 } },
    date: '2026-10-08T09:00:00+04:00'
  });
  const backDay = await back.p.evaluate(() => {
    document.querySelector('.nav button[data-view="data"]').click();
    return document.getElementById('studyDay').textContent;
  });
  check('A clock moved backwards does not rewind the study', backDay === 'Day 11', backDay);
  await back.ctx.close();

  /* ---------------------------------------------------------------- 7 */
  const broken = await open({ breakage: THROWS });
  await broken.p.waitForTimeout(400);
  const blocked = await broken.p.evaluate(async () => {
    document.querySelector('[data-fw="1"] [data-fw-next]').click();
    document.getElementById('fwConsent').click();
    document.getElementById('fwConsentNext').click();
    document.getElementById('fwId').value = 'P001';
    document.getElementById('fwIdNext').click();
    await new Promise(r => setTimeout(r, 600));
    return {
      blocked: document.getElementById('fwStorageNext').disabled,
      says: document.getElementById('fwStorage').innerText
    };
  });
  check('A browser that cannot save blocks the study from starting', blocked.blocked);
  check('And says so in plain language', /will not save|private browsing/i.test(blocked.says),
        blocked.says.split('\n')[0]);
  check('Nothing is thrown when storage is unavailable', broken.errs.length === 0, broken.errs.join(' | '));
  await broken.ctx.close();

  /* ------------------------------------------------------------ 8, 9, 10 */
  const exporter = await open({
    blob: { ...V2, version:3, study:{ ...enrolled.study, startDate:'2026-09-29', lastSeenDay:0 } },
    date: '2026-10-01T09:00:00+04:00'
  });
  const csv = await exporter.p.evaluate(() => {
    const rows = [];
    // Intercept the download rather than letting the browser take it.
    const real = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { rows.push(this.download); real.call(this); };
    return new Promise(resolve => {
      const original = URL.createObjectURL;
      const seen = [];
      URL.createObjectURL = blob => { seen.push(blob); return original(blob); };
      document.querySelector('.nav button[data-view="data"]').click();
      document.getElementById('exportStudy').click();
      setTimeout(async () => {
        const texts = await Promise.all(seen.map(blob => blob.text()));
        resolve({ names: rows, texts });
      }, 1400);
    });
  });

  const dataCsv = csv.texts[0] || '';
  const dictCsv = csv.texts[1] || '';
  const lines = dataCsv.trim().split('\n');
  // Every cell is quoted by the writer, so unwrap before comparing.
  const parse = line => line.split('","').map(x => x.replace(/^"|"$/g, ''));
  const header = parse(lines[0]);
  const at = name => header.indexOf(name);

  check('The export is named for the participant and the date',
        /^sleepsphere-study-P014-\d{4}-\d\d-\d\d\.csv$/.test(csv.names[0] || ''), csv.names[0]);
  check('A data dictionary is exported alongside it',
        /dictionary/.test(csv.names[1] || '') && /column.*meaning.*source/i.test(dictCsv.split('\n')[0] || ''),
        csv.names[1]);
  ['participant_id','study_day','date','completed','brain_day','restoration_1_5','energy_1_5',
   'focus_1_5','sleep_minutes','opportunity_minutes','adherence','bio_light','value_basis',
   'plan_mode','schema_version'].forEach(column => {
    check(`Export has a ${column} column`, at(column) >= 0);
  });
  check('Every dictionary row explains a real column',
        dictCsv.trim().split('\n').length - 1 === header.length,
        `${dictCsv.trim().split('\n').length - 1} entries for ${header.length} columns`);

  // One row per study day, including the day nobody recorded anything.
  check('One row per study day, missing days included', lines.length - 1 === 3,
        `${lines.length - 1} rows for 3 days`);
  const cells = lines.slice(1).map(parse);
  const dayRow = n => cells.find(row => row[at('study_day')] === String(n));
  const day3 = dayRow(3);
  check('A day with no entry is marked incomplete', day3 && day3[at('completed')] === '0');
  check('And its measurements are empty, not zero',
        day3 && day3[at('restoration_1_5')] === '' && day3[at('sleep_minutes')] === '',
        day3 && `rest="${day3[at('restoration_1_5')]}" sleep="${day3[at('sleep_minutes')]}"`);
  const day1 = dayRow(1);
  check('A recorded day carries its real values',
        day1 && day1[at('restoration_1_5')] === '4' && day1[at('sleep_minutes')] === '414',
        day1 && `rest="${day1[at('restoration_1_5')]}" sleep="${day1[at('sleep_minutes')]}"`);
  check('Brain Day exports empty rather than invented',
        day1 && day1[at('brain_day')] === '', day1 && `brain_day="${day1[at('brain_day')]}"`);
  check('Lazy nights declare which values were estimated',
        /estimated: sleepTime/.test(dataCsv));

  // The whole point of a separate research export.
  check('Private thought text is not in the research export', !/SECRETTHOUGHT/.test(dataCsv));
  check('Morning note text is not in the research export', !/SECRETNOTE/.test(dataCsv));
  check('Feedback text is not in the research export', !/SECRETFEEDBACK/.test(dataCsv));
  check('No page errors while exporting', exporter.errs.length === 0, exporter.errs.join(' | '));
  await exporter.ctx.close();

  /* ---------------------------------------------------------------- 15 */
  const backup = await open({ blob: { ...V2, version:3, study:{ ...enrolled.study } } });
  const backupOk = await backup.p.evaluate(() => {
    let name = '';
    const real = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { name = this.download; real.call(this); };
    document.querySelector('.nav button[data-view="data"]').click();
    document.getElementById('exportBackup').click();
    return name;
  });
  check('The original personal backup still works', /\.json$/.test(backupOk), backupOk);
  check('The study panel shows the fieldwork status',
        /P014/.test(await backup.p.locator('#studyPanel').innerText()));
  await backup.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
