/**
 * Documentation governance gate. See ADR-0020.
 *
 * One command that catches every mechanical way docs rot, so nobody has to
 * remember to "update the docs":
 *
 *   1. Marker sync      — every `usa:fact`/`usa:begin` marker matches source.
 *   2. Section coverage — every section id in sections.ts appears in USA.md.
 *   3. Flag references  — every `--flag` on a `usa …` doc line exists in --help.
 *   4. Link integrity   — every relative link + heading anchor resolves.
 *   5. Index coverage   — every docs/**\/*.md is listed in docs/README.md.
 *   6. Version pins     — `@xenos1996/usa@N` matches package.json's major; the
 *                         SECURITY.md supported-versions table lists it.
 *   7. Banned strings   — known-stale tokens never reappear.
 *   8. Heading numbers  — no two `## N ·` headings share a number in one doc.
 *
 * Offline. Checks 1 and 3 need `dist/` (run `npm run build` first).
 *
 * Usage: `node scripts/check-docs.mjs` (exit 1 on any violation).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  computeFacts,
  docFiles,
  claimScannedFiles,
  findUnmarkedClaims,
  readDoc,
  regenerate,
  ROOT,
  DOCS,
  cliHelp,
  META_DOCS,
} from './lib/docs-sync.mjs';

const failures = [];
const fail = (msg) => failures.push(msg);

/* 1 · Marker sync ---------------------------------------------------------- */
const facts = computeFacts();
const KNOWN_FACT_KEYS = new Set([
  'rules',
  'rules-floor',
  'packs',
  'core',
  'stacks',
  'detectors',
  'detectors-approx',
  'sections',
  'check-kinds',
  'adrs',
  'version',
  'version-major',
]);
for (const rel of docFiles()) {
  // ADRs are immutable records; meta-docs quote the machinery. Both are exempt
  // from marker sync, but still link- and index-checked elsewhere.
  if (rel.startsWith('docs/adr/') || META_DOCS.has(rel)) continue;
  const text = readDoc(rel);
  if (!/usa:(fact|begin)/.test(text)) continue;
  if (regenerate(text, facts) !== text) {
    fail(`${rel}: out of sync — run \`node scripts/sync-docs.mjs\``);
  }
  for (const m of text.matchAll(/usa:fact\s+([a-z][a-z0-9-]*)/g)) {
    if (!KNOWN_FACT_KEYS.has(m[1])) fail(`${rel}: unknown fact marker \`${m[1]}\``);
  }
}

/* 2 · Section coverage in USA.md ------------------------------------------- */
const sectionsSrc = fs.readFileSync(path.join(ROOT, 'src/engine/sections.ts'), 'utf8');
const sectionIds = [...new Set([...sectionsSrc.matchAll(/id:\s*'(S\d+)'/g)].map((m) => m[1]))];
const usa = readDoc('USA.md');
const missingSections = sectionIds.filter((id) => !usa.includes(id));
if (missingSections.length > 0) {
  fail(`USA.md never mentions section(s): ${missingSections.join(', ')}`);
}

/* 2b · README badge floor -------------------------------------------------- */
// The shields.io badge cannot carry an inline marker (it is `%2B`-encoded), so
// it gets its own derived check: the floor may not exceed the real rule count.
const badge = /rules-(\d+)(?:%2B|\+)/.exec(readDoc('README.md'));
if (!badge) {
  fail('README.md: rules-NNN+ badge not found (the count claim must stay checkable)');
} else if (Number(badge[1]) > facts.rules) {
  fail(`README.md badge claims ${badge[1]}+ rules but rules/ holds ${facts.rules}`);
}

/* 3 · Flag references ------------------------------------------------------ */
const help = cliHelp();
const knownFlags = new Set([...help.matchAll(/--([a-z][a-z0-9-]*)/g)].map((m) => m[1]));
const CMD_LINE =
  /^[ \t]*(?:\$\s*)?(?:npx(?:\s+[^\s\\]+)*\s+)?(?:@\S+\/usa|usa(?:@\S+)?|npm run usa --)(.*)$/gm;
for (const rel of docFiles()) {
  const text = readDoc(rel);
  for (const m of text.matchAll(CMD_LINE)) {
    for (const f of m[1].matchAll(/--([a-z][a-z0-9-]*)/g)) {
      if (!knownFlags.has(f[1])) fail(`${rel}: documents unknown usa flag --${f[1]}`);
    }
  }
}

