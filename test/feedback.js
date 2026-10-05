/**
 * Tester feedback reaching a real inbox.
 *
 * Two routes, because either alone has a hole: a same-origin POST that only
 * exists once the site is on Netlify, and the tester's own mail app, which
 * works anywhere but costs a tap.
 *
 * The failure this guards is the quiet third option — a Send button that
 * looks like it worked and posted into nothing. That is the same class of bug
 * as the storage one, and it would waste a tester's honest answer.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

// Seeded as an enrolled device: without a study block the app opens into
// fieldwork onboarding, which is correct behaviour and would block every
// check below. The seed stays at version 2 on purpose, so each run also
// exercises the v2 -> v3 migration.
const SEED = `(()=>{localStorage.setItem('sleepsphere_state_v2', JSON.stringify({
  version:2, settings:{welcomeSeen:true, openingOff:true, mode:'dark', target:480}, study:{onboarded:true, participantId:'P001', startDate:'2026-09-01', enrolledAt:'2026-09-01T06:00:00.000Z', consentAck:true, consentAt:'2026-09-01T06:00:00.000Z', cohort:'jamea-v1', schemaVersion:3, storageMode:'local', lastSeenDay:1},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}));})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });

  const open = async (postBehaviour) => {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
    const p = await ctx.newPage();
    const errs = [], posts = [], mails = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    // Catch the mail app being opened, which a headless browser cannot do.
    await p.addInitScript(() => {
      window.__mail = [];
      document.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('a[href^="mailto:"]');
        if (a) { window.__mail.push(a.href); e.preventDefault(); }
      }, true);
    });
    await p.addInitScript(SEED);
    // Stand in for Netlify, which only exists on a deployed site.
    await p.route('**/', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      posts.push(route.request().postData() || '');
      if (postBehaviour === 'accept') return route.fulfill({ status: 200, body: 'OK' });
      if (postBehaviour === 'reject') return route.fulfill({ status: 404, body: 'Not Found' });
      return route.abort('failed');            // offline
    });
    await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(1200);
    await p.evaluate(() => {
      document.getElementById('opening')?.remove();
      document.getElementById('welcomeOverlay')?.classList.remove('active');
      document.querySelector('.nav button[data-view="test"]')?.click();
    });
    await p.waitForTimeout(400);
    return { ctx, p, errs, posts, mails };
  };

  const fillAndSend = async (p, comment, name) => {
    await p.evaluate(() => document.querySelectorAll('.feedback-scale')
      .forEach(s => s.querySelectorAll('button')[3].click()));
    await p.locator('#feedbackText').fill(comment);
    if (name !== undefined) await p.locator('#feedbackName').fill(name);
    await p.locator('#feedbackForm button[type="submit"]').click();
    await p.waitForTimeout(900);
  };

  // ---- Netlify accepts it.
  const good = await open('accept');
  check('The screen says what leaves the device', /one thing that leaves/i.test(
    await good.p.locator('#test .callout.teal').first().innerText()));
  await good.p.selectOption('#feedbackDevice', 'apple watch');
  await fillAndSend(good.p, 'The stars are lovely', 'Insiyah');
  check('It posts the feedback', good.posts.length === 1, `${good.posts.length} post(s)`);
  const body = new URLSearchParams(good.posts[0] || '');
  check('Netlify can tell which form it is', body.get('form-name') === 'sleepsphere-feedback');
  check('The ratings actually arrive', body.get('clarity') === '4' && body.get('use') === '4',
        `clarity ${body.get('clarity')}, use ${body.get('use')}`);
  check('The comment arrives', body.get('comment') === 'The stars are lovely');
  // A field that does not reach the inbox is decoration. Both of these are
  // new, and both have to survive the trip.
  check('An optional name arrives when given', body.get('name') === 'Insiyah', body.get('name'));
  check('The device answer arrives', body.get('device') === 'apple watch', body.get('device'));
  check('No sleep data is sent', !/bedTime|wakeTime|sleepMinutes|mornings/.test(good.posts[0] || ''));
  check('It does not also open a mail app', (await good.p.evaluate(() => window.__mail.length)) === 0);
  const savedOk = await good.p.evaluate(() =>
    JSON.parse(localStorage.getItem('sleepsphere_state_v2')).feedback);
  check('It is kept locally too, and marked sent', savedOk.length === 1 && savedOk[0].sent === true);
  check('No console errors', good.errs.length === 0, good.errs.join(' | '));
  await good.ctx.close();

  // ---- Not on Netlify: the POST 404s. This is the case that must not fail
  // silently, because it is every host that is not Netlify.
  const notNetlify = await open('reject');
  await fillAndSend(notNetlify.p, 'Sent from somewhere that is not Netlify', '');
  const mailed = await notNetlify.p.evaluate(() => window.__mail);
  check('A rejected post falls back to the mail app', mailed.length === 1, `${mailed.length} mail(s)`);
  check('The mail is addressed somewhere real',
        /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/.test(mailed[0] || ''), (mailed[0] || '').slice(0, 40));
  // Leaving the name blank must stay anonymous, not send an empty line that
  // looks like a failure.
  check('A blank name reads as anonymous, not as missing',
        /anonymous/i.test(decodeURIComponent(mailed[0] || '')));
  check('The mail carries the answers, not an empty draft',
        /4\s*\/\s*5/.test(decodeURIComponent(mailed[0] || '')) &&
        /not Netlify/.test(decodeURIComponent(mailed[0] || '')));
  const savedBad = await notNetlify.p.evaluate(() =>
    JSON.parse(localStorage.getItem('sleepsphere_state_v2')).feedback);
  check('Nothing is lost when the post fails', savedBad.length === 1, `${savedBad.length} kept`);
  check('And it is not falsely marked as sent', savedBad[0].sent === false);
  await notNetlify.ctx.close();

  // ---- Offline: fetch throws rather than returning a status.
  const offline = await open('offline');
  await fillAndSend(offline.p, 'Offline on a train');
  check('A thrown network error falls back too',
        (await offline.p.evaluate(() => window.__mail.length)) === 1);
  // The browser logs a failed request to the console whatever the page does
  // about it, so that one line is noise. What matters is that nothing was
  // thrown out of the app and the fallback ran.
  const real = offline.errs.filter(e => !/ERR_FAILED|Failed to load resource/i.test(e));
  check('Nothing is thrown out of the app', real.length === 0, real.join(' | '));
  await offline.ctx.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
