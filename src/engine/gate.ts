import type { AuditReport, Finding, Severity } from '../types.js';
import { SEVERITY_LADDER } from './loader.js';

/**
 * Findings that should block a build: anything at or above `threshold` that is
 * neither passing, unverified, nor explicitly accepted by project policy.
 *
 * Suppressed findings never block — that is the entire point of recording an
 * accepted risk in `.usa.yaml`. UNKNOWN never blocks either: "needs a human"
 * is not "failed", and gating on it would make every manual rule a CI failure.
 */
export function blockingFindings(report: AuditReport, threshold: Severity): Finding[] {
  const open = report.findings.filter(
    (f) =>
      f.status !== 'PASS' &&
      f.status !== 'NOT_APPLICABLE' &&
      f.status !== 'UNKNOWN' &&
      !f.suppressedReason,
  );
  const min = SEVERITY_LADDER.indexOf(threshold);
  return open.filter((f) => SEVERITY_LADDER.indexOf(f.severity) >= min);
}

/**
 * `--fail-on` gate. Returns a process exit code.
 *
 * The ladder is ascending (`FUTURE` … `CRITICAL`), so "at or above" means
 * *higher* index. Getting this backwards makes `--fail-on critical` fail on
 * every finding in the report, which is a memorable way to lose a CI pipeline.
 */
export function evaluateGate(report: AuditReport, failOn: string, quiet: boolean): number {
  if (failOn === 'none') return 0;

  const threshold = failOn.toUpperCase() as Severity;
  if (!SEVERITY_LADDER.includes(threshold)) {
    console.error(
      `--fail-on must be none or one of ${[...SEVERITY_LADDER].reverse().join('|').toLowerCase()}`,
    );
    return 2;
  }

  const blocking = blockingFindings(report, threshold);
  if (blocking.length === 0) return 0;

  if (!quiet) {
    console.error(`\nGate failed: ${blocking.length} finding(s) at or above ${threshold}.`);
    for (const f of blocking.slice(0, 10)) {
      const where = f.locations[0] ? `  (${f.locations[0].file}:${f.locations[0].line})` : '';
      console.error(`  ${f.severity.padEnd(8)} ${f.ruleId}  ${f.title}${where}`);
    }
    if (blocking.length > 10) console.error(`  … and ${blocking.length - 10} more`);
  }
  return 1;
}
