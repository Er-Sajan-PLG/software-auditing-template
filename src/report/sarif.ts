import path from 'node:path';
import type { AuditReport, Finding, Location, Severity, Status } from '../types.js';

/**
 * SARIF 2.1.0 renderer — lets USA compose with GitHub code scanning, IDE
 * SARIF viewers, and any dashboard that ingests SARIF.
 *
 * Only findings that represent an actionable defect become `results`; PASS and
 * NOT_APPLICABLE are successes, not results. Judgement findings (status
 * UNKNOWN) are emitted at `note` level with the evidence hint, because "a
 * human must look at this" is the finding.
 *
 * Path handling: SARIF wants URI-style, repo-relative paths. Locations from
 * the engine are already relative to the audit target, but we normalize
 * separators and strip a leading `./` so GitHub links line up.
 */
export const SARIF_VERSION = '2.1.0';
export const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

/** SARIF levels, weakest to strongest. */
export type SarifLevel = 'none' | 'note' | 'warning' | 'error';

const SEVERITY_LEVEL: Record<Severity, SarifLevel> = {
  CRITICAL: 'error',
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'note',
  FUTURE: 'note',
};

/** A finding is reported only when it is not a success or a skip. */
const REPORTED_STATUSES: ReadonlySet<Status> = new Set<Status>([
  'FAIL',
  'WRONG',
  'MISSING',
  'DEPRECATED',
  'EXPERIMENTAL',
  'UNKNOWN',
]);

/** Normalize an engine path to a SARIF-friendly, repo-relative URI. */
export function sarifUri(file: string): string {
  const posix = file.split(path.sep).join('/');
  return posix.startsWith('./') ? posix.slice(2) : posix;
}

function region(l: Location): Record<string, number> | undefined {
  return typeof l.line === 'number' ? { startLine: l.line } : undefined;
}

interface SarifPhysicalLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region?: Record<string, number>;
  };
}

function locationsOf(f: Finding): SarifPhysicalLocation[] {
  return f.locations.map((l) => {
    const physicalLocation: SarifPhysicalLocation['physicalLocation'] = {
      artifactLocation: { uri: sarifUri(l.file) },
    };
    const r = region(l);
    if (r) physicalLocation.region = r;
    return { physicalLocation };
  });
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  help?: { text: string };
  helpUri?: string;
  defaultConfiguration: { level: SarifLevel };
  properties: Record<string, unknown>;
}

function toRule(f: Finding): SarifRule {
  const help = f.remediation
    ? { text: `${f.why ? `${f.why}\n\n` : ''}${f.remediation}` }
    : f.why
      ? { text: f.why }
      : undefined;
  const firstRef = f.references?.[0];
  return {
    id: f.ruleId,
    name: f.ruleId,
    shortDescription: { text: f.title },
    ...(f.why ? { fullDescription: { text: f.why } } : {}),
    ...(help ? { help } : {}),
    ...(firstRef ? { helpUri: firstRef } : {}),
    defaultConfiguration: { level: SEVERITY_LEVEL[f.severity] },
    properties: {
      section: f.section,
      sectionTitle: f.sectionTitle,
      severity: f.severity,
      baseSeverity: f.baseSeverity,
      ruleClass: f.ruleClass,
    },
  };
}

interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: SarifLevel;
  kind: 'fail' | 'informational';
  message: { text: string };
  locations: SarifPhysicalLocation[];
  suppressions?: { kind: 'external'; justification: string }[];
}

function toResult(f: Finding, ruleIndex: number): SarifResult {
  const isJudgement = f.status === 'UNKNOWN';
  const result: SarifResult = {
    ruleId: f.ruleId,
    ruleIndex,
    level: isJudgement ? 'note' : SEVERITY_LEVEL[f.severity],
    kind: isJudgement ? 'informational' : 'fail',
    message: { text: f.message },
    locations: locationsOf(f),
  };
  if (f.suppressedReason) {
    result.suppressions = [{ kind: 'external', justification: f.suppressedReason }];
  }
  return result;
}

export interface SarifLog {
  version: typeof SARIF_VERSION;
  $schema: typeof SARIF_SCHEMA;
  runs: {
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules: SarifRule[];
      };
    };
    results: SarifResult[];
    invocations: { executionSuccessful: boolean }[];
  }[];
}

/** Builds a SARIF 2.1.0 log from an audit report. */
export function toSarif(report: AuditReport): SarifLog {
  const reported = report.findings.filter((f) => REPORTED_STATUSES.has(f.status));

  // One SARIF rule entry per distinct rule id, in first-seen order so ruleIndex
  // stays stable for a given report.
  const ruleIndex = new Map<string, number>();
  const rules: SarifRule[] = [];
  for (const f of reported) {
    if (!ruleIndex.has(f.ruleId)) {
      ruleIndex.set(f.ruleId, rules.length);
      rules.push(toRule(f));
    }
  }

  const results = reported.map((f) => toResult(f, ruleIndex.get(f.ruleId)!));

  return {
    version: SARIF_VERSION,
    $schema: SARIF_SCHEMA,
    runs: [
      {
        tool: {
          driver: {
            name: 'USA — Universal Software Auditor',
            version: report.usaVersion,
            informationUri: 'https://github.com/Er-Sajan-PLG/universal-software-auditor',
            rules,
          },
        },
        results,
        invocations: [{ executionSuccessful: true }],
      },
    ],
  };
}

/** Renders an AuditReport as pretty-printed SARIF 2.1.0 (trailing newline). */
export function renderSarif(report: AuditReport): string {
  return `${JSON.stringify(toSarif(report), null, 2)}\n`;
}
