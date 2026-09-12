/**
 * Types for the evolution layer: coverage, blind spots, and capability gaps.
 * All of these are plain JSON-serializable data so they can be content-addressed
 * by the Store and reproduced byte-for-byte.
 */

/** A place where USA measurably cannot (yet) analyze something. */
export interface BlindSpot {
  kind: 'unsupported-language' | 'unverifiable-section';
  /** Stable id, e.g. `lang:lua` or `section:S7`. */
  id: string;
  detail: string;
  /** Traceable evidence backing the claim (facts, pack list, counts). */
  evidence: string;
}

/**
 * Multi-axis coverage: what USA actually examined, not what it claims it can
 * examine. Derived solely from the audit result and detected facts — a
 * capability that merely exists in the registry but does not apply is *not*
 * counted as coverage.
 */
export interface CoverageModel {
  /** Share of applicable checks the engine resolved without a human (0..100). */
  automationCoverage: number;
  /** Share of detected languages that a shipped pack actually covers (0..100). */
  languageCoverage: number;
  detectedLanguages: string[];
  coveredLanguages: string[];
  /** Detected languages with no production capability (bootstrap-at-best). */
  unsupportedLanguages: string[];
  /** Sections the engine could not verify automatically (null score). */
  unverifiableSections: string[];
  /** Count of open judgements requiring a human/agent. */
  unknownFindings: number;
  blindSpots: BlindSpot[];
}

export type GapKind =
  'unsupported-technology' | 'missing-detector' | 'unverifiable-property' | 'uncertain-capability';

/**
 * A measurable limitation discovered from audit evidence. A gap is *not* LLM
 * intuition: it carries the evidence (facts, pack list, audit/snapshot ids)
 * that explains why it exists.
 */
export interface CapabilityGap {
  id: string;
  kind: GapKind;
  /** The technology/component/section the gap concerns. */
  target: string;
  problem: string;
  /** Ordered, traceable evidence strings. */
  evidence: string[];
  /** The capability that would close the gap (e.g. `stacks/lua`). */
  requiredCapability: string;
  priority: 'low' | 'medium' | 'high';
  auditRunId: string;
  snapshotId: string;
  createdAt: string;
  state: 'open' | 'accepted' | 'closed';
}
