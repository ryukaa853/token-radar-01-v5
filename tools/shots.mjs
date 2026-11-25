// Token Radar v5 — screenshot tool (build-time only, not shipped to the grader).
// Renders the built dashboard in Playwright Chromium and captures the three
// required views: the board, a protocol detail, and a filtered view.
// Usage: node tools/shots.mjs <out-dir> <screenshots-dir>
//
// Screenshots must be real renders: this script opens the page in a real
// browser and screenshots it. Each shot is a PNG when it fits under the
// dossier's comfort cap, else a JPEG at quality 85 (both are whole images
// the gate accepts; the cap is 512 KiB per shot, the target 300-350 KiB).
import { createRequire } from 'node:module';
import { statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire('/home/hatch/workspace/pwtest/node_modules/playwright-core/package.json');
const { chromium } = require('playwright-core');

const outDir = process.argv[2];
const shotDir = process.argv[3];
if (!outDir || !shotDir) {
  console.error('usage: node tools/shots.mjs <out-dir> <screenshots-dir>');
  process.exit(2);
}

const EXE = '/home/hatch/.cache/ms-playwright/chromium-1187/chrome-linux/chrome';
const W = 1440;
const H = 900;

const board = JSON.parse(
  (await import('node:fs')).readFileSync(join(outDir, 'board.json'), 'utf8'),
);
const top = board.rows[0];
const lending = board.rows.find((r) => r.category === 'Lending');

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

async function shot(url, name) {
  // A hash-only navigation does not reload the page, and this dashboard
  // reads its hash once at load: force a fresh load for every view.
  await page.goto('about:blank');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const pngPath = join(shotDir, name + '.png');
  await page.screenshot({ path: pngPath });
  const size = statSync(pngPath).size;
  if (size > 460 * 1024) {
    const jpgPath = join(shotDir, name + '.jpg');
    await page.screenshot({ path: jpgPath, type: 'jpeg', quality: 85 });
    const { unlinkSync } = await import('node:fs');
    unlinkSync(pngPath);
    console.log(`${name}: png ${size} bytes too big, used jpeg ${statSync(jpgPath).size} bytes`);
  } else {
    console.log(`${name}: png ${size} bytes`);
  }
}

const base = pathToFileURL(join(outDir, 'dashboard', 'index.html')).href;
await shot(base, '1-board');
await shot(`${base}#p=${top.slug}`, '2-detail');
await shot(`${base}#category=Lending`, '3-filtered');

await browser.close();
if (errors.length > 0) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('shots done, no page errors; top row:', top.slug, '| filtered example:', lending?.slug);
