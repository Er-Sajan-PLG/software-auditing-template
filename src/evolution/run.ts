import { runAudit } from '../engine/audit.js';
import { detect, loadDetectorFile } from '../detect/index.js';
import { Project } from '../util/project.js';
import { canonicalJson, hashText, snapshotOfProject, type Snapshot } from '../snapshot/index.js';
import { Store } from '../store/index.js';
import type { AuditReport, Facts } from '../types.js';
import { computeCoverage } from './coverage.js';
import { deriveGaps } from './gap.js';
import { basePackIds, resolveCapabilitySetId } from './capability.js';
import { runBenchmark } from './benchmark.js';
import { DEFAULT_RELEASE_GATE, evaluateRelease } from './release.js';
import { proposeCandidates, proposeFromSuggestions } from './propose.js';
import { learnFromReport } from '../learn/index.js';
import { GapQueue, type QueueSummary } from './queue.js';
import { scheduleCandidates, type ScheduleResult } from './schedule.js';
import type {
  AuditRun,
  BenchmarkCase,
  Capability,
  CapabilityGap,
  CandidateCapability,
  CoverageModel,
  ReAuditDelta,
  ReleaseDecision,
  ReleaseGate,
} from './types.js';

export interface EvolutionCycleInput {
  target: string;
  rulesDir?: string;
  engineVersion?: string;
  repository?: string;
  candidateCapability?: Capability;
  benchmarkCases?: BenchmarkCase[];
  releaseGate?: ReleaseGate;
  store?: Store;
  /**
   * When no explicit candidate is supplied, propose one (or more) from the
   * BEFORE gaps, deterministically, and run the first proposable candidate
   * through benchmark + release. Nothing is registered — the proposal is a
   * candidate only. Records the full proposal list on the output.
   */
  proposeFromGaps?: boolean;
  /** Called for each gap that could not be turned into a candidate. */
  onUnproposable?: (gap: CapabilityGap, reason: string) => void;
  /**
   * Path to a previously generated USA report. When no explicit candidate is
   * supplied, its open findings are turned into a `learn-proposals` candidate of
   * manual checks (`usa learn` → proposal). Lower precedence than
   * `candidateCapability`; higher than `proposeFromGaps`.
   */
  learnReportPath?: string;
  /** Minimum severity considered when learning from `learnReportPath`. */
  learnMinSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'FUTURE';
  /**
   * When true, and only when there is no explicit `candidateCapability` and no
   * `learnReportPath`, evaluate EVERY proposable candidate (one per open gap)
   * via `scheduleCandidates` instead of just the first. Ignored otherwise.
   */
  allGaps?: boolean;
  /**
   * Persist gaps into the persistent queue and close the targeted gap(s) when a
   * candidate is accepted. Defaults to true when a `store` is present. Requires
   * a store; ignored otherwise.
   */
  persistGaps?: boolean;
}

export interface AuditWithCoverage {
  report: AuditReport;
  facts: Facts;
  coverage: CoverageModel;
  gaps: CapabilityGap[];
  capabilitySetId: string;
  auditRunId: string;
  runRecord: AuditRun;
}

export interface EvolutionCycleOutput {
  snapshot: Snapshot;
  before: AuditWithCoverage;
  /** Candidate actually benchmarked/released (explicit or auto-proposed). */
  candidate?: {
    capabilityId: string;
    gapIds: string[];
    release?: ReleaseDecision;
  };
  /** All candidates proposed from gaps (empty when none were requested). */
  proposed: CandidateCapability[];
  /** Suggestion count when the candidate was learned from a report. */
  learnedSuggestions?: number;
  /** Persistent-queue view after the run (when a store was used). */
  queue?: QueueSummary;
  /** Batch scheduler outcome (only in `allGaps` mode). */
  schedule?: ScheduleResult;
  after?: AuditWithCoverage & { delta: ReAuditDelta };
}

const OPEN = new Set(['FAIL', 'WRONG', 'MISSING', 'DEPRECATED', 'EXPERIMENTAL']);

/**
 * The full, deterministic evolution cycle:
 *
 *     SNAPSHOT → AUDIT → COVERAGE → GAPS → (CANDIDATE → BENCHMARK → RELEASE)
 *              → RE-AUDIT → DELTA
 *
 * No LLM is required: every stage is a deterministic function of the snapshot +
 * capability set + engine version. Records written to the Store are
 * content-addressed and reproducible.
 */
