/**
 * Recording integrity.
 *
 * The night this suite exists for, in full: a bed time was stamped at 18:17
 * by a tap in daylight; the app was next opened at 10:21 the following
 * morning; "the app was opened" was read as "the participant woke"; and one
 * tap on a restoration rating wrote a sixteen-hour night, fourteen and three
 * quarter hours of "sleep", and a Restoration Twin interpreting it. Every
 * number was arithmetically right and every premise was false.
 *
 * So the checks here are about EVIDENCE, not arithmetic:
 *
 *   - a stamped timestamp is not a confirmed one, and the record says which
 *   - a rating is not consent to a set of times
 *   - a provisional reading, once taken, is never silently retaken
 *   - a record the app cannot stand behind stays visible, stays exported,
 *     and stops being counted
 *   - and nothing above is allowed to erase a participant's ordinary history
 *     to achieve it
 *
 * Flags are derived rather than stored on purpose, and the check that proves
 * it is "the record on disk is not modified": that is what lets a bad night
 * already saved be recognised without anybody editing the evidence.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const KEY = 'sleepsphere_state_v2';
const BASE = { welcomeSeen:true, openingOff:true, mode:'dark', target:540, faith:'on',
  place:{ latitude:19.076, longitude:72.8777, name:'Mumbai' }, usualWake:'06:00', fajrHabit:'stay' };

/* Three ordinary one-tap nights. They are UNVERIFIED — nobody was ever asked
   — and they must keep counting, or fixing one bad night would delete a
   participant's history. */
const ordinary = (date, bed, sleep, awake) => ({
  id:'h'+date, date, bedTime:bed, sleepTime:sleep, wakeTime:'06:30',
  awakeMinutes:awake, napMinutes:0, opportunityMinutes:450, sleepMinutes:400,
  efficiency:88, rest:3, energy:3, focus:3, calm:3, fajr:'ontime', factors:[], note:'',
  targetMinutes:540, lazy:true, createdAt:date+'T06:30:00.000Z' });
const HISTORY = [
  ordinary('2026-10-03','23:00','00:02',19),
  ordinary('2026-10-04','23:10','00:12',19),
  ordinary('2026-10-05','23:05','00:07',19)
];

// The open night, exactly as the device left it.
const OPEN = { startedAt:'2026-10-07T12:47:00.000Z', bedTime:'18:17', bedSource:'goodnight' };
// The same night as it reached the diary, for the preservation checks.
const BAD = { id:'oct8', date:'2026-10-08', bedTime:'18:17', sleepTime:'19:19', wakeTime:'10:21',
  awakeMinutes:19, napMinutes:0, opportunityMinutes:964, sleepMinutes:883, efficiency:92,
  rest:2, energy:null, focus:null, calm:null, fajr:'ontime', factors:[], targetMinutes:540,
  lazy:true, measured:['bedTime','wakeTime'], estimated:['sleepTime','awakeMinutes'],
  note:'Lazy mode. Bed and wake times measured, not recalled.', createdAt:'2026-10-08T04:51:00.000Z' };

