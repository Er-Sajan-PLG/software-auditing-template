import type { Finding, Rule, ScoreCard, SectionScore, Severity, Status } from '../types.js';
import { ruleWeight } from './evaluate.js';
import type { SectionDef } from './sections.js';
import type { MaturityProfile } from './maturity.js';

export interface ScoredRule {
  rule: Rule;
  finding: Finding;
}

/** How much credit a rule earns for a given outcome. */
const CREDIT: Record<Status, number> = {
  PASS: 1,
  EXPERIMENTAL: 0.5,
  DEPRECATED: 0.4,
  WRONG: 0.15,
  MISSING: 0,
  FAIL: 0,
  // Not counted: unresolved judgement or deliberately skipped.
  UNKNOWN: 0,
  NOT_APPLICABLE: 0,
};

const EMPTY_COUNTS = (): Record<Status, number> => ({
  PASS: 0,
  FAIL: 0,
  WRONG: 0,
  MISSING: 0,
  DEPRECATED: 0,
  EXPERIMENTAL: 0,
  UNKNOWN: 0,
  NOT_APPLICABLE: 0,
});

const EMPTY_SEVERITY = (): Record<Severity, number> => ({
  CRITICAL: 0,
  HIGH: 0,
  MEDIUM: 0,
  LOW: 0,
  FUTURE: 0,
});

/**
 * Deterministic, reproducible scoring.
 *
 *   credit_i   = weight_i × CREDIT[status_i]
 *   section    = 10 × Σcredit_i / Σweight_i        (resolved applicable rules)
 *   overall    = 100 × Σ(credit_i × sectionWeight) / Σ(weight_i × sectionWeight)
 *
 * Rule-level weighting (rather than averaging section scores) means a section
 * with three rules cannot swing the total as hard as one with thirty.
 */
export function score(
  evaluated: ScoredRule[],
  sections: SectionDef[],
  profile: MaturityProfile,
): ScoreCard {
  const counts = EMPTY_COUNTS();
  const severityCounts = EMPTY_SEVERITY();
  const sectionMap = new Map<string, SectionDef>(sections.map((s) => [s.id, s]));

  const bySection = new Map<
    string,
    {
      w: number;
      credit: number;
      applicable: number;
      resolved: number;
      passed: number;
      failed: number;
      unknown: number;
    }
  >();

  let totalW = 0;
  let totalCredit = 0;
  let applicableAll = 0;
  let resolvedAll = 0;

  for (const { rule, finding } of evaluated) {
    if (finding.status === 'NOT_APPLICABLE') continue;

    const sec = sectionMap.get(finding.section) ?? {
      id: finding.section,
      title: finding.sectionTitle,
      weight: 1,
    };
    const bucket = bySection.get(sec.id) ?? {
      w: 0,
      credit: 0,
      applicable: 0,
      resolved: 0,
      passed: 0,
      failed: 0,
      unknown: 0,
    };
    bucket.applicable++;
    applicableAll++;

    counts[finding.status]++;
    if (finding.status !== 'PASS' && finding.status !== 'UNKNOWN') {
      severityCounts[finding.severity]++;
    }

    if (finding.suppressedReason || finding.status === 'UNKNOWN') {
      if (finding.status === 'UNKNOWN') bucket.unknown++;
      bySection.set(sec.id, bucket);
      continue;
    }

    const w = ruleWeight(rule) * sec.weight;
    const credit = w * CREDIT[finding.status];
    bucket.w += w;
    bucket.credit += credit;
    bucket.resolved++;
    resolvedAll++;
    if (finding.status === 'PASS') bucket.passed++;
    else bucket.failed++;

    totalW += w;
    totalCredit += credit;
    bySection.set(sec.id, bucket);
  }

  const sectionScores: SectionScore[] = sections
    .filter((s) => bySection.has(s.id))
    .map((s) => {
      const b = bySection.get(s.id)!;
      return {
        id: s.id,
        title: s.title,
        score: b.w > 0 ? round1((10 * b.credit) / b.w) : null,
        weight: s.weight,
        applicable: b.applicable,
        resolved: b.resolved,
        passed: b.passed,
        failed: b.failed,
        unknown: b.unknown,
        confidence: b.applicable > 0 ? round1((100 * b.resolved) / b.applicable) : 100,
      };
    });

  return {
    overall: totalW > 0 ? round1((100 * totalCredit) / totalW) : 0,
    sections: sectionScores,
    counts,
    severityCounts,
    automationCoverage: applicableAll > 0 ? round1((100 * resolvedAll) / applicableAll) : 0,
    expectedBand: profile.expectedBand,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
