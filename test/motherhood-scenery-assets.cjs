// Motherhood release gate: run with node test/motherhood-scenery-assets.cjs
// Missing images must fail before production deployment.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'motherhood.css'), 'utf8');
const scenes = ['aurora', 'starlake', 'firstlight', 'moonmeadow'];
let missing = 0;
for (const scene of scenes) {
  const relative = 'media/motherhood/' + scene + '.webp';
  assert.ok(css.includes(relative), 'CSS must reference ' + relative);
  const full = path.join(root, relative);
  if (!fs.existsSync(full) || fs.statSync(full).size < 1000) {
    console.error('MISSING: ' + relative);
    missing++;
  } else {
    console.log('OK: ' + relative);
  }
}
if (missing) {
  console.error('BLOCK DEPLOYMENT: ' + missing + ' photographic scenery asset(s) missing.');
  process.exitCode = 1;
} else {
  console.log('All four Motherhood photographic assets exist.');
}
