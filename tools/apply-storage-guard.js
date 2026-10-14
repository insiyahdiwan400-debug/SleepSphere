/**
 * One-time safe migration guard patch for index.html.
 * Run: node tools/apply-storage-guard.js
 * Then: node test/storage-schema-guard.js
 * This edits the working copy only. Commit the resulting index.html separately.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');
function change(from, to) {
  const at = html.indexOf(from);
  if (at < 0 || html.indexOf(from, at + 1) !== -1)
    throw new Error('Missing or repeated patch anchor: ' + from.slice(0, 65));
  html = html.replace(from, to);
}
change(
  `        loadState.corrupt = true;
        return clone(defaults);`,
  `        loadState.corrupt = true;
        loadState.protectedRaw = raw;
        return clone(defaults);`
);
change(
  `      // A future version, written by a newer build on the same device. Keep
      // the data rather than discarding it; the shape is additive so far.
      if (stored && Number(stored.version) > 3) {
        loadState.futureVersion = Number(stored.version);
        return shapeState(stored);
      }

      const migrated = clone(defaults);`,
  `      // Show future data best-effort, but never write it back as v3.
      if (stored && Number(stored.version) > SCHEMA_VERSION) {
        loadState.futureVersion = Number(stored.version);
        loadState.protectedRaw = raw;
        return shapeState(stored);
      }
      // An existing unknown primary-key schema is not legacy-key data.
      if (stored && raw) {
        loadState.unsupportedVersion = String(stored.version ?? 'unknown');
        loadState.protectedRaw = raw;
        return clone(defaults);
      }

      const migrated = clone(defaults);`
);
change(
  `    function saveState() {
      const written = store.set(STORAGE_KEY, JSON.stringify(state));`,
  `    function saveState() {
      // Preserve the original bytes if this build cannot safely read them.
      if (loadState.corrupt || loadState.futureVersion || loadState.unsupportedVersion) {
        if (!saveState.warned) {
          saveState.warned = true;
          renderStorageWarning();
          toast('Saved data protected. New changes cannot be saved.');
        }
        return false;
      }
      const written = store.set(STORAGE_KEY, JSON.stringify(state));`
);
change(
  `      const broken = !store.healthy || document.documentElement.dataset.storage === 'unavailable';
      node.hidden = !broken;`,
  `      const protectedState = Boolean(loadState.corrupt || loadState.futureVersion || loadState.unsupportedVersion);
      const broken = protectedState || !store.healthy || document.documentElement.dataset.storage === 'unavailable';
      node.hidden = !broken;
      if (protectedState) {
        const title = node.querySelector('strong');
        const why = document.getElementById('storageWarningWhy');
        const fix = node.querySelector('.storage-fix');
        const button = document.getElementById('storageWarningExport');
        if (title) title.textContent = 'Saved data protected — new changes cannot be saved.';
        if (why) why.textContent = loadState.corrupt
          ? 'SleepSphere cannot read the saved data. The original is untouched.'
          : loadState.futureVersion
            ? 'Data from a newer SleepSphere version is protected from this older build.'
            : 'An unrecognized saved-data format is protected from overwrite.';
        if (fix) fix.textContent = 'Do not clear site data. Download the original and use a compatible version.';
        if (button) button.textContent = 'Download original saved data';
      }`
);
change(
  `    $('#storageWarningExport')?.addEventListener('click', () => $('#exportBackup')?.click());`,
  `    $('#storageWarningExport')?.addEventListener('click', () => {
      if (loadState.protectedRaw != null) {
        download('sleepsphere-original-saved-data.txt', loadState.protectedRaw, 'text/plain');
      } else {
        $('#exportBackup')?.click();
      }
    });`
);
fs.writeFileSync(file, html, 'utf8');
console.log('Patched index.html. Run node test/storage-schema-guard.js before committing.');
