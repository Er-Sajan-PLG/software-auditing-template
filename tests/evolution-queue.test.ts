import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from './helpers.js';
import { Store } from '../src/store/index.js';
import { GapQueue } from '../src/evolution/queue.js';
import { runEvolutionCycle } from '../src/evolution/run.js';
import { luaBenchmarkCases, luaCandidate } from './evolution-helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tmpStore(): { store: Store; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-evoq-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { store: new Store(dir), dir };
}

function luaRepo(): string {
  const { root, cleanup } = makeProject({ 'app.lua': 'local r = os.execute("rm " .. p)\n' });
  cleanups.push(cleanup);
  return root;
}

describe('evolution loop persists gaps into the queue', () => {
  it('records the Lua gap when a store backs the run', () => {
    const { store } = tmpStore();
    const result = runEvolutionCycle({ target: luaRepo(), engineVersion: 'test', store });

    expect(result.queue).toBeDefined();
    const queue = new GapQueue(store);
    const open = queue.openGaps();
    expect(open.map((g) => g.id)).toContain('unsupported-technology:lua');
  });

  it('is idempotent in effect: re-running does not duplicate logical state', () => {
    const { store } = tmpStore();
    const target = luaRepo();
    const first = runEvolutionCycle({ target, engineVersion: 'test', store });
    const second = runEvolutionCycle({ target, engineVersion: 'test', store });

    // The same logical gaps are observed (same ids), and the queue summary is
    // stable. Each run may append one evidence-refreshing record per gap — an
    // append-only audit trail, not a state change.
    expect(second.before.gaps.map((g) => g.id).sort()).toEqual(
      first.before.gaps.map((g) => g.id).sort(),
    );
    expect(second.queue).toEqual(first.queue);

    const open = new GapQueue(store)
      .openGaps()
      .map((g) => g.id)
      .sort();
    const expectedIds = first.before.gaps
      .filter((g) => g.priority !== undefined)
      .map((g) => g.id)
      .sort();
    expect(open).toEqual(expectedIds);
  });

  it('closes the targeted gap once the candidate is released', () => {
    const { store } = tmpStore();
    const result = runEvolutionCycle({
      target: luaRepo(),
      engineVersion: 'test',
      store,
      candidateCapability: luaCandidate(),
      benchmarkCases: luaBenchmarkCases(),
      releaseGate: { minPrecision: 1, minRecall: 1, requireNoRegressions: true },
    });
    expect(result.candidate?.release?.decision).toBe('ACCEPT');
    expect(result.after).toBeDefined();

    const queue = new GapQueue(store);
    const open = queue.openGaps().map((g) => g.id);
    expect(open).not.toContain('unsupported-technology:lua');
    const summary = queue.summarize();
    expect(summary.closed).toBeGreaterThanOrEqual(1);
  });

  it('does not record gaps when persistGaps is disabled', () => {
    const { store } = tmpStore();
    const result = runEvolutionCycle({
      target: luaRepo(),
      engineVersion: 'test',
      store,
      persistGaps: false,
    });
    expect(result.queue).toBeUndefined();
  });

  it('a release that targets no known gap closes nothing', () => {
    const { store } = tmpStore();
    const candidate = luaCandidate();
    // Rename the capability so it matches no gap's requiredCapability.
    const unrelated = { ...candidate, id: 'totally/unrelated' };
    runEvolutionCycle({
      target: luaRepo(),
      engineVersion: 'test',
      store,
      candidateCapability: unrelated,
      benchmarkCases: luaBenchmarkCases(),
      releaseGate: { minPrecision: 1, minRecall: 1, requireNoRegressions: false },
    });

    const open = new GapQueue(store).openGaps().map((g) => g.id);
    // The candidate targeted nothing, so every gap stays open.
    expect(open).toContain('unsupported-technology:lua');
    expect(open.length).toBeGreaterThan(0);
  });
});
