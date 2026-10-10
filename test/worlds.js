/**
 * SleepSphere Worlds — the shared shell.
 *
 * The product promise is that a world is a skin over one engine: changing
 * it changes nothing you have recorded, scheduled or set. That promise is
 * worth exactly as much as this file, so the central check compares the
 * whole stored state byte-for-byte across a switch.
 *
 * The other half is the anti-engagement rule. The brief asks that the
 * environment make the experience more enjoyable WITHOUT encouraging
 * night-time screen use, so these checks assert that the night screen is
 * actively boring: one line, one way out, no progress to watch, and no
 * world able to override it.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let fails = 0;
const check = (n, ok, x = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' :: ' + x : ''}`); if (!ok) fails++;
};

const KEY = 'sleepsphere_state_v2';
const BASE = { welcomeSeen:true, openingOff:true, mode:'dark', target:480, faith:'on',
               usualWake:'06:30', fajrHabit:'return',
               place:{ latitude:25.2048, longitude:55.2708, name:'Dubai' }, name:'' };
const PLAN = { mode:'fajr', fajr:'04:45', returnSleep:'05:10', finalWake:'06:30',
  wakeAnchor:'04:45', savedDate:'2026-09-09', settle:15, wind:30,
  windStart:1310, settleStart:1340, sleepStart:1355, blockOne:400, blockTwo:80,
  total:480, target:480, afterFajr:'return', brainDay:'hifz',
  obligation:{ kind:'jamea', time:'07:30' }, source:'build-my-night' };
const MORNINGS = Array.from({ length: 8 }, (_, i) => ({
  id:`fix-${i+1}`, supersedes:null,
  date:`2026-09-0${i+1}`, createdAt:`2026-09-0${i+1}T06:40:00.000Z`,
  bedTime:'22:30', sleepTime:'23:00', wakeTime:'06:30', awakeMinutes:15, napMinutes:0,
  opportunityMinutes:480, sleepMinutes:400+i*6, efficiency:Math.round((400+i*6)/480*100),
  rest:3+(i%3), energy:3, focus:3+(i%2), calm:3, fajr:'ready', factors:[], note:'',
  targetMinutes:480, intent:'restore', planSnapshot:null, brainDay:'normal',
  bioHarmonyId:null, bioHarmonySnapshot:null, experimentId:null,
  adherence:'not_applicable', demo:false, verified:'entered' }));

const seedScript = (plan, mornings) => {
  const state = { version:3, settings:BASE, plan:plan||null, brainDays:{},
    mornings:mornings||[], morningRevisions:[],
    study:{ onboarded:true, participantId:'P001', startDate:'2026-09-01',
      enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true,
      consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3,
      storageMode:'local', lastSeenDay:9 },
    bioCheckins:[], thoughts:[], scans:[], feedback:[], experimentHistory:[] };
  return `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(state))});`;
};
const clockAt = (h, mi) => `(()=>{const R=Date;const f=new R(2026,8,9,${h},${mi},0);
  class D extends R{constructor(...a){if(!a.length)return super(f.getTime());return super(...a);}
  static now(){return f.getTime();}} window.Date=D;})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });

  const open = async (world, h, mi, plan, mornings, journey) => {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
      isMobile:true, hasTouch:true, timezoneId:'Asia/Dubai' });
    const errs = [];
    await ctx.addInitScript(clockAt(h, mi));
    await ctx.addInitScript(seedScript(plan, mornings));
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push(String(e)));
    const q = `?world=${world}` + (journey ? `&journey=${journey}` : '');
    await p.goto('http://localhost:8099/index.html' + q, { waitUntil:'networkidle' });
    await p.waitForTimeout(900);
    return { ctx, p, errs };
  };

  /* ================================================================
     1. THE PROMISE — a world switch touches nothing
     ================================================================ */
  {
    const { ctx, p, errs } = await open('flight', 20, 40, PLAN, MORNINGS);
    const before = await p.evaluate(k => localStorage.getItem(k), KEY);

    /* Switch through every registered world and back. */
    const ids = await p.evaluate(() => window.__world.worlds());
    check('More than one world is registered', ids.length >= 2, ids.join(','));

    for (const id of ids.concat(['flight'])) {
      await p.evaluate(i => { localStorage.setItem('ss_world', i); }, id);
      await p.goto(`http://localhost:8099/index.html?world=${id}`, { waitUntil:'networkidle' });
      await p.waitForTimeout(600);
    }
    const after = await p.evaluate(k => localStorage.getItem(k), KEY);
    check('Switching worlds leaves the stored state byte-identical',
          before === after, `${(before||'').length} vs ${(after||'').length} chars`);

    const same = await p.evaluate(k => {
      const s = JSON.parse(localStorage.getItem(k));
      return { mornings: s.mornings.length, plan: Boolean(s.plan),
               planWind: s.plan && s.plan.windStart,
               wake: s.settings.usualWake, habit: s.settings.fajrHabit,
               schema: s.version, participant: s.study.participantId };
    }, KEY);
    check('Records survive a world change', same.mornings === 8, String(same.mornings));
    check('The schedule survives', same.plan === true && same.planWind === 1310, String(same.planWind));
    check('Preferences survive', same.wake === '06:30' && same.habit === 'return');
    check('Schema and participant untouched',
          same.schema === 3 && same.participant === 'P001');
    check('No console errors across the switches', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. EVERY WORLD SUPPORTS EVERY JOURNEY
     ================================================================ */
  for (const world of ['flight', 'plain']) {
    for (const journey of ['tonight', 'logbook', 'learn', 'you', 'adjust']) {
      const { ctx, p, errs } = await open(world, 20, 40, PLAN, MORNINGS, journey);
      const v = await p.evaluate(() => {
        const vis = n => n.offsetParent !== null && n.getClientRects().length > 0;
        const root = document.getElementById('world');
        return { mounted: Boolean(root),
                 content: root ? (root.innerText || '').trim().length : 0,
                 buttons: root ? [...root.querySelectorAll('button')].filter(vis).length : -1,
                 scrollW: document.documentElement.scrollWidth };
      });
      check(`${world}/${journey} renders`, v.mounted && v.content > 10, `${v.content} chars`);
      check(`${world}/${journey} no horizontal scroll`, v.scrollW <= 390, `${v.scrollW}px`);
      check(`${world}/${journey} no console errors`, errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
  }

  /* ================================================================
     3. THE SHARED ENGINE — the Flight world shows the real plan
     ================================================================ */
  {
    const { ctx, p } = await open('flight', 20, 40, PLAN, MORNINGS);
    const v = await p.evaluate(() => {
      const times = [...document.querySelectorAll('.f-time')].map(n => n.textContent.trim());
      const codes = [...document.querySelectorAll('.f-code')].map(n => n.textContent.trim());
      return { times, codes, title: (document.querySelector('.f-title')||{}).textContent };
    });
    check('Flight shows the engine\'s real wind-down',
          /9:50/.test(v.title || ''), v.title);
    check('And the whole night as stages, in order',
          v.codes.join(',') === 'GATE,DEP,WPT,CONT,ARR', v.codes.join(','));
    check('With the real Fajr among them',
          v.times.includes('4:45 AM'), v.times.join(' · '));
    await ctx.close();
  }

  /* ================================================================
     4. PLANNING AND ADJUSTING GO THROUGH THE ENGINE
     ================================================================ */
  {
    const { ctx, p } = await open('flight', 20, 40, null, MORNINGS);
    const proposed = await p.evaluate(() => Boolean(JSON.parse(
      localStorage.getItem('sleepsphere_state_v2')).plan));
    check('No plan is saved merely by proposing one', proposed === false);
    await p.locator('#wGo').click();
    await p.waitForTimeout(600);
    const saved = await p.evaluate(() => {
      const pl = JSON.parse(localStorage.getItem('sleepsphere_state_v2')).plan;
      return pl && { wind: pl.windStart, source: pl.source };
    });
    check('Filing the night writes through the engine\'s own path',
          saved && saved.source === 'build-my-night', JSON.stringify(saved));
    await ctx.close();
  }
  {
    const { ctx, p } = await open('flight', 20, 40, PLAN, MORNINGS, 'adjust');
    const before = await p.evaluate(() => JSON.parse(
      localStorage.getItem('sleepsphere_state_v2')).plan.windStart);
    await p.locator('.f-opt[data-sit="later"]').click();
    await p.waitForTimeout(500);
    await p.locator('#wRefile').click();
    await p.waitForTimeout(700);
    const after = await p.evaluate(() => JSON.parse(
      localStorage.getItem('sleepsphere_state_v2')).plan.windStart);
    check('A schedule change re-files a different night', after !== before,
          `${before} -> ${after}`);
    await ctx.close();
  }

  /* ================================================================
     5. RECORDING STILL GOES THROUGH THE ONE WRITE PATH
     ================================================================ */
  {
    const { ctx, p } = await open('flight', 6, 50, PLAN, MORNINGS, 'logbook');
    const seg = await p.locator('.f-seg button[data-v="4"]');
    check('The arrival report is offered in the morning', await seg.count() === 1);
    await seg.click();
    await p.waitForTimeout(800);
    const rec = await p.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
      const last = s.mornings[s.mornings.length - 1];
      return { count: s.mornings.length, rest: last.rest, calm: last.calm,
               quick: last.quick, verified: last.verified };
    });
    check('It writes exactly one record', rec.count === 9, String(rec.count));
    check('With the rating given', rec.rest === 4, String(rec.rest));
    check('And calm left null, because it was never asked', rec.calm === null, String(rec.calm));
    check('Marked as the quick path, as the engine does', rec.quick === true);
    await ctx.close();
  }

  /* ================================================================
     6. THE NIGHT IS BORING, BY CONSTRUCTION
     ================================================================ */
  for (const world of ['flight', 'plain']) {
    const { ctx, p } = await open(world, 22, 50, PLAN, MORNINGS);
    const before = await p.evaluate(() => {
      const r = document.getElementById('world');
      return { buttons: [...r.querySelectorAll('button')].length };
    });
    await p.evaluate(() => window.__world.settle());
    await p.waitForTimeout(500);
    const after = await p.evaluate(() => {
      const r = document.getElementById('world');
      const vis = n => n.offsetParent !== null && n.getClientRects().length > 0;
      return {
        buttons: [...r.querySelectorAll('button')].filter(vis).length,
        tabs: document.querySelectorAll('.w-tabs button').length,
        words: (r.innerText || '').trim().split(/\s+/).length,
        stages: r.querySelectorAll('.f-row, .w-plain-list dt').length,
        animations: document.getAnimations().filter(a => a.playState === 'running').length,
        screens: +(document.documentElement.scrollHeight / 844).toFixed(2)
      };
    });
    check(`${world} · after goodnight exactly one action remains`,
          after.buttons === 1, `${before.buttons} before, ${after.buttons} after`);
    check(`${world} · navigation is withdrawn for the night`, after.tabs === 0, String(after.tabs));
    check(`${world} · no stage-by-stage progress to watch`, after.stages === 0, String(after.stages));
    check(`${world} · it fits one screen`, after.screens <= 1.05, `${after.screens} screens`);
    check(`${world} · and nothing is animating`, after.animations === 0, String(after.animations));
    check(`${world} · under thirty words`, after.words <= 30, `${after.words} words`);
    await ctx.close();
  }

  /* The guard is the shell's, not the world's: a world cannot render past
     it even when its own scene would have drawn something. */
  {
    const { ctx, p } = await open('flight', 22, 50, PLAN, MORNINGS);
    await p.evaluate(() => window.__world.settle());
    await p.waitForTimeout(400);
    const leaked = await p.evaluate(() =>
      document.querySelectorAll('.f-pass, .f-board, .f-route').length);
    check('A world cannot draw its own night screen past the guard',
          leaked === 0, String(leaked));
    await p.locator('#wMorning').click();
    await p.waitForTimeout(600);
    const back = await p.evaluate(() => ({
      tabs: document.querySelectorAll('.w-tabs button').length,
      pass: document.querySelectorAll('.f-pass').length
    }));
    check('And the morning gives the product back', back.tabs === 4 && back.pass === 1,
          JSON.stringify(back));
    await ctx.close();
  }

  /* ================================================================
     7. NOTHING LEAVES THE DEVICE
     ================================================================ */
  {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true,
      hasTouch:true, timezoneId:'Asia/Dubai' });
    const external = [];
    await ctx.route('**', route => {
      const u = route.request().url();
      if (!/^http:\/\/localhost:8099/.test(u) && !u.startsWith('data:') && !u.startsWith('blob:')) {
        external.push(u);
      }
      route.continue();
    });
    await ctx.addInitScript(clockAt(20, 40));
    await ctx.addInitScript(seedScript(PLAN, MORNINGS));
    const p = await ctx.newPage();
    await p.goto('http://localhost:8099/index.html?world=flight', { waitUntil:'networkidle' });
    await p.waitForTimeout(800);
    await p.locator('.w-tabs button[data-journey="logbook"]').click();
    await p.waitForTimeout(500);
    check('No request leaves the device', external.length === 0, external.join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})();
