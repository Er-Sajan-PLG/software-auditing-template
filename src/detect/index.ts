import { parse as parseYaml } from 'yaml';
import fs from 'node:fs';
import path from 'node:path';
import type { Facts, Maturity } from '../types.js';
import { Project } from '../util/project.js';

/* --------------------------------------------------------------- detector -- */

interface DetectorMatch {
  any_file?: string[];
  file_exists?: string[];
  dir_exists?: string[];
  content?: { include: string[]; pattern: string };
  manifest?: { file: string; key: string; contains?: string };
  metric?: { name: string; min?: number; max?: number };
  any_of?: DetectorMatch[];
  all_of?: DetectorMatch[];
}

interface Detector {
  fact: string;
  category: string;
  title: string;
  match?: DetectorMatch;
  implies?: string[];
}

/**
 * Paths a detection scan must ignore. Prose, tests, and examples *talk about*
 * technology; they are not evidence that the project uses it. Without this,
 * auditing any repo that mentions "postgres" in its docs reports a Postgres
 * dependency.
 */
const CONTENT_EXCLUDES = [
  '**/*.md',
  '**/*.mdx',
  '**/*.rst',
  'README*',
  '**/README*',
  // NB: deliberately NOT '**/*.txt' — requirements.txt is a manifest, not prose.
  '**/docs/**',
  '**/doc/**',
  '**/examples/**',
  '**/example/**',
  '**/templates/**',
  '**/fixtures/**',
  '**/__mocks__/**',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/spec/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/test_*',
  '**/*_test.*',
  'LICENSE*',
  'CHANGELOG*',
];

export interface DetectionResult {
  facts: Facts;
  detectorsFired: { fact: string; title: string; category: string }[];
  maturity: Maturity;
  maturitySignals: string[];
}

/** Load the detector registry. */
export function loadDetectors(file: string): Detector[] {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const doc = parseYaml(raw) as { detectors?: Detector[] } | null;
  return Array.isArray(doc?.detectors) ? doc!.detectors! : [];
}

/** Run every detector against the project and derive the fact set. */
export function detect(
  project: Project,
  detectors: Detector[],
  git: ReturnType<Project['gitInfo']>,
  extraFacts: string[] = [],
): DetectionResult {
  const flags = new Set<string>(extraFacts);
  const metrics: Record<string, number> = {
    commits: git.commits,
    contributors: git.contributors,
    tags: git.tags,
    branches: git.branches,
    files: project.files.length,
    ...(git.daysSinceLastCommit !== undefined
      ? { daysSinceLastCommit: git.daysSinceLastCommit }
      : {}),
  };

  const fired: DetectionResult['detectorsFired'] = [];

  // Fixed-point resolution: `implies` chains of any length resolve regardless
  // of declaration order. Bounded by detectors.length + 1 passes (each pass
  // must fire at least one new fact to continue), so a malformed registry
  // cannot hang detection. Two hardcoded passes silently dropped chains of
  // length 3+ declared worst-first, inflating score and confidence.
  for (let pass = 0; pass <= detectors.length; pass++) {
    let changed = false;
    for (const d of detectors) {
      if (processDetector(d, project, flags, metrics, fired)) changed = true;
    }
    if (!changed) break;
  }

  const { maturity, signals } = classifyMaturity(flags, metrics, project);
  flags.add(`maturity:${maturity}`);

  return { facts: { flags, metrics }, detectorsFired: fired, maturity, maturitySignals: signals };
}

function processDetector(
  d: Detector,
  project: Project,
  flags: Set<string>,
  metrics: Record<string, number>,
  fired: DetectionResult['detectorsFired'],
): boolean {
  if (flags.has(d.fact)) return false;
  let hit = false;
  if (d.implies?.length) {
    hit = d.implies.every((f) => flags.has(f));
  }
  if (!hit && d.match) {
    hit = evalMatch(d.match, project, flags, metrics);
  }
  if (!hit) return false;
  flags.add(d.fact);
  if (!fired.some((f) => f.fact === d.fact)) {
    fired.push({ fact: d.fact, title: d.title, category: d.category });
  }
  return true;
}

function evalMatch(
  m: DetectorMatch,
  project: Project,
  flags: Set<string>,
  metrics: Record<string, number>,
): boolean {
  const checks = [
    ...matchAnyFile(m, project),
    ...matchFileExists(m, project),
    ...matchDirExists(m, project),
    ...matchContent(m, project),
    ...matchManifest(m, project),
    ...matchMetric(m, metrics),
    ...matchAnyOf(m, project, flags, metrics),
    ...matchAllOf(m, project, flags, metrics),
  ];

  return checks.length > 0 && checks.every(Boolean);
}

