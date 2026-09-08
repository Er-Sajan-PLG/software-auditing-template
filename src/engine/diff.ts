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

  const bRules = before.rules ?? {};
  const aRules = after.rules ?? {};
  const ids = [...new Set([...Object.keys(bRules), ...Object.keys(aRules)])].sort();

  const fixed: string[] = [];
  const regressed: string[] = [];
  const improved: string[] = [];
  const newRules: string[] = [];
  const goneRules: string[] = [];

  const PASSING = new Set(['PASS']);
  const OPEN = new Set(['FAIL', 'WRONG', 'MISSING', 'DEPRECATED', 'EXPERIMENTAL']);

  for (const id of ids) {
    const x = bRules[id];
    const y = aRules[id];
    if (!x) {
      newRules.push(`${id} — now applicable (${y!.status})`);
      continue;
    }
    if (!y) {
      goneRules.push(id);
      continue;
    }
    if (x.status === y.status) continue;
    const wasOpen = OPEN.has(x.status as Status);
    const isOpen = OPEN.has(y.status as Status);
    if (wasOpen && PASSING.has(y.status)) {
      fixed.push(`${id} — ${x.status} → PASS`);
    } else if (!wasOpen && isOpen) {
      regressed.push(`${id} — ${x.status} → ${y.status}`);
    } else if (wasOpen && isOpen) {
      improved.push(`${id} — ${x.status} → ${y.status}`);
    }
  }

  const list = (title: string, items: string[]) => {
    p(`## ${title} (${items.length})`);
    p();
    if (items.length === 0) p('None. ✅');
    else for (const i of items) p(`- ${i}`);
    p();
  };

  list('✅ Fixed', fixed);
  list('🔺 Regressed', regressed);
  list('🟡 Changed (still open)', improved);
  list('🆕 Newly applicable', newRules);
  if (goneRules.length > 0) list('➖ No longer applicable', goneRules);

  p('---');
  p();
  p(
    delta > 0
      ? `**Net movement: +${delta} points.** Keep going — the fixed list is the progress report.`
      : delta < 0
        ? `**Net movement: ${delta} points.** New rules became applicable, or something regressed. Start with 🔺 Regressed.`
        : '**No net movement.** Either nothing changed, or fixes were offset by newly applicable rules.',
  );
  p();

  return out.join('\n');
}

function sign(n: number): string {
  const v = Math.round(n * 10) / 10;
  if (v === 0) return '0';
  return v > 0 ? `+${v}` : `${v}`;
}
