/**
 * Documentation facts + sync engine (see ADR-0020).
 *
 * Single source of truth for every fact that appears in more than one doc:
 * counts (rules, packs, detectors, sections, check kinds, ADRs), the package
 * version, and the CLI help text. `sync-docs.mjs` writes; `check-docs.mjs`
 * verifies by re-deriving in memory and diffing, so the two can never disagree.
 *
 * Two marker forms, both survive Prettier because they are HTML comments:
 *
 *   Inline value:
 *     Rules: <!-- usa:fact rules -->281<!-- /usa:fact -->
 *
 *   Generated block (content between the markers is replaced wholesale):
 *     <!-- usa:begin rules-tree -->
 *     ...
 *     <!-- usa:end rules-tree -->
 *
 * Everything here is pure and offline: facts come from the checked-in files,
 * never the network. `regenerate(text, facts)` returns the corrected text; if
 * it equals the input, the doc is already in sync.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

export const ROOT = process.cwd();
export const DOCS = path.join(ROOT, 'docs');

/** Round a count down to a "N+" floor that marketing claims may use. */
function floorTo(n, step) {
  return Math.floor(n / step) * step;
}

/** Compute every shared fact from the checked-in source files. Pure. */
export function computeFacts() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  const index = parseYaml(fs.readFileSync(path.join(ROOT, 'rules/index.yaml'), 'utf8'));
  let rules = 0;
  let packs = 0;
  let core = 0;
  let stacks = 0;
  for (const entry of index.packs ?? []) {
    const file = typeof entry === 'string' ? entry : entry.file;
    if (typeof entry !== 'string' && entry.enabled === false) continue;
    const pack = parseYaml(fs.readFileSync(path.join(ROOT, 'rules', file), 'utf8'));
    rules += (pack.rules ?? []).length;
    packs += 1;
    if (file.startsWith('core/')) core += 1;
    else if (file.startsWith('stacks/')) stacks += 1;
  }

  const rawDetectors = parseYaml(fs.readFileSync(path.join(ROOT, 'rules/detectors.yaml'), 'utf8'));
  const detectors = (Array.isArray(rawDetectors) ? rawDetectors : (rawDetectors.detectors ?? []))
    .length;

  const sectionsSrc = fs.readFileSync(path.join(ROOT, 'src/engine/sections.ts'), 'utf8');
  const sections = new Set([...sectionsSrc.matchAll(/id:\s*'(S\d+)'/g)].map((m) => m[1])).size;

  const typesSrc = fs.readFileSync(path.join(ROOT, 'src/types.ts'), 'utf8');
  const checkKinds = new Set([...typesSrc.matchAll(/kind:\s*'([a-z_]+)'/g)].map((m) => m[1])).size;

  const adrs = fs
    .readdirSync(path.join(ROOT, 'docs/adr'))
    .filter((f) => /^\d{4}-.+\.md$/.test(f)).length;

  return {
    version: pkg.version,
    versionMajor: String(pkg.version).split('.')[0],
    rules,
    rulesFloor: floorTo(rules, 10),
    packs,
    core,
    stacks,
    detectors,
    detectorsApprox: `~${floorTo(detectors, 10)}`,
    sections,
    checkKinds,
    adrs,
  };
}

/** The `usa --help` text (requires `dist/`). */
export function cliHelp() {
  try {
    return execFileSync('node', ['dist/cli.js', '--help'], {
      encoding: 'utf8',
      cwd: ROOT,
    }).trimEnd();
  } catch {
    console.error('docs-sync: `node dist/cli.js --help` failed — run `npm run build` first.');
    process.exit(2);
  }
}

/** The `usa rules` summary line list (requires `dist/`). */
export function cliRules() {
  try {
    return execFileSync('node', ['dist/cli.js', 'rules'], {
      encoding: 'utf8',
      cwd: ROOT,
    }).trimEnd();
  } catch {
    console.error('docs-sync: `node dist/cli.js rules` failed — run `npm run build` first.');
    process.exit(2);
  }
}

/**
 * The `usa standards --format json` rows (requires `dist/`). Structured rather
 * than pre-rendered so the doc block can format a Prettier-stable table (see
 * `markdownTable`) independent of the CLI's terminal presentation.
 */
