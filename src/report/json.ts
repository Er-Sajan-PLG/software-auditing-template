import type { AuditReport, Finding, Location } from '../types.js';

/**
 * JSON renderer — the machine-readable projection of an audit.
 *
 * The Markdown report is for humans; this is the same `AuditReport` with a
 * stable, documented shape for dashboards, CI gates, and tooling. It is a
 * faithful serialization (no re-derivation), so it never disagrees with the
 * Markdown trailer's counts.
 *
 * Determinism: findings keep the engine's order (already stable), and no
 * timestamp is introduced here beyond what the report already carries.
 */
export const JSON_SCHEMA = 'usa-report-json-v1';

export interface JsonFinding {
  ruleId: string;
  title: string;
  section: string;
  sectionTitle: string;
  status: Finding['status'];
  severity: Finding['severity'];
  baseSeverity: Finding['baseSeverity'];
  dampened: boolean;
  ruleClass: Finding['ruleClass'];
  message: string;
  locations: Location[];
  suppressedReason?: string;
  remediation?: string;
  why?: string;
  evidenceHint?: string;
  references?: string[];
}

export interface JsonReport {
  schema: typeof JSON_SCHEMA;
  generatedAt: string;
  usaVersion: string;
  target: AuditReport['target'];
  detection: AuditReport['detection'];
  options: AuditReport['options'];
  score: AuditReport['score'];
  findings: JsonFinding[];
}

function projectFinding(f: Finding): JsonFinding {
  const out: JsonFinding = {
    ruleId: f.ruleId,
    title: f.title,
    section: f.section,
    sectionTitle: f.sectionTitle,
    status: f.status,
    severity: f.severity,
    baseSeverity: f.baseSeverity,
    dampened: f.dampened,
    ruleClass: f.ruleClass,
    message: f.message,
    locations: f.locations,
  };
  if (f.suppressedReason) out.suppressedReason = f.suppressedReason;
  if (f.remediation) out.remediation = f.remediation;
  if (f.why) out.why = f.why;
  if (f.evidenceHint) out.evidenceHint = f.evidenceHint;
  if (f.references && f.references.length > 0) out.references = f.references;
  return out;
}

/** Projects an AuditReport into the stable JSON shape. */
export function toJsonReport(report: AuditReport): JsonReport {
  return {
    schema: JSON_SCHEMA,
    generatedAt: report.generatedAt,
    usaVersion: report.usaVersion,
    target: report.target,
    detection: report.detection,
    options: report.options,
    score: report.score,
    findings: report.findings.map(projectFinding),
  };
}

/** Renders an AuditReport as pretty-printed JSON (trailing newline). */
export function renderJson(report: AuditReport): string {
  return `${JSON.stringify(toJsonReport(report), null, 2)}\n`;
}
