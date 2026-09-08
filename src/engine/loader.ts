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
    throw new Error(`Rule index not found at ${indexPath}. Pass --rules-dir or run \`usat init\`.`);
  }
  const indexDoc = parseYaml(fs.readFileSync(indexPath, 'utf8')) as {
    packs?: (string | { file: string; enabled?: boolean })[];
  } | null;
  const entries = indexDoc?.packs ?? [];

  const packs: RulePack[] = [];
  const seenIds = new Set<string>();

  for (const entry of entries) {
    processIndexEntry(entry, rulesDir, packs, seenIds, warnings);
  }
  return { packs, warnings };
}

function processIndexEntry(
  entry: string | { file: string; enabled?: boolean },
  rulesDir: string,
  packs: RulePack[],
  seenIds: Set<string>,
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
  const pack = parsePack(abs, warnings);
  if (!pack) return;
  if (seenIds.has(pack.id)) {
    warnings.push(`duplicate pack id "${pack.id}" (${file}) — later pack ignored`);
    return;
  }
  seenIds.add(pack.id);
  pack.source = path.relative(path.dirname(rulesDir), abs) || file;
  packs.push(pack);
}

function parsePack(file: string, warnings: string[]): RulePack | null {
  const raw = parseYaml(fs.readFileSync(file, 'utf8'));
  if (!isMap(raw)) {
    warnings.push(`${file}: not a YAML mapping`);
    return null;
  }
  const id = str(raw.id) ?? path.basename(file, path.extname(file));
  const rules: Rule[] = [];

  (list(raw.rules) ?? []).forEach((r, i) => {
    const parsed = parseRule(r, id, i, warnings);
    if (parsed) rules.push(parsed);
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
  return build(c);
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
