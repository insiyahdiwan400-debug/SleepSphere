/**
 * Generates every icon and launch image from one source drawing.
 *
 * Change brand/icon-source.svg, run `node brand/make-assets.mjs`, and the
 * home-screen icon, the App Store icon and all the iOS launch images are
 * rebuilt together. Nothing is hand-exported, so they can never drift apart.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const svg = readFileSync(join(here, 'icon-source.svg'), 'utf8');

// The ground colour behind a launch image. Matches --sky-top at night so
// the transition from launch image to app is invisible.
const GROUND = '#07080C';

const ICONS = [
  ['sleepsphere-icon-192.png', 192],
  ['sleepsphere-icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['appstore-icon-1024.png', 1024]
];

// Portrait launch images for the iPhones people actually carry. Without
// these iOS shows a white flash on every cold start, which is the single
// clearest tell that something is a web page and not an app.
const SPLASH = [
  ['splash-1290x2796.png', 1290, 2796], // 15/16 Pro Max, 14 Pro Max
  ['splash-1179x2556.png', 1179, 2556], // 15/16, 14 Pro
  ['splash-1206x2622.png', 1206, 2622], // 16 Pro
  ['splash-1320x2868.png', 1320, 2868], // 16 Pro Max
  ['splash-1170x2532.png', 1170, 2532], // 14, 13, 12
  ['splash-1242x2688.png', 1242, 2688], // 11 Pro Max, XS Max
  ['splash-828x1792.png',   828, 1792], // 11, XR
  ['splash-1125x2436.png', 1125, 2436], // X, XS, 11 Pro
  ['splash-750x1334.png',   750, 1334], // SE 2/3, 8
  ['splash-1242x2208.png', 1242, 2208]  // 8 Plus
];

mkdirSync(join(repo, 'splash'), { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

for (const [name, size] of ICONS) {
  const context = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(`<body style="margin:0;background:${GROUND}">
    <div style="width:${size}px;height:${size}px">${svg.replace(/width="\d+"\s+height="\d+"/, `width="${size}" height="${size}"`)}</div></body>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(repo, name) });
  await context.close();
  console.log(`icon   ${name.padEnd(28)} ${size}x${size}`);
}

for (const [name, width, height] of SPLASH) {
  const mark = Math.round(Math.min(width, height) * 0.34);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(`<body style="margin:0;height:${height}px;background:${GROUND};display:grid;place-items:center">
    <div style="width:${mark}px;height:${mark}px;border-radius:${Math.round(mark*0.23)}px;overflow:hidden">
      ${svg.replace(/width="\d+"\s+height="\d+"/, `width="${mark}" height="${mark}"`)}
    </div></body>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(repo, 'splash', name) });
  await context.close();
  console.log(`splash ${name.padEnd(28)} ${width}x${height}`);
}

await browser.close();
console.log(`\nDone. ${ICONS.length} icons, ${SPLASH.length} launch images.`);
