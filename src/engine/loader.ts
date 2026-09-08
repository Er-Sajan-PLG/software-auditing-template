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
    const file = typeof entry === 'string' ? entry : entry.file;
    const enabled = typeof entry === 'string' ? true : entry.enabled !== false;
    if (!enabled) continue;
    const abs = path.resolve(rulesDir, file);
    if (!fs.existsSync(abs)) {
      warnings.push(`pack listed in index but missing on disk: ${file}`);
      continue;
    }
    const pack = parsePack(abs, warnings);
    if (!pack) continue;
    if (seenIds.has(pack.id)) {
      warnings.push(`duplicate pack id "${pack.id}" (${file}) — later pack ignored`);
      continue;
    }
    seenIds.add(pack.id);
    pack.source = path.relative(path.dirname(rulesDir), abs) || file;
    packs.push(pack);
  }
  return { packs, warnings };
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
  if (!isMap(raw)) {
    warnings.push(`${where}: rule is not a mapping`);
    return null;
  }
  const r = raw;
  const id = r.id ? String(r.id) : null;
  if (!id) {
    warnings.push(`${where}: rule missing "id"`);
    return null;
  }
  const severity = normalizeSeverity(r.severity);
  if (!severity) {
    warnings.push(`${where} ${id}: invalid severity "${String(r.severity)}"`);
    return null;
  }
  const declaredClass = str(r.class);
  const ruleClass: RuleClass =
    declaredClass && (RULE_CLASSES as readonly string[]).includes(declaredClass)
      ? (declaredClass as RuleClass)
      : 'maintainability';
  if (declaredClass && !(RULE_CLASSES as readonly string[]).includes(declaredClass)) {
    warnings.push(`${where} ${id}: unknown class "${declaredClass}" → maintainability`);
  }
  const check = parseCheck(r.check, `${where} ${id}`, warnings);
  if (!check) return null;
  const depths = Array.isArray(r.depths) ? (r.depths.filter(isDepth) as Depth[]) : undefined;

  return {
    id,
    title: String(r.title ?? id),
    section: String(r.section ?? 'S0'),
    sectionTitle: r.section_title ? String(r.section_title) : undefined,
    severity,
    weight: typeof r.weight === 'number' ? r.weight : undefined,
    ruleClass,
    appliesWhen: r.applies_when as Rule['appliesWhen'],
    depths,
    check,
    why: r.why ? String(r.why) : undefined,
    evidence: r.evidence ? String(r.evidence) : undefined,
    remediation: r.remediation ? String(r.remediation) : undefined,
    references: Array.isArray(r.references) ? r.references.map(String) : undefined,
    tags: Array.isArray(r.tags) ? r.tags.map(String) : undefined,
  };
}

function parseCheck(raw: unknown, where: string, warnings: string[]): Check | null {
  const c = asMap(raw);
  if (!str(c.kind)) {
    warnings.push(`${where}: check missing "kind"`);
    return null;
  }
  switch (str(c.kind)) {
    case 'manual':
      return { kind: 'manual' };
    case 'info':
      return { kind: 'info' };
    case 'file_exists':
      return { kind: 'file_exists', files: toStringArray(c.files) };
    case 'file_absent':
      return { kind: 'file_absent', files: toStringArray(c.files) };
    case 'any_file':
      return { kind: 'any_file', patterns: toStringArray(c.patterns ?? c.files) };
    case 'grep_present':
      return grepCheck('grep_present', c);
    case 'grep_absent':
      return grepCheck('grep_absent', c);
    case 'grep_wrong':
      return grepCheck('grep_wrong', c);
    case 'grep_deprecated':
      return grepCheck('grep_deprecated', c);
    case 'json_path':
      return {
        kind: 'json_path',
        file: String(c.file ?? ''),
        path: String(c.path ?? ''),
        equals: scalar(c.equals) ?? undefined,
      };
    case 'tracked_present':
      return { kind: 'tracked_present', patterns: toStringArray(c.patterns ?? c.files) };
    case 'tracked_absent':
      return { kind: 'tracked_absent', patterns: toStringArray(c.patterns ?? c.files) };
    case 'file_lines_max':
      return {
        kind: 'file_lines_max',
        patterns: toStringArray(c.patterns ?? c.files),
        max_lines: num(c.max_lines) ?? 800,
      };
    case 'count_min':
      return {
        kind: 'count_min',
        patterns: toStringArray(c.patterns ?? c.files),
        min: num(c.min) ?? 1,
      };
    case 'command':
      return { kind: 'command', run: str(c.run) ?? '', expect_exit: num(c.expect_exit) ?? 0 };
    default:
      warnings.push(`${where}: unsupported check kind "${String(c.kind)}"`);
      return null;
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
