import { execFileSync } from 'node:child_process';
import type {
  Check,
  Depth,
  Facts,
  Finding,
  Location,
  Predicate,
  Rule,
  RulePack,
  Severity,
  Status,
} from '../types.js';
import { Project } from '../util/project.js';
import { DEFAULT_WEIGHT } from './loader.js';

export interface EvalContext {
  project: Project;
  facts: Facts;
  depth: Depth;
  allowCommands: boolean;
  disabled: Set<string>;
  suppressions: Map<string, string>;
}

/* ------------------------------------------------------------ applicability */

export function evalPredicate(p: Predicate | undefined, facts: Facts): boolean {
  if (!p) return true;
  // Programmatic callers can hand us anything (the loader validates
  // file-loaded packs and warns). Malformed applicability fails closed —
  // a rule no one can parse must not silently apply to every repo.
  if (typeof p !== 'object') return false;
  if (Object.keys(p).length === 0) return true;
  return evalPredicateKeys(p, facts);
}

function evalPredicateKeys(p: Predicate, facts: Facts): boolean {
  if ('all' in p && Array.isArray(p.all)) return p.all.every((x) => evalPredicate(x, facts));
  if ('any' in p && Array.isArray(p.any)) return p.any.some((x) => evalPredicate(x, facts));
  if ('not' in p && p.not) return !evalPredicate(p.not, facts);
  if ('fact' in p && typeof p.fact === 'string') return evalFact(p, facts);
  return false;
}

interface FactOperands {
  isMetric: boolean;
  present: boolean;
  metric: number | undefined;
  value: unknown;
}

/** One predicate operator per entry — adding an operator means adding a line. */
const OP_HANDLERS: Record<string, (o: FactOperands) => boolean> = {
  absent: (o) => (o.isMetric ? o.metric === undefined : !o.present),
  exists: (o) => (o.isMetric ? o.metric !== undefined : o.present),
  eq: (o) => (o.isMetric ? o.metric === Number(o.value) : o.present === Boolean(o.value)),
  neq: (o) => (o.isMetric ? o.metric !== Number(o.value) : o.present !== Boolean(o.value)),
  in: (o) => {
    // Membership only means something for metric facts (numbers). Flag facts
    // are presence-only — there is no value to test membership against.
    if (!o.isMetric || !Array.isArray(o.value)) return false;
    return o.value.some((v) => v === o.metric || String(v) === String(o.metric ?? ''));
  },
  includes: (o) => {
    // Same contract as `in`: the metric value must appear in the listed
    // values. Presence alone never satisfies a value comparison.
    if (!o.isMetric || !Array.isArray(o.value)) return false;
    return o.value.some((v) => v === o.metric || String(v) === String(o.metric ?? ''));
  },
  gt: (o) => typeof o.metric === 'number' && o.metric > Number(o.value ?? 0),
  lt: (o) => typeof o.metric === 'number' && o.metric < Number(o.value ?? 0),
  matches: (o) => {
    if (typeof o.value !== 'string') return false;
    try {
      return new RegExp(o.value).test(String(o.metric ?? ''));
    } catch {
      // Invalid regex fails closed; the loader warns at pack load time.
      return false;
    }
  },
};

function evalFact(p: Extract<Predicate, { fact: string }>, facts: Facts): boolean {
  const { fact, op = 'exists', value } = p;
  const isMetric = fact.startsWith('metric:');
  const key = isMetric ? fact.slice('metric:'.length) : fact;
  // Unknown operators fail closed (rule skipped), never silently applied.
  // The loader warns at pack load time; this is the programmatic-API backstop.
  const handler = OP_HANDLERS[op] ?? (() => false);
  return handler({
    isMetric,
    present: facts.flags.has(fact),
    metric: facts.metrics[key],
    value,
  });
}

export function ruleApplies(rule: Rule, facts: Facts, depth: Depth, includeAll = false): boolean {
  // Forced packs apply wholesale — that is the documented contract of
  // `include` ("always load, even if appliesWhen says no"). Depth *and*
  // applicability are both bypassed when the operator forces a pack on.
  if (includeAll) return true;
  if (rule.depths && rule.depths.length > 0 && !rule.depths.includes(depth)) {
    return false;
  }
  return evalPredicate(rule.appliesWhen, facts);
}

export function packApplies(pack: RulePack, facts: Facts): boolean {
  return evalPredicate(pack.skipWhen ? { not: pack.skipWhen } : undefined, facts);
}

