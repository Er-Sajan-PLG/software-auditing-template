import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store/index.js';
import { GapQueue } from '../src/evolution/queue.js';
import { capabilityFromPack } from '../src/evolution/capability.js';
import { scheduleCandidates } from '../src/evolution/schedule.js';
import { luaBenchmarkCases, luaCandidate } from './evolution-helpers.js';
import type { Capability, CapabilityGap, CandidateCapability } from '../src/evolution/types.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tempStore(): Store {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-sched-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new Store(dir);
}

function gap(over: Partial<CapabilityGap> = {}): CapabilityGap {
  return {
    id: 'unsupported-technology:lua',
    kind: 'unsupported-technology',
    target: 'lua',
    problem: 'no capability covers lua',
    evidence: ['detected fact "lang:lua"'],
    requiredCapability: 'stacks/lua',
    priority: 'high',
    auditRunId: 'r1',
    snapshotId: 's1',
    createdAt: '2020-01-01T00:00:00.000Z',
    state: 'open',
    ...over,
  };
}

function candidate(cap: Capability, gapIds: string[] = []): CandidateCapability {
  return {
    id: cap.id,
    capability: cap,
    gapIds,
    status: 'PROPOSED',
    createdAt: '2020-01-01T00:00:00.000Z',
  };
}

/** A capability whose only checks are `manual` — no automated detection. */
function manualOnly(): Capability {
  return capabilityFromPack(
    {
      id: 'stacks/lua',
      title: 'Lua',
      rules: [
        {
          id: 'LUA-001',
          title: 'Review dynamic execution',
          section: 'S15',
          severity: 'HIGH',
          ruleClass: 'security',
          check: { kind: 'manual' },
          why: 'needs review',
          evidence: 'file:line',
        },
      ],
    },
    { version: '0.1.0', createdBy: 'test', languages: ['lua'] },
  );
}

/** A capability contributing no rules at all. */
function emptyPack(): Capability {
  return capabilityFromPack(
    { id: 'stacks/lua', title: 'Lua', rules: [] },
    { version: '0.1.0', createdBy: 'test' },
  );
}

describe('scheduleCandidates', () => {
  it('releases a benchmarkable candidate and closes its targeted gap', () => {
    const queue = new GapQueue(tempStore());
    queue.recordGaps([gap()]);
    const result = scheduleCandidates({
      candidates: [candidate(luaCandidate())],
      gaps: [gap()],
      benchmarkCases: luaBenchmarkCases(),
      releaseGate: { minPrecision: 1, minRecall: 1, requireNoRegressions: true },
      queue,
    });

    expect(result.attempted).toBe(1);
    expect(result.released).toBe(1);
    expect(result.candidates[0]!.outcome).toBe('RELEASED');
    expect(result.candidates[0]!.gapIds).toEqual(['unsupported-technology:lua']);
    expect(result.candidates[0]!.closedGapIds).toEqual(['unsupported-technology:lua']);
    expect(queue.openGaps()).toHaveLength(0);
  });

  it('rejects a candidate with no benchmark cases and closes nothing', () => {
    const queue = new GapQueue(tempStore());
    queue.recordGaps([gap()]);
    const result = scheduleCandidates({
      candidates: [candidate(luaCandidate())],
      gaps: [gap()],
      queue,
    });
    expect(result.rejected).toBe(1);
    expect(result.candidates[0]!.closedGapIds).toEqual([]);
    expect(queue.openGaps()).toHaveLength(1);
  });

  it('evaluates candidates in the given order and does not let one rejection block another', () => {
    const queue = new GapQueue(tempStore());
    queue.recordGaps([
      gap(),
      gap({ id: 'unsupported-technology:php', target: 'php', requiredCapability: 'stacks/php' }),
    ]);
    const broken = manualOnly();
    const result = scheduleCandidates({
      candidates: [candidate(broken), candidate(luaCandidate())],
      gaps: [
        gap(),
        gap({ id: 'unsupported-technology:php', target: 'php', requiredCapability: 'stacks/php' }),
      ],
      benchmarkCases: luaBenchmarkCases(),
      releaseGate: { minPrecision: 1, minRecall: 1, requireNoRegressions: true },
      queue,
    });
    expect(result.candidates.map((c) => c.capabilityId)).toEqual(['stacks/lua', 'stacks/lua']);
    // Order preserved; both entries present regardless of outcome.
    expect(result.attempted).toBe(2);
  });

  it('refuses to release a manual-only capability even when the gate accepts', () => {
    const queue = new GapQueue(tempStore());
    queue.recordGaps([gap()]);
    const result = scheduleCandidates({
      candidates: [candidate(manualOnly())],
      gaps: [gap()],
      // A case that the manual pack "passes" vacuously (UNKNOWN is non-open).
      benchmarkCases: [
        {
          id: 'vacuous',
          kind: 'regression',
          description: 'manual check stays non-open',
          fixture: { 'app.lua': 'print("x")\n' },
          expected: [{ ruleId: 'LUA-001', status: 'UNKNOWN' }],
        },
      ],
      releaseGate: { minPrecision: 1, minRecall: 1, requireNoRegressions: true },
      queue,
    });
    const entry = result.candidates[0]!;
    expect(entry.outcome).toBe('REJECTED');
    expect(entry.blockedReason).toContain('only manual checks');
    expect(entry.closedGapIds).toEqual([]);
    expect(queue.openGaps()).toHaveLength(1);
  });

  it('rejects a capability that contributes no rules (no detection to benchmark)', () => {
    const result = scheduleCandidates({
      candidates: [candidate(emptyPack())],
      gaps: [gap()],
      benchmarkCases: luaBenchmarkCases(),
    });
    // The gate already rejects it (the expected LUA-001 finding becomes an FN);
    // either way it is never released.
    expect(result.candidates[0]!.outcome).toBe('REJECTED');
    expect(result.released).toBe(0);
  });

  it('a release that matches no gap closes nothing (exact targeting only)', () => {
    const queue = new GapQueue(tempStore());
    queue.recordGaps([gap()]);
    const unrelated = { ...luaCandidate(), id: 'totally/unrelated' };
    const result = scheduleCandidates({
      candidates: [candidate(unrelated)],
      gaps: [gap()],
      benchmarkCases: luaBenchmarkCases(),
      releaseGate: { minPrecision: 1, minRecall: 1, requireNoRegressions: false },
      queue,
    });
    expect(result.candidates[0]!.release.decision).toBe('ACCEPT');
    expect(result.candidates[0]!.gapIds).toEqual([]);
    expect(result.candidates[0]!.closedGapIds).toEqual([]);
    expect(queue.openGaps()).toHaveLength(1);
  });

  it('persists benchmark and release records through the persist callback', () => {
    const kinds: string[] = [];
    scheduleCandidates({
      candidates: [candidate(luaCandidate())],
      gaps: [gap()],
      benchmarkCases: luaBenchmarkCases(),
      persist: (kind) => kinds.push(kind),
    });
    expect(kinds).toEqual(['benchmark', 'release']);
  });
});
