/**
 * Pre-commit documentation autosync (see ADR-0020).
 *
 * Runs the docs sync and re-stages any doc it changed, so a contributor never
 * has to remember to run `sync-docs` by hand: commit a change that moves a
 * documented count and the count updates itself in the same commit.
 *
 * Safe by construction: `sync-docs` only rewrites the region between
 * `usa:fact` / `usa:begin`…`usa:end` markers, so unrelated prose is untouched.
 * If the build is missing (CLI facts need `dist/`), it warns and exits 0 rather
 * than blocking the commit — CI still enforces the gate.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

try {
  execFileSync('node', ['scripts/sync-docs.mjs'], { stdio: 'inherit', cwd: ROOT });
} catch {
  console.warn('docs-autosync: sync failed (is dist/ built?) — skipping; CI will still check.');
  process.exit(0);
}

// Re-stage every tracked, marker-bearing doc the sync may have touched.
const tracked = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8', cwd: ROOT })
  .trim()
  .split('\n')
  .filter((f) => !f.startsWith('experiments/') && !f.startsWith('examples/demo-app/'));
const toAdd = tracked.filter((f) =>
  /usa:(fact|begin)/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
);
if (toAdd.length > 0) execFileSync('git', ['add', ...toAdd], { stdio: 'inherit', cwd: ROOT });