/* -------------------------------------------------------------- evaluation */

export function evaluateRule(rule: Rule, ctx: EvalContext): Finding {
  const base: Omit<Finding, 'status' | 'message' | 'locations' | 'severity' | 'dampened'> = {
    ruleId: rule.id,
    title: rule.title,
    section: rule.section,
    sectionTitle: rule.sectionTitle ?? rule.section,
    baseSeverity: rule.severity,
    ruleClass: rule.ruleClass,
    why: rule.why,
    evidenceHint: rule.evidence,
    remediation: rule.remediation,
    references: rule.references,
  };

  if (ctx.disabled.has(rule.id)) {
    return {
      ...base,
      status: 'NOT_APPLICABLE',
      severity: rule.severity,
      dampened: false,
      message: 'Disabled by project configuration.',
      locations: [],
    };
  }

  const suppressed = ctx.suppressions.get(rule.id);
  const { status, message, locations } = runCheck(rule, ctx, rule.check);

  const finding: Finding = {
    ...base,
    status,
    severity: rule.severity,
    dampened: false,
    message,
    locations,
  };

  if (suppressed && status !== 'PASS' && status !== 'NOT_APPLICABLE') {
    finding.suppressedReason = suppressed;
  }
  return finding;
}

type CheckOutcome = { status: Status; message: string; locations: Location[] };

interface CheckHelpers {
  project: Project;
  allowCommands: boolean;
  missing: (detail: string) => CheckOutcome;
  pass: (detail: string, locations?: Location[]) => CheckOutcome;
}

function missingOutcome(detail: string): CheckOutcome {
  return { status: 'MISSING', message: `Not detected — ${detail}.`, locations: [] };
}

function passOutcome(detail: string, locations: Location[] = []): CheckOutcome {
  return { status: 'PASS', message: `Verified — ${detail}.`, locations };
}

function unknownOutcome(message: string): CheckOutcome {
  return { status: 'UNKNOWN', message, locations: [] };
}

type GrepCheck = Extract<
  Check,
  { kind: 'grep_present' | 'grep_absent' | 'grep_wrong' | 'grep_deprecated' }
>;

function queryGrep(project: Project, check: GrepCheck) {
  return project.grep(check.pattern, check.include, check.exclude ?? [], check.flags ?? '');
}

function checkManual(_check: Extract<Check, { kind: 'manual' }>, _h: CheckHelpers): CheckOutcome {
  return unknownOutcome('Requires judgement — no automated evidence recorded.');
}

function checkInfo(_check: Extract<Check, { kind: 'info' }>, _h: CheckHelpers): CheckOutcome {
  return { status: 'NOT_APPLICABLE', message: 'Context only.', locations: [] };
}

function checkFileExists(
  check: Extract<Check, { kind: 'file_exists' }>,
  h: CheckHelpers,
): CheckOutcome {
  const found = check.files.flatMap((f) => h.project.glob([f]));
  if (found.length === 0) return h.missing(`none of [${check.files.join(', ')}] found`);
  return h.pass(`found ${found.slice(0, 5).join(', ')}`, found.slice(0, 5).map(toLocation));
}

function checkFileAbsent(
  check: Extract<Check, { kind: 'file_absent' }>,
  h: CheckHelpers,
): CheckOutcome {
  const found = check.files.flatMap((f) => h.project.glob([f]));
  if (found.length === 0) return h.pass(`none of [${check.files.join(', ')}] present`);
  return {
    status: 'FAIL',
    message: `${found.length} forbidden path(s) present: ${found.slice(0, 5).join(', ')}.`,
    locations: found.slice(0, 5).map(toLocation),
  };
}

function checkAnyFile(check: Extract<Check, { kind: 'any_file' }>, h: CheckHelpers): CheckOutcome {
  const found = h.project.glob(check.patterns);
  if (found.length === 0) return h.missing(`no files matching ${check.patterns.join(', ')}`);
  return h.pass(
    `${found.length} file(s) matching ${check.patterns.join(', ')}`,
    found.slice(0, 5).map(toLocation),
  );
}

function checkGrepPresent(
  check: Extract<Check, { kind: 'grep_present' }>,
  h: CheckHelpers,
): CheckOutcome {
  const hits = queryGrep(h.project, check);
  if (hits.length === 0) return h.missing(`pattern not found in ${check.include.join(', ')}`);
  return h.pass(`${hits.length} match(es)`, toLocations(hits));
}

