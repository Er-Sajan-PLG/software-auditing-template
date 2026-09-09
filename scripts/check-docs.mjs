/**
 * Doc-sync gate: the fastest-rotting documented facts are counts.
 *
 * Fails when:
 * - the README `rules-NNN+` badge floor exceeds the actual rule count, or
 * - a section id in `rules/sections.yaml` is never mentioned in `USAT.md`.
 *
 * Usage: `node scripts/check-docs.mjs` (exit 1 on any violation).
 * Needs `node_modules` (uses the `yaml` dependency).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = process.cwd();
const failures = [];

function loadYaml(rel) {
  return parseYaml(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

// 1. Rule count floor -------------------------------------------------------
const index = loadYaml('rules/index.yaml');
let ruleCount = 0;
for (const entry of index.packs ?? []) {
  const file = typeof entry === 'string' ? entry : entry.file;
  if (typeof entry !== 'string' && entry.enabled === false) continue;
  const pack = loadYaml(path.join('rules', file));
  ruleCount += (pack.rules ?? []).length;
}
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const badge = /rules-(\d+)(?:%2B|\+)/.exec(readme);
if (!badge) {
  failures.push(
    'README.md: rules-NNN+ badge not found — the count claim must stay machine-checkable',
  );
} else if (ruleCount < Number(badge[1])) {
  failures.push(`README.md claims ${badge[1]}+ rules but rules/ holds ${ruleCount}`);
} else {
  console.log(`rule count: OK (${ruleCount} rules, badge floor ${badge[1]})`);
}

// 2. Section coverage in USAT.md ---------------------------------------------
// Sections are defined in code (src/engine/sections.ts DEFAULT_SECTIONS;
// rules/sections.yaml is an optional override), so the source of truth is
// the `id: 'S…'` literals in that file.
const sectionsSrc = fs.readFileSync(path.join(ROOT, 'src/engine/sections.ts'), 'utf8');
const ids = [...new Set([...sectionsSrc.matchAll(/id:\s*'(S\d+)'/g)].map((m) => m[1]))];
const usat = fs.readFileSync(path.join(ROOT, 'USAT.md'), 'utf8');
const missing = ids.filter((id) => !usat.includes(id));
if (missing.length > 0) {
  failures.push(`USAT.md never mentions section(s): ${missing.join(', ')}`);
} else {
  console.log(`section coverage: OK (${ids.length} sections referenced in USAT.md)`);
}

if (failures.length > 0) {
  console.error(`doc sync: ${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('doc sync: OK');
