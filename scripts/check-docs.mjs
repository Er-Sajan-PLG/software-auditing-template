/**
 * Doc-sync gate: the fastest-rotting documented facts are counts.
 *
 * Fails when:
 * - the README `rules-NNN+` badge floor exceeds the actual rule count, or
 * - a section id in `rules/sections.yaml` is never mentioned in `USA.md`.
 *
 * Usage: `node scripts/check-docs.mjs` (exit 1 on any violation).
 * Needs `node_modules` (uses the `yaml` dependency).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const ROOT = process.cwd();
const failures = [];

function execHelp() {
  try {
    return execFileSync('node', ['dist/cli.js', '--help'], { encoding: 'utf8', cwd: ROOT });
  } catch {
    console.error('check-docs: dist/cli.js --help failed — run `npm run build` first.');
    process.exit(2);
  }
}

function walkDocs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkDocs(rel));
    else if (entry.name.endsWith('.md')) out.push(rel);
  }
  return out;
}

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

// 2. Section coverage in USA.md ---------------------------------------------
// Sections are defined in code (src/engine/sections.ts DEFAULT_SECTIONS;
// rules/sections.yaml is an optional override), so the source of truth is
// the `id: 'S…'` literals in that file.
const sectionsSrc = fs.readFileSync(path.join(ROOT, 'src/engine/sections.ts'), 'utf8');
const ids = [...new Set([...sectionsSrc.matchAll(/id:\s*'(S\d+)'/g)].map((m) => m[1]))];
const usa = fs.readFileSync(path.join(ROOT, 'USA.md'), 'utf8');
const missing = ids.filter((id) => !usa.includes(id));
if (missing.length > 0) {
  failures.push(`USA.md never mentions section(s): ${missing.join(', ')}`);
} else {
  console.log(`section coverage: OK (${ids.length} sections referenced in USA.md)`);
}

// 3. Every --flag in `usa …` doc snippets exists in --help ------------------
// Only command lines count (prose may recommend flags for *other* tools,
// e.g. --dry-run for audited CLIs). Lines are matched loosely; anything the
// matcher misses merely weakens the check, it can never false-positive.
const help = execHelp();
const known = new Set([...help.matchAll(/--([a-z][a-z0-9-]*)/g)].map((m) => m[1]));
const docFiles = [
  'README.md',
  'CONTRIBUTING.md',
  'USA.md',
  ...walkDocs('docs'),
  ...walkDocs('templates'),
  ...walkDocs('skills'),
  ...walkDocs('examples'),
];
const cmdLine =
  /^[ \t]*(?:\$\s*)?(?:npx(?:\s+[^\s\\]+)*\s+)?(?:@\S+\/usa|usa(?:@\S+)?|npm run usa --)(.*)$/gm;
for (const rel of docFiles) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of text.matchAll(cmdLine)) {
    for (const f of m[1].matchAll(/--([a-z][a-z0-9-]*)/g)) {
      if (!known.has(f[1])) {
        failures.push(`${rel}: documents unknown usa flag --${f[1]}`);
      }
    }
  }
}
if (failures.length === 0) {
  console.log(`flag references: OK (${known.size} known flags)`);
}

if (failures.length > 0) {
  console.error(`doc sync: ${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('doc sync: OK');
