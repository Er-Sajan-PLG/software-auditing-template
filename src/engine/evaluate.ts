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
  if ('all' in p && Array.isArray(p.all)) return p.all.every((x) => evalPredicate(x, facts));
  if ('any' in p && Array.isArray(p.any)) return p.any.some((x) => evalPredicate(x, facts));
  if ('not' in p && p.not) return !evalPredicate(p.not, facts);
  if ('fact' in p && typeof p.fact === 'string') return evalFact(p, facts);
  return true;
}

function evalFact(p: Extract<Predicate, { fact: string }>, facts: Facts): boolean {
  const { fact, op = 'exists', value } = p;
  const isMetric = fact.startsWith('metric:');
  const key = isMetric ? fact.slice('metric:'.length) : fact;
  const present = facts.flags.has(fact);
  const metric = facts.metrics[key];

  switch (op) {
    case 'absent':
      return isMetric ? metric === undefined : !present;
    case 'exists':
      return isMetric ? metric !== undefined : present;
    case 'eq':
      return isMetric ? metric === Number(value) : present === Boolean(value);
    case 'neq':
      return isMetric ? metric !== Number(value) : present !== Boolean(value);
    case 'in':
      return Array.isArray(value) ? value.includes(String(metric ?? '')) : false;
    case 'includes':
      return Array.isArray(value) && present;
    case 'gt':
      return typeof metric === 'number' && metric > Number(value ?? 0);
    case 'lt':
      return typeof metric === 'number' && metric < Number(value ?? 0);
    case 'matches':
      return typeof value === 'string' && new RegExp(value).test(String(metric ?? ''));
    default:
      return present;
  }
}

