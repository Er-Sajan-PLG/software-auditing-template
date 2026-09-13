/**
 * Sync documentation (write mode). See ADR-0020 and scripts/lib/docs-sync.mjs.
 *
 * Derives every shared fact from source and writes it into the docs, in place:
 * inline `<!-- usa:fact KEY -->VALUE<!-- /usa:fact -->` markers and generated
 * `<!-- usa:begin NAME -->…<!-- usa:end NAME -->` blocks. Idempotent: running
 * twice changes nothing.
 *
 * Usage:
 *   node scripts/sync-docs.mjs          # rewrite docs in place
 *   node scripts/sync-docs.mjs --check  # exit 1 if any doc is out of sync (CI)
 * Requires `dist/` for the CLI-help facts (run `npm run build` first).
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeFacts, docFiles, readDoc, regenerate, ROOT } from './lib/docs-sync.mjs';

const check = process.argv.includes('--check');
const facts = computeFacts();

const drift = [];
let changed = 0;

for (const rel of docFiles()) {
  if (rel.startsWith('docs/adr/')) continue; // ADRs are immutable; markers there are examples
  const before = readDoc(rel);
  const after = regenerate(before, facts);
  if (before === after) continue;
  changed += 1;
  drift.push(rel);
  if (!check) {
    fs.writeFileSync(path.join(ROOT, rel), after, 'utf8');
  }
}

if (check) {
  if (drift.length > 0) {
    console.error(
      `docs sync: ${drift.length} file(s) out of sync — run \`node scripts/sync-docs.mjs\`:\n- ` +
        drift.join('\n- '),
    );
    process.exit(1);
  }
  console.log(
    `docs sync: OK (${docFiles().length} docs, facts: ${facts.version} · ${facts.rules} rules)`,
  );
} else {
  console.log(
    changed > 0
      ? `docs sync: updated ${changed} file(s):\n- ${drift.join('\n- ')}`
      : 'docs sync: nothing to update',
  );
}
