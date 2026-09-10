import { parse as parseYaml } from 'yaml';
import { asMap, isMap, list, num, scalar, str, strList, type YamlMap } from '../util/yaml.js';
import fs from 'node:fs';
import path from 'node:path';
import type { Check, Depth, Rule, RuleClass, RulePack, Severity } from '../types.js';

export const SEVERITY_LADDER: Severity[] = ['FUTURE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const RULE_CLASSES: RuleClass[] = [
  'security',
  'supply-chain',
  'correctness',
  'maintainability',
  'operations',
  'performance',
  'compliance',
  'documentation',
  'style',
];

export const DEFAULT_WEIGHT: Record<Severity, number> = {
  CRITICAL: 10,
  HIGH: 6,
  MEDIUM: 3,
  LOW: 1.5,
  FUTURE: 0.5,
};

export interface LoaderResult {
  packs: RulePack[];
  warnings: string[];
}

/** Read `rules/index.yaml` and every pack it references. */
export function loadRulePacks(rulesDir: string): LoaderResult {
  const warnings: string[] = [];
  const indexPath = path.join(rulesDir, 'index.yaml');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Rule index not found at ${indexPath}. Pass --rules-dir or run \`usa init\`.`);
  }
  let indexDoc: { packs?: (string | { file: string; enabled?: boolean })[] } | null;
  try {
    indexDoc = parseYaml(fs.readFileSync(indexPath, 'utf8')) as typeof indexDoc;
  } catch (err) {
    // A corrupt index must not abort the audit with a stack trace: warn and
    // continue with zero packs rather than zero findings with no explanation.
    warnings.push(
      `rule index ${indexPath} is not valid YAML (${(err as Error).message}) — no packs loaded`,
    );
    return { packs: [], warnings };
  }
  const entries = indexDoc?.packs ?? [];

  const packs: RulePack[] = [];
  const seenIds = new Set<string>();
  const seenRuleIds = new Map<string, string>();

  for (const entry of entries) {
    processIndexEntry(entry, rulesDir, packs, seenIds, seenRuleIds, warnings);
  }
  return { packs, warnings };
}

function processIndexEntry(
  entry: string | { file: string; enabled?: boolean },
  rulesDir: string,
  packs: RulePack[],
  seenIds: Set<string>,
  seenRuleIds: Map<string, string>,
  warnings: string[],
): void {
  const file = typeof entry === 'string' ? entry : entry.file;
  const enabled = typeof entry === 'string' ? true : entry.enabled !== false;
  if (!enabled) return;
  const abs = path.resolve(rulesDir, file);
  if (!fs.existsSync(abs)) {
    warnings.push(`pack listed in index but missing on disk: ${file}`);
    return;
  }
  const pack = parsePack(abs, seenRuleIds, warnings);
  if (!pack) return;
  if (seenIds.has(pack.id)) {
    warnings.push(`duplicate pack id "${pack.id}" (${file}) — later pack ignored`);
    return;
  }
  seenIds.add(pack.id);
  pack.source = path.relative(path.dirname(rulesDir), abs) || file;
  packs.push(pack);
}

