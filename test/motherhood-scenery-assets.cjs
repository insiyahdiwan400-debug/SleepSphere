// Motherhood photographic scenery release gate.
// Visual approval is human-attested, not machine image recognition.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'motherhood.css'), 'utf8');
const scenes = ['aurora', 'starlake', 'firstlight', 'moonmeadow'];
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(root, 'media/motherhood/scenery-approvals.json'), 'utf8'));
} catch {
  console.error('BLOCK RELEASE: scenery approvals manifest missing or invalid');
  process.exit(1);
}
let failures = 0;
for (const scene of scenes) {
  const relative = 'media/motherhood/' + scene + '.webp';
  const approval = manifest.scenes && manifest.scenes[scene];
  let bytes;
  try { bytes = fs.readFileSync(path.join(root, relative)); }
  catch { console.error('MISSING: ' + relative); failures++; continue; }
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const valid = css.includes(relative) && bytes.length >= 1024 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    approval && approval.sha256 === hash &&
    approval.visualApproval && approval.visualApproval.approved === true &&
    approval.visualApproval.noAircraft === true &&
    approval.visualApproval.photographic === true &&
    approval.visualApproval.reviewer &&
    approval.rights && approval.rights.cleared === true &&
    approval.rights.source && approval.rights.license;
  if (!valid) { console.error('UNAPPROVED OR INVALID: ' + relative); failures++; }
}
if (failures) {
  console.error('BLOCK RELEASE: ' + failures + ' scene(s) failed checks.');
  process.exitCode = 1;
} else {
  console.log('All four Motherhood scenery assets passed recorded approval checks.');
}
