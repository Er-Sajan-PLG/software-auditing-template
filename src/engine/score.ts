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

  const acc: ScoreAccum = {
    bySection: new Map(),
    counts,
    severityCounts,
    totalW: 0,
    totalCredit: 0,
    applicableAll: 0,
    resolvedAll: 0,
  };

  for (const { rule, finding } of evaluated) {
    accumulateScoredRule(acc, sectionMap, rule, finding);
  }

  const sectionScores: SectionScore[] = sections
    .filter((s) => acc.bySection.has(s.id))
    .map((s) => buildSectionScore(s, acc.bySection.get(s.id)!));

  return {
    overall: acc.totalW > 0 ? round1((100 * acc.totalCredit) / acc.totalW) : 0,
    sections: sectionScores,
    counts,
    severityCounts,
    automationCoverage:
      acc.applicableAll > 0 ? round1((100 * acc.resolvedAll) / acc.applicableAll) : 0,
    expectedBand: profile.expectedBand,
  };
}

interface SectionBucket {
  w: number;
  credit: number;
  applicable: number;
  resolved: number;
  passed: number;
  failed: number;
  unknown: number;
}

interface ScoreAccum {
  bySection: Map<string, SectionBucket>;
  counts: Record<Status, number>;
  severityCounts: Record<Severity, number>;
  totalW: number;
  totalCredit: number;
  applicableAll: number;
  resolvedAll: number;
}

function emptyBucket(): SectionBucket {
  return { w: 0, credit: 0, applicable: 0, resolved: 0, passed: 0, failed: 0, unknown: 0 };
}

function bucketFor(bySection: Map<string, SectionBucket>, id: string): SectionBucket {
  let bucket = bySection.get(id);
  if (!bucket) {
    bucket = emptyBucket();
    bySection.set(id, bucket);
  }
  return bucket;
}

function accumulateScoredRule(
  acc: ScoreAccum,
  sectionMap: Map<string, SectionDef>,
  rule: Rule,
  finding: Finding,
): void {
  if (finding.status === 'NOT_APPLICABLE') return;
  const sec = sectionMap.get(finding.section) ?? {
    id: finding.section,
    title: finding.sectionTitle,
    weight: 1,
  };
  const bucket = bucketFor(acc.bySection, sec.id);
  bucket.applicable++;
  acc.applicableAll++;

  acc.counts[finding.status]++;
  if (finding.status !== 'PASS' && finding.status !== 'UNKNOWN') {
    acc.severityCounts[finding.severity]++;
  }

  if (finding.suppressedReason || finding.status === 'UNKNOWN') {
    if (finding.status === 'UNKNOWN') bucket.unknown++;
    return;
  }
  applyRuleCredit(acc, bucket, rule, finding, sec.weight);
}

function applyRuleCredit(
  acc: ScoreAccum,
  bucket: SectionBucket,
  rule: Rule,
  finding: Finding,
  sectionWeight: number,
): void {
  const w = ruleWeight(rule) * sectionWeight;
  const credit = w * CREDIT[finding.status];
  bucket.w += w;
  bucket.credit += credit;
  bucket.resolved++;
  acc.resolvedAll++;
  if (finding.status === 'PASS') bucket.passed++;
  else bucket.failed++;
  acc.totalW += w;
  acc.totalCredit += credit;
}

function buildSectionScore(s: SectionDef, b: SectionBucket): SectionScore {
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
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