/** Each matcher returns [] when its clause is absent, else a single verdict. */
function matchAnyFile(m: DetectorMatch, project: Project): boolean[] {
  return m.any_file?.length ? [project.anyFile(m.any_file)] : [];
}

function matchFileExists(m: DetectorMatch, project: Project): boolean[] {
  return m.file_exists?.length ? [m.file_exists.some((f) => project.glob([f]).length > 0)] : [];
}

function matchDirExists(m: DetectorMatch, project: Project): boolean[] {
  return m.dir_exists?.length ? [m.dir_exists.some((d) => project.dirExists(d))] : [];
}

function matchContent(m: DetectorMatch, project: Project): boolean[] {
  if (!m.content) return [];
  const { include, pattern } = m.content;
  return [project.grep(pattern, include, CONTENT_EXCLUDES).length > 0];
}

function matchManifest(m: DetectorMatch, project: Project): boolean[] {
  return m.manifest ? [manifestHas(project, m.manifest)] : [];
}

function matchMetric(m: DetectorMatch, metrics: Record<string, number>): boolean[] {
  if (!m.metric) return [];
  const v = metrics[m.metric.name] ?? 0;
  if (m.metric.min !== undefined && v < m.metric.min) return [false];
  if (m.metric.max !== undefined && v > m.metric.max) return [false];
  return [true];
}

function matchAnyOf(
  m: DetectorMatch,
  project: Project,
  flags: Set<string>,
  metrics: Record<string, number>,
): boolean[] {
  return m.any_of?.length ? [m.any_of.some((c) => evalMatch(c, project, flags, metrics))] : [];
}

function matchAllOf(
  m: DetectorMatch,
  project: Project,
  flags: Set<string>,
  metrics: Record<string, number>,
): boolean[] {
  return m.all_of?.length ? [m.all_of.every((c) => evalMatch(c, project, flags, metrics))] : [];
}

/** Dotted key lookup across JSON manifests, with a TOML/YAML text fallback. */
function manifestHas(
  project: Project,
  m: { file: string; key: string; contains?: string },
): boolean {
  const matches = project.glob([m.file]);
  if (matches.length === 0) return false;
  const file = matches[0]!;
  const parts = m.key.split('.');
  return file.endsWith('.json')
    ? manifestHasJson(project, file, parts, m.contains)
    : manifestHasText(project, file, parts, m.contains);
}

function manifestHasJson(
  project: Project,
  file: string,
  parts: string[],
  contains: string | undefined,
): boolean {
  const json = project.readJson(file);
  const value = deepGet(json, parts.join('.'));
  // No root-leaf fallback: when sections were specified (`a.b.c`) but the
  // full path missed, a root-level key equal to the leaf (`{"c": …}`) must
  // not count as a section-scoped hit. That fallback fired on any JSON with
  // a coincidentally named top-level key.
  if (value === undefined) return false;
  if (contains === undefined) return true;
  return String(value).includes(contains);
}

function manifestHasText(
  project: Project,
  file: string,
  parts: string[],
  contains: string | undefined,
): boolean {
  // TOML / YAML / go.mod: section-scoped text search.
  const text = project.read(file);
  if (text === null) return false;
  const leaf = parts[parts.length - 1]!;
  const sections = parts.slice(0, -1);
  // Word boundaries on both sides: without the leading one, leaf `test`
  // matches inside `latest = …`; without the trailing one, similar affix
  // collisions apply. Manifest keys are identifiers, so \b is the right gate.
  const leafRe = new RegExp(`["']?\\b${escapeRe(leaf)}\\b["']?\\s*[=:]`, 'm');

  if (sections.length > 0) {
    const secName = sections[sections.length - 1]!;
    const block = extractSection(text, secName);
    if (block) {
      // The section exists: decide solely on its content. A dependency named
      // elsewhere (comments, other sections) must not satisfy a
      // section-scoped query, and `contains` is checked against the block.
      return leafRe.test(block) && containsOk(block, contains);
    }
    // No such section block. In a section-structured file (TOML/INI) that
    // means the requested structure is absent — fail, don't rummage the
    // whole file. In a flat file (YAML, go.mod) there are no blocks to
    // match, so fall through to the whole-text search below.
    if (hasSectionHeaders(text)) return false;
  }
  if (leafRe.test(text)) return containsOk(text, contains);
  return false;
}

/** True when the text contains at least one `[section]`-style header. */
function hasSectionHeaders(text: string): boolean {
  return /^\s*\[[^\]]*\]\s*$/m.test(text);
}

