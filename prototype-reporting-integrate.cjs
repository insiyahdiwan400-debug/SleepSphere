/* Development-only, guarded integration of isolated consent controls.
 * Does not transmit data or change sleep/Motherhood storage schemas.
 * Usage in local checkout: node prototype-reporting-integrate.cjs --apply
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const GRID_ANCHOR = '          <div class="grid">\n            <article class="card span-5">\n              <div class="card-label">Three things to test</div>';
const TAIL_ANCHOR = '  <script src="flight-cabin.js"></script>\n</body>';
const CONSENT_CARD = `          <div class="grid">
            <article class="card span-12 no-print" id="ss-prototype-consent-root" aria-label="Optional prototype reporting controls"></article>
            <article class="card span-5">
              <div class="card-label">Three things to test</div>`;
const LOADER = `  <script src="flight-cabin.js"></script>
  <!-- Development consent preview only. No reporting endpoint is connected. -->
  <script src="prototype-reporting-consent.js" defer></script>
  <script src="prototype-reporting-consent-ui.js" defer></script>
  <script src="prototype-reporting-embed.js" defer></script>
  <script>
    window.addEventListener('DOMContentLoaded', function () {
      try {
        if (window.SleepSpherePrototypeReportingEmbed &&
            window.SleepSpherePrototypeReporting &&
            window.SleepSpherePrototypeConsentUI) {
          window.SleepSpherePrototypeReportingEmbed.mount(
            document, window.localStorage,
            window.SleepSpherePrototypeReporting,
            window.SleepSpherePrototypeConsentUI
          );
        }
      } catch (_) { /* Diagnostics never block sleep tracking. */ }
    });
  </script>
</body>`;
function occurrences(source, needle) { return source.split(needle).length - 1; }
function integrate(source) {
  if (typeof source !== 'string') throw new TypeError('Expected HTML text');
  const hasCard = source.includes('id="ss-prototype-consent-root"');
  const hasLoader = source.includes('src="prototype-reporting-embed.js"');
  if (hasCard && hasLoader) return source;
  if (hasCard || hasLoader) throw new Error('Partial integration: refusing to change index.html');
  if (occurrences(source, GRID_ANCHOR) !== 1 || occurrences(source, TAIL_ANCHOR) !== 1) {
    throw new Error('Expected unique integration anchors: refusing to change index.html');
  }
  if (occurrences(source, '<script src="motherhood.js"></script>') !== 1 ||
      occurrences(source, '<script src="motherhood-ui.js"></script>') !== 1 ||
      !source.includes('id="morning"') || !source.includes('id="plan"')) {
    throw new Error('Core tracking or Motherhood references not found');
  }
  return source.replace(GRID_ANCHOR, CONSENT_CARD).replace(TAIL_ANCHOR, LOADER);
}
if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply') {
    console.error('Refusing to write without explicit --apply');
    process.exitCode = 2;
  } else {
    const target = path.join(__dirname, 'index.html');
    const before = fs.readFileSync(target, 'utf8');
    const after = integrate(before);
    if (after !== before) fs.writeFileSync(target, after, 'utf8');
    console.log(after === before ? 'Already integrated' : 'Updated local index.html (no deployment)');
  }
}
module.exports = { integrate };
