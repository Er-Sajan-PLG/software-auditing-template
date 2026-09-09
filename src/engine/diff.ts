import { parse as parseYaml } from 'yaml';
import type { Severity, Status } from '../types.js';

export interface TrailerData {
  schema?: string;
  generated_at?: string;
  usat_version?: string;
  overall?: number;
  sections?: Record<string, { score: number; open: number; review: number }>;
  severity_totals?: Record<string, number>;
  rules?: Record<string, { status: string; severity: string; section: string }>;
}

/**
 * An audit you can't compare against the last one is just a number.
 * `usat diff` reads the YAML trailer USAT embeds in every Markdown report and
 * reports movement: regressions, fixes, and drift.
 */
export function diffReports(beforeRaw: string, afterRaw: string): string {
  const before = parseYaml(beforeRaw) as TrailerData | null;
  const after = parseYaml(afterRaw) as TrailerData | null;
  if (!before || !after) throw new Error('Could not parse one or both report trailers.');

  const out: string[] = [];
  const p = (s = '') => out.push(s);

  const b = before.overall ?? 0;
  const a = after.overall ?? 0;
  const delta = Math.round((a - b) * 10) / 10;

  renderDiffHeader(p, before, after, b, a, delta);

  const buckets = classifyAllRules(before.rules ?? {}, after.rules ?? {});

  const list = (title: string, items: string[]) => {
    p(`## ${title} (${items.length})`);
    p();
    if (items.length === 0) p('None. ✅');
    else for (const i of items) p(`- ${i}`);
    p();
  };

  list('✅ Fixed', buckets.fixed);
  list('🔺 Regressed', buckets.regressed);
  list('🟡 Changed (still open)', buckets.improved);
  list('🆕 Newly applicable', buckets.newRules);
  if (buckets.goneRules.length > 0) list('➖ No longer applicable', buckets.goneRules);

  p('---');
  p();
  p(renderDiffVerdict(delta));
  p();

  return out.join('\n');
}

function renderDiffHeader(
  p: (s?: string) => void,
  before: TrailerData,
  after: TrailerData,
  b: number,
  a: number,
  delta: number,
): void {
  p('# 🔁 USAT Audit Diff');
  p();
  p('| | Before | After | Δ |');
  p('|---|---:|---:|---:|');
  p(`| **Overall score** | ${b} | ${a} | ${sign(delta)} |`);

  const sevKeys: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'FUTURE'];
  for (const k of sevKeys) {
    const bv = before.severity_totals?.[k] ?? 0;
    const av = after.severity_totals?.[k] ?? 0;
    p(`| ${k} | ${bv} | ${av} | ${sign(av - bv)} |`);
  }
  p();
  p(`*Before: ${before.generated_at ?? 'unknown'} · After: ${after.generated_at ?? 'unknown'}*`);
  p();
}

interface DiffBuckets {
  fixed: string[];
  regressed: string[];
  improved: string[];
  newRules: string[];
  goneRules: string[];
}

type TrailerRule = { status: string; severity: string; section: string };

function classifyAllRules(
  bRules: Record<string, TrailerRule>,
  aRules: Record<string, TrailerRule>,
): DiffBuckets {
  const buckets: DiffBuckets = {
    fixed: [],
    regressed: [],
    improved: [],
    newRules: [],
    goneRules: [],
  };
  const ids = [...new Set([...Object.keys(bRules), ...Object.keys(aRules)])].sort();
  for (const id of ids) {
    classifyRuleChange(id, bRules[id], aRules[id], buckets);
  }
  return buckets;
}

const PASSING = new Set(['PASS']);
const OPEN = new Set(['FAIL', 'WRONG', 'MISSING', 'DEPRECATED', 'EXPERIMENTAL']);

function classifyRuleChange(
  id: string,
  x: TrailerRule | undefined,
  y: TrailerRule | undefined,
  buckets: DiffBuckets,
): void {
  if (!x) {
    buckets.newRules.push(`${id} — now applicable (${y!.status})`);
    return;
  }
  if (!y) {
    buckets.goneRules.push(id);
    return;
  }
  if (x.status === y.status) return;
  if (classifyUnknownTransition(id, x.status, y.status, buckets)) return;
  classifyOpenTransition(id, x.status, y.status, buckets);
}

/**
 * Movements to or from the judgement queue. Previously these were dropped
 * entirely, so resolving the queue (the tool's headline workflow) was
 * invisible in `usat diff` — "No net movement… nothing changed" while a
 * human did the most valuable work.
 */
function classifyUnknownTransition(
  id: string,
  xs: string,
  ys: string,
  buckets: DiffBuckets,
): boolean {
  if (xs !== 'UNKNOWN' && ys !== 'UNKNOWN') return false;
  if (xs === 'UNKNOWN' && ys === 'PASS') {
    buckets.fixed.push(`${id} — UNKNOWN → PASS (resolved by review)`);
  } else if (ys === 'UNKNOWN' && !OPEN.has(xs as Status)) {
    buckets.regressed.push(`${id} — ${xs} → UNKNOWN (needs review)`);
  } else {
    buckets.improved.push(`${id} — ${xs} → ${ys}`);
  }
  return true;
}

function classifyOpenTransition(id: string, xs: string, ys: string, buckets: DiffBuckets): void {
  const wasOpen = OPEN.has(xs as Status);
  const isOpen = OPEN.has(ys as Status);
  if (wasOpen && PASSING.has(ys)) {
    buckets.fixed.push(`${id} — ${xs} → PASS`);
  } else if (!wasOpen && isOpen) {
    buckets.regressed.push(`${id} — ${xs} → ${ys}`);
  } else if (wasOpen && isOpen) {
    buckets.improved.push(`${id} — ${xs} → ${ys}`);
  }
}

function renderDiffVerdict(delta: number): string {
  if (delta > 0) {
    return `**Net movement: +${delta} points.** Keep going — the fixed list is the progress report.`;
  }
  if (delta < 0) {
    return `**Net movement: ${delta} points.** New rules became applicable, or something regressed. Start with 🔺 Regressed.`;
  }
  return '**No net movement.** Either nothing changed, or fixes were offset by newly applicable rules.';
}

function sign(n: number): string {
  const v = Math.round(n * 10) / 10;
  if (v === 0) return '0';
  return v > 0 ? `+${v}` : `${v}`;
}
