/**
 * Generate `examples/sample-report.md` from the real engine (ADR-0020).
 *
 * The sample report is genuine engine output against `examples/demo-app`, but
 * two fields are machine-local and must be normalized so the file is stable
 * across machines and runs:
 *
 *   - **Path**  → a fixed `/home/user/universal-software-auditor/...`
 *   - **Date**  → a fixed timestamp
 *
 * Everything else (score, findings, trailer, USA version) is real and moves
 * when the engine or the demo app changes, which is the point: the committed
 * example can never describe an engine that no longer exists.
 *
 * Usage:
 *   node scripts/gen-sample-report.mjs          # write the file
 *   node scripts/gen-sample-report.mjs --check  # exit 1 if stale (CI)
 * Requires `dist/` (run `npm run build` first).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'examples/sample-report.md');
const FIXED_DATE = '2026-01-01T00:00:00.000Z';

function generate() {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'usa-sample-')), 'report.md');
  try {
    execFileSync('node', ['dist/cli.js', 'audit', 'examples/demo-app', '--out', tmp], {
      encoding: 'utf8',
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    console.error('gen-sample-report: audit failed — run `npm run build` first.');
    process.exit(2);
  }
  const raw = fs.readFileSync(tmp, 'utf8');
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  return raw
    .replace(
      /`[^`]*\/examples\/demo-app`/,
      '`/home/user/universal-software-auditor/examples/demo-app`',
    )
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, FIXED_DATE);
}

const doc = generate();

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (current !== doc) {
    console.error(
      'examples/sample-report.md is stale — run `node scripts/gen-sample-report.mjs` and commit.',
    );
    process.exit(1);
  }
  console.log('sample report: OK (in sync)');
} else {
  fs.writeFileSync(OUT, doc);
  console.log('wrote examples/sample-report.md');
}