/* 4 · Link integrity ------------------------------------------------------- */
function slugify(h) {
  return h
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}
function anchorsOf(text) {
  const set = new Set();
  for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) set.add(slugify(m[1]));
  return set;
}
for (const rel of docFiles()) {
  const text = readDoc(rel);
  const dir = path.dirname(rel);
  const selfPath = path.join(ROOT, rel);
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const raw = m[1];
    if (/^(https?:|mailto:)/.test(raw)) continue;
    // A bare `#anchor` points within this file; `file.md#anchor`/`file.md` point
    // at a sibling. Both are validated, so a renamed heading breaks the build.
    let targetFile;
    let anchor;
    if (raw.startsWith('#')) {
      targetFile = selfPath;
      anchor = raw.slice(1);
    } else {
      const [target, a] = raw.split('#');
      anchor = a ?? null;
      targetFile = path.join(ROOT, dir, target);
      if (!fs.existsSync(targetFile)) {
        fail(`${rel}: link target does not exist: ${raw}`);
        continue;
      }
    }
    if (anchor && targetFile.endsWith('.md') && fs.existsSync(targetFile)) {
      if (!anchorsOf(fs.readFileSync(targetFile, 'utf8')).has(anchor)) {
        fail(`${rel}: anchor not found in ${path.relative(ROOT, targetFile)}: #${anchor}`);
      }
    }
  }
}

/* 5 · Index coverage ------------------------------------------------------- */
const indexText = readDoc('docs/README.md');
for (const entry of fs.readdirSync(DOCS, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue;
  if (!indexText.includes(entry.name)) fail(`docs/README.md does not list docs/${entry.name}`);
}
const refDir = path.join(DOCS, 'reference');
if (fs.existsSync(refDir)) {
  for (const entry of fs.readdirSync(refDir, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      entry.name.endsWith('.md') &&
      !indexText.includes(`reference/${entry.name}`)
    ) {
      fail(`docs/README.md does not list docs/reference/${entry.name}`);
    }
  }
}

/* 6 · Version pins --------------------------------------------------------- */
const major = facts.versionMajor;
for (const rel of docFiles()) {
  const text = readDoc(rel);
  for (const m of text.matchAll(/@xenos1996\/usa@(\d+)/g)) {
    if (m[1] !== major)
      fail(`${rel}: version pin @xenos1996/usa@${m[1]} != current major ${major}`);
  }
}
if (!new RegExp(`\\|\\s*${major}\\.x\\s*\\|\\s*✅`).test(readDoc('SECURITY.md'))) {
  fail(`SECURITY.md: supported-versions table does not list ${major}.x`);
}

/* 7 · Banned stale strings ------------------------------------------------- */
// Living docs only: ADRs are immutable records that legitimately quote old
// states (e.g. ADR-0020 lists the very strings banned here).
const BANNED = [
  { re: /from ['"]usa['"]/, why: "wrong import specifier — use '@xenos1996/usa'" },
  { re: /rules\/sections\.yaml/, why: 'sections live in src/engine/sections.ts' },
  { re: /grep_experimental/, why: 'no such check kind' },
  { re: /@xenos1996\/usat/, why: 'old package name (usat)' },
  { re: /Section 14 template/i, why: 'report template is no longer §14' },
];
for (const rel of docFiles()) {
  if (rel.startsWith('docs/adr/') || META_DOCS.has(rel)) continue;
  const text = readDoc(rel);
  for (const { re, why } of BANNED) {
    if (re.test(text)) fail(`${rel}: contains banned stale text (${why})`);
  }
}

/* 8 · Heading numbers unique within a doc ---------------------------------- */
for (const rel of docFiles()) {
  const seen = new Set();
  for (const m of readDoc(rel).matchAll(/^##\s+(\d+)\s/gm)) {
    if (seen.has(m[1])) fail(`${rel}: duplicate section number ## ${m[1]}`);
    seen.add(m[1]);
  }
}

/* 9 · Every numeric claim is marked or correct ----------------------------- */
// A bare "281 rules" in prose rots the moment the count moves. If it is not
// the current value and not wrapped in a marker, the author must either mark it
// (so it self-maintains) or correct it. Opt a legitimate non-USA use out with
// an inline `usa:allow-claim` comment on the line.
for (const rel of claimScannedFiles()) {
  for (const claim of findUnmarkedClaims(readDoc(rel), facts)) {
    fail(
      `${rel}:${claim.line}: unmarked claim "${claim.text}" — wrap it as ${claim.suggestedMarker} ` +
        `(or add a usa:allow-claim comment)`,
    );
  }
}

/* ---------------------------------------------------------------- report -- */
if (failures.length > 0) {
  console.error(`docs governance: ${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `docs governance: OK (${docFiles().length} docs · facts ${facts.version}/${facts.rules} rules · sections · flags · links · index · pins)`,
);
