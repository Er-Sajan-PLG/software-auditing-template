import type { CapabilityGap, CoverageModel } from './types.js';

/**
 * Turn a coverage model's blind spots into evidence-backed capability gaps.
 *
 * Every gap cites the audit run and snapshot that produced it, plus the
 * observed fact/pack-list evidence — a gap is a conclusion from recorded
 * evidence, never free-floating intuition.
 */
export function deriveGaps(
  coverage: CoverageModel,
  auditRunId: string,
  snapshotId: string,
  now = new Date().toISOString(),
): CapabilityGap[] {
  const gaps: CapabilityGap[] = [];
  for (const spot of coverage.blindSpots) {
    gaps.push(spot.kind === 'unsupported-language' ? languageGap(spot) : sectionGap(spot));
  }
  for (const gap of gaps) {
    gap.auditRunId = auditRunId;
    gap.snapshotId = snapshotId;
    gap.createdAt = now;
    gap.evidence.push(`auditRun:${auditRunId}`, `snapshot:${snapshotId}`);
  }
  return gaps;
}

function languageGap(spot: { id: string; detail: string; evidence: string }): CapabilityGap {
  const lang = spot.id.startsWith('lang:') ? spot.id.slice('lang:'.length) : spot.id;
  return {
    id: `unsupported-technology:${lang}`,
    kind: 'unsupported-technology',
    target: lang,
    problem: `USA cannot analyze ${lang} repositories — no capability covers this language.`,
    evidence: [spot.evidence],
    requiredCapability: `stacks/${lang}`,
    priority: 'high',
    auditRunId: '',
    snapshotId: '',
    createdAt: '',
    state: 'open',
  };
}

function sectionGap(spot: { id: string; detail: string; evidence: string }): CapabilityGap {
  return {
    id: `unverifiable-property:${spot.id}`,
    kind: 'unverifiable-property',
    target: spot.id,
    problem: spot.detail,
    evidence: [spot.evidence],
    requiredCapability: spot.id,
    priority: 'medium',
    auditRunId: '',
    snapshotId: '',
    createdAt: '',
    state: 'open',
  };
}
