/**
 * A vault that opens after it was locked.
 *
 * The app locks the Motherhood vault when it is backgrounded or the page
 * is hidden. Checking a passcode is 250,000 PBKDF2 iterations, which on a
 * phone is about a second — and both unlock() and createVault() awaited
 * across that second and then assigned the session unconditionally. So:
 * type the passcode, take a call, come back, and the vault is open with
 * no passcode asked for. The lock worked; the unlock simply outlived it.
 *
 * The checks in tests/ reach this through extracted source and stubbed
 * crypto, which is how the race is made deterministic. This suite is the
 * other half: the real module, the browser's real WebCrypto, real key
 * derivation, so the guard is proved where it actually has to hold. It
 * also proves the two things a guard like this usually breaks — the
 * correct passcode still works afterwards, and a wrong one is still
 * reported as wrong rather than as a cancellation.
 *
 * Needs the repository served at :8099.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let pass = 0, fail = 0;
const check = (l, ok, d) => { ok ? (pass++, console.log('PASS  ' + l + (d ? ' :: ' + d : ''))) : (fail++, console.log('FAIL  ' + l + (d ? ' :: ' + d : ''))); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => { try { document.getElementById('fwSkip').click(); } catch (e) {} });
  await p.waitForTimeout(700);

  check('The module is present', await p.evaluate(() => typeof window.SSMotherhood === 'object'));
  check('It exposes isAuthenticating', await p.evaluate(() => typeof window.SSMotherhood.isAuthenticating === 'function'));

  /* Real vault, real PBKDF2. */
  const made = await p.evaluate(async () => {
    await window.SSMotherhood.createVault('correct horse battery');
    await window.SSMotherhood.addEntry({ kind: 'day', note: 'kept across the lock' });
    return { unlocked: window.SSMotherhood.isUnlocked(), entries: window.SSMotherhood.liveEntries(window.SSMotherhood.vault()).length };
  });
  check('A vault is created and unlocked', made.unlocked === true);
  check('And an entry is stored in it', made.entries === 1, String(made.entries));

  /* The bug: lock while the key is being derived. */
  const race = await p.evaluate(async () => {
    window.SSMotherhood.lock();
    const pending = window.SSMotherhood.unlock('correct horse battery');
    const sawAuthenticating = window.SSMotherhood.isAuthenticating();
    window.SSMotherhood.lock();              // app backgrounded mid-derivation
    let threw = null;
    try { await pending; } catch (e) { threw = String(e.message); }
    return { sawAuthenticating, threw, unlocked: window.SSMotherhood.isUnlocked(),
             vault: window.SSMotherhood.vault() };
  });
  check('A pending unlock is visible as authenticating', race.sawAuthenticating === true);
  check('Locking during derivation rejects the unlock', /locked/.test(race.threw || ''), race.threw);
  check('And the vault stays locked', race.unlocked === false);
  check('And no decrypted records are left in memory', !race.vault, JSON.stringify(race.vault));

  /* A hidden page cannot finish an unlock either. */
  const hidden = await p.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    let threw = null;
    try { await window.SSMotherhood.unlock('correct horse battery'); } catch (e) { threw = String(e.message); }
    const out = { threw, unlocked: window.SSMotherhood.isUnlocked() };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    return out;
  });
  check('A hidden page cannot finish an unlock', /locked/.test(hidden.threw || ''), hidden.threw);
  check('And it is still locked afterwards', hidden.unlocked === false);

  /* Nothing was damaged: the real passcode still opens it, with the entry. */
  const after = await p.evaluate(async () => {
    await window.SSMotherhood.unlock('correct horse battery');
    return { unlocked: window.SSMotherhood.isUnlocked(),
             entries: window.SSMotherhood.liveEntries(window.SSMotherhood.vault()).map(e => e.note) };
  });
  check('The correct passcode still opens the vault', after.unlocked === true);
  check('And the entry survived every cancelled attempt',
    after.entries.join('|') === 'kept across the lock', after.entries.join('|'));

  /* A wrong passcode is still wrong, and still says so. */
  const wrong = await p.evaluate(async () => {
    window.SSMotherhood.lock();
    let threw = null;
    try { await window.SSMotherhood.unlock('not the passcode'); } catch (e) { threw = String(e.message); }
    return { threw, unlocked: window.SSMotherhood.isUnlocked() };
  });
  check('A wrong passcode is refused', wrong.unlocked === false);
  check('And is NOT reported as a cancellation', !/^locked$/.test(wrong.threw || ''), wrong.threw);

  check('No uncaught page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
