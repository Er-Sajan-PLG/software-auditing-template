import { runBenchmark } from './benchmark.js';
import { evaluateRelease, DEFAULT_RELEASE_GATE } from './release.js';
import type { GapQueue } from './queue.js';
import type {
  BenchmarkCase,
  BenchmarkResult,
  CandidateCapability,
  CapabilityGap,
  ReleaseDecision,
  ReleaseGate,
} from './types.js';

/**
 * The queue-driven scheduler: the unattended half of the loop.
 *
 * A single cycle evaluates one candidate. The scheduler walks a *batch* of
 * candidates (one per open gap, produced by the proposal stage) and runs each
 * through BENCHMARK → RELEASE, closing the queue gap for every accepted
 * capability. It is still fully deterministic and offline: the same candidates,
 * cases, and gate produce the same outcome list, and nothing is ever registered.
 *
 * The scheduler never proposes and never audits — it is a pure coordination of
 * the stages that already exist, so it cannot invent work the proposal and gate
 * steps would not have produced anyway.
 */

export interface ScheduledCandidate {
  capabilityId: string;
  /** Gaps this candidate targeted (by required capability). */
  gapIds: string[];
  release: ReleaseDecision;
  outcome: 'RELEASED' | 'REJECTED';
  /** Queue gaps actually closed by this release (empty when rejected). */
  closedGapIds: string[];
  benchmark: BenchmarkResult;
  /**
   * Set when the scheduler overrode an ACCEPT to a REJECT because the candidate
   * offers no automated detection to prove (e.g. only `manual` checks).
   */
  blockedReason?: string;
}

export interface ScheduleResult {
  attempted: number;
  released: number;
  rejected: number;
  candidates: ScheduledCandidate[];
}

export interface ScheduleInput {
  /** Candidates to evaluate, in the order they should be attempted. */
  candidates: CandidateCapability[];
  /** The BEFORE gaps, used to map each candidate to the gaps it targets. */
  gaps: CapabilityGap[];
  benchmarkCases?: BenchmarkCase[];
  rulesDir?: string;
  engineVersion?: string;
  releaseGate?: ReleaseGate;
  /** When present, accepted candidates close their targeted gaps. */
  queue?: GapQueue;
  /** Persist benchmark + release records (needs a store). */
  persist?: (kind: 'benchmark' | 'release', body: Record<string, unknown>) => void;
}

/**
 * Evaluate every candidate in order and return one outcome per candidate.
 *
 * The order is significant and preserved: the caller (which sorted gaps by
 * priority then id) decides what "first" means. Each candidate is independent,
 * so a rejection never blocks a later release.
 */
export function scheduleCandidates(input: ScheduleInput): ScheduleResult {
  const gate = input.releaseGate ?? DEFAULT_RELEASE_GATE;
  const candidates = input.candidates.map((candidate) => evaluateCandidate(candidate, input, gate));
  return summarize(candidates);
}

/** Benchmark → gate → (release ⇒ close) for one candidate. */
function evaluateCandidate(
  candidate: CandidateCapability,
  input: ScheduleInput,
  gate: ReleaseGate,
): ScheduledCandidate {
  const benchmark = runBenchmark(
    candidate.capability,
    input.benchmarkCases ?? [],
    input.rulesDir,
    input.engineVersion ?? 'dev',
  );
  const release = evaluateRelease(benchmark, gate);
  const gapIds = targetedGapIds(input.gaps, candidate.capability.id);
  input.persist?.('benchmark', { capabilityId: candidate.capability.id, ...benchmark });
  input.persist?.('release', { capabilityId: candidate.capability.id, ...release });

  // A gate ACCEPT only proves the candidate matches its fixtures. A candidate
  // whose pack is entirely `manual` checks proves nothing automated: every
  // `manual` check is UNKNOWN, so it trivially has zero FP/FN and would pass
  // on a vacuous benchmark. Releasing it would close a real gap with a
  // capability that detects nothing — so the scheduler refuses.
  const blockedReason = release.decision === 'ACCEPT' ? unbenchmarkable(candidate) : undefined;
  const released = release.decision === 'ACCEPT' && blockedReason === undefined;

  const entry: ScheduledCandidate = {
    capabilityId: candidate.capability.id,
    gapIds,
    release,
    outcome: released ? 'RELEASED' : 'REJECTED',
    closedGapIds: released ? closeTargets(input, candidate, gapIds) : [],
    benchmark,
  };
  if (blockedReason) entry.blockedReason = blockedReason;
  return entry;
}

/** Close the queue gaps a released candidate targets (empty when no queue). */
function closeTargets(
  input: ScheduleInput,
  candidate: CandidateCapability,
  gapIds: string[],
): string[] {
  if (!input.queue) return [];
  return input.queue.closeGaps(
    gapIds,
    `released ${candidate.capability.id}@${candidate.capability.version ?? '?'}`,
  );
}

/**
 * Why a candidate must not be released despite a passing gate, or undefined if
 * it is genuinely releasable. Today: a pack with no automated (non-`manual`)
 * rule cannot be proven to detect anything.
 */
function unbenchmarkable(candidate: CandidateCapability): string | undefined {
  const rules = candidate.capability.pack?.rules ?? [];
  if (rules.length === 0) return 'capability contributes no rules';
  const automated = rules.filter((r) => r.check.kind !== 'manual');
  if (automated.length === 0) {
    return `only manual checks (${rules.length}) — no automated detection to prove`;
  }
  return undefined;
}

/** Gaps a candidate provably targets, by required capability. Never a fallback. */
function targetedGapIds(gaps: CapabilityGap[], capabilityId: string): string[] {
  return gaps.filter((g) => g.requiredCapability === capabilityId).map((g) => g.id);
}

function summarize(candidates: ScheduledCandidate[]): ScheduleResult {
  let released = 0;
  let rejected = 0;
  for (const c of candidates) {
    if (c.outcome === 'RELEASED') released += 1;
    else rejected += 1;
  }
  return { attempted: candidates.length, released, rejected, candidates };
}
