/**
 * SleepSphere Motherhood — the storage and export boundary.
 *
 * Motherhood is an optional module of this app, holding the most sensitive
 * data in it: pregnancy and postpartum stage, night feeds, fertility. The
 * product owner's rule is that if adequate protection cannot be provided,
 * the interface and architecture are built and collection stays off. This
 * suite is what "adequate" is measured against, so it is written to fail
 * the moment the boundary leaks rather than to confirm it holds.
 *
 * The four hazards it guards, all found by audit (see MOTHERHOOD.md §3):
 *
 *   H1  #exportStudyJson serialises the whole state object, and sits beside
 *       a button whose own note says to send the files to a researcher.
 *   H2  shapeState spreads unknown keys straight through, so anything put
 *       on `state` is exported forever after with no code change.
 *   H3  the private backup has the same property, and a backup file is the
 *       one most likely to be mailed to oneself.
 *   H4  there is no lock of any kind — which is exactly why the module must
 *       not be in the main blob and must vanish completely when off.
 *
 * The strongest check here is the last one: a device with the module on
 * must produce a BYTE-IDENTICAL research CSV to one without it. Not a
 * similar one. Identical.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const KEY = 'sleepsphere_state_v2';
const MKEY = 'sleepsphere_motherhood_v1';
const DUBAI = { latitude: 25.2048, longitude: 55.2708, name: 'Dubai' };
const BASE = { welcomeSeen:true, openingOff:true, mode:'dark', target:480, faith:'on',
               usualWake:'06:30', fajrHabit:'return', place: DUBAI, name:'Insiyah' };

/* A participant with real history, so the research export has something to
   say and "identical" is a meaningful claim rather than two empty files. */
const MORNINGS = [
  { date:'2026-09-02', bed:'22:30', sleep:'23:00', wake:'06:30', awake:15, naps:0,
    restoration:4, energy:4, focus:4, calm:4, fajr:'ready', factors:[], brainDay:'normal',
    entry:'full', sleepMinutes:435, opportunityMinutes:480 },
  { date:'2026-09-03', bed:'23:10', sleep:'23:40', wake:'06:20', awake:20, naps:0,
    restoration:3, energy:3, focus:3, calm:3, fajr:'woke_tired', factors:['Late screen'],
    brainDay:'hifz', entry:'full', sleepMinutes:380, opportunityMinutes:430 }
];

const seed = () => `(()=>{localStorage.setItem('${KEY}', JSON.stringify({
  version:3, settings:${JSON.stringify(BASE)}, plan:null, brainDays:{},
  study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:3},
  bioCheckins:[], mornings:${JSON.stringify(MORNINGS)}, morningRevisions:[],
  thoughts:[], scans:[], feedback:[], experimentHistory:[]
}));})()`;

const clockAt = `(()=>{const R=Date;const f=new R(2026,8,4,13,30,0);
  class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
  static now(){return f.getTime();}} window.Date=D;})()`;

/* The shape a real Motherhood record would have once collection opens. No
   field of this is written by the app today — it is injected here so the
   boundary is tested against the thing it exists to contain, rather than
   against an empty object that would pass by accident. */
