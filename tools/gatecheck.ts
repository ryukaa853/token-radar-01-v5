// Token Radar v5 — gate self-check (build-time only, not shipped to the grader).
// Replicates the scorer's seven gate rows against a built /output directory,
// from the snapshot, so a failure is caught here instead of on the server.
// Usage: node tools/gatecheck.ts <out-dir> <snapshot.json>
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const outDir = process.argv[2]!;
const snapFile = process.argv[3]!;
if (!outDir || !snapFile) {
  console.error('usage: node tools/gatecheck.ts <out-dir> <snapshot.json>');
  process.exit(2);
}

const snapshot = JSON.parse(readFileSync(snapFile, 'utf8'));
const snapSlugs = new Set<string>(snapshot.protocols.map((p: { slug: string }) => p.slug));
const watchlist: string[] = snapshot.watchlist;

let pass = 0;
let fail = 0;
function row(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  if (ok) pass++;
  else fail++;
}

/** PNG dimensions from the IHDR chunk; JPEG from the first SOF marker. */
function imageDims(buf: Buffer): { w: number; h: number; kind: string } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), kind: 'png' };
  }
  if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), kind: 'jpeg' };
      }
      const len = buf.readUInt16BE(i + 2);
      i += 2 + len;
    }
  }
  return null;
}

// 1. dashboard_files
{
  const dir = join(outDir, 'dashboard');
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const files = names.filter((n) => statSync(join(dir, n)).isFile());
  const bytes = files.reduce((s, n) => s + statSync(join(dir, n)).size, 0);
  const hasHtml = files.includes('index.html');
  const hasCss = files.some((n) => n.endsWith('.css'));
  const hasJs = files.some((n) => n.endsWith('.js'));
  const badName = files.find((n) => !/^[A-Za-z0-9._-]{1,128}$/.test(n) || n.startsWith('.') || n.startsWith('-'));
  let urlOffence: string | null = null;
  for (const n of files) {
    const text = readFileSync(join(dir, n), 'utf8');
    const m = text.match(/https?:\/\/[^\s"'<>]+/);
    if (m) {
      urlOffence = `${n}: ${m[0]}`;
      break;
    }
  }
  row(
    'dashboard_files',
    hasHtml && hasCss && hasJs && files.length <= 400 && bytes <= 4_194_304 && !badName && !urlOffence,
    `${files.length} files, ${bytes} bytes, html=${hasHtml} css=${hasCss} js=${hasJs}${badName ? ` bad name ${badName}` : ''}${urlOffence ? ` url ${urlOffence}` : ''}`,
  );
}

// 2-5. board.json
const boardRaw = readFileSync(join(outDir, 'board.json'));
const board = JSON.parse(boardRaw.toString('utf8'));
const rows = Array.isArray(board) ? board : board.rows;
{
  const badSlug = rows.find((r: { slug: string }) => !snapSlugs.has(r.slug));
  const badRow = rows.find(
    (r: { name: string; rank: number; implied_value_usd: number }) =>
      typeof r.name !== 'string' || r.name.length === 0 || !Number.isSafeInteger(r.rank) || r.rank <= 0 || !Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000,
  );
  const dup = rows.length !== new Set(rows.map((r: { slug: string }) => r.slug)).size;
  row(
    'board_file',
    rows.length >= 100 && rows.length <= 4000 && boardRaw.length <= 8_388_608 && !badSlug && !badRow && !dup,
    `${rows.length} rows, ${boardRaw.length} bytes${badSlug ? ` bad slug ${badSlug.slug}` : ''}${badRow ? ` bad row ${JSON.stringify(badRow).slice(0, 80)}` : ''}${dup ? ' duplicate slug' : ''}`,
  );
}
{
  const ranks = rows.map((r: { rank: number }) => r.rank).sort((a: number, b: number) => a - b);
  const ranksOk = ranks.every((r: number, i: number) => r === i + 1);
  let orderOk = true;
  for (let i = 1; i < rows.length; i++) if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) orderOk = false;
  const allSame = rows.length >= 2 && rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd;
  row('sorted_by_value', ranksOk && orderOk && !allSame, `ranks 1..${rows.length} ${ranksOk ? 'exact' : 'BROKEN'}, non-increasing ${orderOk}, top $${rows[0].implied_value_usd.toLocaleString('en-US')} bottom $${rows[rows.length - 1].implied_value_usd.toLocaleString('en-US')}`);
}
{
  const have = new Set(rows.map((r: { slug: string }) => r.slug));
  const missing = watchlist.filter((s) => !have.has(s));
  row('coverage', missing.length === 0, `${watchlist.length - missing.length}/${watchlist.length} watchlist slugs covered${missing.length ? ` missing ${missing.slice(0, 5).join(', ')}` : ''}`);
}
{
  const bad = rows.find((r: { slug: string; farm_steps: string[] }) => {
    const s = r.farm_steps;
    if (!Array.isArray(s) || s.length < 3 || s.length > 12) return true;
    return s.some((x) => typeof x !== 'string' || x.trim().length < 20 || x.trim().length > 600);
  });
  const steps = rows.flatMap((r: { farm_steps: string[] }) => r.farm_steps);
  row(
    'farm_steps',
    !bad,
    `${steps.length} steps across ${rows.length} rows, length ${Math.min(...steps.map((s: string) => s.length))}..${Math.max(...steps.map((s: string) => s.length))} chars${bad ? ` bad row ${bad.slug}` : ''}`,
  );
}

// 6. screenshots
{
  const dir = join(outDir, 'screenshots');
  const names = existsSync(dir) ? readdirSync(dir).filter((n) => !n.startsWith('.')) : [];
  let detail = `${names.length} images`;
  let ok = names.length >= 3 && names.length <= 4;
  for (const n of names) {
    const buf = readFileSync(join(dir, n));
    const dims = imageDims(buf);
    if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(n) || buf.length > 524_288 || !dims) ok = false;
    if (dims) {
      const long = Math.max(dims.w, dims.h);
      const short = Math.min(dims.w, dims.h);
      if (long > 1440 || short < 800) ok = false;
      detail += `; ${n} ${dims.kind} ${dims.w}x${dims.h} ${buf.length}B`;
    } else {
      detail += `; ${n} NOT AN IMAGE ${buf.length}B`;
    }
  }
  row('screenshots', ok, detail);
}

// 7. dossier_matches
{
  const written = readFileSync(join(outDir, 'dossier.json'));
  const rebuilt = buildDossier(outDir, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  });
  const same = Buffer.compare(written, Buffer.from(rebuilt)) === 0;
  row('dossier_matches', same && written.length <= 1_572_864, `dossier.json ${written.length} bytes, byte-identical to buildDossier output: ${same}`);
}

console.log(`\ngate: ${pass}/7 PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
