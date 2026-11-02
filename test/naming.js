/**
 * Names the interface is not allowed to use.
 *
 * "This replaces the name Restoration Twin. Never display the term
 * Restoration Twin in the user interface." A rename done by hand is
 * right once; this is what keeps it right, because the phrase lived in
 * thirteen places across five screens and the next person to write a
 * status line has no reason to know it is forbidden.
 *
 * It reads rendered text, not source. The source still contains the
 * phrase in two places on purpose — as the stored value of a feedback
 * option — and a grep could not tell that apart from a heading.
 *
 * That exception is the second half of this file. The feedback select's
 * value is what reaches the research CSV as most_useful, so changing
 * the label without pinning the value would have split the study's
 * vocabulary across the rename: older returns saying "Restoration Twin"
 * and newer ones saying "My Rest" for the same answer. The label moved;
 * the recorded value did not.
 *
 * Needs the repository served at :8099.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = 'http://localhost:8099/index.html';
const BANNED = /restoration twin/i;

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? ' :: ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
};

/* Evening, so the contextual night console is on screen rather than
   display:none — a screen that is not rendered cannot be checked. */
const EVENING = () => {
  const fixed = new Date(); fixed.setHours(20, 40, 0, 0);
  const Real = Date;
  window.Date = class extends Real {
    constructor(...a) { return a.length ? new Real(...a) : new Real(fixed); }
    static now() { return fixed.getTime(); }
  };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
  });
  const page = await ctx.newPage();
  await page.addInitScript(EVENING);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2300);

  /* Onboarding first: it is interface too, and it is what a new
     participant reads before anything else. */
  const onboarding = await page.evaluate(() => {
    const fw = document.getElementById('fieldwork');
    return fw && fw.classList.contains('active') ? (fw.innerText || '') : '';
  });
  check('The enrolment screens never say it',
    !BANNED.test(onboarding), (onboarding.match(/Restoration Twin/i) || [''])[0] || 'clean');

  await page.evaluate(() => { const b = document.getElementById('fwSkip'); if (b) b.click(); });
  await page.waitForTimeout(900);

  /* Every destination, as rendered. */
  const views = ['today', 'twin', 'learn', 'data', 'private'];
  for (const view of views) {
    const text = await page.evaluate(async (v) => {
      const tab = document.querySelector('.nav button[data-view="' + v + '"]');
      if (!tab) return null;
      tab.click();
      await new Promise(r => setTimeout(r, 650));
      const host = document.getElementById(v);
      return host ? (host.innerText || '') : '';
    }, view);
    check('The ' + view + ' destination never says it',
      text !== null && !BANNED.test(text),
      text === null ? 'destination missing' : (text.match(/Restoration Twin/i) || ['clean'])[0]);
  }

  /* The screens reached from inside Today, which carry most of the
     old wording: the planner, the morning form, the comparison. */
  const screens = ['plan', 'morning', 'compass', 'bio', 'experiment'];
  for (const screen of screens) {
    const text = await page.evaluate(async (s) => {
      const b = document.querySelector('[data-go="' + s + '"]');
      if (b) { b.click(); await new Promise(r => setTimeout(r, 650)); }
      const host = document.getElementById(s);
      return host ? (host.innerText || '') : null;
    }, screen);
    if (text === null) continue;
    check('The ' + screen + ' screen never says it',
      !BANNED.test(text), (text.match(/Restoration Twin/i) || ['clean'])[0]);
  }

  /* The navigation itself, and the page heading it sets. */
  const chrome = await page.evaluate(async () => {
    document.querySelector('.nav button[data-view="twin"]').click();
    await new Promise(r => setTimeout(r, 600));
    return {
      tabs: [...document.querySelectorAll('.nav button[data-view]')]
        .map(b => b.textContent.replace(/[^\w\s]/g, '').trim()).join(' | '),
      heading: (document.getElementById('pageEyebrow') || {}).textContent || '',
      title: (document.getElementById('pageTitle') || {}).textContent || ''
    };
  });
  check('No tab is named it', !BANNED.test(chrome.tabs), chrome.tabs);
  check('The destination is named My Rest',
    /my rest/i.test(chrome.tabs) && /my rest/i.test(chrome.heading),
    chrome.heading);
  check('And its page heading never says it',
    !BANNED.test(chrome.heading + ' ' + chrome.title), chrome.title);

  /* ================================================================
     The deliberate exception, and why it is one.
     ================================================================ */
  const feedback = await page.evaluate(async () => {
    document.querySelector('.nav button[data-view="data"]').click();
    await new Promise(r => setTimeout(r, 500));
    const most = document.getElementById('mostUseful');
    const least = document.getElementById('leastUseful');
    if (!most || !least) return { missing: true };
    const read = sel => [...sel.options].map(o => ({ label: o.textContent, value: o.value }));
    return { most: read(most), least: read(least) };
  });
  check('The feedback options are reachable', feedback.missing !== true);
  if (!feedback.missing) {
    const labels = [...feedback.most, ...feedback.least].map(o => o.label).join(' | ');
    check('No option is labelled with the old name', !BANNED.test(labels),
      (labels.match(/Restoration Twin/i) || ['clean'])[0]);
    const renamed = feedback.most.find(o => /my rest/i.test(o.label));
    check('The replacement is offered instead', Boolean(renamed), renamed ? renamed.label : 'absent');
    check('But what gets recorded is unchanged, so the study keeps one vocabulary',
      renamed && renamed.value === 'Restoration Twin',
      renamed ? renamed.value : 'n/a');
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) console.log('ALL CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
