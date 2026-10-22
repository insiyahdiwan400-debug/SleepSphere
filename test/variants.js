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

    /* The check that was missing, and that let a broken feature ship.
       Asserting the flag was stored and the URL changed proves nothing
       about what a tester can see: in Simple, Flight and Plain the
       classic markup renders at zero size, so the switcher and the
       feedback form were both present and both invisible. A tester who
       switched away could neither switch back nor send feedback. */
    const seen = await p.evaluate(() => {
      const vis = el => {
        if (!el) return 'absent';
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' ||
            Number(style.opacity) < 0.05) return 'hidden';
        return (box.width > 0 && box.height > 0) ? 'visible' : 'zero-size';
      };
      const escape = document.getElementById('variantEscape');
      return {
        escape: vis(escape),
        escapeTap: escape ? Math.round(escape.getBoundingClientRect().height) : 0,
        rendered: (document.body.innerText || '').trim().length
      };
    });
    check('2 · ' + label + ' renders something',
      seen.rendered > 40, seen.rendered + ' chars');
    check('2 · ' + label + ' leaves a visible way back to feedback',
      seen.escape === 'visible', seen.escape);
    check('2 · ' + label + ' way back is tappable',
      seen.escapeTap >= 44, seen.escapeTap + 'px');

    /* It must not sit on top of the variant's own controls. It did: once
       Flight composed its question low in the frame, a pill in the
       bottom-left corner landed across the third time button. */
    const clash = await p.evaluate(() => {
      const pill = document.getElementById('variantEscape');
      if (!pill) return { pill: false };
      const a = pill.getBoundingClientRect();
      const hits = [];
      document.querySelectorAll('button, a, input, [role="button"]').forEach(other => {
        if (other === pill || pill.contains(other)) return;
        const b = other.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) return;
        if (a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom) {
          hits.push((other.textContent || other.tagName).trim().slice(0, 24));
        }
      });
      const atCentre = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
      return { pill: true, hits, onTop: atCentre === pill || pill.contains(atCentre) };
    });
    check('2 · ' + label + ' way back covers nothing tappable',
      clash.pill && clash.hits.length === 0, (clash.hits || []).join(', ') || 'clear');
    check('2 · ' + label + ' way back is the thing you hit when you tap it',
      clash.onTop === true, String(clash.onTop));
    await ctx.close();
  }

  /* ================================================================
     2b. The way back actually goes back.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser, '?go=test');
    await p.evaluate(() => {
      [...document.querySelectorAll('.variant-btn')]
        .find(b => b.querySelector('strong').textContent === 'Plain').click();
    });
    await p.waitForTimeout(2200);
    await p.evaluate(() => document.getElementById('variantEscape').click());
    await p.waitForTimeout(2200);
    const back = await p.evaluate(() => {
      const row = document.getElementById('variantRow');
      const form = document.getElementById('feedbackForm');
      const box = row ? row.getBoundingClientRect() : null;
      const fbox = form ? form.getBoundingClientRect() : null;
      return {
        ui: localStorage.getItem('ss_ui'), world: localStorage.getItem('ss_world'),
        switcherVisible: Boolean(box && box.width > 0 && box.height > 0),
        formVisible: Boolean(fbox && fbox.width > 0 && fbox.height > 0),
        escapeGone: document.getElementById('variantEscape') === null
      };
    });
    check('2b · The way back restores Classic',
      back.ui === 'classic' && back.world === 'off', JSON.stringify(back));
    check('2b · The switcher is visible again', back.switcherVisible);
    check('2b · The feedback form is reachable again', back.formVisible);
    check('2b · And the way back removes itself once home', back.escapeGone);
    check('2b · No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2c. Classic does not carry the escape it does not need.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, '?go=test');
    const classic = await p.evaluate(() => ({
      escape: document.getElementById('variantEscape') === null,
      switcher: (() => { const r = document.getElementById('variantRow');
        const b = r && r.getBoundingClientRect();
        return Boolean(b && b.width > 0 && b.height > 0); })()
    }));
    check('2c · Classic shows no escape control', classic.escape);
    check('2c · Classic shows the switcher inline', classic.switcher);
    await ctx.close();
  }

  /* ================================================================
     2d. A variant that paints its own ground must set its own ink.

     Plain draws light paper. Text inside it inherited the app's
     dark-theme near-white, so the heading rendered at 1.16:1 against a
     3:1 requirement — not low contrast, invisible. Measured rather than
     eyeballed, because "looks fine to me" is how it shipped.
     ================================================================ */
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
    });
    await ctx.addInitScript(SEED);
    await ctx.addInitScript(`(()=>{try{localStorage.setItem('ss_world','plain');
      localStorage.setItem('ss_ui','classic');localStorage.setItem('ss_concept','off');}catch(e){}})()`);
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2500);
    const worst = await p.evaluate(() => {
      const channel = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = c => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
      const rgb = s => (s.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);
      let low = null;
      document.querySelectorAll('.w-plain, .w-plain *').forEach(el => {
        const box = el.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return;
        const text = (el.textContent || '').trim();
        if (!text || el.children.length > 0) return;      /* leaf nodes only */
        const style = getComputedStyle(el);
        let node = el, bg = null;
        while (node && !bg) {
          const c = getComputedStyle(node).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) bg = c;
          node = node.parentElement;
        }
        if (!bg) return;
        const a = lum(rgb(style.color)), b = lum(rgb(bg));
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const need = parseFloat(style.fontSize) >= 24 ? 3 : 4.5;
        if (!low || ratio - need < low.margin) {
          low = { ratio: +ratio.toFixed(2), need, margin: ratio - need,
                  text: text.slice(0, 40), color: style.color, bg };
        }
      });
      return low;
    });
    await ctx.close();
    check('2d · Plain meets WCAG AA contrast throughout',
      worst !== null && worst.margin >= 0,
      worst ? worst.ratio + ':1 (needs ' + worst.need + ') "' + worst.text + '"' : 'nothing measured');
  }

  /* ================================================================
     3. The soundscape layers.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser, '?go=learn');
        /* The mixer used to be a tile called 'Sounds'. It is now reached
       from the hub's 'Open the mixer' link, the sound cards being the
       quick way in. */
    const opened = await p.evaluate(() => {
      const link = [...document.querySelectorAll('.ex-link')]
        .find(b => /Open the mixer/.test(b.textContent));
      if (!link) return false;
      link.click();
      return true;
    });
    await p.waitForTimeout(1000);
    const r = await p.evaluate(() => ({
      labels: [...document.querySelectorAll('.ex-layer-row .ex-toggle')].map(b => b.textContent),
      specs: (window.SSExplore && window.SSExplore.LAYERS || []).map(s => s.id),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    check('3 · The mixer opens from the hub', opened);
    check('3 · Seven layers are offered', r.specs.length === 7, r.specs.join(','));
    check('3 · Including the two added for testers',
      r.specs.includes('leaves') && r.specs.includes('snowfield'), r.specs.join(','));
    check('3 · And the cabin hum for Flight Mode',
      r.specs.includes('engine'), r.specs.join(','));
    check('3 · Every layer has a control', r.labels.length === r.specs.length + 1,
      r.labels.join(','));          /* +1 for Mute */
    check('3 · No horizontal overflow with seven layers', r.overflow <= 0, r.overflow + 'px');
    check('3 · No console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     3b. The audio context is woken, not merely built.

     iOS hands back a suspended context and keeps it suspended until
     resume() is called inside a tap. Nothing resumed it, so the graph
     was built, the toggles lit, and nothing was ever audible. This
     container's Chromium does not enforce that policy, so the state
     cannot be reproduced here — what IS asserted is that the code calls
     resume on the start path and on returning to the app, which is the
     thing that was missing.
     ================================================================ */
  {
    const source = fs.readFileSync(path.join(ROOT, 'explore.js'), 'utf8');
    check('3b · There is a wake() that resumes a suspended context',
      /function wake\s*\(\)\s*\{[\s\S]{0,400}?ctx\.resume\(\)/.test(source));
    check('3b · ensureContext wakes on creation and on reuse',
      (source.match(/function ensureContext[\s\S]*?\n  \}/) || [''])[0].split('wake()').length - 1 >= 2,
      'wake() calls inside ensureContext');
    check('3b · Returning to the app resumes a live soundscape',
      /visibilitychange[\s\S]{0,420}?nodes\.length\s*\)\s*wake\(\)/.test(source));
    check('3b · A refused resume cannot throw out of the toggle',
      /r\.catch\(\(\) => \{\}\)/.test(source) || /catch\s*\(\)\s*=>\s*\{\}/.test(source));

    /* And it does still start, here, where the policy is lenient. */
    const ctx2 = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
    });
    await ctx2.addInitScript(SEED);
    await ctx2.addInitScript(`(()=>{window.__ctxs=[];const A=window.AudioContext||window.webkitAudioContext;
      if(!A)return;function W(...a){const c=new A(...a);window.__ctxs.push(c);return c;}
      W.prototype=A.prototype;window.AudioContext=W;window.webkitAudioContext=W;})()`);
    const p2 = await ctx2.newPage();
    await p2.goto(BASE + '?go=learn', { waitUntil: 'networkidle' });
    await p2.waitForTimeout(1500);
    /* Straight off the hub now, which is the path a person actually
       takes: one tap on the Explore tab, one on the sound. */
    await p2.evaluate(() => {
      const card = [...document.querySelectorAll('.ex-sound')]
        .find(x => /Rain/.test(x.textContent));
      if (card) card.click();
    });
    await p2.waitForTimeout(1600);
    const audio = await p2.evaluate(() => ({
      contexts: (window.__ctxs || []).length,
      states: (window.__ctxs || []).map(c => c.state),
      advanced: (window.__ctxs || []).some(c => c.currentTime > 0.2)
    }));
    await ctx2.close();
    check('3b · Tapping a layer creates exactly one context',
      audio.contexts === 1, String(audio.contexts));
    check('3b · It is running, not suspended',
      audio.states.every(s => s === 'running'), audio.states.join(','));
    check('3b · And its clock is advancing', audio.advanced);
  }

  /* ================================================================
     3c. The switcher is findable without being told where it is.
     ================================================================ */
  {
    const { ctx, p } = await open(browser, '?go=data');
    const found = await p.evaluate(async () => {
      const b = document.getElementById('goVariants');
      if (!b) return { button: false };
      const label = b.textContent.trim();
      b.click();
      await new Promise(r => setTimeout(r, 600));
      const card = document.getElementById('variantCard');
      const box = card ? card.getBoundingClientRect() : null;
      return {
        button: true, label,
        cardVisible: Boolean(box && box.width > 0 && box.height > 0),
        onScreen: Boolean(box && box.top < innerHeight && box.bottom > 0)
      };
    });
    check('3c · "Me" offers a way to the interfaces', found.button);
    check('3c · Labelled for what it does, not "Give feedback"',
      found.label === 'Try another look', String(found.label));
    check('3c · It lands on the switcher', found.cardVisible && found.onScreen,
      JSON.stringify(found));
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
