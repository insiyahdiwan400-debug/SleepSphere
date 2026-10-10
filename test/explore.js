/**
 * SleepSphere Explore.
 *
 * The brief's requirement for this module is blunt — "Every visible Explore
 * feature must function", "Ensure every interaction has a meaningful
 * outcome" — so the suite's job is to press each one and check something
 * actually happened, rather than that a screen opened.
 *
 * Four things get more attention than the rest, because they are the ones
 * that would be quietly wrong:
 *
 *   · Audio must be silent until asked, and must STOP on leaving. A
 *     soundscape still playing behind a closed screen is a battery
 *     complaint and a surprise in a quiet room.
 *   · Breathing must not ask anyone to hold their breath.
 *   · Reflection and Gratitude must write to the app's existing journal,
 *     not a second store that nobody's erase button knows about.
 *   · Nothing may count, score, or streak a calming practice.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = 'http://localhost:8099/index.html';
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
  await p.evaluate(() => document.querySelector('.nav button[data-view="learn"]').click());
  await p.waitForTimeout(400);
  return { ctx, p, errs };
}
const text = p => p.evaluate(() => document.querySelector('.ex-body').innerText);

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  /* ================================================================
     1. The index, and that every tile leads somewhere.
     ================================================================ */
  {
    const { ctx, p, errs } = await open(browser);
    const n = await p.evaluate(() => document.querySelectorAll('.ex-tile').length);
    check('Six practices are offered', n === 6, String(n));

    /* Press every one. A tile that opens nothing is the exact failure the
       brief names, and it is invisible until someone presses it. */
    const opened = [];
    for (let i = 0; i < n; i++) {
      await p.evaluate(k => document.querySelectorAll('.ex-tile')[k].click(), i);
      await p.waitForTimeout(260);
      const title = await p.evaluate(() => {
        const t = document.querySelector('.ex-bar-title');
        return t ? t.textContent : null;
      });
      const hasBody = await p.evaluate(() =>
        Boolean(document.querySelector('.ex-body')) &&
        document.querySelector('.ex-body').innerText.trim().length > 40);
      opened.push(title && hasBody ? title : 'EMPTY:' + i);
      await p.evaluate(() => window.SSExplore.close());
      await p.waitForTimeout(140);
    }
    check('Every tile opens a screen with something on it',
      opened.every(t => !String(t).startsWith('EMPTY')), opened.join(' / '));
    check('Closing removes the layer every time',
      (await p.evaluate(() => document.querySelectorAll('.ex-layer').length)) === 0);
    check('No console errors opening all six', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ================================================================
     2. Body scan: a real sequence, with a pause that pauses.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await p.evaluate(() => window.SSExplore.open('Body scan'));
    await p.waitForTimeout(300);

    const regions = await p.evaluate(() => window.SSExplore.REGIONS.length);
    check('It walks the body in steps', regions >= 10, String(regions) + ' regions');
    check('Every region carries its own words, not just a name',
      await p.evaluate(() => window.SSExplore.REGIONS.every(r => r[1] && r[1].length > 50)));
    check('It starts at the feet, not the head',
      await p.evaluate(() => /feet/i.test(window.SSExplore.REGIONS[0][0])));

    /* Accessibility: the guidance must be readable text present at rest,
       not something only conveyed by a timer or an animation. */
    const words = await p.evaluate(() => {
      const w = document.querySelector('.ex-words');
      return { len: w.textContent.length, live: w.getAttribute('aria-live') };
    });
    check('The guidance is on screen before anything starts', words.len > 60, words.len + ' chars');
    check('And is announced as it changes', words.live === 'polite', String(words.live));

    await p.evaluate(() => [...document.querySelectorAll('.ex-primary')]
      .find(b => /Begin/.test(b.textContent)).click());
    await p.waitForTimeout(2300);
    const ticking = await p.evaluate(() => document.querySelector('.ex-clock').textContent);
    check('It runs on its own', /\d+s/.test(ticking), ticking);

    await p.evaluate(() => [...document.querySelectorAll('.ex-primary')]
      .find(b => /Pause/.test(b.textContent)).click());
    const a = await p.evaluate(() => document.querySelector('.ex-clock').textContent);
    await p.waitForTimeout(1600);
    const b2 = await p.evaluate(() => document.querySelector('.ex-clock').textContent);
    check('Pause actually stops the clock', a === 'Paused' && b2 === 'Paused', a + ' / ' + b2);

    await p.evaluate(() => [...document.querySelectorAll('.ex-quiet')]
      .find(x => /Next/.test(x.textContent)).click());
    await p.waitForTimeout(200);
    check('And it can be stepped by hand',
      /Step 2 of/.test(await p.evaluate(() => document.querySelector('.ex-eyebrow').textContent)));
    await ctx.close();
  }

  /* ================================================================
     3. Breathing: no holds, ever.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    await p.evaluate(() => window.SSExplore.open('Breathing'));
    await p.waitForTimeout(300);

    const paces = await p.evaluate(() => window.SSExplore.PACES);
    check('No pace asks for a breath-hold',
      paces.every(x => !('hold' in x) && x.in > 0 && x.out > 0),
      paces.map(x => x.in + '/' + x.out).join(' '));
    check('And at least one has a longer out-breath than in',
      paces.some(x => x.out > x.in));

    await p.evaluate(() => document.querySelector('.ex-primary').click());
    await p.waitForTimeout(1300);
    const cue = await p.evaluate(() => document.querySelector('.ex-cue').textContent);
    const cnt = await p.evaluate(() => document.querySelector('.ex-clock').textContent);
    check('A cue appears while it runs', /Breathe (in|out)/.test(cue), cue);
    /* The count exists so the practice works without watching the ring —
       which is the whole accessibility question for a breathing pacer. */
    check('With a count that does not need the animation', /Breathe (in|out) · \d/.test(cnt), cnt);
    await ctx.close();
  }
  {
    const { ctx, p } = await open(browser, { reducedMotion: 'reduce' });
    await p.evaluate(() => window.SSExplore.open('Breathing'));
    await p.waitForTimeout(250);
    await p.evaluate(() => document.querySelector('.ex-primary').click());
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => ({
      transform: document.querySelector('.ex-ring').style.transform,
      cue: document.querySelector('.ex-cue').textContent,
      count: document.querySelector('.ex-clock').textContent
    }));
    check('Under reduced motion the ring is not driven', r.transform === '', '"' + r.transform + '"');
    check('But the practice still works in words',
      /Breathe (in|out)/.test(r.cue) && /\d/.test(r.count), r.cue + ' / ' + r.count);
    await ctx.close();
  }

  /* ================================================================
     4. Audio. The part most likely to misbehave in someone's bedroom.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    check('Silent before anything is opened',
      (await p.evaluate(() => window.SSExplore.audioRunning())) === false);

    await p.evaluate(() => window.SSExplore.open('Sounds'));
    await p.waitForTimeout(300);
    check('And still silent when the screen opens',
      (await p.evaluate(() => window.SSExplore.audioRunning())) === false);

    const layers = await p.evaluate(() => document.querySelectorAll('.ex-layer-row .ex-toggle').length);
    check('Each sound is its own layer', layers >= 4, String(layers) + ' layers plus master');

    const sliderBefore = await p.evaluate(() =>
      document.querySelectorAll('.ex-layer-row input[type=range]')[0].disabled);
    check('A layer\'s volume is inert until that layer is on', sliderBefore === true);

    await p.evaluate(() => document.querySelectorAll('.ex-layer-row .ex-toggle')[0].click());
    await p.waitForTimeout(800);
    check('Turning one on starts sound',
      (await p.evaluate(() => window.SSExplore.audioRunning())) === true);
    check('And hands over its own volume',
      (await p.evaluate(() => document.querySelectorAll('.ex-layer-row input[type=range]')[0].disabled)) === false);

    /* Mute and master must exist and be operable — the brief asks for
       volume adjustment, mute, pause and stopping behaviour by name. */
    const hasMute = await p.evaluate(() =>
      [...document.querySelectorAll('.ex-toggle')].some(b => /mute/i.test(b.textContent)));
    check('There is a mute', hasMute);

    await p.evaluate(() => window.SSExplore.close());
    await p.waitForTimeout(800);
    check('Leaving the screen stops the sound',
      (await p.evaluate(() => window.SSExplore.audioRunning())) === false);

    /* No files. Synthesised audio is why this works offline and why there
       is nothing to licence or mis-attribute. */
    const requests = [];
    p.on('request', r => { if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(r.url())) requests.push(r.url()); });
    await p.evaluate(() => window.SSExplore.open('Sounds'));
    await p.waitForTimeout(200);
    await p.evaluate(() => document.querySelectorAll('.ex-layer-row .ex-toggle')[1].click());
    await p.waitForTimeout(900);
    check('No audio file is ever fetched', requests.length === 0, requests.join(', ') || 'none');
    await p.evaluate(() => window.SSExplore.close());
    await ctx.close();
  }

  /* ================================================================
     5. Writing goes into the app's own journal.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    const before = await p.evaluate(() => window.SS.engine.thoughts().length);

    await p.evaluate(() => window.SSExplore.open('Reflection'));
    await p.waitForTimeout(250);
    await p.fill('.ex-layer textarea', 'The viva is Thursday and I keep rehearsing it.');
    await p.fill('.ex-layer input[type=text]', 'Read the methods section once, in the morning.');
    await p.evaluate(() => document.querySelector('.ex-primary').click());
    await p.waitForTimeout(350);

    const after = await p.evaluate(() => window.SS.engine.thoughts());
    check('Reflection writes one entry', after.length === before + 1, String(after.length));
    check('Typed as a reflection', after[0].type === 'reflection', after[0].type);
    check('Keeping the optional next step', /methods section/.test(after[0].next || ''));

    /* The point of reusing the journal: one store, one erase path, one
       export. A second store is a second thing nobody deletes. */
    const persisted = await p.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('sleepsphere_state_v2'));
      return { n: s.thoughts.length, text: s.thoughts[0] && s.thoughts[0].text, keys: Object.keys(s) };
    });
    check('It lands in state.thoughts, not a store of its own',
      persisted.n === before + 1 && /viva/.test(persisted.text));
    check('And no new top-level store appeared',
      !persisted.keys.some(k => /explore|practice|gratitude|reflection/i.test(k)),
      persisted.keys.filter(k => /explore|practice/i.test(k)).join(',') || 'none');

    await p.evaluate(() => window.SSExplore.close());
    await p.evaluate(() => window.SSExplore.open('Gratitude'));
    await p.waitForTimeout(250);
    await p.fill('.ex-layer textarea', 'Walked home the long way.');
    await p.evaluate(() => document.querySelector('.ex-primary').click());
    await p.waitForTimeout(350);
    const g = await p.evaluate(() => window.SS.engine.thoughts()[0]);
    check('Gratitude is kept as its own type', g.type === 'gratitude', g.type);

    /* Empty input must not silently create a blank entry. */
    const n1 = await p.evaluate(() => window.SS.engine.thoughts().length);
    await p.evaluate(() => document.querySelector('.ex-primary').click());
    await p.waitForTimeout(250);
    check('An empty note is not saved',
      (await p.evaluate(() => window.SS.engine.thoughts().length)) === n1);
    check('And it says so rather than failing silently',
      /Nothing written/i.test(await text(p)));
    await ctx.close();
  }

  /* ================================================================
     6. Tone, sources, and the religious content left alone.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    /* The index lives on the page; the practices live in a layer that only
       exists while one is open. Read each from where it actually is. */
    let all = await p.evaluate(() => document.getElementById('explore').innerText);
    for (const id of ['Body scan', 'Breathing', 'Sounds', 'Reflection', 'Gratitude', 'About sleep']) {
      await p.evaluate(x => window.SSExplore.open(x), id);
      await p.waitForTimeout(220);
      all += '\n' + await text(p);
      await p.evaluate(() => window.SSExplore.close());
      await p.waitForTimeout(100);
    }
    const banned = ['streak', 'day in a row', 'well done', 'you failed', 'keep it up',
                    'don\'t break', 'score', 'level up', 'badge'];
    const found = banned.filter(w => all.toLowerCase().includes(w));
    check('Nothing counts, scores or streaks a practice', found.length === 0, found.join(', ') || 'clean');

    await p.evaluate(() => window.SSExplore.open('About sleep'));
    await p.waitForTimeout(250);
    const sources = await p.evaluate(() => document.querySelectorAll('.ex-source').length);
    const lessons = await p.evaluate(() => document.querySelectorAll('.ex-lesson').length);
    check('Every lesson carries a source', sources === lessons && lessons >= 5,
      lessons + ' lessons, ' + sources + ' sources');
    check('No lesson claims to be about this person\'s own sleep',
      /none of it is about your records/i.test(await text(p)));
    await p.evaluate(() => window.SSExplore.close());

    /* The verified dua and stillness material is NOT reimplemented here;
       a second copy is a second thing to keep correct. */
    const learn = await p.evaluate(() => document.getElementById('learn').innerText);
    check('The existing verified Arabic content is still on the Explore page',
      /وَجَعَلْنَا نَوْمَكُمْ سُبَاتًا/.test(learn));
    check('And Explore points to it rather than copying it',
      /where they already were/i.test(learn));
    await ctx.close();
  }

  /* ================================================================
     7. It fits a phone, and a Split View column.
     ================================================================ */
  {
    const { ctx, p } = await open(browser);
    for (const id of ['Body scan', 'Sounds', 'Reflection']) {
      await p.evaluate(x => window.SSExplore.open(x), id);
      await p.waitForTimeout(250);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(id + ' does not scroll sideways on a phone', over <= 1, over + 'px');
      await p.setViewportSize({ width: 262, height: 1135 });
      await p.waitForTimeout(300);
      const narrow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(id + ' survives a Split View column', narrow <= 1, narrow + 'px at 262');
      await p.setViewportSize({ width: 390, height: 844 });
      await p.waitForTimeout(200);
      await p.evaluate(() => window.SSExplore.close());
    }
    const small = await p.evaluate(() => {
      window.SSExplore.open('Sounds');
      return new Promise(r => setTimeout(() => r(
        [...document.querySelectorAll('.ex-layer button, .ex-layer input[type=range]')]
          .filter(b => b.offsetParent !== null)
          .filter(b => b.getBoundingClientRect().height < 32).length), 300));
    });
    check('Every control is big enough to hit', small === 0, String(small));
    await ctx.close();
  }

  await browser.close();
  console.log('');
  console.log(fail ? `${fail} FAILED, ${pass} passed` : 'ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
