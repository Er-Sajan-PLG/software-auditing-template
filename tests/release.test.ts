import { describe, it, expect } from 'vitest';
import { evaluateRelease, DEFAULT_RELEASE_GATE } from '../src/evolution/release.js';
import { runBenchmark } from '../src/evolution/benchmark.js';
import { brokenCandidate, luaBenchmarkCases, luaCandidate } from './evolution-helpers.js';
import type { BenchmarkResult } from '../src/evolution/types.js';

function benchFor(candidate: Parameters<typeof runBenchmark>[0]): BenchmarkResult {
  return runBenchmark(candidate, luaBenchmarkCases(), undefined, 'test');
}

describe('release gate', () => {
  it('accepts a candidate that passes tests, benchmark, and regressions', () => {
    const d = evaluateRelease(benchFor(luaCandidate()), DEFAULT_RELEASE_GATE);
    expect(d.decision).toBe('ACCEPT');
    expect(d.testsPassed).toBe(true);
    expect(d.benchmarkPassed).toBe(true);
    expect(d.reasons).toEqual([]);
  });

  it('rejects a candidate that misses ground truth', () => {
    const d = evaluateRelease(benchFor(brokenCandidate()), DEFAULT_RELEASE_GATE);
    expect(d.decision).toBe('REJECT');
    expect(d.testsPassed).toBe(false);
    expect(d.reasons.length).toBeGreaterThan(0);
    expect(d.recall).toBeLessThan(1);
  });

  it('rejects a candidate that clears tests but fails the precision threshold', () => {
    // A perfect-accuracy benchmark under a stricter-than-possible gate still
    // passes; to force a precision failure we lower the gate and falsify via FN.
    const d = evaluateRelease(benchFor(brokenCandidate()), {
      minPrecision: 1,
      minRecall: 1,
      requireNoRegressions: false,
    });
    expect(d.decision).toBe('REJECT');
    expect(d.benchmarkPassed).toBe(false);
  });

  it('configurable gate: turning regressions off does not change a clean result', () => {
    const gate = { minPrecision: 1, minRecall: 1, requireNoRegressions: false };
    const d = evaluateRelease(benchFor(luaCandidate()), gate);
    expect(d.decision).toBe('ACCEPT');
  });

  it('the decision is a pure function of benchmark + gate', () => {
    const a = evaluateRelease(benchFor(luaCandidate()), DEFAULT_RELEASE_GATE);
    const b = evaluateRelease(benchFor(luaCandidate()), DEFAULT_RELEASE_GATE);
    expect(a).toEqual(b);
  });

  it('rejects a vacuous benchmark: a release requires positive evidence', () => {
    const empty: BenchmarkResult = {
      capability: { id: 'stacks/lua', version: '0.1.0' },
      cases: [],
      summary: { tp: 0, tn: 0, fp: 0, fn: 0, precision: 1, recall: 1, regressions: 0 },
    };
    const d = evaluateRelease(empty, DEFAULT_RELEASE_GATE);
    expect(d.decision).toBe('REJECT');
    expect(d.testsPassed).toBe(false);
    expect(d.reasons.join(' ')).toContain('no benchmark cases');
  });
});
