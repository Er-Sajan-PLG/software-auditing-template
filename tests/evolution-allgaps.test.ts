import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from './helpers.js';
import { runEvolutionCycle } from '../src/evolution/run.js';
import { GapQueue } from '../src/evolution/queue.js';
import { Store } from '../src/store/index.js';
import { main } from '../src/cli.js';
import type { BenchmarkCase } from '../src/evolution/types.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tmpdir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-allgaps-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A project with two bootstrap-proposable languages: lua + php. */
function twoLangTarget(): string {
  const { root } = makeProject({
    'app.lua': 'print("hello from lua")\n',
    'index.php': '<?php echo "hello from php";\n',
  });
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

/**
 * Benchmark cases matching the bootstrap-proposed lua pack. Lua is not in the
 * curated catalog, so its proposal is the generic fallback whose LUA-001/002
 * checks are `manual`; a manual check is never "open" (it reports UNKNOWN). The
 * cases therefore assert the proposed lua capability introduces no false
 * positives, which is exactly what lets the gate release it.
 */
function proposedLuaCases(): BenchmarkCase[] {
  return [
    {
      id: 'lua-review-stable',
      kind: 'regression',
      description: 'The proposed lua manual checks stay non-open (no false positives).',
      fixture: { 'app.lua': 'print("hello")\n' },
      expected: [
        { ruleId: 'LUA-001', status: 'UNKNOWN' },
        { ruleId: 'LUA-002', status: 'UNKNOWN' },
      ],
    },
  ];
}

describe('runEvolutionCycle allGaps', () => {
  it('rejects every candidate when no benchmark cases are supplied', () => {
    const target = twoLangTarget();
    const out = runEvolutionCycle({ target, engineVersion: 'test', allGaps: true });

    expect(out.schedule).toBeDefined();
    const schedule = out.schedule!;
    expect(schedule.attempted).toBeGreaterThanOrEqual(2);
    expect(schedule.rejected).toBe(schedule.attempted);
    expect(schedule.candidates.every((c) => c.outcome === 'REJECTED')).toBe(true);

    expect(out.candidate).toBeDefined();
    expect(out.candidate!.release?.decision).toBe('REJECT');
    expect(out.after).toBeUndefined();
  });

  it('does not release a manual-only auto-proposal: the gap stays open', () => {
    const target = twoLangTarget();
    const store = new Store(tmpdir());
    const out = runEvolutionCycle({
      target,
      engineVersion: 'test',
      allGaps: true,
      store,
      benchmarkCases: proposedLuaCases(),
    });

    expect(out.schedule).toBeDefined();
    const schedule = out.schedule!;
    // Auto-proposed fallbacks are manual-only, so even when a benchmark exists
    // that they pass vacuously, the scheduler refuses to release them.
    const lua = schedule.candidates.find((c) => c.capabilityId === 'stacks/lua');
    expect(lua).toBeDefined();
    expect(lua!.outcome).toBe('REJECTED');
    expect(lua!.blockedReason).toContain('only manual checks');
    expect(lua!.closedGapIds).toEqual([]);

    const open = new GapQueue(store).openGaps().map((g) => g.id);
    expect(open).toContain('unsupported-technology:lua');
  });

  it('stays backward compatible without allGaps', () => {
    const target = twoLangTarget();
    const out = runEvolutionCycle({ target, engineVersion: 'test' });
    expect(out.schedule).toBeUndefined();
  });
});

describe('usa evolve --all-gaps', () => {
  it('returns 0', () => {
    const target = twoLangTarget();
    expect(main(['evolve', target, '--all-gaps'])).toBe(0);
  });
});