function checkGrepAbsent(
  check: Extract<Check, { kind: 'grep_absent' }>,
  h: CheckHelpers,
): CheckOutcome {
  const hits = queryGrep(h.project, check);
  if (hits.length === 0) return h.pass(`no matches in ${check.include.join(', ')}`);
  return {
    status: 'FAIL',
    message: `${hits.length} occurrence(s)${describedBy(hits)}`,
    locations: toLocations(hits),
  };
}

function checkGrepWrong(
  check: Extract<Check, { kind: 'grep_wrong' }>,
  h: CheckHelpers,
): CheckOutcome {
  const hits = queryGrep(h.project, check);
  if (hits.length === 0) return h.pass(`no incorrect usage of \`${trimPattern(check.pattern)}\``);
  return {
    status: 'WRONG',
    message: `${hits.length} instance(s) of an incorrect implementation${describedBy(hits)}`,
    locations: toLocations(hits),
  };
}

function checkGrepDeprecated(
  check: Extract<Check, { kind: 'grep_deprecated' }>,
  h: CheckHelpers,
): CheckOutcome {
  const hits = queryGrep(h.project, check);
  if (hits.length === 0) return h.pass('no deprecated usage detected');
  return {
    status: 'DEPRECATED',
    message: `${hits.length} deprecated usage(s) detected.`,
    locations: toLocations(hits),
  };
}

function checkFileLinesMax(
  check: Extract<Check, { kind: 'file_lines_max' }>,
  h: CheckHelpers,
): CheckOutcome {
  const offenders: Location[] = [];
  for (const file of h.project.glob(check.patterns)) {
    const text = h.project.read(file);
    if (text === null) continue;
    const lines = text.split('\n').length;
    if (lines > check.max_lines) offenders.push({ file, excerpt: `${lines} lines` });
  }
  if (offenders.length === 0) {
    return h.pass(`no file over ${check.max_lines} lines`);
  }
  // A god object is a violation (FAIL, 0 credit), not a partial
  // implementation: WRONG would award 0.15 credit for failing modularity.
  return {
    status: 'FAIL',
    message: `${offenders.length} file(s) exceed ${check.max_lines} lines — likely god objects.`,
    locations: offenders.slice(0, 8),
  };
}

function checkTrackedPresent(
  check: Extract<Check, { kind: 'tracked_present' }>,
  h: CheckHelpers,
): CheckOutcome {
  const found = h.project.trackedGlob(check.patterns);
  if (found.length === 0)
    return h.missing(`nothing matching ${check.patterns.join(', ')} is tracked by git`);
  return h.pass(`${found.length} tracked file(s)`, found.slice(0, 5).map(toLocation));
}

function checkTrackedAbsent(
  check: Extract<Check, { kind: 'tracked_absent' }>,
  h: CheckHelpers,
): CheckOutcome {
  const found = h.project.trackedGlob(check.patterns);
  if (found.length === 0) return h.pass(`no tracked files matching ${check.patterns.join(', ')}`);
  return {
    status: 'FAIL',
    message: `${found.length} tracked file(s) should not be committed: ${found.slice(0, 5).join(', ')}.`,
    locations: found.slice(0, 5).map(toLocation),
  };
}

function checkJsonPath(
  check: Extract<Check, { kind: 'json_path' }>,
  h: CheckHelpers,
): CheckOutcome {
  const files = h.project.glob([check.file]);
  if (files.length === 0) return h.missing(`${check.file} not found`);
  const json = h.project.readJson(files[0]!);
  if (json === null) return h.missing(`${check.file} unreadable`);
  const value = resolvePath(json, check.path);
  if (value === undefined) return h.missing(`\`${check.path}\` not set in ${check.file}`);
  if (check.equals !== undefined && value !== check.equals) {
    return {
      status: 'WRONG',
      message: `\`${check.path}\` is ${JSON.stringify(value)}, expected ${JSON.stringify(check.equals)}.`,
      locations: [toLocation(files[0]!)],
    };
  }
  return h.pass(`\`${check.path}\` is ${JSON.stringify(value)}`, [toLocation(files[0]!)]);
}