export function runEvolutionCycle(input: EvolutionCycleInput): EvolutionCycleOutput {
  const engineVersion = input.engineVersion ?? 'dev';
  const snapshot = makeSnapshot(input.target);
  const before = audit(input, snapshot, engineVersion, [], input.repository);

  const out: EvolutionCycleOutput = { snapshot, before, proposed: [] };
  const queue = useQueue(input);
  if (queue) {
    queue.recordGaps(before.gaps);
    out.queue = queue.summarize();
  }

  const candidate = resolveCandidate(input, before, out);
  if (isAllGapsMode(input)) {
    runAllGaps(input, snapshot, before, out, queue, engineVersion);
    return out;
  }
  if (!candidate) return out;

  const gate = input.releaseGate ?? DEFAULT_RELEASE_GATE;
  const bench = runBenchmark(candidate, input.benchmarkCases ?? [], input.rulesDir, engineVersion);
  const release = evaluateRelease(bench, gate);
  // Gaps this candidate provably targets, by required capability. This drives
  // the queue — it must be exact, never a "the candidate is about everything"
  // fallback, or an unrelated release would close unrelated gaps.
  const targeted = before.gaps
    .filter((g) => g.requiredCapability === candidate.id)
    .map((g) => g.id);
  out.candidate = {
    capabilityId: candidate.id,
    gapIds: targeted,
    release,
  };
  input.store?.put({ kind: 'benchmark', capabilityId: candidate.id, ...bench });
  input.store?.put({ kind: 'release', capabilityId: candidate.id, ...release });

  if (release.decision === 'ACCEPT') {
    const after = audit(input, snapshot, engineVersion, [candidate], input.repository);
    out.after = { ...after, delta: compareReAudit(before, after) };
    releaseIntoQueue(queue, out, candidate, targeted);
  }

  return out;
}

/**
 * Whether this run should sweep every proposable candidate. Only an explicit
 * `allGaps` with no explicit candidate and no report to learn from qualifies;
 * everything else keeps the single-candidate behavior.
 */
function isAllGapsMode(input: EvolutionCycleInput): boolean {
  return !!input.allGaps && !input.candidateCapability && !input.learnReportPath;
}

/**
 * The batch, queue-driven half of the loop: evaluate EVERY proposable
 * candidate (one per open gap) through the scheduler. The first RELEASED
 * candidate defines the output `candidate` and drives a single re-audit; if
 * nothing releases, `candidate` reflects the first attempt and `after` stays
 * undefined. Never runs the single-candidate path, so nothing is benchmarked
 * twice.
 */
function runAllGaps(
  input: EvolutionCycleInput,
  snapshot: Snapshot,
  before: AuditWithCoverage,
  out: EvolutionCycleOutput,
  queue: GapQueue | undefined,
  engineVersion: string,
): void {
  const proposed = proposeCandidates(before.coverage, before.gaps, {
    createdBy: 'evolution:propose',
    onUnproposable: input.onUnproposable,
  });
  out.proposed = proposed;

  const result = scheduleCandidates({
    candidates: proposed,
    gaps: before.gaps,
    benchmarkCases: input.benchmarkCases,
    rulesDir: input.rulesDir,
    engineVersion,
    releaseGate: input.releaseGate,
    queue,
    persist: input.store ? (kind, body) => input.store!.put({ kind, ...body }) : undefined,
  });
  out.schedule = result;
  if (queue) out.queue = queue.summarize();

  const firstReleased = result.candidates.find((c) => c.outcome === 'RELEASED');
  const primary = firstReleased ?? result.candidates[0];
  if (!primary) return;

  out.candidate = {
    capabilityId: primary.capabilityId,
    gapIds: primary.gapIds,
    release: primary.release,
  };
  if (!firstReleased) return;

  const capability = proposed.find(
    (c) => c.capability.id === firstReleased.capabilityId,
  )?.capability;
  if (!capability) return;
  const after = audit(input, snapshot, engineVersion, [capability], input.repository);
  out.after = { ...after, delta: compareReAudit(before, after) };
}

/** A released capability closes exactly the queue gaps it targeted. */
function releaseIntoQueue(
  queue: GapQueue | undefined,
  out: EvolutionCycleOutput,
  candidate: Capability,
  targeted: string[],
): void {
  if (!queue || targeted.length === 0) return;
  queue.closeGaps(targeted, `released ${candidate.id}@${candidate.version ?? '?'}`);
  out.queue = queue.summarize();
}

/** The persistent gap queue, when a store backs this run. */
function useQueue(input: EvolutionCycleInput): GapQueue | undefined {
  const enabled = input.persistGaps ?? input.store !== undefined;
  if (!enabled || !input.store) return undefined;
  return new GapQueue(input.store);
}

/**
 * Choose the capability to benchmark: the explicit one, or the first candidate
 * auto-proposed from the BEFORE gaps. When proposing, all proposals are
 * recorded on the output (even though only the first is evaluated this run).
 */
function resolveCandidate(
  input: EvolutionCycleInput,
  before: AuditWithCoverage,
  out: EvolutionCycleOutput,
): Capability | undefined {
  if (input.candidateCapability) return input.candidateCapability;
  if (input.learnReportPath) return learnCandidate(input, out);
  if (!input.proposeFromGaps) return undefined;
  const proposed = proposeCandidates(before.coverage, before.gaps, {
    createdBy: 'evolution:propose',
    onUnproposable: input.onUnproposable,
  });
  out.proposed = proposed;
  return proposed[0]?.capability;
}