function parsePack(
  file: string,
  seenRuleIds: Map<string, string>,
  warnings: string[],
): RulePack | null {
  let raw: unknown;
  try {
    raw = parseYaml(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    // One corrupt pack must not abort the whole audit: skip it loudly.
    warnings.push(`pack ${file} is not valid YAML (${(err as Error).message}) — pack skipped`);
    return null;
  }
  if (!isMap(raw)) {
    warnings.push(`${file}: not a YAML mapping`);
    return null;
  }
  const id = str(raw.id) ?? path.basename(file, path.extname(file));
  const rules: Rule[] = [];

  (list(raw.rules) ?? []).forEach((r, i) => {
    const parsed = parseRule(r, id, i, warnings);
    if (!parsed) return;
    const firstSeen = seenRuleIds.get(parsed.id);
    if (firstSeen !== undefined) {
      // Duplicate rule IDs double-count weight in scoring and collide as
      // duplicate YAML keys in the report trailer (second silently wins in
      // `usa diff`). First definition wins; the later one is dropped loudly.
      warnings.push(
        `duplicate rule id "${parsed.id}" in pack "${id}" (first defined in pack "${firstSeen}") — later rule ignored`,
      );
      return;
    }
    seenRuleIds.set(parsed.id, id);
    rules.push(parsed);
  });

  return {
    id,
    title: str(raw.title) ?? id,
    description: str(raw.description),
    version: str(raw.version),
    section: str(raw.section),
    sectionTitle: str(raw.section_title),
    skipWhen: isMap(raw.skip_when) ? (raw.skip_when as RulePack['skipWhen']) : undefined,
    provides: strList(raw.provides),
    rules,
  };
}

function parseRule(raw: unknown, packId: string, index: number, warnings: string[]): Rule | null {
  const where = `${packId}[${index}]`;
  const head = readRuleHead(raw, where, warnings);
  if (!head) return null;
  const { map: r, id, severity } = head;
  const ruleClass = resolveRuleClass(r, where, id, warnings);
  const check = parseCheck(r.check, `${where} ${id}`, warnings);
  if (!check) return null;
  validatePredicate(r.applies_when, `${where} ${id}`, warnings);
  return assembleRule(r, id, severity, ruleClass, check);
}

function assembleRule(
  r: YamlMap,
  id: string,
  severity: Severity,
  ruleClass: RuleClass,
  check: Check,
): Rule {
  const depths = Array.isArray(r.depths) ? (r.depths.filter(isDepth) as Depth[]) : undefined;
  return {
    id,
    title: String(r.title ?? id),
    section: String(r.section ?? 'S0'),
    sectionTitle: optText(r.section_title),
    severity,
    weight: optNumber(r.weight),
    ruleClass,
    appliesWhen: r.applies_when as Rule['appliesWhen'],
    depths,
    check,
    why: optText(r.why),
    evidence: optText(r.evidence),
    remediation: optText(r.remediation),
    references: optStrArray(r.references),
    tags: optStrArray(r.tags),
  };
}

function optText(v: unknown): string | undefined {
  return v ? String(v) : undefined;
}

function optNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function optStrArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.map(String) : undefined;
}

function readRuleHead(
  raw: unknown,
  where: string,
  warnings: string[],
): { map: YamlMap; id: string; severity: Severity } | null {
  if (!isMap(raw)) {
    warnings.push(`${where}: rule is not a mapping`);
    return null;
  }
  const id = raw.id ? String(raw.id) : null;
  if (!id) {
    warnings.push(`${where}: rule missing "id"`);
    return null;
  }
  const severity = normalizeSeverity(raw.severity);
  if (!severity) {
    warnings.push(`${where} ${id}: invalid severity "${String(raw.severity)}"`);
    return null;
  }
  return { map: raw, id, severity };
}

function resolveRuleClass(r: YamlMap, where: string, id: string, warnings: string[]): RuleClass {
  const declaredClass = str(r.class);
  if (declaredClass && !(RULE_CLASSES as readonly string[]).includes(declaredClass)) {
    warnings.push(`${where} ${id}: unknown class "${declaredClass}" → maintainability`);
  }
  return declaredClass && (RULE_CLASSES as readonly string[]).includes(declaredClass)
    ? (declaredClass as RuleClass)
    : 'maintainability';
}

/** One check kind per entry — adding a kind means adding a line, not a branch. */
const CHECK_BUILDERS: Record<string, (c: YamlMap) => Check> = {
  manual: () => ({ kind: 'manual' }),
  info: () => ({ kind: 'info' }),
  file_exists: (c) => ({ kind: 'file_exists', files: toStringArray(c.files) }),
  file_absent: (c) => ({ kind: 'file_absent', files: toStringArray(c.files) }),
  any_file: (c) => ({ kind: 'any_file', patterns: toStringArray(c.patterns ?? c.files) }),
  grep_present: (c) => grepCheck('grep_present', c),
  grep_absent: (c) => grepCheck('grep_absent', c),
  grep_wrong: (c) => grepCheck('grep_wrong', c),
  grep_deprecated: (c) => grepCheck('grep_deprecated', c),
  json_path: (c) => ({
    kind: 'json_path',
    file: String(c.file ?? ''),
    path: String(c.path ?? ''),
    equals: scalar(c.equals) ?? undefined,
  }),
  tracked_present: (c) => ({
    kind: 'tracked_present',
    patterns: toStringArray(c.patterns ?? c.files),
  }),
  tracked_absent: (c) => ({
    kind: 'tracked_absent',
    patterns: toStringArray(c.patterns ?? c.files),
  }),
  file_lines_max: (c) => ({
    kind: 'file_lines_max',
    patterns: toStringArray(c.patterns ?? c.files),
    max_lines: num(c.max_lines) ?? 800,
  }),
  count_min: (c) => ({
    kind: 'count_min',
    patterns: toStringArray(c.patterns ?? c.files),
    min: num(c.min) ?? 1,
  }),
  command: (c) => ({
    kind: 'command',
    run: str(c.run) ?? '',
    expect_exit: num(c.expect_exit) ?? 0,
  }),
};

