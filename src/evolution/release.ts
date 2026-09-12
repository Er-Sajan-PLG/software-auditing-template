import type { BenchmarkResult, ReleaseDecision, ReleaseGate } from './types.js';

/** Default gate: perfect precision/recall on the fleet, zero regressions. */
export const DEFAULT_RELEASE_GATE: ReleaseGate = {
  minPrecision: 1,
  minRecall: 1,
  requireNoRegressions: true,
};

/**
 * Deterministic release decision. A candidate ships only when the benchmark
 * fixtures match ground truth (no FP, no FN), precision/recall meet policy, and
 * no existing rule regressed. The decision is a pure function of the benchmark
 * result + gate, so it is auditable and reproducible.
 */
export function evaluateRelease(bench: BenchmarkResult, gate: ReleaseGate): ReleaseDecision {
  const s = bench.summary;
  const precision = s.tp + s.fp > 0 ? s.tp / (s.tp + s.fp) : 1;
  const recall = s.tp + s.fn > 0 ? s.tp / (s.tp + s.fn) : 1;
  const testsPassed = s.fp === 0 && s.fn === 0;
  const benchmarkPassed = precision >= gate.minPrecision && recall >= gate.minRecall;
  const noRegressions = !gate.requireNoRegressions || s.regressions === 0;
  const reasons = buildReasons(
    s.fp,
    s.fn,
    s.regressions,
    precision,
    recall,
    gate,
    testsPassed,
    noRegressions,
  );
  const decision = testsPassed && benchmarkPassed && noRegressions ? 'ACCEPT' : 'REJECT';
  return {
    decision,
    reasons,
    testsPassed,
    benchmarkPassed,
    precision,
    recall,
    regressions: s.regressions,
  };
}

function buildReasons(
  fp: number,
  fn: number,
  regressions: number,
  precision: number,
  recall: number,
  gate: ReleaseGate,
  testsPassed: boolean,
  noRegressions: boolean,
): string[] {
  const reasons: string[] = [];
  if (!testsPassed) reasons.push(`fixture results diverge from ground truth (${fp} FP, ${fn} FN)`);
  if (precision < gate.minPrecision)
    reasons.push(`precision ${precision.toFixed(3)} < ${gate.minPrecision}`);
  if (recall < gate.minRecall) reasons.push(`recall ${recall.toFixed(3)} < ${gate.minRecall}`);
  if (!noRegressions) reasons.push(`${regressions} regression(s) against existing rules`);
  return reasons;
}