export function ruleApplies(rule: Rule, facts: Facts, depth: Depth, includeAll = false): boolean {
  if (!includeAll && rule.depths && rule.depths.length > 0 && !rule.depths.includes(depth)) {
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

function runCheck(
  rule: Rule,
  ctx: EvalContext,
  check: Check,
): { status: Status; message: string; locations: Location[] } {
  const project = ctx.project;
  const missing = (detail: string) => ({
    status: 'MISSING' as Status,
    message: `Not detected — ${detail}.`,
    locations: [],
  });
  const pass = (detail: string, locations: Location[] = []) => ({
    status: 'PASS' as Status,
    message: `Verified — ${detail}.`,
    locations,
  });

  switch (check.kind) {
    case 'manual':
      return {
        status: 'UNKNOWN',
        message: 'Requires judgement — no automated evidence recorded.',
        locations: [],
      };

    case 'info':
      return { status: 'NOT_APPLICABLE', message: 'Context only.', locations: [] };

    case 'file_exists': {
      const found = check.files.flatMap((f) => project.glob([f]));
      if (found.length === 0) return missing(`none of [${check.files.join(', ')}] found`);
      return pass(`found ${found.slice(0, 5).join(', ')}`, found.slice(0, 5).map(toLocation));
    }

    case 'file_absent': {
      const found = check.files.flatMap((f) => project.glob([f]));
      if (found.length === 0) return pass(`none of [${check.files.join(', ')}] present`);
      return {
        status: 'FAIL',
        message: `${found.length} forbidden path(s) present: ${found.slice(0, 5).join(', ')}.`,
        locations: found.slice(0, 5).map(toLocation),
      };
    }

    case 'any_file': {
      const found = project.glob(check.patterns);
      if (found.length === 0) return missing(`no files matching ${check.patterns.join(', ')}`);
      return pass(
        `${found.length} file(s) matching ${check.patterns.join(', ')}`,
        found.slice(0, 5).map(toLocation),
      );
    }

    case 'grep_present': {
      const hits = project.grep(
        check.pattern,
        check.include,
        check.exclude ?? [],
        check.flags ?? '',
      );
      if (hits.length === 0) return missing(`pattern not found in ${check.include.join(', ')}`);
      return pass(`${hits.length} match(es)`, toLocations(hits));
    }

    case 'grep_absent': {
      const hits = project.grep(
        check.pattern,
        check.include,
        check.exclude ?? [],
        check.flags ?? '',
      );
      if (hits.length === 0) return pass(`no matches in ${check.include.join(', ')}`);
      return {
        status: 'FAIL',
        message: `${hits.length} occurrence(s)${describedBy(hits)}`,
        locations: toLocations(hits),
      };
    }

    case 'grep_wrong': {
      const hits = project.grep(
        check.pattern,
        check.include,
        check.exclude ?? [],
        check.flags ?? '',
      );
      if (hits.length === 0) return pass(`no incorrect usage of \`${trimPattern(check.pattern)}\``);
      return {
        status: 'WRONG',
        message: `${hits.length} instance(s) of an incorrect implementation${describedBy(hits)}`,
        locations: toLocations(hits),
      };
    }

    case 'grep_deprecated': {
      const hits = project.grep(
        check.pattern,
        check.include,
        check.exclude ?? [],
        check.flags ?? '',
      );
      if (hits.length === 0) return pass('no deprecated usage detected');
      return {
        status: 'DEPRECATED',
        message: `${hits.length} deprecated usage(s) detected.`,
        locations: toLocations(hits),
      };
    }

    case 'file_lines_max': {
      const offenders: Location[] = [];
      for (const file of project.glob(check.patterns)) {
        const text = project.read(file);
        if (text === null) continue;
        const lines = text.split('\n').length;
        if (lines > check.max_lines) offenders.push({ file, excerpt: `${lines} lines` });
      }
      if (offenders.length === 0) {
        return pass(`no file over ${check.max_lines} lines`);
      }
      return {
        status: 'WRONG',
        message: `${offenders.length} file(s) exceed ${check.max_lines} lines — likely god objects.`,
        locations: offenders.slice(0, 8),
      };
    }

    case 'tracked_present': {
      const found = project.trackedGlob(check.patterns);
      if (found.length === 0)
        return missing(`nothing matching ${check.patterns.join(', ')} is tracked by git`);
      return pass(`${found.length} tracked file(s)`, found.slice(0, 5).map(toLocation));
    }

    case 'tracked_absent': {
      const found = project.trackedGlob(check.patterns);
      if (found.length === 0) return pass(`no tracked files matching ${check.patterns.join(', ')}`);
      return {
        status: 'FAIL',
        message: `${found.length} tracked file(s) should not be committed: ${found.slice(0, 5).join(', ')}.`,
        locations: found.slice(0, 5).map(toLocation),
      };
    }

    case 'json_path': {
      const files = project.glob([check.file]);
      if (files.length === 0) return missing(`${check.file} not found`);
      const json = project.readJson(files[0]!);
      if (json === null) return missing(`${check.file} unreadable`);
      const value = resolvePath(json, check.path);
      if (value === undefined) return missing(`\`${check.path}\` not set in ${check.file}`);
      if (check.equals !== undefined && value !== check.equals) {
        return {
          status: 'WRONG',
          message: `\`${check.path}\` is ${JSON.stringify(value)}, expected ${JSON.stringify(check.equals)}.`,
          locations: [toLocation(files[0]!)],
        };
      }
      return pass(`\`${check.path}\` is ${JSON.stringify(value)}`, [toLocation(files[0]!)]);
    }

    case 'count_min': {
      const n = project.count(check.patterns);
      if (n >= check.min) return pass(`${n} file(s), threshold ${check.min}`);
      return {
        status: 'FAIL',
        message: `Found ${n} file(s) matching ${check.patterns.join(', ')} — expected at least ${check.min}.`,
        locations: [],
      };
    }

    case 'command': {
      if (!ctx.allowCommands) {
        return {
          status: 'UNKNOWN',
          message: 'Shell check skipped (enable with --allow-commands).',
          locations: [],
        };
      }
      const expected = check.expect_exit ?? 0;
      try {
        const out = execFileSync('sh', ['-c', check.run], {
          cwd: project.root,
          encoding: 'utf8',
          timeout: 60_000,
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        if (expected === 0) {
          return pass(
            `\`${check.run}\` succeeded${out ? `: ${truncate(out.replace(/\s+/g, ' '), 160)}` : ''}`,
          );
        }
        return {
          status: 'FAIL',
          message: `\`${check.run}\` exited 0 but ${expected} was expected.`,
          locations: [],
        };
      } catch (err) {
        if (expected !== 0) return pass(`\`${check.run}\` exited non-zero as expected`);
        const detail = err instanceof Error ? truncate(err.message.replace(/\s+/g, ' '), 200) : '';
        return {
          status: 'FAIL',
          message: `\`${check.run}\` failed${detail ? `: ${detail}` : ''}.`,
          locations: [],
        };
      }
    }

    default:
      return { status: 'UNKNOWN', message: 'Unsupported check.', locations: [] };
  }
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
