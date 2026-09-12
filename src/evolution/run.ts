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
import type {
  AuditRun,
  BenchmarkCase,
  Capability,
  CapabilityGap,
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
  candidate?: {
    capabilityId: string;
    gapIds: string[];
    release?: ReleaseDecision;
  };
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

  const out: EvolutionCycleOutput = { snapshot, before };
  const candidate = input.candidateCapability;
  if (!candidate) return out;

  const gate = input.releaseGate ?? DEFAULT_RELEASE_GATE;
  const bench = runBenchmark(candidate, input.benchmarkCases ?? [], input.rulesDir, engineVersion);
  const release = evaluateRelease(bench, gate);

  out.candidate = { capabilityId: candidate.id, gapIds: before.gaps.map((g) => g.id), release };
  input.store?.put({ kind: 'benchmark', capabilityId: candidate.id, ...bench });
  input.store?.put({ kind: 'release', capabilityId: candidate.id, ...release });

  if (release.decision === 'ACCEPT') {
    const after = audit(input, snapshot, engineVersion, [candidate], input.repository);
    out.after = { ...after, delta: compareReAudit(before, after) };
  }

  return out;
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