function parseCheck(raw: unknown, where: string, warnings: string[]): Check | null {
  const c = asMap(raw);
  const kind = str(c.kind);
  if (!kind) {
    warnings.push(`${where}: check missing "kind"`);
    return null;
  }
  const build = CHECK_BUILDERS[kind];
  if (!build) {
    warnings.push(`${where}: unsupported check kind "${String(c.kind)}"`);
    return null;
  }
  const built = build(c);
  if (built.kind.startsWith('grep_') && 'pattern' in built && built.pattern === '') {
    // `new RegExp('')` matches every line: a grep_absent rule with a missing
    // pattern FAILs the whole repo, a grep_present one awards free credit.
    // A malformed rule must never become a score weapon — drop it loudly.
    warnings.push(
      `${where}: ${built.kind} has an empty pattern (matches every line) — rule ignored`,
    );
    return null;
  }
  return built;
}

/** Predicate operators the evaluator understands. Anything else fails closed. */
const PREDICATE_OPS = new Set([
  'exists',
  'absent',
  'eq',
  'neq',
  'in',
  'includes',
  'gt',
  'lt',
  'matches',
]);

/**
 * `applies_when` is author-controlled input to the audit hot loop. An unknown
 * key, a non-list `all`/`any`, or an uncompilable `matches` regex must warn at
 * load time, because evaluation fails closed (rule skipped) on all of them.
 */
export function validatePredicate(p: unknown, where: string, warnings: string[]): void {
  if (p === undefined || p === null) return;
  if (!isMap(p)) {
    warnings.push(`${where}: applies_when must be a mapping — constraint ignored, rule skipped`);
    return;
  }
  const keys = Object.keys(p);
  if (keys.length === 0) return;
  for (const k of keys) {
    validatePredicateKey(p, k, where, warnings);
  }
}

function validatePredicateKey(p: YamlMap, k: string, where: string, warnings: string[]): void {
  if (k === 'all' || k === 'any') {
    validatePredicateList(p[k], `${where}: applies_when.${k}`, warnings);
    return;
  }
  if (k === 'not') {
    validatePredicate(p.not, where, warnings);
    return;
  }
  if (k === 'fact') {
    validateFactPredicate(p, where, warnings);
    return;
  }
  if (k === 'op' || k === 'value') {
    // `op`/`value` are operands of a sibling `fact` — meaningful only there.
    if (typeof p.fact !== 'string') {
      warnings.push(`${where}: "${k}" without a "fact" — ignoring`);
    }
    return;
  }
  warnings.push(`${where}: unknown applies_when key "${k}" — constraint ignored, rule skipped`);
}

function validatePredicateList(v: unknown, where: string, warnings: string[]): void {
  const items = list(v);
  if (!items) {
    warnings.push(`${where} must be a list — constraint ignored`);
    return;
  }
  for (const item of items) validatePredicate(item, where, warnings);
}

function validateFactPredicate(p: YamlMap, where: string, warnings: string[]): void {
  const op = str(p.op) ?? 'exists';
  if (!PREDICATE_OPS.has(op)) {
    warnings.push(`${where}: unknown predicate op "${op}" — rule will never apply`);
    return;
  }
  if (op === 'matches' && typeof p.value === 'string') {
    try {
      new RegExp(p.value);
    } catch {
      warnings.push(
        `${where}: invalid regex in matches predicate ("${String(p.value)}") — rule will never apply`,
      );
    }
  }
}

/** The four grep_* kinds share a shape; they differ only in polarity. */
function grepCheck(
  kind: 'grep_present' | 'grep_absent' | 'grep_wrong' | 'grep_deprecated',
  c: YamlMap,
): Check {
  return {
    kind,
    pattern: str(c.pattern) ?? '',
    include: toStringArray(c.include),
    exclude: c.exclude ? toStringArray(c.exclude) : undefined,
    flags: str(c.flags),
  };
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return [v];
  return [];
}

function normalizeSeverity(v: unknown): Severity | null {
  const s = String(v ?? '').toUpperCase();
  return (SEVERITY_LADDER as string[]).includes(s) ? (s as Severity) : null;
}

function isDepth(v: unknown): v is Depth {
  return v === 'quick' || v === 'standard' || v === 'deep';
}

/** Merge config-driven rule overrides onto loaded packs. */
export function applyRuleOverrides(
  packs: RulePack[],
  overrides: Record<string, { severity?: Severity; weight?: number }>,
): void {
  for (const pack of packs) {
    for (const rule of pack.rules) {
      const o = overrides[rule.id];
      if (!o) continue;
      if (o.severity) rule.severity = o.severity;
      if (typeof o.weight === 'number') rule.weight = o.weight;
    }
  }
}