function containsOk(text: string, contains?: string): boolean {
  return contains === undefined || text.includes(contains);
}

/** Grabs the bodies of ini/TOML sections like `[dependencies]` or `[tool.poetry]`. */
function extractSection(text: string, section: string): string | null {
  const lines = text.split(/\r?\n/);
  const want = section.toLowerCase();
  let collecting = false;
  let found = false;
  let out = '';
  for (const line of lines) {
    const header = /^\s*\[([^\]]*)\]\s*$/.exec(line);
    if (header) {
      collecting = isWantedSection(header[1]!, want);
      if (collecting) found = true;
      continue;
    }
    if (collecting) out += line + '\n';
  }
  return found ? out : null;
}

/**
 * The requested name must equal a full dot-segment of the header,
 * case-insensitively. The old `\bname\b` substring test matched
 * `[dev-dependencies]` for `dependencies` (`-` is a non-word char) and missed
 * `[tool.Poetry]` for `poetry` (case). All matching blocks are gathered, not
 * just the first — a repeated section later in the file counts too.
 */
function isWantedSection(headerBody: string, want: string): boolean {
  const segments = headerBody.split('.').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  const last = segments[segments.length - 1] ?? '';
  return last.toLowerCase() === want;
}

function deepGet(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const key of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* --------------------------------------------------------------- maturity -- */

/**
 * Lifecycle classification. Deliberately conservative: a project is only
 * called "production" when it has release tags, CI, tests and recent activity.
 * The result drives severity dampening so a prototype is not graded like a
 * bank.
 */
export function classifyMaturity(
  flags: Set<string>,
  metrics: Record<string, number>,
  project?: Project,
): { maturity: Maturity; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  const bump = (n: number, why: string, cond: boolean) => {
    if (cond) {
      score += n;
      signals.push(`+${n} ${why}`);
    } else {
      signals.push(`+0 ${why} (absent)`);
    }
  };

  bump(1, 'tests present', flags.has('has:tests'));
  bump(1, 'CI configured', flags.has('has:ci'));
  bump(1, 'CHANGELOG maintained', flags.has('doc:changelog'));
  bump(1, 'release tags published', metrics['tags']! > 0);
  bump(1, 'meaningful history (>=50 commits)', metrics['commits']! >= 50);
  bump(1, 'security policy published', flags.has('doc:security-policy'));
  bump(0.5, 'containerised', flags.has('has:containers'));
  bump(0.5, 'monitoring configured', flags.has('has:monitoring'));
  bump(0.5, 'contributing guide', flags.has('doc:contributing'));

  const days = metrics['daysSinceLastCommit'];
  const stale = typeof days === 'number' && days > 365;
  const abandoned = typeof days === 'number' && days > 540;

  const stage = decideMaturityStage(score, metrics['tags']!, days, stale, abandoned, flags);
  let maturity = stage.maturity;
  if (stage.signal) signals.push(stage.signal);

  // A 0.x version with no tags is never "production".
  if (maturity === 'production' && project && isPrereleaseVersion(project)) {
    maturity = 'beta';
    signals.push('downgraded: 0.x version with no stable release');
  }

  signals.push(`maturity score ${score.toFixed(1)}/7.5 → ${maturity}`);
  return { maturity, signals };
}

function decideMaturityStage(
  score: number,
  tags: number,
  days: number | undefined,
  stale: boolean,
  abandoned: boolean,
  flags: Set<string>,
): { maturity: Maturity; signal?: string } {
  if (abandoned) {
    return { maturity: 'legacy', signal: `legacy: last commit ${days}d ago` };
  }
  if (stale && !flags.has('has:ci')) {
    return { maturity: 'legacy', signal: `legacy: ${days}d since last commit and no CI` };
  }
  if (score >= 7 && tags > 0) return { maturity: 'production' };
  if (score >= 5) return { maturity: 'beta' };
  if (score >= 2.5) return { maturity: 'mvp' };
  return { maturity: 'prototype' };
}

function isPrereleaseVersion(project: Project): boolean {
  const pkg = project.readJson('package.json') as { version?: string } | null;
  const v = pkg?.version;
  if (typeof v === 'string' && /^0\./.test(v)) return true;
  return false;
}

/* ------------------------------------------------------------------ helpers */

export function factsByPrefix(facts: Facts, prefix: string): string[] {
  const out: string[] = [];
  for (const f of facts.flags) {
    if (f.startsWith(`${prefix}:`)) out.push(f.slice(prefix.length + 1));
  }
  return out.sort();
}

export function loadDetectorFile(rulesDir: string): Detector[] {
  return loadDetectors(path.join(rulesDir, 'detectors.yaml'));
}