const SENSITIVE = {
  enabled: true,
  stage: 'postpartum',
  weeksPostpartum: 7,
  feeds: [{ date:'2026-09-03', at:'02:40', minutes:25 },
          { date:'2026-09-03', at:'05:10', minutes:20 }],
  childWakes: [{ date:'2026-09-03', count:2, whoGotUp:'me' }],
  cycle: { tracking:true, lastPeriod:'2026-08-20' }
};

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const open = async (opts = {}) => {
    const ctx = await b.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:2,
      isMobile:true, hasTouch:true, timezoneId:'Asia/Dubai' });
    const errs = [];
    await ctx.addInitScript(clockAt);
    await ctx.addInitScript(seed());
    if (opts.motherhood) {
      await ctx.addInitScript(`(()=>{localStorage.setItem('${MKEY}',
        JSON.stringify(${JSON.stringify(opts.motherhood)}));})()`);
    }
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(600);
    return { ctx, p, errs };
  };

  /* Every string that must never appear in a file leaving the device. */
  const SECRETS = ['postpartum', 'weeksPostpartum', 'childWakes', 'lastPeriod',
                   'feeds', 'motherhood', '2026-08-20'];

  /* ================================================================
     1. OFF IS INDISTINGUISHABLE FROM NEVER HAVING BEEN HERE
     ================================================================ */
  {
    const c = await open();
    /* The threat this measures is someone picking up the phone, not someone
       running devtools. So it reads the rendered interface, excluding the
       inline <script> — in a single-file app with no build step the
       module's own source is in the page for every user, identically,
       whether they have ever enabled it or not. That source says nothing
       about THIS participant, which is the distinction that matters and
       which check 2 below pins down. The limitation is recorded in
       MOTHERHOOD.md §7 rather than hidden behind a narrower assertion. */
    const v = await c.p.evaluate(mkey => {
      const rendered = [...document.body.querySelectorAll('*')]
        .filter(n => n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE')
        .map(n => `${n.id} ${n.className} ${n.getAttribute('aria-label') || ''}`)
        .join(' ');
      return {
        enabled: window.__motherhood.enabled(),
        stored: localStorage.getItem(mkey),
        markupHits: (rendered.match(/motherhood|postpartum|nightfeed|night-feed/gi) || []).length,
        textHits: (document.body.innerText.match(/motherhood|postpartum|night feed/gi) || []).length
      };
    }, MKEY);

    check('Off by default', v.enabled === false);
    check('And off writes nothing at all — no key, no flag, no residue',
          v.stored === null, String(v.stored));
    check('No Motherhood element, id or label exists in the rendered page',
          v.markupHits === 0, `${v.markupHits} occurrences`);
    check('And nothing Motherhood-shaped is readable on screen',
          v.textHits === 0, `${v.textHits} occurrences`);
    check('No console errors with the module off', c.errs.length === 0, c.errs.join(' | '));
    await c.ctx.close();
  }

  /* ================================================================
     2. THE MODULE IS NOT IN `state` — H1, H2 and H3 at the root
     ================================================================ */
  {
    const c = await open({ motherhood: SENSITIVE });
    const v = await c.p.evaluate(mkey => {
      const exported = JSON.stringify(window.__motherhood.exported());
      return {
        enabled: window.__motherhood.enabled(),
        storedSeparately: localStorage.getItem(mkey) !== null,
        mainBlob: localStorage.getItem('sleepsphere_state_v2'),
        exported
      };
    }, MKEY);

    check('The module reads back when it is on', v.enabled === true);
    check('It is stored under its own key, not inside the app state',
          v.storedSeparately === true);

    /* The real guarantee behind the source-presence limitation above: the
       module's code is in every copy of the app identically, so finding it
       there tells an onlooker nothing about whose phone they are holding.
       If this ever fails, the module has started leaving a participant-
       specific trace in the document and the discretion claim is void. */
    const off = await open();
    const [srcOff, srcOn] = await Promise.all([
      off.p.evaluate(() => document.documentElement.innerHTML.length),
      c.p.evaluate(() => document.documentElement.innerHTML.length)
    ]);
    const marks = await Promise.all([
      off.p.evaluate(() => (document.documentElement.innerHTML.match(/motherhood/gi) || []).length),
      c.p.evaluate(() => (document.documentElement.innerHTML.match(/motherhood/gi) || []).length)
    ]);
    check('The document carries the same Motherhood source either way',
          marks[0] === marks[1] && marks[0] > 0, `${marks[0]} off vs ${marks[1]} on`);
    check('So the page cannot be told apart by length either',
          Math.abs(srcOff - srcOn) === 0, `${srcOff} off vs ${srcOn} on`);
    await off.ctx.close();

    /* H2. The main blob is what both JSON exports serialise. */
    for (const secret of SECRETS) {
      check(`The main state blob never contains "${secret}"`,
            !v.mainBlob.toLowerCase().includes(secret.toLowerCase()));
    }
    for (const secret of SECRETS) {
      check(`The exported object never contains "${secret}"`,
            !v.exported.toLowerCase().includes(secret.toLowerCase()));
    }
    check('No console errors with the module on', c.errs.length === 0, c.errs.join(' | '));
    await c.ctx.close();
  }

  /* ================================================================
     3. DENY BY DEFAULT — the filter excludes what it was never told about
     ================================================================ */
  {
    const c = await open({ motherhood: SENSITIVE });
    /* Simulate the exact mistake the architecture exists to survive:
       somebody, later, writes a Motherhood field onto `state` instead of
       into the module. The export must drop it anyway. */
    const v = await c.p.evaluate(() => {
      const dirty = {
        version:3, settings:{ name:'Insiyah', motherhoodStage:'postpartum' },
        mornings:[], motherhoodFeeds:[{ at:'02:40' }],
        motherhood:{ lastPeriod:'2026-08-20' }
      };
      const out = JSON.stringify(window.__motherhood.exported(dirty));
      return { out, allowlist: window.__motherhood.exportable,
               keptName: JSON.parse(out).settings.name };
    });

    check('The allowlist is empty, so nothing is permitted out today',
          Array.isArray(v.allowlist) && v.allowlist.length === 0,
          JSON.stringify(v.allowlist));
    check('A Motherhood key written onto state by mistake is still dropped',
          !v.out.includes('motherhoodFeeds') && !v.out.includes('"motherhood"'), v.out.slice(0, 200));
    check('A Motherhood key inside settings is dropped too',
          !v.out.includes('motherhoodStage'));
    check('And the far more sensitive value inside it goes with it',
          !v.out.includes('2026-08-20'));
    check('While ordinary settings survive the filter untouched',
          v.keptName === 'Insiyah', v.keptName);
    await c.ctx.close();
  }

  /* ================================================================
     4. THE RESEARCH EXPORT IS BYTE-IDENTICAL, ON AND OFF
     ================================================================ */
  {
    const grab = async motherhoodState => {
      const c = await open(motherhoodState ? { motherhood: motherhoodState } : {});
      const files = await c.p.evaluate(() => {
        /* Capture what download() would write, without writing it. */
        const seen = {};
        const realCreate = document.createElement.bind(document);
        const realBlobUrl = URL.createObjectURL;
        let pending = null;
        URL.createObjectURL = blob => { pending = blob; return 'blob:stub'; };
        document.createElement = tag => {
          const node = realCreate(tag);
          if (tag === 'a') {
            const realClick = node.click.bind(node);
            node.click = () => { seen[node.download] = pending; };
            void realClick;
          }
          return node;
        };
        document.getElementById('exportStudy').click();
        const names = Object.keys(seen);
        URL.createObjectURL = realBlobUrl;
        return Promise.all(names.map(n => seen[n].text().then(t => [n, t])))
          .then(pairs => Object.fromEntries(pairs));
      });
      const errs = c.errs;
      await c.ctx.close();
      return { files, errs };
    };

    const without = await grab(null);
    const with_ = await grab(SENSITIVE);

    const csvName = Object.keys(without.files).find(n => n.endsWith('.csv') && !n.includes('dictionary'));
    const dictName = Object.keys(without.files).find(n => n.includes('dictionary'));

    check('The research CSV exports in both cases', Boolean(csvName), String(csvName));
    check('The research export is BYTE-IDENTICAL with the module on',
          without.files[csvName] === with_.files[csvName],
          `${(without.files[csvName]||'').length} vs ${(with_.files[csvName]||'').length} chars`);
    check('And so is the data dictionary',
          without.files[dictName] === with_.files[dictName]);

    const header = (without.files[csvName] || '').split('\n')[0];
    check('The export is still exactly 50 columns',
          header.split(',').length === 50, `${header.split(',').length} columns`);
    for (const secret of SECRETS) {
      check(`The research CSV never contains "${secret}"`,
            !(with_.files[csvName] || '').toLowerCase().includes(secret.toLowerCase()));
    }
    /* The presence flag the product owner approved is a SEPARATE, later
       change with its own schema bump and its own consent wording. Until
       then its absence is the correct state, and this says so out loud. */
    check('No presence flag has been slipped in ahead of its consent wording',
          !/motherhood|module_enabled/i.test(header), header.slice(0, 120));
    check('No console errors exporting either way',
          [...without.errs, ...with_.errs].length === 0,
          [...without.errs, ...with_.errs].join(' | '));
  }

  /* ================================================================
     5. ERASE MEANS ERASE
     ================================================================ */
  {
    const c = await open({ motherhood: SENSITIVE });
    c.p.on('dialog', d => d.accept());
    const before = await c.p.evaluate(k => localStorage.getItem(k) !== null, MKEY);
    await c.p.evaluate(() => document.getElementById('eraseData').click());
    await c.p.waitForTimeout(400);
    const after = await c.p.evaluate(k => ({
      motherhood: localStorage.getItem(k),
      enabled: window.__motherhood.enabled()
    }), MKEY);

    check('The module was there before erase', before === true);
    check('Erase everything erases the module too — it is not a survivor',
          after.motherhood === null, String(after.motherhood));
    check('And it reads back as off afterwards', after.enabled === false);
    await c.ctx.close();
  }

  /* ================================================================
     6. THE EXISTING APP IS UNTOUCHED
     ================================================================ */
  {
    const c = await open({ motherhood: SENSITIVE });
    const v = await c.p.evaluate(() => ({
      schema: window.__motherhood.exported().version,
      mornings: window.__motherhood.exported().mornings.length,
      revisions: Array.isArray(window.__motherhood.exported().morningRevisions),
      tabs: [...document.querySelectorAll('.nav button[data-view]')].map(n => n.dataset.view).join(','),
      trusted: window.__trustedMornings().length
    }));
    check('SCHEMA_VERSION is still 3', v.schema === 3, String(v.schema));
    check('Both existing morning records survive the module', v.mornings === 2, String(v.mornings));
    check('The revision array is intact', v.revisions === true);
    check('Recording integrity still reads the same records', v.trusted === 2, String(v.trusted));
    check('Navigation is still exactly four tabs',
          v.tabs === 'today,twin,learn,data', v.tabs);
    await c.ctx.close();
  }

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})();