/** Turn a report's open findings into a `learn-proposals` candidate. */
function learnCandidate(
  input: EvolutionCycleInput,
  out: EvolutionCycleOutput,
): Capability | undefined {
  let suggestions;
  try {
    suggestions = learnFromReport({
      reportPath: input.learnReportPath!,
      minSeverity: input.learnMinSeverity,
    });
  } catch (err) {
    // A malformed/foreign report must not abort the audit: warn and continue
    // with the BEFORE half (consistent with ADR-0009: fail closed, not crash).
    input.onUnproposable?.(
      { id: 'learn-proposals' } as CapabilityGap,
      `could not learn from ${input.learnReportPath}: ${(err as Error).message}`,
    );
    return undefined;
  }
  out.learnedSuggestions = suggestions.length;
  const candidate = proposeFromSuggestions(suggestions, { createdBy: 'evolution:learn' });
  if (!candidate) {
    input.onUnproposable?.(
      { id: 'learn-proposals' } as CapabilityGap,
      `no actionable suggestions in ${input.learnReportPath}`,
    );
    return undefined;
  }
  out.proposed = [candidate];
  return candidate.capability;
}

/* -------------------------------------------------------------------- core -- */

function makeSnapshot(target: string): Snapshot {
  const project = new Project(target);
  const git = project.gitInfo();
  return snapshotOfProject(
    project,
    git.isRepo ? { commit: git.commit, ref: git.ref, repoUrl: git.repoUrl } : null,
  );
}

function audit(
  input: EvolutionCycleInput,
  snapshot: Snapshot,
  engineVersion: string,
  extraCapabilities: Capability[],
  repository: string | undefined,
): AuditWithCoverage {
  const started = new Date().toISOString();

  const outcome = runAudit({
    target: snapshot.root,
    rulesDir: input.rulesDir,
    usaVersion: engineVersion,
    extraPacks: extraCapabilities.map((c) => c.pack).filter((p): p is NonNullable<typeof p> => !!p),
  });
  const report = outcome.report;

  // Capability set identity is resolved from the *same* rules dir the audit
  // used, so the reproducibility boundary is exactly what ran.
  const capabilitySetId = resolveCapabilitySetId(
    basePackIds(report.options.rulesDir),
    extraCapabilities,
    engineVersion,
  );

  const project = new Project(snapshot.root);
  const git = project.gitInfo();
  const detection = detect(project, loadDetectorFile(report.options.rulesDir), git, []);
  const facts = detection.facts;

  const extraLangs = extraCapabilities.flatMap((c) => c.languages ?? []);
  const coverage = computeCoverage(report, facts, extraLangs);

  const resultId = input.store ? input.store.put(report) : undefined;
  const body: Omit<AuditRun, 'id'> = {
    repository: repository ?? git.repoUrl ?? snapshot.root,
    snapshotId: snapshot.id,
    capabilitySetId,
    engineVersion,
    status: 'completed',
    startedAt: started,
    endedAt: new Date().toISOString(),
    resultId,
    provenance: {},
  };
  // The run's identity is its content address (stored without an `id` field so
  // the address is exactly the hash of the stored bytes, hence retrievable).
  const auditRunId = input.store ? input.store.put(body) : hashText(canonicalJson(body));
  const runRecord: AuditRun = { id: auditRunId, ...body };
  const gaps = deriveGaps(coverage, auditRunId, snapshot.id);

  return { report, facts, coverage, gaps, capabilitySetId, auditRunId, runRecord };
}

/* ------------------------------------------------------------------ delta -- */

function openStatuses(report: AuditReport): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of report.findings) map.set(f.ruleId, f.status);
  return map;
}

function compareReAudit(before: AuditWithCoverage, after: AuditWithCoverage): ReAuditDelta {
  const gapReduced = before.gaps.some(
    (g) =>
      g.kind === 'unsupported-technology' && after.coverage.coveredLanguages.includes(g.target),
  );

  const b = openStatuses(before.report);
  const a = openStatuses(after.report);
  const findingsAdded: string[] = [];
  const findingsRemoved: string[] = [];
  for (const id of new Set([...b.keys(), ...a.keys()])) {
    const was = b.get(id) ?? 'NOT_APPLICABLE';
    const is = a.get(id) ?? 'NOT_APPLICABLE';
    const wasOpen = OPEN.has(was);
    const isOpen = OPEN.has(is);
    if (!wasOpen && isOpen) findingsAdded.push(id);
    else if (wasOpen && !isOpen) findingsRemoved.push(id);
  }

  return {
    before: {
      automationCoverage: before.coverage.automationCoverage,
      languageCoverage: before.coverage.languageCoverage,
      unsupported: before.coverage.unsupportedLanguages,
    },
    after: {
      automationCoverage: after.coverage.automationCoverage,
      languageCoverage: after.coverage.languageCoverage,
      unsupported: after.coverage.unsupportedLanguages,
    },
    coverageDelta: after.coverage.languageCoverage - before.coverage.languageCoverage,
    findingsAdded,
    findingsRemoved,
    gapReduced,
    intendedFindingDetectable: findingsAdded.length > 0,
  };
}
