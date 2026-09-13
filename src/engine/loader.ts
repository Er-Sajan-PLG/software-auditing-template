import { parse as parseYaml } from 'yaml';
import { asMap, isMap, list, num, scalar, str, strList, type YamlMap } from '../util/yaml.js';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Automatability,
  Check,
  Depth,
  OracleLevel,
  OracleOp,
  Rule,
  RuleClass,
  RulePack,
  Severity,
} from '../types.js';
import { validateAutomatability, validateCatalogue } from './automatability.js';

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

/**
 * Load a single pack file (not the registry). Used by the evolution CLI to load
 * a candidate capability pack that is *not* (yet) in `rules/index.yaml`.
 */
export function loadPackFile(file: string): { pack: RulePack | null; warnings: string[] } {
  const warnings: string[] = [];
  const pack = parsePack(path.resolve(file), new Map(), warnings);
  if (pack) pack.source = path.basename(file);
  return { pack, warnings };
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
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    warnings.push(`pack ${file} could not be read (${(err as Error).message}) — pack skipped`);
    return null;
  }
  return parsePackText(text, file, seenRuleIds, warnings);
}

/**
 * Parse a rule pack from YAML text in memory. Shared by the file loader and the
 * evolution proposal stage, which renders a candidate pack (from the bootstrap
 * catalog) without ever touching the checked-in registry. `sourceName` is only
 * used in warnings and as the fallback pack id.
 */
export function parsePackText(
  text: string,
  sourceName: string,
  seenRuleIds: Map<string, string> = new Map(),
  warnings: string[] = [],
): RulePack | null {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    // One corrupt pack must not abort the whole audit: skip it loudly.
    warnings.push(
      `pack ${sourceName} is not valid YAML (${(err as Error).message}) — pack skipped`,
    );
    return null;
  }
  if (!isMap(raw)) {
    warnings.push(`${sourceName}: not a YAML mapping`);
    return null;
  }
  const id = str(raw.id) ?? path.basename(sourceName, path.extname(sourceName));
  const rules: Rule[] = [];

  // Pack-level catalogue is the default for its rules; validate the pin once.
  const packCtx: PackContext = { catalogue: validPackCatalogue(raw, id, warnings) };

  (list(raw.rules) ?? []).forEach((r, i) => {
    const parsed = parseRule(r, id, i, warnings, packCtx);
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
    catalogue: packCtx.catalogue,
    rules,
  };
}

/** Defaults a pack applies to each of its rules. */
interface PackContext {
  catalogue?: string;
}

/** The pack's `catalogue:` pin if it is valid, else undefined (with a warning). */
function validPackCatalogue(raw: YamlMap, id: string, warnings: string[]): string | undefined {
  const value = str(raw.catalogue);
  if (value === undefined) return undefined;
  const problem = validateCatalogue(value);
  if (problem) {
    warnings.push(`pack ${id}: ${problem} — catalogue ignored`);
    return undefined;
  }
  return value;
}

function parseRule(
  raw: unknown,
  packId: string,
  index: number,
  warnings: string[],
  pack: PackContext,
): Rule | null {
  const where = `${packId}[${index}]`;
  const head = readRuleHead(raw, where, warnings);
  if (!head) return null;
  const { map: r, id, severity } = head;
  const ruleClass = resolveRuleClass(r, where, id, warnings);
  const check = parseCheck(r.check, `${where} ${id}`, warnings);
  if (!check) return null;
  validatePredicate(r.applies_when, `${where} ${id}`, warnings);
  return assembleRule(r, id, severity, ruleClass, check, pack, warnings);
}

function assembleRule(
  r: YamlMap,
  id: string,
  severity: Severity,
  ruleClass: RuleClass,
  check: Check,
  pack: PackContext,
  warnings: string[],
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
    automatability: resolveAutomatability(r, id, check, warnings),
    catalogue: resolveRuleCatalogue(r, id, pack, warnings),
  };
}

function resolveAutomatability(
  r: YamlMap,
  id: string,
  check: Check,
  warnings: string[],
): Automatability | undefined {
  const claimed = optText(r.automatability) as Automatability | undefined;
  if (claimed === undefined) return undefined; // derived by ruleAutomatability()
  const problem = validateAutomatability(claimed, check);
  if (problem) {
    warnings.push(`rule ${id}: ${problem} — using derived value`);
    return undefined;
  }
  return claimed;
}

function resolveRuleCatalogue(
  r: YamlMap,
  id: string,
  pack: PackContext,
  warnings: string[],
): string | undefined {
  const own = optText(r.catalogue);
  if (own === undefined) return pack.catalogue;
  const problem = validateCatalogue(own);
  if (problem) {
    warnings.push(`rule ${id}: ${problem} — catalogue ignored`);
    return pack.catalogue;
  }
  return own;
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
  oracle: (c) => ({
    kind: 'oracle',
    source: (str(c.source) ?? 'sarif') as 'sarif' | 'json',
    file: str(c.file) ?? '',
    path: str(c.path),
    levels: (strList(c.levels) ?? []).filter(isOracleLevel),
    rules: strList(c.rules) ?? [],
    op: (str(c.op) ?? 'at_most') as OracleOp,
    // A missing or non-numeric bound becomes NaN so validation rejects the
    // rule; defaulting to 0 would silently turn a typo into "at most 0".
    value: num(c.value) ?? NaN,
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
  if (built.kind === 'oracle') {
    const problem = oracleProblem(built);
    if (problem) {
      warnings.push(`${where}: ${problem} — rule ignored`);
      return null;
    }
  }
  return built;
}

/**
 * Validates an `oracle` check's shape. An assertion with no file, an unknown
 * source/op, a missing JSON path, or a non-finite bound could compare
 * `undefined` and silently pass — so any of those returns a message and the
 * rule is dropped (ADR-0009).
 */
function oracleProblem(check: Extract<Check, { kind: 'oracle' }>): string | null {
  if (check.file === '') return 'oracle check missing "file"';
  if (!isOracleSource(check.source)) return 'oracle source must be "sarif" or "json"';
  if (!isOracleOp(check.op)) return 'oracle op must be at_most|at_least|equals';
  if (!Number.isFinite(check.value)) return 'oracle check needs a finite "value"';
  if (check.source === 'json' && (check.path === undefined || check.path === '')) {
    return 'oracle json source needs "path"';
  }
  return null;
}

function isOracleSource(v: string): v is 'sarif' | 'json' {
  return v === 'sarif' || v === 'json';
}

function isOracleOp(v: string | undefined): v is OracleOp {
  return v === 'at_most' || v === 'at_least' || v === 'equals';
}

function isOracleLevel(v: string): v is OracleLevel {
  return v === 'error' || v === 'warning' || v === 'note';
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
