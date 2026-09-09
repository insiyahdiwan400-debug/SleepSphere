/**
 * Deep links.
 *
 * One router serves three entry points that all mean the same thing:
 * sleepsphere://plan, myapp://plan, and ?go=plan. A link handed to a tester
 * has to behave the same whether they opened the prototype in Safari or
 * installed the real app, so they are tested together.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };

const SEED = `(()=>{localStorage.setItem('sleepsphere_state_v2', JSON.stringify({
  version:2, settings:{welcomeSeen:true, openingOff:true, mode:'dark', target:480},
  bioCheckins:[], mornings:[], thoughts:[], scans:[], feedback:[], experimentHistory:[]
}));})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(SEED);
  await p.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
  await p.waitForTimeout(900);

  const activeView = () => p.evaluate(() => document.querySelector('.view.active')?.id || null);
  const send = async url => {
    await p.evaluate(u => window.SleepSphereOpenURL(u), url);
    await p.waitForTimeout(350);
  };

  check('The router is exposed for the native layer',
        await p.evaluate(() => typeof window.SleepSphereOpenURL === 'function'));

  // Both schemes, same destination. myapp:// was asked for; sleepsphere://
  // is the one that should be published, since iOS does not reserve schemes.
  for (const scheme of ['sleepsphere', 'myapp']) {
    await send(`${scheme}://plan`);
    check(`${scheme}:// opens a named view`, await activeView() === 'plan', await activeView());
    await send(`${scheme}://travel`);
    check(`${scheme}:// routes to another view`, await activeView() === 'travel', await activeView());
  }

  // Shapes a link can realistically be written in.
  await send('myapp://twin');
  check('Host form works', await activeView() === 'twin');
  await send('myapp:///compass');
  check('Empty-host form works', await activeView() === 'compass', await activeView());
  await send('myapp://open/data');
  check('Path form works', await activeView() === 'data', await activeView());
  await send('MyApp://LEARN');
  check('Case is not significant', await activeView() === 'learn', await activeView());
  await send('myapp://plan?utm=x#frag');
  check('Query and fragment are ignored', await activeView() === 'plan', await activeView());

  // A link straight into a flow is the point of having deep links at all.
  await send('myapp://flow');
  check('A link can open the check-in', await p.locator('#flow').isVisible());
  await p.evaluate(() => document.getElementById('flowClose')?.click());
  await p.waitForTimeout(300);

  // And straight into Lazy mode, which is what a bedtime Shortcut wants.
  await send('myapp://lazy');
  check('A link can put you to bed', await p.locator('#lazyVeil').isVisible());
  const stored = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('sleepsphere_state_v2')).lazyNight);
  check('...and that really starts the night', Boolean(stored && stored.bedTime), JSON.stringify(stored));
  await p.evaluate(() => { document.getElementById('lazyVeil').hidden = true; });

  // Nonsense must not throw or navigate somewhere surprising.
  await send('myapp://not-a-real-screen');
  check('An unknown target is ignored, not obeyed', await activeView() !== null);
  check('Rubbish does not throw', await p.evaluate(() => {
    try { window.SleepSphereOpenURL(''); window.SleepSphereOpenURL(null);
          window.SleepSphereOpenURL('myapp://'); return true; } catch { return false; }
  }));
  check('No console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // The same target as a plain web link, which is how testers without the
  // app will get it.
  const web = await b.newContext({ viewport:{width:390,height:844}, isMobile:true });
  const wp = await web.newPage();
  await wp.addInitScript(SEED);
  await wp.goto('http://localhost:8099/index.html?go=travel', { waitUntil:'networkidle' });
  await wp.waitForTimeout(900);
  check('?go= reaches the same place in a browser',
        await wp.evaluate(() => document.querySelector('.view.active')?.id) === 'travel');
  await web.close();

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