function checkCountMin(
  check: Extract<Check, { kind: 'count_min' }>,
  h: CheckHelpers,
): CheckOutcome {
  const n = h.project.count(check.patterns);
  if (n >= check.min) return h.pass(`${n} file(s), threshold ${check.min}`);
  // Below threshold means required files are absent — MISSING, not FAIL.
  // FAIL is a violated condition; MISSING is an absent one (see types.ts).
  return h.missing(
    `Found ${n} file(s) matching ${check.patterns.join(', ')} — expected at least ${check.min}.`,
  );
}

function runShellCheck(
  project: Project,
  run: string,
  expected: number,
  pass: CheckHelpers['pass'],
): CheckOutcome {
  try {
    // NOTE: pack-supplied shell runs synchronously in the audit loop with a
    // 60 s timeout and a 10 MB output cap. Pack authors get arbitrary shell
    // by design (opt-in via --allow-commands, UNKNOWN otherwise) — review
    // third-party packs like production dependencies before enabling.
    const out = execFileSync('sh', ['-c', run], {
      cwd: project.root,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (expected === 0) {
      return pass(
        `\`${run}\` succeeded${out ? `: ${truncate(out.replace(/\s+/g, ' '), 160)}` : ''}`,
      );
    }
    return {
      status: 'FAIL',
      message: `\`${run}\` exited 0 but ${expected} was expected.`,
      locations: [],
    };
  } catch (err) {
    if (expected !== 0) return pass(`\`${run}\` exited non-zero as expected`);
    const detail = err instanceof Error ? truncate(err.message.replace(/\s+/g, ' '), 200) : '';
    return {
      status: 'FAIL',
      message: `\`${run}\` failed${detail ? `: ${detail}` : ''}.`,
      locations: [],
    };
  }
}

function checkCommand(check: Extract<Check, { kind: 'command' }>, h: CheckHelpers): CheckOutcome {
  if (!h.allowCommands) {
    return unknownOutcome('Shell check skipped (enable with --allow-commands).');
  }
  return runShellCheck(h.project, check.run, check.expect_exit ?? 0, h.pass);
}

/**
 * Ingests machine evidence from an external scanner (ADR-0011) and asserts a
 * numeric bound. Read-only and offline: the artifact is a committed file, not
 * a live probe. Verdicts stay honest about provenance:
 *   - artifact absent            → MISSING ("no evidence"), never a silent PASS
 *   - artifact unparseable       → UNKNOWN (fail closed, a human must look)
 *   - `at_most`/`at_least`/`equals` satisfied → PASS; violated → FAIL
 */
function checkOracle(check: Extract<Check, { kind: 'oracle' }>, h: CheckHelpers): CheckOutcome {
  const files = h.project.glob([check.file]);
  if (files.length === 0) {
    return h.missing(`${check.file} not found — no ${check.source} evidence to ingest`);
  }
  const file = files[0]!;

  let raw: unknown;
  try {
    raw = JSON.parse(h.project.read(file) ?? '');
  } catch {
    return unknownOutcome(`${file} is not valid JSON — cannot ingest ${check.source} evidence.`);
  }

  const selected =
    check.source === 'sarif' ? countSarifResults(raw, check) : readJsonNumber(raw, check);
  if (selected === null) {
    return unknownOutcome(
      check.source === 'json'
        ? `\`${check.path}\` in ${file} is not a number.`
        : `${file} is not a SARIF log with a runs[].results array.`,
    );
  }

  const op = check.op ?? 'at_most';
  const ok = compare(selected, op, check.value);
  const detail = `${selected} ${opPhrase(op)} ${check.value} (${describeOracle(check)}) from ${file}`;
  return ok
    ? h.pass(detail, [toLocation(file)])
    : {
        status: 'FAIL',
        message: `Oracle threshold violated — ${detail}.`,
        locations: [toLocation(file)],
      };
}

/** Total SARIF results, filtered by level and ruleId substrings when given. */
function countSarifResults(raw: unknown, check: Extract<Check, { kind: 'oracle' }>): number | null {
  const runs = (raw as { runs?: unknown[] }).runs;
  if (!Array.isArray(runs)) return null;
  const keep = sarifFilter(check);
  let count = 0;
  for (const run of runs) {
    const results = (run as { results?: unknown[] }).results;
    if (!Array.isArray(results)) continue;
    for (const r of results) {
      if (keep(r)) count++;
    }
  }
  return count;
}

/** Builds the predicate a SARIF result must satisfy to be counted. */
function sarifFilter(check: Extract<Check, { kind: 'oracle' }>): (result: unknown) => boolean {
  const levels = check.levels && check.levels.length > 0 ? new Set(check.levels) : null;
  const rules = check.rules && check.rules.length > 0 ? check.rules : null;
  if (!levels && !rules) return () => true;
  return (result) => {
    const level = (result as { level?: string }).level ?? 'warning';
    if (levels && !levels.has(level as never)) return false;
    if (rules) {
      const ruleId = String((result as { ruleId?: unknown }).ruleId ?? '');
      if (!rules.some((needle) => ruleId.includes(needle))) return false;
    }
    return true;
  };
}

/** Reads the numeric value at `path`, or null when it is not a finite number. */
function readJsonNumber(raw: unknown, check: Extract<Check, { kind: 'oracle' }>): number | null {
  const value = resolvePath(raw, check.path ?? '');
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function compare(
  actual: number,
  op: NonNullable<Extract<Check, { kind: 'oracle' }>['op']>,
  bound: number,
): boolean {
  switch (op) {
    case 'at_least':
      return actual >= bound;
    case 'equals':
      return actual === bound;
    default:
      return actual <= bound;
  }
}

function opPhrase(op: string): string {
  return op === 'at_least' ? '>=' : op === 'equals' ? '==' : '<=';
}

function describeOracle(check: Extract<Check, { kind: 'oracle' }>): string {
  const parts: string[] = [check.source];
  if (check.levels && check.levels.length > 0) parts.push(`levels: ${check.levels.join('/')}`);
  if (check.rules && check.rules.length > 0) parts.push(`rules: ${check.rules.join('|')}`);
  if (check.source === 'json') parts.push(check.path ?? '');
  return parts.join(' ');
}

/** One check kind per entry — adding a kind means adding a line, not a branch. */
const CHECK_HANDLERS: {
  [K in Check['kind']]: (check: Extract<Check, { kind: K }>, h: CheckHelpers) => CheckOutcome;
} = {
  manual: checkManual,
  info: checkInfo,
  file_exists: checkFileExists,
  file_absent: checkFileAbsent,
  any_file: checkAnyFile,
  grep_present: checkGrepPresent,
  grep_absent: checkGrepAbsent,
  grep_wrong: checkGrepWrong,
  grep_deprecated: checkGrepDeprecated,
  file_lines_max: checkFileLinesMax,
  tracked_present: checkTrackedPresent,
  tracked_absent: checkTrackedAbsent,
  json_path: checkJsonPath,
  count_min: checkCountMin,
  command: checkCommand,
  oracle: checkOracle,
};

function runCheck(
  _rule: Rule,
  ctx: EvalContext,
  check: Check,
): { status: Status; message: string; locations: Location[] } {
  const h: CheckHelpers = {
    project: ctx.project,
    allowCommands: ctx.allowCommands,
    missing: missingOutcome,
    pass: passOutcome,
  };
  const handler = CHECK_HANDLERS[check.kind] as (check: Check, h: CheckHelpers) => CheckOutcome;
  return handler(check, h);
}

/* ----------------------------------------------------------------- helpers */

function toLocation(file: string): Location {
  return { file };
}

function toLocations(hits: { file: string; line: number; excerpt: string }[]): Location[] {
  return hits.slice(0, 8).map((h) => ({ file: h.file, line: h.line, excerpt: h.excerpt }));
}

/**
 * "…: `api_key: '...'` at src/config.js:3" — the line that actually tripped
 * the rule, not the regex. A report that quotes its own pattern tells the
 * reader nothing they can act on.
 */
function describedBy(hits: { file: string; line: number; excerpt: string }[]): string {
  const first = hits[0];
  if (!first) return '.';
  const excerpt = truncate(first.excerpt.trim(), 80);
  const more = hits.length > 1 ? ` (+${hits.length - 1} more)` : '';
  return `: \`${excerpt}\` at ${first.file}:${first.line}${more}.`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function trimPattern(p: string): string {
  return p.length <= 70 ? p : `${p.slice(0, 69)}…`;
}

export function resolvePath(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const key of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Effective weight of a rule: explicit override, else the severity default. */
export function ruleWeight(rule: Rule): number {
  return rule.weight ?? DEFAULT_WEIGHT[rule.severity];
}

export function severityRank(s: Severity): number {
  return { FUTURE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[s];
}