export function standardsRows() {
  try {
    return JSON.parse(
      execFileSync('node', ['dist/cli.js', 'standards', '--format', 'json'], {
        encoding: 'utf8',
        cwd: ROOT,
      }),
    );
  } catch {
    console.error(
      'docs-sync: `node dist/cli.js standards --format json` failed — run `npm run build` first.',
    );
    process.exit(2);
  }
}

/**
 * Render a markdown table in exactly Prettier's canonical style: every cell
 * left-aligned and padded to its column's widest entry, separator dashes
 * matching the padded width. Generated blocks are compared as raw text by the
 * checker, so the output must survive `prettier --write` unchanged.
 */
export function markdownTable(headers, rows) {
  const cells = [headers, ...rows].map((r) => r.map((c) => String(c)));
  const widths = headers.map((_, col) => Math.max(...cells.map((r) => r[col].length)));
  const line = (r) => `| ${r.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
  const sep = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;
  return [line(cells[0]), sep, ...cells.slice(1).map(line)].join('\n');
}

/* ------------------------------------------------------- claim vocabulary -- */

/**
 * Every fact can appear as a bare number in prose ("281 rules"), which would
 * drift the moment the count moves. This maps the words that may follow a
 * fixed number to the fact key that owns that number, so the checker can catch
 * an unmarked claim and tell the author exactly which marker to use.
 *
 * A number is only flagged when it equals NO known-current value AND is not
 * inside a marker — i.e. it is a number that *looks like* a claim about a fact
 * but is not one the sync will maintain. (See `findUnmarkedClaims`.)
 */
export const CLAIM_NOUNS = [
  { re: /\brules\b/i, key: 'rules', valueKeys: ['rules'] },
  { re: /\bpacks\b/i, key: 'packs', valueKeys: ['packs', 'core', 'stacks'] },
  {
    re: /\b(?:detectors|detection signals)\b/i,
    key: 'detectors',
    valueKeys: ['detectors', 'detectorsApprox'],
  },
  { re: /\bsections\b/i, key: 'sections', valueKeys: ['sections'] },
  { re: /\bcheck kinds\b/i, key: 'check-kinds', valueKeys: ['checkKinds'] },
  { re: /\bADRs\b/i, key: 'adrs', valueKeys: ['adrs'] },
  { re: /\b(?:universal|conditional)\s+packs\b/i, key: 'packs', valueKeys: ['core', 'stacks'] },
];

/** Strip generated blocks and inline markers so only living prose remains. */
export function stripMarkedRegions(text) {
  return text
    .replace(BLOCK_RE, (m) => m.replace(/[^\n]/g, ' '))
    .replace(FACT_RE, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Find bare numeric claims in prose that no marker owns. Returns
 * `{ line, text, key, suggestedMarker }` for each. A number whose noun phrase
 * is a known fact but which is NOT the current value is reported so the author
 * either marks it (`<!-- usa:fact KEY -->…`) or corrects it.
 */
export function findUnmarkedClaims(text, facts) {
  const out = [];
  const prose = stripMarkedRegions(text);
  const lines = prose.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/usa:(fact|begin|end)/.test(line)) continue;
    // Escape hatch for legitimate non-USA uses of these words (e.g. "the
    // standard has 3 sections"). Opt a line out explicitly, never silently.
    if (/usa:allow-claim/.test(line)) continue;
    for (const { re, key, valueKeys } of CLAIM_NOUNS) {
      // Match an optional `~`/`+` qualifier before the noun.
      const full = new RegExp(`(~?)(\\d{1,4})(\\+?)\\s*(?:${re.source})`, 'gi');
      for (const m of line.matchAll(full)) {
        const n = Number(m[2]);
        const current = valueKeys.some((k) => {
          const v = String(facts[k] ?? '').replace(/[^0-9]/g, '');
          return v !== '' && Number(v) === n;
        });
        if (!current) {
          out.push({
            line: i + 1,
            text: m[0].trim(),
            key,
            suggestedMarker: `<!-- usa:fact ${key} -->…<!-- /usa:fact -->`,
          });
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------ marker engine */

const FACT_RE = /<!--\s*usa:fact\s+([a-z][a-z0-9-]*)\s*-->[\s\S]*?<!--\s*\/usa:fact\s*-->/g;
// Tolerant on input (any spacing between the markers), canonical on output: a
// blank line is emitted after `begin` and before `end`, which is what Prettier
// produces for an HTML comment followed/preceded by a fenced code block. If the
// generator did not match that, `sync` and `format` would fight on every commit.
const BLOCK_RE =
  /<!--\s*usa:begin\s+([a-z][a-z0-9-]*)\s*-->\s*\n([\s\S]*?)\n\s*<!--\s*usa:end\s+\1\s*-->/g;

/** Fact keys whose prose form includes a `+`/`~` qualifier. */
function factValue(key, facts) {
  if (key === 'rules-floor') return `${facts.rulesFloor}+`;
  if (key === 'detectors-approx') return facts.detectorsApprox;
  if (key in facts) return String(facts[key]);
  return null;
}

/** Block generators, keyed by block name. Return the block body (no markers). */
export const BLOCKS = {
  'rules-tree': (facts) => {
    const tree = [
      '```',
      'rules/',
      '├── index.yaml              pack registry',
      `├── detectors.yaml          ${facts.detectorsApprox} detection signals → facts`,
      '├── profiles/maturity.yaml  the five lifecycle profiles',
      `├── core/                   ${facts.core} universal packs`,
      '│   ├── repo.yaml           ├── security.yaml      ├── supply-chain.yaml',
      '│   ├── architecture.yaml   ├── code-quality.yaml  ├── testing.yaml',
      '│   ├── cicd.yaml           ├── release.yaml       ├── dependencies.yaml',
      '│   ├── documentation.yaml  └── future-readiness.yaml',
      `└── stacks/                 ${facts.stacks} conditional packs`,
      '    ├── node-typescript     ├── python      ├── go        ├── rust',
      '    ├── jvm                 ├── web-frontend├── mobile    ├── containers',
      '    ├── iac                 ├── solidity    ├── ml-ai      ├── cli',
      '    ├── data                ├── api-backend ├── compliance ├── ai-era',
      '    └── swift',
      '```',
    ];
    return tree.join('\n');
  },
  // Derived from the real loaded rules via `usa standards` (ADR-0021), so the
  // standards mapping in the docs cannot describe rules that no longer exist.
  'standards-coverage': () => {
    const rows = standardsRows().map((r) => [
      `${r.name} (\`${r.catalogue}\`)`,
      r.rules,
      r.automatable.full,
      r.automatable.assist,
      r.automatable.manual,
    ]);
    return markdownTable(['Catalogue', 'Rules', 'Fully automated', 'Assisted', 'Manual'], rows);
  },
};

