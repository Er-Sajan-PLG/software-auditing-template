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
  '**/*.test.*',
  '**/*.spec.*',
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

  // Two passes so `implies` chains resolve regardless of declaration order.
  for (let pass = 0; pass < 2; pass++) {
    for (const d of detectors) {
      if (flags.has(d.fact)) continue;
      let hit = false;
      if (d.implies?.length) {
        hit = d.implies.every((f) => flags.has(f));
      }
      if (!hit && d.match) {
        hit = evalMatch(d.match, project, flags, metrics);
      }
      if (hit) {
        flags.add(d.fact);
        if (!fired.some((f) => f.fact === d.fact)) {
          fired.push({ fact: d.fact, title: d.title, category: d.category });
        }
      }
    }
  }

  const { maturity, signals } = classifyMaturity(flags, metrics, project);
  flags.add(`maturity:${maturity}`);

  return { facts: { flags, metrics }, detectorsFired: fired, maturity, maturitySignals: signals };
}

function evalMatch(
  m: DetectorMatch,
  project: Project,
  flags: Set<string>,
  metrics: Record<string, number>,
): boolean {
  const checks: boolean[] = [];

  if (m.any_file?.length) checks.push(project.anyFile(m.any_file));
  if (m.file_exists?.length) checks.push(m.file_exists.some((f) => project.glob([f]).length > 0));
  if (m.dir_exists?.length) checks.push(m.dir_exists.some((d) => project.dirExists(d)));
  if (m.content) {
    const { include, pattern } = m.content;
    checks.push(project.grep(pattern, include, CONTENT_EXCLUDES).length > 0);
  }
  if (m.manifest) {
    checks.push(manifestHas(project, m.manifest));
  }
  if (m.metric) {
    const v = metrics[m.metric.name] ?? 0;
    if (m.metric.min !== undefined && v < m.metric.min) checks.push(false);
    else if (m.metric.max !== undefined && v > m.metric.max) checks.push(false);
    else checks.push(true);
  }
  if (m.any_of?.length) checks.push(m.any_of.some((c) => evalMatch(c, project, flags, metrics)));
  if (m.all_of?.length) checks.push(m.all_of.every((c) => evalMatch(c, project, flags, metrics)));

  return checks.length > 0 && checks.every(Boolean);
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
  const leaf = parts[parts.length - 1]!;
  const sections = parts.slice(0, -1);

  if (file.endsWith('.json')) {
    const json = project.readJson(file);
    const rawPath = parts.join('.');
    let value = deepGet(json, rawPath);
    if (value === undefined && sections.length > 0) {
      value = deepGet(json, leaf);
    }
    if (value === undefined) return false;
    if (m.contains === undefined) return true;
    return String(value).includes(m.contains);
  }

  // TOML / YAML / go.mod: section-scoped text search.
  const text = project.read(file);
  if (text === null) return false;
  const escaped = escapeRe(leaf);
  const leafRe = new RegExp(`["']?${escaped}["']?\\s*[=:]`, 'm');

  if (sections.length > 0) {
    const secName = sections[sections.length - 1]!;
    const block = extractSection(text, secName);
    if (block && leafRe.test(block)) return containsOk(text, m.contains);
  }
  if (leafRe.test(text)) return containsOk(text, m.contains);
  return false;
}

function containsOk(text: string, contains?: string): boolean {
  return contains === undefined || text.includes(contains);
}

/** Grabs the body of an ini/TOML section like `[dependencies]` or `[tool.poetry]`. */
function extractSection(text: string, section: string): string | null {
  const lines = text.split(/\r?\n/);
  const headerRe = new RegExp(`^\\s*\\[[^\\]]*\\b${escapeRe(section)}\\b[^\\]]*\\]\\s*$`);
  let collecting = false;
  let out = '';
  for (const line of lines) {
    if (/^\s*\[/.test(line)) {
      if (collecting) break;
      collecting = headerRe.test(line);
      continue;
    }
    if (collecting) out += line + '\n';
  }
  return collecting ? out : null;
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

  let maturity: Maturity;
  if (abandoned) {
    maturity = 'legacy';
    signals.push(`legacy: last commit ${days}d ago`);
  } else if (stale && !flags.has('has:ci')) {
    maturity = 'legacy';
    signals.push(`legacy: ${days}d since last commit and no CI`);
  } else if (score >= 7 && metrics['tags']! > 0) {
    maturity = 'production';
  } else if (score >= 5) {
    maturity = 'beta';
  } else if (score >= 2.5) {
    maturity = 'mvp';
  } else {
    maturity = 'prototype';
  }

  // A 0.x version with no tags is never "production".
  if (maturity === 'production' && project && isPrereleaseVersion(project)) {
    maturity = 'beta';
    signals.push('downgraded: 0.x version with no stable release');
  }

  signals.push(`maturity score ${score.toFixed(1)}/7.5 → ${maturity}`);
  return { maturity, signals };
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