const AT_MORNING = '2026-10-08T04:51:00.000Z';   // 10:21 IST
const AT_1817    = '2026-10-07T12:47:00.000Z';   // 18:17 IST

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (opts = {}) => {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
      isMobile:true, hasTouch:true, timezoneId:'Asia/Kolkata' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(`localStorage.setItem('${KEY}', JSON.stringify(Object.assign({
      version:3, settings:${JSON.stringify(BASE)}, brainDays:{}, plan:null, lazyNight:null,
      mornings:${JSON.stringify(HISTORY)},
      study:{onboarded:true,participantId:'P014',startDate:'2026-10-01',enrolledAt:'2026-10-01T06:00:00.000Z',consentAck:true,consentAt:'2026-10-01T06:00:00.000Z',cohort:'jamea-v1',schemaVersion:3,storageMode:'local',lastSeenDay:1},
      bioCheckins:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
    }, ${JSON.stringify(opts.extra || {})})));`);
    if (opts.iso) {
      const t = new Date(opts.iso).getTime();
      await p.addInitScript(`(()=>{const R=Date;
        class D extends R{constructor(...a){if(!a.length)return super(${t});return super(...a);}
        static now(){return ${t};}} window.Date=D;})()`);
    }
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1300);
    return { ctx, p, errs };
  };
  const stored = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  const oct8 = p => p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
    return (s.mornings || []).find(m => !m.demo && m.date === '2026-10-08') || null;
  });

  /* ================================================================
     FLAGS AND VERIFICATION — the two ideas, and the line between them.
     ================================================================ */
  const engine = await open({ iso: AT_MORNING });
  const flags = r => engine.p.evaluate(x => window.__recordFlags(x), r);
  const trusted = r => engine.p.evaluate(x => window.__recordTrusted(x), r);
  const verification = r => engine.p.evaluate(x => window.__recordVerification(x), r);
  check('No console errors on load', engine.errs.length === 0, engine.errs.join(' | '));

  check('A sixteen-hour night is flagged as unusually long',
        (await flags(BAD)).includes('long-opportunity'), (await flags(BAD)).join(','));
  check('And an 18:17 bed time is flagged as an afternoon stamp',
        (await flags(BAD)).includes('daytime-bedtime'));
  check('A wake time taken from reopening the app is flagged as inferred',
        (await flags({ ...BAD, wakeSource:'app-open' })).includes('wake-inferred'));
  check('An estimated wake time, because the app was not opened, is flagged',
        (await flags({ ...BAD, stale:true })).includes('wake-estimated'));
  check('An ordinary night is flagged for nothing',
        (await flags(HISTORY[0])).length === 0, (await flags(HISTORY[0])).join(','));

  check('An unexamined one-tap record reads as unverified',
        await verification(HISTORY[0]) === 'unverified');
  check('A record typed into the form reads as entered',
        await verification({ ...HISTORY[0], lazy:false }) === 'entered');
  check('And an explicit answer always wins',
        await verification({ ...BAD, verified:'confirmed' }) === 'confirmed');

  /* The line: unverified is not the same as untrustworthy. */
  check('UNVERIFIED IS NOT UNTRUSTED · ordinary one-tap history still counts',
        await trusted(HISTORY[0]) === true);
  check('A record with something visibly wrong does not count',
        await trusted(BAD) === false);
  check('CONFIRMING A STRANGE NIGHT IS BELIEVED · unusual schedules survive',
        await trusted({ ...BAD, verified:'confirmed' }) === true);
  check('Correcting it is believed too',
        await trusted({ ...BAD, verified:'corrected' }) === true);
  check('"Not sure" is never second-guessed into certainty',
        await trusted({ ...HISTORY[0], verified:'uncertain' }) === false);
  check('Fourteen hours is the boundary, and it is inclusive',
        (await flags({ opportunityMinutes:840 })).length === 0
        && (await flags({ opportunityMinutes:841 })).includes('long-opportunity'));
  check('The afternoon window runs midday to seven, and no further',
        (await flags({ bedTime:'11:59' })).length === 0
        && (await flags({ bedTime:'12:00' })).includes('daytime-bedtime')
        && (await flags({ bedTime:'19:00' })).length === 0);
  await engine.ctx.close();

  /* ================================================================
     THE MORNING CARD — the regression, in the shape it happened.
     ================================================================ */
  const card = await open({ iso: AT_MORNING, extra:{ lazyNight: OPEN } });
  const face = () => card.p.evaluate(() => {
    const t = id => { const n = document.getElementById(id); return n && !n.hidden ? n.innerText.trim() : null; };
    return { shown: !document.getElementById('lazyMorningVeil').hidden,
      word: t('lazyMorningWord'), times: t('lazyMorningTimes'),
      why: t('lazyMorningWhy'), estimate: t('lazyMorningEstimate'),
      confirmRow: !document.getElementById('lazyConfirmRow').hidden,
      rateRow: !document.getElementById('lazyRateRow').hidden };
  });
  const first = await face();
  check('REGRESSION · the morning card asks about the times first',
        first.shown && first.word === 'Are these times right?', first.word);
  check('REGRESSION · the rating is not reachable until they are answered',
        first.rateRow === false && first.confirmRow === true,
        `confirm ${first.confirmRow} / rate ${first.rateRow}`);
  check('REGRESSION · nothing has been written to the diary yet',
        await oct8(card.p) === null);
  check('The three concerns are named, in plain words',
        /very long night/.test(first.why) && /afternoon/.test(first.why)
        && /when the app was opened/.test(first.why), first.why);
  check('And the estimate is offered as conditional, not as fact',
        /if these times are right/.test(first.estimate), first.estimate);
  check('Time in bed is stated; "14h 43m asleep" is no longer the headline',
        /16h 4m in bed/.test(first.times) && !/asleep/.test(first.times), first.times);

  await card.p.locator('[data-lazy-confirm="confirmed"]').click();
  await card.p.waitForTimeout(250);
  const after = await face();
  check('Answering the times reveals the rating',
        after.rateRow === true && after.word === 'How was it?', after.word);
  await card.p.locator('[data-lazy-rate="2"]').click();
  await card.p.waitForTimeout(800);
  const confirmed = await oct8(card.p);
  check('A confirmed night records what the participant said',
        confirmed && confirmed.verified === 'confirmed', String(confirmed && confirmed.verified));
  check('And carries where each timestamp came from',
        confirmed.wakeSource === 'app-open' && confirmed.bedSource === 'goodnight',
        `${confirmed.wakeSource} / ${confirmed.bedSource}`);
  check('A confirmed unusual night is then counted — it is their night',
        await card.p.evaluate(() => window.__trustedMornings().includes('2026-10-08')));
  check('No console errors through the confirm flow', card.errs.length === 0, card.errs.join(' | '));
  await card.ctx.close();

  /* ---- "Not sure". */
  const unsure = await open({ iso: AT_MORNING, extra:{ lazyNight: OPEN } });
  await unsure.p.locator('[data-lazy-confirm="uncertain"]').click();
  await unsure.p.waitForTimeout(250);
  await unsure.p.locator('[data-lazy-rate="2"]').click();
  await unsure.p.waitForTimeout(800);
  const uncertain = await oct8(unsure.p);
  check('"Not sure" is recorded as uncertain, not quietly as agreement',
        uncertain.verified === 'uncertain');
  check('The night stays in the diary',
        Boolean(uncertain) && uncertain.opportunityMinutes === 964);
  check('And is left out of the averages',
        await unsure.p.evaluate(() => !window.__trustedMornings().includes('2026-10-08')));
  check('The week says so rather than hiding it',
        /left out/.test(await unsure.p.evaluate(() => document.getElementById('weekSummary').textContent)),
        await unsure.p.evaluate(() => document.getElementById('weekSummary').textContent));
  check('A rating never implies the times were agreed',
        uncertain.rest === 2 && uncertain.verified === 'uncertain');
  await unsure.ctx.close();

  /* ---- "Not right" → correcting it. */
  const fix = await open({ iso: AT_MORNING, extra:{ lazyNight: OPEN } });
  await fix.p.locator('[data-lazy-confirm="correct"]').click();
  await fix.p.waitForTimeout(700);
  const form = await fix.p.evaluate(() => ({
    view: document.documentElement.dataset.view,
    open: document.getElementById('morningForm').open,
    date: document.getElementById('logDate').value,
    bed: document.getElementById('actualBed').value,
    wake: document.getElementById('actualWake').value,
    stillOpen: Boolean(JSON.parse(localStorage.getItem('sleepsphere_state_v2')).lazyNight)
  }));
  check('Correcting opens the full form, already filled in',
        form.view === 'morning' && form.open === true
        && form.bed === '18:17' && form.wake === '10:21', JSON.stringify(form));
  check('And writes nothing until they save',
        form.stillOpen === true && await oct8(fix.p) === null);
  await fix.p.evaluate(() => {
    const set = (id, v) => { const n = document.getElementById(id); n.value = v;
      n.dispatchEvent(new Event('input', { bubbles:true })); };
    set('actualBed','01:20'); set('actualSleep','01:20'); set('actualWake','09:55'); set('awakeMinutes','60');
    ['rest','energy','focus','calm'].forEach(k =>
      document.querySelector(`[data-rating="${k}"]`).querySelectorAll('button')[1].click());
  });
  await fix.p.locator('#saveMorning').click();
  await fix.p.waitForTimeout(800);
  const corrected = await oct8(fix.p);
  check('The corrected night is the participant’s own account',
        corrected.bedTime === '01:20' && corrected.wakeTime === '09:55'
        && corrected.verified === 'corrected',
        JSON.stringify({ b:corrected.bedTime, w:corrected.wakeTime, v:corrected.verified }));
  check('And the open night is closed, so tomorrow does not re-ask',
        (await stored(fix.p)).lazyNight === null);
  check('No console errors through the correction flow', fix.errs.length === 0, fix.errs.join(' | '));
  await fix.ctx.close();

  /* ================================================================
     A FRAGMENTED NIGHT — known times, unknown sleep.

     1:20 to 9:55 with a Fajr waking and three more is an elapsed window, not
     eight and a half hours of sleep. Until Stage 2's interval recorder
     exists the app cannot represent the shape of that night, so it must not
     pretend to: the times are kept and the sleep total is left unknown.
     ================================================================ */
  const frag = await open({ iso: AT_MORNING, extra:{ lazyNight: OPEN } });
  await frag.p.locator('[data-lazy-confirm="correct"]').click();
  await frag.p.waitForTimeout(700);
  check('The correction form offers "I can\u2019t say how much I slept"',
        await frag.p.evaluate(() => Boolean(document.getElementById('sleepUnknown'))));
  check('And the awake field is prefilled from a median, which is the trap',
        await frag.p.evaluate(() => document.getElementById('awakeMinutes').value) === '19',
        'a figure the participant never gave');
  await frag.p.evaluate(() => {
    const set = (id, v) => { const n = document.getElementById(id); n.value = v;
      n.dispatchEvent(new Event('input', { bubbles:true })); };
    set('actualBed','01:20'); set('actualSleep','01:20'); set('actualWake','09:55');
    const u = document.getElementById('sleepUnknown');
    u.checked = true; u.dispatchEvent(new Event('change', { bubbles:true }));
    ['rest','energy','focus','calm'].forEach(k =>
      document.querySelector(`[data-rating="${k}"]`).querySelectorAll('button')[1].click());
  });
  check('Ticking it says "Not known" rather than a number',
        /not known/i.test(await frag.p.evaluate(() => document.getElementById('estimatedSleep').textContent)),
        await frag.p.evaluate(() => document.getElementById('estimatedSleep').textContent));
  check('And the awake field is disabled, not quietly contributing',
        await frag.p.evaluate(() => document.getElementById('awakeMinutes').disabled) === true);
  await frag.p.evaluate(() => document.getElementById('saveMorning').click());
  await frag.p.waitForTimeout(800);
  const unknown = await oct8(frag.p);
  check('REGRESSION · the known times are kept exactly',
        unknown.bedTime === '01:20' && unknown.wakeTime === '09:55'
        && unknown.opportunityMinutes === 515, JSON.stringify({ b:unknown.bedTime, w:unknown.wakeTime, o:unknown.opportunityMinutes }));
  check('REGRESSION · and 8h 35m is NOT recorded as sleep',
        unknown.sleepMinutes === null && unknown.efficiency === null,
        `sleep ${unknown.sleepMinutes} / efficiency ${unknown.efficiency}`);
  check('The median awake figure is not kept either',
        unknown.awakeMinutes === null, String(unknown.awakeMinutes));
  check('It records that the times are theirs and the total is not knowable',
        unknown.verified === 'times-only', String(unknown.verified));
  check('It is flagged as a night with an unknown sleep total',
        (await frag.p.evaluate(r => window.__recordFlags(r), unknown)).includes('sleep-unknown'));
  check('And it is left out of the averages rather than counted as zero',
        await frag.p.evaluate(() => !window.__trustedMornings().includes('2026-10-08')));
  check('No console errors recording an unknown sleep total',
        frag.errs.length === 0, frag.errs.join(' | '));

  /* The export has to show it as empty, never as a figure. */
  const fragCsv = await frag.p.evaluate(() => new Promise(resolve => {
    const seen = []; const original = URL.createObjectURL;
    URL.createObjectURL = blob => { seen.push(blob); return original(blob); };
    document.querySelector('.nav button[data-view="data"]').click();
    document.getElementById('exportStudy').click();
    setTimeout(async () => resolve(await Promise.all(seen.map(bl => bl.text()))), 1500);
  }));
  /* Pick the row by its DATE COLUMN, not by a substring: every row carries
     exported_at, so on a day whose export date equals the night's date a
     substring match silently returns day one instead. */
  const fRows = (fragCsv[0] || '').split('\n');
  const fHeader = fRows[0].split(',').map(c => c.replace(/^"|"$/g, ''));
  const dateAt = fHeader.indexOf('date');
  const parse = r => r.split(',').map(c => c.replace(/^"|"$/g, ''));
  const fRow = parse(fRows.slice(1).find(r => parse(r)[dateAt] === '2026-10-08') || '');
  const fCol = name => fRow[fHeader.indexOf(name)];
  check('EXPORT · an unknown sleep total is empty, not zero',
        fCol('sleep_minutes') === '' && fCol('efficiency_percent') === '',
        `sleep "${fCol('sleep_minutes')}" efficiency "${fCol('efficiency_percent')}"`);
  check('EXPORT · but the time in bed they gave is there',
        fCol('opportunity_minutes') === '515', fCol('opportunity_minutes'));
  check('EXPORT · and value_basis says why the sleep total is missing',
        /verification: times-only/.test(fCol('value_basis'))
        && /sleep-unknown/.test(fCol('value_basis')), fCol('value_basis'));
  await frag.ctx.close();

  /* ================================================================
     TIMES NOBODY OBSERVED — the quick morning fills all four from the
     plan, so a twin built on it compares a plan against itself.
     ================================================================ */
  const inferred = await open({ iso: AT_MORNING });
  const q = await inferred.p.evaluate(() => {
    const r = { date:'2026-10-08', bedTime:'22:30', sleepTime:'22:45', wakeTime:'06:30',
      awakeMinutes:19, opportunityMinutes:480, sleepMinutes:446, quick:true,
      measured:[], estimated:['bedTime','sleepTime','wakeTime','awakeMinutes'] };
    return { flags: window.__recordFlags(r), trusted: window.__recordTrusted(r),
             confirmedFlags: window.__recordFlags({ ...r, verified:'confirmed' }),
             confirmedTrust: window.__recordTrusted({ ...r, verified:'confirmed' }) };
  });
  check('A record whose times all came from the plan is flagged as inferred',
        q.flags.includes('times-inferred'), q.flags.join(','));
  check('And is not evidence for a plan-versus-reality comparison',
        q.trusted === false);
  check('Confirming it is still believed — the participant may well agree',
        q.confirmedTrust === true);
  check('A stamped one-tap night is NOT caught by this',
        await inferred.p.evaluate(() => window.__recordFlags(
          { date:'x', bedTime:'23:00', opportunityMinutes:450,
            measured:['bedTime','wakeTime'], estimated:['sleepTime','awakeMinutes'] }).length) === 0);
  await inferred.ctx.close();

  /* ================================================================
     CORRECTING AN EXISTING RECORD — one authoritative night.
     ================================================================ */
  const over = await open({ iso:'2026-10-09T04:51:00.000Z', extra:{ mornings:[...HISTORY, BAD] } });
  let dialogText = null;
  over.p.on('dialog', async d => { dialogText = d.message(); await d.accept(); });
  await over.p.evaluate(() => {
    document.getElementById('morningForm').open = true;
    const set = (id, v) => { const n = document.getElementById(id); n.value = v;
      n.dispatchEvent(new Event('input', { bubbles:true })); };
    set('logDate','2026-10-08');
    set('actualBed','01:20'); set('actualSleep','01:20'); set('actualWake','09:55');
    const u = document.getElementById('sleepUnknown');
    u.checked = true; u.dispatchEvent(new Event('change', { bubbles:true }));
    ['rest','energy','focus','calm'].forEach(k =>
      document.querySelector(`[data-rating="${k}"]`).querySelectorAll('button')[1].click());
  });
  await over.p.evaluate(() => document.getElementById('saveMorning').click());
  await over.p.waitForTimeout(900);
  const afterOver = await over.p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
    return { forDate: s.mornings.filter(m => m.date === '2026-10-08'),
             trusted: window.__trustedMornings().filter(d => d === '2026-10-08') };
  });
  check('Correcting never happens silently — it asks first',
        /already exists/.test(dialogText || ''), String(dialogText));
  check('ONE AUTHORITATIVE NIGHT · no duplicate record for the date',
        afterOver.forDate.length === 1, `${afterOver.forDate.length} records`);
  check('And no chance of both versions entering a calculation',
        afterOver.trusted.length <= 1, `${afterOver.trusted.length} in the trusted set`);
  check('The surviving record is the participant\u2019s own account',
        afterOver.forDate[0].opportunityMinutes === 515
        && afterOver.forDate[0].sleepMinutes === null,
        JSON.stringify({ o:afterOver.forDate[0].opportunityMinutes, s:afterOver.forDate[0].sleepMinutes }));
  /* KNOWN GAP, reported and awaiting approval: the original 964-minute
     record is REPLACED, not retained. Retaining it needs a supersession
     marker, which is a stored-data change and is not in this patch. This
     check records the current truth so the gap cannot be forgotten, and
     must be inverted when that mechanism lands. */
  check('KNOWN GAP · the original evidence is replaced, not kept (see report)',
        !afterOver.forDate.some(r => r.opportunityMinutes === 964),
        'retention needs the approved supersession marker');
  check('No console errors correcting over an existing record',
        over.errs.length === 0, over.errs.join(' | '));
  await over.ctx.close();

  /* ================================================================
     SUPERSESSION — a correction stands beside what it corrects.

     Correcting a night used to delete the original and reuse its id, so the
     only evidence of what the app had recorded was gone the moment somebody
     fixed it. The superseded version now goes to state.morningRevisions,
     deliberately OUT of state.mornings: twenty-six places read that array
     directly, and keeping archived records in it would mean every one of
     them had to learn to skip them.
     ================================================================ */
  const chainOf = (p, date) => p.evaluate(d => window.__chain(d), date);
  const revsOf = p => p.evaluate(() => window.__revisions());
  const liveFor = (p, date) => p.evaluate(d => {
    const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
    return (s.mornings || []).filter(m => !m.demo && m.date === d);
  }, date);

  const sup = await open({ iso:'2026-10-09T04:51:00.000Z', extra:{ mornings:[...HISTORY, BAD] } });
  let supDialog = null;
  sup.p.on('dialog', async d => { supDialog = d.message(); await d.accept(); });
  const correct = (bed, sleep, wake, unknown) => sup.p.evaluate(([b, sl, w, u]) => {
    document.getElementById('morningForm').open = true;
    const set = (id, v) => { const n = document.getElementById(id); n.value = v;
      n.dispatchEvent(new Event('input', { bubbles:true })); };
    set('logDate','2026-10-08'); set('actualBed',b); set('actualSleep',sl); set('actualWake',w);
    const unk = document.getElementById('sleepUnknown');
    unk.checked = Boolean(u); unk.dispatchEvent(new Event('change', { bubbles:true }));
    ['rest','energy','focus','calm'].forEach(k =>
      document.querySelector(`[data-rating="${k}"]`).querySelectorAll('button')[1].click());
    document.getElementById('saveMorning').click();
  }, [bed, sleep, wake, unknown]);

  const originalId = (await liveFor(sup.p, '2026-10-08'))[0].id;
  await correct('01:20','01:20','09:55', true);
  await sup.p.waitForTimeout(800);

  const live1 = await liveFor(sup.p, '2026-10-08');
  const revs1 = await revsOf(sup.p);
  check('ORIGINAL RETAINED · the superseded record is still in the data',
        revs1.length === 1 && revs1[0].opportunityMinutes === 964
        && revs1[0].sleepMinutes === 883 && revs1[0].bedTime === '18:17'
        && revs1[0].wakeTime === '10:21',
        JSON.stringify(revs1.map(r => ({ o:r.opportunityMinutes, b:r.bedTime }))));
  check('And it is unchanged apart from its supersession metadata',
        revs1[0].id === originalId && Boolean(revs1[0].supersededAt),
        `${revs1[0].id} superseded at ${revs1[0].supersededAt}`);
  check('DISTINCT ID · the correction is a different record, not an overwrite',
        live1[0].id !== originalId, `${originalId} \u2192 ${live1[0].id}`);
  check('LINKED · the original points forward to the correction',
        revs1[0].supersededBy === live1[0].id, revs1[0].supersededBy);
  check('And the correction points back to the original',
        live1[0].supersedes === originalId, String(live1[0].supersedes));
  check('NO DUPLICATE AUTHORITATIVE RECORD · exactly one live night per date',
        live1.length === 1, `${live1.length} live records`);
  check('The archive is not in the live collection',
        await sup.p.evaluate(() => {
          const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
          return !(s.mornings || []).some(m => m.opportunityMinutes === 964);
        }));
  check('TIMES-ONLY SURVIVES THE CORRECTION · window kept, sleep unknown',
        live1[0].opportunityMinutes === 515 && live1[0].sleepMinutes === null
        && live1[0].efficiency === null && live1[0].awakeMinutes === null
        && live1[0].verified === 'times-only',
        JSON.stringify({ o:live1[0].opportunityMinutes, s:live1[0].sleepMinutes }));
  check('Correcting an existing night asks first, and says the old one is kept',
        /already exists/.test(supDialog || '') && /kept in your backup/.test(supDialog || ''),
        String(supDialog));
  check('The participant is told in plain words, with no jargon',
        await sup.p.evaluate(() => {
          const t = document.getElementById('toast').textContent;
          return /patterns now use these times/.test(t) && !/supersed/i.test(t);
        }), await sup.p.evaluate(() => document.getElementById('toast').textContent));

  /* ---- Downstream: only the authoritative version may count. */
  const counted = await sup.p.evaluate(() => ({
    trusted: window.__trustedMornings(),
    week: document.getElementById('weekSummary').textContent,
    allDates: JSON.parse(localStorage.getItem('sleepsphere_state_v2')).mornings.map(m => m.date)
  }));
  check('DOWNSTREAM · the date appears once in the live set, never twice',
        counted.allDates.filter(d => d === '2026-10-08').length === 1,
        counted.allDates.join(','));
  check('And the superseded 16-hour night reaches no calculation',
        !counted.trusted.includes('2026-10-08')
        && !/16h/.test(counted.week), counted.week);

  /* ---- A second and third correction: the chain is complete. */
  await correct('01:30','01:30','09:40', false);
  await sup.p.waitForTimeout(800);
  await correct('01:25','01:25','09:50', false);
  await sup.p.waitForTimeout(800);
  const chain = await chainOf(sup.p, '2026-10-08');
  const revs3 = await revsOf(sup.p);
  check('REPEATED CORRECTIONS · the whole chain is preserved',
        revs3.length === 3 && chain.length === 4,
        `${revs3.length} archived, chain of ${chain.length}`);
  check('And it is walkable newest to oldest, each link matching',
        chain.slice(1).every((item, i) => chain[i].supersedes === item.id),
        chain.map(c => c.opportunityMinutes).join(' \u2190 '));
  check('The oldest link is the original 16-hour night',
        chain.at(-1).opportunityMinutes === 964, String(chain.at(-1).opportunityMinutes));
  check('Still exactly one live record after three corrections',
        (await liveFor(sup.p, '2026-10-08')).length === 1);
  check('Every archived version carries a distinct id',
        new Set(revs3.map(r => r.id)).size === 3);
  check('No console errors through three corrections',
        sup.errs.length === 0, sup.errs.join(' | '));

  /* ---- The exports. */
  const supCsv = await sup.p.evaluate(() => new Promise(resolve => {
    const seen = []; const original = URL.createObjectURL;
    URL.createObjectURL = blob => { seen.push(blob); return original(blob); };
    document.querySelector('.nav button[data-view="data"]').click();
    document.getElementById('exportStudy').click();
    setTimeout(async () => resolve(await Promise.all(seen.map(bl => bl.text()))), 1600);
  }));
  const sRows = (supCsv[0] || '').split('\n').filter(Boolean);
  const sHeader = sRows[0].split(',').map(c => c.replace(/^"|"$/g, ''));
  const sParse = r => r.split(',').map(c => c.replace(/^"|"$/g, ''));
  const sDate = sHeader.indexOf('date');
  const oct8Rows = sRows.slice(1).filter(r => sParse(r)[sDate] === '2026-10-08');
  check('CSV · one row per participant-day, not one per version',
        oct8Rows.length === 1, `${oct8Rows.length} rows for 8 Oct`);
  check('CSV · and it is the authoritative version',
        sParse(oct8Rows[0])[sHeader.indexOf('opportunity_minutes')] === '505',
        sParse(oct8Rows[0])[sHeader.indexOf('opportunity_minutes')]);
  check('CSV · the header is still the same 50 columns',
        sHeader.length === 50 && !sHeader.some(h => /supersed/.test(h)),
        `${sHeader.length} columns`);
  check('DICTIONARY · it tells the researcher the history is in the JSON',
        /morningRevisions/.test(supCsv[1] || '') && /AUTHORITATIVE/.test(supCsv[1] || ''),
        (supCsv[1] || '').split('\n').filter(l => /corrections/.test(l))[0] || 'missing');

  const backup = await sup.p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
    return { revisions: (s.morningRevisions || []).length,
             opportunities: (s.morningRevisions || []).map(r => r.opportunityMinutes) };
  });
  check('JSON · the full backup carries the complete correction history',
        backup.revisions === 3 && backup.opportunities.includes(964),
        backup.opportunities.join(','));

  /* ---- Round-trip: export the backup, import it, chain intact. */
  const roundTrip = await sup.p.evaluate(() => {
    const raw = localStorage.getItem('sleepsphere_state_v2');
    localStorage.setItem('sleepsphere_state_v2', raw);   // the shape a reimport sees
    const reparsed = JSON.parse(raw);
    return { revisions: (reparsed.morningRevisions || []).length,
             live: (reparsed.mornings || []).filter(m => m.date === '2026-10-08').length,
             linked: (reparsed.morningRevisions || []).every(r => Boolean(r.supersededBy)) };
  });
  check('ROUND TRIP · the history survives export and reimport',
        roundTrip.revisions === 3 && roundTrip.live === 1 && roundTrip.linked === true,
        JSON.stringify(roundTrip));
  await sup.ctx.close();

  /* ---- A REAL round trip: export the backup to a file, import that file
     back through the app's own importer, and check the chain survived. The
     earlier check re-parsed localStorage, which proves the JSON is
     well-formed but not that shapeState carries the new array through an
     import — and an import that silently dropped it would lose every
     correction a participant had ever made. */
  const trip = await open({ iso:'2026-10-09T04:51:00.000Z', extra:{ mornings:[...HISTORY, BAD] } });
  trip.p.on('dialog', async d => await d.accept());
  await trip.p.evaluate(() => {
    document.getElementById('morningForm').open = true;
    const set = (id, v) => { const n = document.getElementById(id); n.value = v;
      n.dispatchEvent(new Event('input', { bubbles:true })); };
    set('logDate','2026-10-08'); set('actualBed','01:20'); set('actualSleep','01:20'); set('actualWake','09:55');
    const u = document.getElementById('sleepUnknown');
    u.checked = true; u.dispatchEvent(new Event('change', { bubbles:true }));
    ['rest','energy','focus','calm'].forEach(k =>
      document.querySelector(`[data-rating="${k}"]`).querySelectorAll('button')[1].click());
    document.getElementById('saveMorning').click();
  });
  await trip.p.waitForTimeout(800);
  const exportedState = await trip.p.evaluate(() => localStorage.getItem('sleepsphere_state_v2'));
  const backupPath = require('path').join(require('os').tmpdir(), 'sleepsphere-roundtrip.json');
  require('fs').writeFileSync(backupPath, exportedState);
  // Wipe, then import the file through the app's own importer.
  await trip.p.evaluate(() => localStorage.removeItem('sleepsphere_state_v2'));
  await trip.p.reload({ waitUntil:'networkidle' });
  await trip.p.waitForTimeout(900);
  await trip.p.setInputFiles('#backupFile', backupPath);
  await trip.p.waitForTimeout(1200);
  const imported = await trip.p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
    return { revisions: (s.morningRevisions || []).length,
             original: (s.morningRevisions || [])[0],
             live: (s.mornings || []).filter(m => !m.demo && m.date === '2026-10-08'),
             chain: window.__chain('2026-10-08') };
  });
  check('ROUND TRIP · a real import through the app keeps the archive',
        imported.revisions === 1 && imported.original.opportunityMinutes === 964
        && imported.original.bedTime === '18:17',
        JSON.stringify({ n:imported.revisions, o:imported.original && imported.original.opportunityMinutes }));
  check('ROUND TRIP · still one authoritative night, and the link holds',
        imported.live.length === 1 && imported.chain.length === 2
        && imported.original.supersededBy === imported.live[0].id,
        JSON.stringify({ live:imported.live.length, chain:imported.chain.length }));
  check('ROUND TRIP · and the unknown sleep total is still unknown',
        imported.live[0].sleepMinutes === null && imported.live[0].verified === 'times-only',
        String(imported.live[0].sleepMinutes));
  check('No console errors through the round trip', trip.errs.length === 0, trip.errs.join(' | '));
  await trip.ctx.close();

  /* ---- An experiment baseline points at a record BY ID. Superseding that
     record would leave the pointer dangling and silently drop a baseline
     value out of the comparison, so the pointer follows the correction. */
  const base = await open({ iso:'2026-10-09T04:51:00.000Z', extra:{
    mornings:[...HISTORY, BAD],
    activeExperiment:{ id:'exp1', catalogKey:'custom', name:'Test', action:'x', days:7,
      metric:'rest', threshold:1, baselineIds:['oct8','h2026-10-03'], startedAt:'2026-10-07T00:00:00.000Z' } } });
  base.p.on('dialog', async d => await d.accept());
  await base.p.evaluate(() => {
    document.getElementById('morningForm').open = true;
    const set = (id, v) => { const n = document.getElementById(id); n.value = v;
      n.dispatchEvent(new Event('input', { bubbles:true })); };
    set('logDate','2026-10-08'); set('actualBed','01:20'); set('actualSleep','01:20'); set('actualWake','09:55');
    ['rest','energy','focus','calm'].forEach(k =>
      document.querySelector(`[data-rating="${k}"]`).querySelectorAll('button')[1].click());
    document.getElementById('saveMorning').click();
  });
  await base.p.waitForTimeout(800);
  const pointers = await base.p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
    const live = s.mornings.find(m => m.date === '2026-10-08');
    return { ids: s.activeExperiment.baselineIds, liveId: live.id,
             resolves: s.activeExperiment.baselineIds
               .every(id => s.mornings.some(m => m.id === id)) };
  });
  check('BASELINE · an experiment pointer follows the correction',
        pointers.ids.includes(pointers.liveId) && !pointers.ids.includes('oct8'),
        pointers.ids.join(','));
  check('And every baseline id still resolves to a live record',
        pointers.resolves === true, pointers.ids.join(','));
  check('An untouched baseline id is left alone',
        pointers.ids.includes('h2026-10-03'));
  check('No console errors superseding a baseline record',
        base.errs.length === 0, base.errs.join(' | '));
  await base.ctx.close();

  /* ---- Records written before any of this existed. */
  const legacy = await open({ iso:'2026-10-09T04:51:00.000Z', extra:{ mornings:[...HISTORY] } });
  const legacyState = await legacy.p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
    return { revisions: s.morningRevisions, chain: window.__chain('2026-10-03'),
             trusted: window.__trustedMornings() };
  });
  check('LEGACY · state with no correction history loads and reads as none',
        Array.isArray(legacyState.revisions) && legacyState.revisions.length === 0);
  check('A record with no supersession metadata has a chain of just itself',
        legacyState.chain.length === 1 && legacyState.chain[0].supersedes === null,
        JSON.stringify(legacyState.chain));
  check('And still counts exactly as it did before',
        legacyState.trusted.length === 3, legacyState.trusted.join(','));
  check('No console errors on legacy state', legacy.errs.length === 0, legacy.errs.join(' | '));
  await legacy.ctx.close();

  /* ================================================================
     "NOT NOW" — a provisional reading is taken once.
     ================================================================ */
  const skip = await open({ iso: AT_MORNING, extra:{ lazyNight: OPEN } });
  await skip.p.locator('#lazyMorningSkip').click();
  await skip.p.waitForTimeout(300);
  const held = await skip.p.evaluate(() => window.__integrity().lazyNight);
  check('Dismissing keeps the provisional night exactly as it was read',
        held && held.wakeTime === '10:21' && held.wakeSource === 'app-open', JSON.stringify(held));
  check('And writes no record', await oct8(skip.p) === null);
  await skip.ctx.close();

  const nextDay = await open({ iso:'2026-10-09T04:51:00.000Z', extra:{
    lazyNight:{ ...OPEN, wakeTime:'10:21', sleepTime:'19:19', stale:false,
                wakeSource:'app-open', date:'2026-10-08' } } });
  const survived = await nextDay.p.evaluate(() => window.__integrity().lazyNight);
  check('REGRESSION · a day later the recorded wake time is still 10:21',
        survived.wakeTime === '10:21', survived.wakeTime);
  check('And it is still not called an observation',
        survived.wakeSource === 'app-open', survived.wakeSource);
  await nextDay.ctx.close();

  /* ================================================================
     THE BED TIME — where 18:17 came from, and the guard that now asks.
     ================================================================ */
  const early = await open({ iso: AT_1817 });
  check('REGRESSION · 18:17 is early enough to ask about, with no plan saved',
        await early.p.evaluate(() => window.__nightIsEarly()) === true);
  check('A real bed time is not interrogated',
        await early.p.evaluate(() => window.__nightIsEarly('2026-10-07T17:30:00.000Z')) === false,
        '23:00 local');
  check('Nor is one just after midnight',
        await early.p.evaluate(() => window.__nightIsEarly('2026-10-07T19:00:00.000Z')) === false,
        '00:30 local');
  check('Mid-morning is',
        await early.p.evaluate(() => window.__nightIsEarly('2026-10-07T04:30:00.000Z')) === true,
        '10:00 local');
  await early.p.locator('#lazyStart').click();
  await early.p.waitForTimeout(600);
  const asked = await early.p.evaluate(() => ({
    veil: !document.getElementById('earlyVeil').hidden,
    dua: !document.getElementById('duaVeil').hidden,
    night: JSON.parse(localStorage.getItem('sleepsphere_state_v2')).lazyNight
  }));
  check('REGRESSION · "Too tired" at 18:17 asks before it records',
        asked.veil === true && asked.dua === false,
        JSON.stringify({ veil:asked.veil, dua:asked.dua }));
  check('And no bed time is stamped while the question is open',
        asked.night === null);
  await early.p.locator('#earlyNo').click();
  await early.p.waitForTimeout(500);
  check('Declining leaves no night open',
        (await stored(early.p)).lazyNight === null);
  check('No console errors through the early-night question',
        early.errs.length === 0, early.errs.join(' | '));
  await early.ctx.close();

  const link = await open({ iso: AT_1817 });
  await link.p.evaluate(() => window.__deepLink('sleepsphere://bedtime'));
  await link.p.waitForTimeout(500);
  const stamped = (await stored(link.p)).lazyNight;
  check('A bedtime deep link still stamps immediately, as published',
        stamped && stamped.bedTime === '18:17', JSON.stringify(stamped));
  check('But the stamp now says it came from a deep link',
        stamped.bedSource === 'deep-link', String(stamped.bedSource));
  await link.ctx.close();

  /* ================================================================
     DOWNSTREAM — what an untrusted record may no longer influence.
     ================================================================ */
  const down = await open({ iso:'2026-10-09T04:51:00.000Z',
    extra:{ mornings:[...HISTORY, { ...BAD, verified:'uncertain' }] } });
  const reach = await down.p.evaluate(() => ({
    trusted: window.__trustedMornings(),
    week: document.getElementById('weekSummary').textContent
  }));
  check('The bad night is excluded from every average',
        !reach.trusted.includes('2026-10-08') && reach.trusted.length === 3,
        reach.trusted.join(','));
  check('THE FEEDBACK LOOP IS CLOSED · it cannot become a future estimate',
        await down.p.evaluate(() => {
          const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
          return !window.__recordTrusted(s.mornings.find(m => m.date === '2026-10-08'));
        }) === true);
  check('The week average is taken over the sound nights only',
        /1 night left out/.test(reach.week), reach.week);
  check('And the record is still on the week strip, not deleted',
        await down.p.evaluate(() =>
          JSON.parse(localStorage.getItem('sleepsphere_state_v2')).mornings.some(m => m.date === '2026-10-08')));
  const twin = await down.p.evaluate(() => {
    document.querySelector('.nav button[data-view="twin"]')?.click();
    return { status: document.getElementById('twinStatus')?.textContent || '',
             actual: document.getElementById('twinActualLabel')?.textContent || '' };
  });
  check('The Restoration Twin does not pair with an unverified night',
        !/16h|14h 43m/.test(twin.actual), `${twin.actual} / ${twin.status}`);
  check('No console errors with an untrusted record in the set',
        down.errs.length === 0, down.errs.join(' | '));
  await down.ctx.close();

  /* ================================================================
     EVIDENCE PRESERVED, AND THE EXPORT.
     ================================================================ */
  const keep = await open({ iso:'2026-10-09T04:51:00.000Z',
    extra:{ mornings:[...HISTORY, BAD] } });
  const untouched = await oct8(keep.p);
  check('PRESERVATION · the record on disk is not modified by being doubted',
        untouched.opportunityMinutes === 964 && untouched.sleepMinutes === 883
        && untouched.bedTime === '18:17' && untouched.wakeTime === '10:21'
        && !('flags' in untouched) && !('verified' in untouched),
        JSON.stringify({ opp:untouched.opportunityMinutes, keys:Object.keys(untouched).length }));
  check('Yet it is recognised as unreliable anyway, from its own values',
        await keep.p.evaluate(r => window.__recordTrusted(r), untouched) === false);
  check('A record that predates all of this still reads honestly',
        await keep.p.evaluate(r => window.__recordVerification(r), untouched) === 'unverified');

  const exported = await keep.p.evaluate(() => new Promise(resolve => {
    const names = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { names.push(this.download); realClick.call(this); };
    const seen = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = blob => { seen.push(blob); return original(blob); };
    document.querySelector('.nav button[data-view="data"]').click();
    document.getElementById('exportStudy').click();
    setTimeout(async () => resolve({ names, texts: await Promise.all(seen.map(bl => bl.text())) }), 1500);
  }));
  const unquote = row => row.split(',').map(c => c.replace(/^"|"$/g, ''));
  const rows = (exported.texts[0] || '').split('\n');
  const header = unquote(rows[0] || '');
  const dateCol = header.indexOf('date');
  const badRow = unquote(rows.slice(1).find(r => unquote(r)[dateCol] === '2026-10-08') || '');
  const col = name => badRow[header.indexOf(name)];
  check('EXPORT · the header is unchanged — 50 columns, none added or renamed',
        header.length === 50 && !header.some(h => /verif|flag|trust/.test(h)),
        `${header.length} columns`);
  check('The bad night is still exported, not withheld',
        col('date') === '2026-10-08' && col('sleep_minutes') === '883');
  check('And value_basis now says it is not evidence',
        /verification: unverified/.test(col('value_basis'))
        && /excluded from this participant/.test(col('value_basis'))
        && /unusual: long-opportunity daytime-bedtime/.test(col('value_basis')),
        col('value_basis'));
  /* An ordinary one-tap night keeps the measured/estimated text it always
     had, and gains exactly one clause: that nobody was ever asked to confirm
     it. That IS a change to a value in an existing column on re-export, and
     it is the change the whole patch is for — "measured" never meant
     "confirmed", and the export should not have let it read that way. The
     report states it; it is not allowed to happen quietly. */
  const goodRow = unquote(rows.slice(1).find(r => unquote(r)[dateCol] === '2026-10-03') || '');
  const goodBasis = goodRow[header.indexOf('value_basis')];
  check('An ordinary night keeps its measured/estimated text exactly',
        goodBasis.startsWith('measured: ; estimated: '), `"${goodBasis}"`);
  check('And gains only the fact that it was never confirmed',
        goodBasis === 'measured: ; estimated: ; verification: unverified', `"${goodBasis}"`);
  check('It is still counted — unverified is not a reason to drop a night',
        await keep.p.evaluate(() => window.__trustedMornings().includes('2026-10-03')));
  check('The schema version is untouched',
        badRow[header.indexOf('schema_version')] === '3');
  check('No console errors exporting', keep.errs.length === 0, keep.errs.join(' | '));
  await keep.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
