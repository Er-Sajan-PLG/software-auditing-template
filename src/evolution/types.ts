/**
 * Types for the evolution layer: coverage, blind spots, capability gaps,
 * capabilities/candidates, benchmarks, releases, audit runs, and re-audit deltas.
 * All are plain JSON-serializable data so they can be content-addressed by the
 * Store and reproduced byte-for-byte.
 */

import type { RulePack, Status } from '../types.js';

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

/* -------------------------------------------------------------- capability -- */

export type CapabilityKind = 'data' | 'executor' | 'composite' | 'oracle';

/** A shipped, versioned capability. The data kind carries a rule pack. */
export interface Capability {
  id: string;
  version: string;
  kind: CapabilityKind;
  description: string;
  /** The rule pack this capability contributes (signature for `data` capabilities). */
  pack?: RulePack;
  /** Languages this capability analyzes — used for honest coverage accounting. */
  languages?: string[];
  status: 'stable' | 'deprecated';
  provenance: { createdAt: string; createdBy: string };
}

export type CandidateStatus =
  'PROPOSED' | 'IMPLEMENTED' | 'TESTED' | 'BENCHMARKED' | 'REVIEWED' | 'RELEASED' | 'REJECTED';

/** A capability that is *not* production yet. Never in the active set. */
export interface CandidateCapability {
  id: string;
  capability: Capability;
  gapIds: string[];
  status: CandidateStatus;
  createdAt: string;
  release?: ReleaseDecision;
}

/* --------------------------------------------------------------- benchmark -- */

export type BenchmarkKind = 'known-positive' | 'known-negative' | 'regression';

export interface BenchmarkCase {
  id: string;
  kind: BenchmarkKind;
  description: string;
  /** Files to materialize as a fixture tree. */
  fixture: Record<string, string>;
  /** Ground truth: expected status per rule id in a full-fixture audit. */
  expected: { ruleId: string; status: Status }[];
}

export interface BenchmarkCaseResult {
  caseId: string;
  kind: BenchmarkKind;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  regressions: string[];
  elapsedMs: number;
}

export interface BenchmarkResult {
  capability: { id: string; version: string };
  cases: BenchmarkCaseResult[];
  summary: {
    tp: number;
    tn: number;
    fp: number;
    fn: number;
    precision: number;
    recall: number;
    regressions: number;
  };
}

/* ----------------------------------------------------------------- release -- */

export interface ReleaseGate {
  minPrecision: number;
  minRecall: number;
  requireNoRegressions: boolean;
}

export interface ReleaseDecision {
  decision: 'ACCEPT' | 'REJECT';
  reasons: string[];
  testsPassed: boolean;
  benchmarkPassed: boolean;
  precision: number;
  recall: number;
  regressions: number;
}

/* -------------------------------------------------------------- audit run -- */

export interface AuditRun {
  id: string;
  repository: string;
  snapshotId: string;
  capabilitySetId: string;
  engineVersion: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  endedAt?: string;
  /** Content address of the stored result (report trailer data). */
  resultId?: string;
  provenance: { modelBundleId?: string };
}

/* -------------------------------------------------------------- re-audit -- */

export interface ReAuditDelta {
  before: { automationCoverage: number; languageCoverage: number; unsupported: string[] };
  after: { automationCoverage: number; languageCoverage: number; unsupported: string[] };
  coverageDelta: number;
  findingsAdded: string[];
  findingsRemoved: string[];
  gapReduced: boolean;
  intendedFindingDetectable: boolean;
}
