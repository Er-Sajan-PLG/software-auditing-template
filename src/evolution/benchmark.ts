import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAudit } from '../engine/audit.js';
import type { AuditReport, Status } from '../types.js';
import type { BenchmarkCase, BenchmarkCaseResult, BenchmarkResult, Capability } from './types.js';

const OPEN: Set<Status> = new Set(['FAIL', 'WRONG', 'MISSING', 'DEPRECATED', 'EXPERIMENTAL']);

function statusOf(report: AuditReport, ruleId: string): Status {
  return report.findings.find((f) => f.ruleId === ruleId)?.status ?? 'NOT_APPLICABLE';
}

function materialize(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-bench-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return root;
}

/**
 * Run a candidate capability against a set of flees and measure TP/TN/FP/FN,
 * precision/recall, and the one thing that matters most: whether the candidate
 * changed the verdict of any *existing* rule (a regression).
 *
 * A baseline audit (without the candidate) and a candidate audit (with it) are
 * both run on each fixture; the candidate's own rules are excluded from the
 * regression comparison so only collateral damage counts.
 */
export function runBenchmark(
  candidate: Capability,
  cases: BenchmarkCase[],
  rulesDir?: string,
  engineVersion = 'bench',
): BenchmarkResult {
  const caseResults: BenchmarkCaseResult[] = [];
  for (const c of cases) {
    const started = Date.now();
    const root = materialize(c.fixture);
    try {
      const baseline = runAudit({ target: root, rulesDir, usaVersion: engineVersion });
      const withCap = runAudit({
        target: root,
        rulesDir,
        usaVersion: engineVersion,
        extraPacks: candidate.pack ? [candidate.pack] : undefined,
      });
      caseResults.push(
        evaluateCase(c, candidate, baseline.report, withCap.report, Date.now() - started),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const summary = caseResults.reduce(
    (acc, r) => ({
      tp: acc.tp + r.tp,
      tn: acc.tn + r.tn,
      fp: acc.fp + r.fp,
      fn: acc.fn + r.fn,
      regressions: acc.regressions + r.regressions.length,
      precision: 0,
      recall: 0,
    }),
    { tp: 0, tn: 0, fp: 0, fn: 0, precision: 0, recall: 0, regressions: 0 },
  );
  summary.precision = summary.tp + summary.fp > 0 ? summary.tp / (summary.tp + summary.fp) : 1;
  summary.recall = summary.tp + summary.fn > 0 ? summary.tp / (summary.tp + summary.fn) : 1;

  return {
    capability: { id: candidate.id, version: candidate.version },
    cases: caseResults,
    summary,
  };
}

function evaluateCase(
  c: BenchmarkCase,
  candidate: Capability,
  baseline: AuditReport,
  withCap: AuditReport,
  elapsedMs: number,
): BenchmarkCaseResult {
  const acc = classify(c.expected, withCap);
  const regressions = collectRegressions(
    baseline,
    withCap,
    candidate.pack?.rules.map((r) => r.id) ?? [],
  );
  const precision = acc.tp + acc.fp > 0 ? acc.tp / (acc.tp + acc.fp) : 1;
  const recall = acc.tp + acc.fn > 0 ? acc.tp / (acc.tp + acc.fn) : 1;
  return { caseId: c.id, kind: c.kind, ...acc, precision, recall, regressions, elapsedMs };
}

function classify(
  expected: BenchmarkCase['expected'],
  withCap: AuditReport,
): { tp: number; tn: number; fp: number; fn: number } {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (const exp of expected) {
    const expectedOpen = OPEN.has(exp.status);
    const actualOpen = OPEN.has(statusOf(withCap, exp.ruleId));
    if (expectedOpen && actualOpen) tp++;
    else if (expectedOpen) fn++;
    else if (actualOpen) fp++;
    else tn++;
  }
  return { tp, tn, fp, fn };
}

function collectRegressions(
  baseline: AuditReport,
  withCap: AuditReport,
  candidateRules: string[],
): string[] {
  const excluded = new Set(candidateRules);
  const ids = new Set<string>();
  for (const f of baseline.findings) ids.add(f.ruleId);
  for (const f of withCap.findings) ids.add(f.ruleId);
  const regressions: string[] = [];
  for (const id of [...ids].sort()) {
    if (excluded.has(id)) continue;
    const a = statusOf(baseline, id);
    const b = statusOf(withCap, id);
    if (a !== b) regressions.push(`${id}: ${a} -> ${b}`);
  }
  return regressions;
}
