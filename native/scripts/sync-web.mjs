/**
 * Copies the shipped web app into native/www for Capacitor.
 *
 * The web app stays at the repository root so the existing Netlify deploy
 * keeps working untouched; this is the only place that knows how to turn
 * it into the native bundle. Two deliberate differences in the native copy:
 *
 *  - the service worker is dropped. Capacitor already serves the app from
 *    the bundle, and a second cache layer only creates stale-asset bugs.
 *  - a small bridge script is appended so the app can find the native
 *    plugins when they exist and fall back to manual entry when they do not.
 */
import { copyFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const out = join(here, '..', 'www');

const ASSETS = [
  'manifest.webmanifest',
  'favicon.svg',
  'sleepsphere-icon-192.png',
  'sleepsphere-icon-512.png'
];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

let html = await readFile(join(repo, 'index.html'), 'utf8');

// The service worker is the web deployment's offline story; inside the
// native bundle it is redundant and can serve yesterday's build.
html = html.replace(
  /if \('serviceWorker' in navigator[\s\S]*?\n    \}\n/,
  "// Service worker intentionally omitted in the native build.\n"
);

// Load the bridge before the app's own script so window.SleepSphereNative
// exists by the time the app initialises.
html = html.replace('<script>', '<script src="./native-bridge.js"></script>\n  <script>');

await writeFile(join(out, 'index.html'), html, 'utf8');
await copyFile(join(here, 'native-bridge.js'), join(out, 'native-bridge.js'));
for (const asset of ASSETS) await copyFile(join(repo, asset), join(out, asset));

console.log(`Built native/www (${ASSETS.length + 2} files)`);
