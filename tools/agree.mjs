// Token Radar v5 — page/board agreement check (build-time only).
// Opens the built dashboard for a few protocols, reads the farm plan the
// page renders in the detail drawer, and compares it step-for-step with
// board.json. The page recomputes the plan from the same derivation, so
// any drift between the two copies of the logic shows up here.
// Usage: node tools/agree.mjs <out-dir>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire('/home/hatch/workspace/pwtest/node_modules/playwright-core/package.json');
const { chromium } = require('playwright-core');

const outDir = process.argv[2];
const board = JSON.parse(readFileSync(join(outDir, 'board.json'), 'utf8'));
const rows = board.rows;
const picks = [rows[0], rows[1], rows[4], rows[50], rows[100], rows[rows.length - 1]];

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let bad = 0;
for (const r of picks) {
  await page.goto('about:blank');
  await page.goto(pathToFileURL(join(outDir, 'dashboard', 'index.html')).href + '#p=' + r.slug, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const shown = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#detail .steps li')];
    return items.map((li) => li.textContent.replace(/\s+/g, ' ').trim());
  });
  // The page renders action in <b> and "Cost: … Time: …" in a span: join
  // them the way board.json stores them (one space between action and Cost).
  const expected = r.farm_steps.map((s) => s.replace(/\s+/g, ' ').trim());
  const joined = shown.map((s) => s.replace(/^(.+?)(Cost:)/, '$1 $2'));
  const match = joined.length === expected.length && joined.every((s, i) => s === expected[i]);
  // Budget shown in the drawer must equal board.json's farm_budget_usd.
  const budgetText = await page.evaluate(() => document.querySelector('#detail .budget b')?.textContent ?? '');
  const budgetOk = budgetText.startsWith('$' + r.farm_budget_usd + ' ');
  console.log(`${match && budgetOk ? 'AGREE' : 'DRIFT'}  #${r.rank} ${r.slug}: ${joined.length} steps, budget ${budgetText.slice(0, 40)}`);
  if (!match || !budgetOk) {
    bad++;
    for (let i = 0; i < Math.max(joined.length, expected.length); i++) {
      if (joined[i] !== expected[i]) {
        console.log('  page :', joined[i]);
        console.log('  board:', expected[i]);
      }
    }
    if (!budgetOk) console.log('  budget board.json:', r.farm_budget_usd);
  }
}
// Live tab renders the live set.
await page.goto('about:blank');
await page.goto(pathToFileURL(join(outDir, 'dashboard', 'index.html')).href + '#tab=live', { waitUntil: 'load' });
await page.waitForTimeout(400);
const liveRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
console.log(`live tab rows: ${liveRows} (expect 24)`);
if (liveRows !== 24) bad++;

await browser.close();
if (errors.length) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(bad === 0 ? 'page and board agree' : `${bad} mismatch(es)`);
process.exit(bad === 0 ? 0 : 1);
