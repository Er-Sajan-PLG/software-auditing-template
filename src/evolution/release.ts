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
  // Evidence over claims: a benchmark with no cases proves nothing, so it can
  // never release. Otherwise an unbenchmarked candidate would sail through on
  // vacuous 1.000/1.000 scores.
  const hasEvidence = bench.cases.length > 0;
  const testsPassed = hasEvidence && s.fp === 0 && s.fn === 0;
  const benchmarkPassed = hasEvidence && precision >= gate.minPrecision && recall >= gate.minRecall;
  const noRegressions = !gate.requireNoRegressions || s.regressions === 0;
  const decision = decide(hasEvidence, testsPassed, benchmarkPassed, noRegressions);
  return {
    decision,
    reasons: buildReasons(
      bench.cases.length,
      s,
      precision,
      recall,
      gate,
      testsPassed,
      noRegressions,
    ),
    testsPassed,
    benchmarkPassed,
    precision,
    recall,
    regressions: s.regressions,
  };
}

/** All four conditions must hold; a missing benchmark is never a pass. */
function decide(
  hasEvidence: boolean,
  testsPassed: boolean,
  benchmarkPassed: boolean,
  noRegressions: boolean,
): ReleaseDecision['decision'] {
  if (!hasEvidence || !testsPassed || !benchmarkPassed || !noRegressions) return 'REJECT';
  return 'ACCEPT';
}

function buildReasons(
  cases: number,
  s: BenchmarkResult['summary'],
  precision: number,
  recall: number,
  gate: ReleaseGate,
  testsPassed: boolean,
  noRegressions: boolean,
): string[] {
  const reasons: string[] = [];
  if (cases === 0) reasons.push('no benchmark cases: a release requires positive evidence');
  if (cases > 0 && !testsPassed)
    reasons.push(`fixture results diverge from ground truth (${s.fp} FP, ${s.fn} FN)`);
  if (!noRegressions) reasons.push(`${s.regressions} regression(s) against existing rules`);
  if (cases > 0 && precision < gate.minPrecision)
    reasons.push(`precision ${precision.toFixed(3)} < ${gate.minPrecision}`);
  if (cases > 0 && recall < gate.minRecall)
    reasons.push(`recall ${recall.toFixed(3)} < ${gate.minRecall}`);
  return reasons;
}