/**
 * Regenerate a document: replace every inline fact and generated block with
 * the current value. Unknown fact keys or block names are left untouched (and
 * reported by the caller via `problems` if it cares). Pure.
 */
export function regenerate(text, facts, blocks = BLOCKS) {
  let out = text.replace(FACT_RE, (whole, key) => {
    const value = factValue(key, facts);
    if (value === null) return whole; // unknown key: leave for the checker
    return `<!-- usa:fact ${key} -->${value}<!-- /usa:fact -->`;
  });
  out = out.replace(BLOCK_RE, (whole, name) => {
    const gen = blocks[name];
    if (!gen) return whole;
    // Canonical, Prettier-stable form: blank line inside each marker.
    return `<!-- usa:begin ${name} -->\n\n${gen(facts)}\n\n<!-- usa:end ${name} -->`;
  });
  return out;
}

/* ------------------------------------------------------------- doc discovery */

/** Every tracked markdown doc governed by the marker/claim system. */
export function docFiles() {
  const tracked = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8', cwd: ROOT })
    .trim()
    .split('\n');
  return tracked.filter(
    (f) =>
      !f.startsWith('experiments/') &&
      !f.startsWith('examples/demo-app/') &&
      f !== 'CHANGELOG.md' && // machine-written by release-please
      f !== 'examples/sample-report.md' && // generated audit output
      f !== 'docs/reference/cli.md', // generated CLI reference
  );
}

/**
 * Meta-documentation: docs that quote the governance machinery itself
 * (example markers, banned strings, unmarked claims) as teaching material.
 * They are exempt from the content checks — marker sync, the claim scanner,
 * and the banned-string scan — because those would rewrite or flag the very
 * examples the doc exists to show. They are still link- and index-checked.
 */
export const META_DOCS = new Set(['docs/writing-docs.md']);

/** Docs the claim scanner skips entirely (generated, immutable history, or meta). */
export function claimScannedFiles() {
  return docFiles().filter((f) => !f.startsWith('docs/adr/') && !META_DOCS.has(f));
}

/** Read a doc's current content. */
export function readDoc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
