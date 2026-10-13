/**
 * Interface variants and the soundscape layers.
 *
 * Both exist so testers can answer "which deserves to stay". Both are
 * reachable in production, so both need a suite rather than a one-off
 * script run once and thrown away.
 *
 * The variant switcher is the riskier of the two: it writes three
 * interface flags and reloads. The thing that must never be true is that
 * switching how the app looks disturbs what it holds, so that is asserted
 * directly rather than inferred.
 *
 * Needs the repository served at :8099.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8099/index.html';
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
};

/* A settled participant: onboarded, welcome seen, one record to protect. */
const SEED = `(()=>{try{localStorage.setItem('sleepsphere_state_v2',JSON.stringify({
  version:3, settings:{welcomeSeen:true, mode:'dark'},
  mornings:[{id:'protected-record', date:'2026-10-12'}],
  morningRevisions:[], bioCheckins:[], thoughts:[], scans:[], feedback:[],
  experimentHistory:[], trip:null,
  study:{onboarded:true, participantId:'TEST', cohort:'jamea-v1', schemaVersion:3, storageMode:'local'}
}));}catch(e){}})()`;

async function open(browser, query) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true
  });
  const errs = [];
  await ctx.addInitScript(SEED);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE + (query || ''), { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  return { ctx, p, errs };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });

  /* ================================================================
     1. The switcher is present, and honest about where you are.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser, '?go=test');
    const r = await p.evaluate(() => {
      const row = document.getElementById('variantRow');
      const btns = [...(row ? row.querySelectorAll('.variant-btn') : [])];
      return {
        present: !!row,
        count: btns.length,
        labels: btns.map(b => b.querySelector('strong').textContent),
        pressed: btns.filter(b => b.getAttribute('aria-pressed') === 'true')
                     .map(b => b.querySelector('strong').textContent),
        showingNow: btns.filter(b => /Showing now/.test(b.textContent)).length,
        minTap: Math.min(...btns.map(b => b.getBoundingClientRect().height)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    check('1 · The variant switcher renders', r.present);
    check('1 · Four variants', r.count === 4, String(r.count));
    check('1 · Named Classic, Simple, Flight, Plain',
      r.labels.join(',') === 'Classic,Simple,Flight,Plain', r.labels.join(','));
    check('1 · Exactly one is marked active', r.pressed.length === 1, r.pressed.join(','));
    check('1 · Classic is the default', r.pressed[0] === 'Classic', r.pressed[0]);
    check('1 · Only the active one says "Showing now"', r.showingNow === 1, String(r.showingNow));
    check('1 · Tap targets are at least 44px', r.minTap >= 44, r.minTap + 'px');
    /* The bare-1fr bug has shipped three times in this file. */
    check('1 · No horizontal overflow', r.overflow <= 0, r.overflow + 'px');
    check('1 · No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. Switching works, switches the others OFF, and keeps the data.
     ================================================================ */
  for (const [label, wantUi, wantWorld] of [
    ['Simple', 'calm', 'off'],
    ['Flight', 'classic', 'flight'],
    ['Plain',  'classic', 'plain']
  ]) {
    const { ctx, p, errs } = await open(browser, '?go=test');
    await p.evaluate(name => {
      [...document.querySelectorAll('.variant-btn')]
        .find(b => b.querySelector('strong').textContent === name).click();
    }, label);
    await p.waitForTimeout(2200);
    const r = await p.evaluate(() => {
      let state = null;
      try { state = JSON.parse(localStorage.getItem('sleepsphere_state_v2') || '{}'); } catch (e) {}
      return {
        ui: localStorage.getItem('ss_ui'),
        world: localStorage.getItem('ss_world'),
        concept: localStorage.getItem('ss_concept'),
        search: location.search,
        records: (state && state.mornings || []).length,
        kept: Boolean(state && (state.mornings || []).some(m => m.id === 'protected-record'))
      };
    });
    check('2 · ' + label + ' sets ss_ui=' + wantUi, r.ui === wantUi, String(r.ui));
    check('2 · ' + label + ' sets ss_world=' + wantWorld, r.world === wantWorld, String(r.world));
    /* Only one layer may be live; concepts are switched off explicitly
       rather than left to whichever script runs first. */
    check('2 · ' + label + ' switches concepts off', r.concept === 'off', String(r.concept));
    check('2 · ' + label + ' returns to the tester screen',
      r.search.includes('go=test'), r.search);
    check('2 · ' + label + ' does not disturb the records',
      r.records === 1 && r.kept, r.records + ' record(s), kept=' + r.kept);
    check('2 · ' + label + ' raises no console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     3. The soundscape layers.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser, '?go=learn');
    const opened = await p.evaluate(() => {
      const tile = [...document.querySelectorAll('.ex-tile')]
        .find(t => /Sounds/.test(t.textContent));
      if (!tile) return false;
      tile.click();
      return true;
    });
    await p.waitForTimeout(1000);
    const r = await p.evaluate(() => ({
      labels: [...document.querySelectorAll('.ex-layer-row .ex-toggle')].map(b => b.textContent),
      specs: (window.SSExplore && window.SSExplore.LAYERS || []).map(s => s.id),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    check('3 · The Sounds practice opens', opened);
    check('3 · Six layers are offered', r.specs.length === 6, r.specs.join(','));
    check('3 · Including the two added for testers',
      r.specs.includes('leaves') && r.specs.includes('snowfield'), r.specs.join(','));
    check('3 · Every layer has a control', r.labels.length === r.specs.length + 1,
      r.labels.join(','));          /* +1 for Mute */
    check('3 · No horizontal overflow with six layers', r.overflow <= 0, r.overflow + 'px');
    check('3 · No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     4. The blurb does not lie about what is inside.

     The tile said "Rain, wind, water, night air" for a build that had
     six layers. A list in prose beside a list in code drifts, so it is
     asserted rather than trusted.
     ================================================================ */
  {
    const source = fs.readFileSync(path.join(ROOT, 'explore.js'), 'utf8');
    const blurb = (/\['Sounds',\s*'([^']+)'/.exec(source) || [])[1] || '';
    const { ctx, p } = await open(browser, '');
    const ids = await p.evaluate(() => (window.SSExplore && window.SSExplore.LAYERS || [])
      .map(s => s.label.toLowerCase()));
    await ctx.close();
    const lower = blurb.toLowerCase();
    /* "Water" is the label for the stream layer and "Snowfield" is named
       as "snow" in prose; both are checked by their visible word. */
    const missing = ids
      .map(l => l === 'water' ? 'water' : l === 'snowfield' ? 'snow' : l)
      .filter(word => !lower.includes(word));
    check('4 · The Sounds blurb names every layer it ships',
      missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : blurb);
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
