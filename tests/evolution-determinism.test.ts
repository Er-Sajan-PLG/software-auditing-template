import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from './helpers.js';
import { Store } from '../src/store/index.js';
import {
  basePackIds,
  capabilityFromPack,
  resolveCapabilitySetId,
} from '../src/evolution/capability.js';
import { runEvolutionCycle } from '../src/evolution/run.js';
import type { AuditRun } from '../src/evolution/types.js';
import { brokenCandidate, luaCandidate, luaBenchmarkCases } from './evolution-helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const APP_LUA = 'local r = os.execute("rm -rf " .. user_path)\n';

function luaRepo(): string {
  const { root, cleanup } = makeProject({ 'app.lua': APP_LUA });
  cleanups.push(cleanup);
  return root;
}

function tempStore(): Store {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-det-store-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new Store(dir);
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  for (const rel of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (rel.isFile()) out.push(path.join(rel.parentPath, rel.name));
  }
  return out.sort();
}

function cycle(target: string) {
  return runEvolutionCycle({
    target,
    engineVersion: 'det-test',
    candidateCapability: luaCandidate(),
    benchmarkCases: luaBenchmarkCases(),
  });
}

describe('snapshot + capabilitySetId determinism', () => {
  it('two identical trees yield the same snapshot id and capabilitySetId', () => {
    const a = cycle(luaRepo());
    const b = cycle(luaRepo());
    expect(a.snapshot.id).toBe(b.snapshot.id);
    expect(a.before.capabilitySetId).toBe(b.before.capabilitySetId);
  }, 15000);

  it('a real content change changes the snapshot id', () => {
    const target = luaRepo();
    const before = runEvolutionCycle({ target, engineVersion: 'det-test' });
    fs.writeFileSync(path.join(target, 'app.lua'), 'print("changed")\n');
    const after = runEvolutionCycle({ target, engineVersion: 'det-test' });
    expect(after.snapshot.id).not.toBe(before.snapshot.id);
  });
});

describe('capabilitySetId sensitivity', () => {
  it('differs with and without the candidate, and is stable across calls', () => {
    const base = basePackIds(path.resolve(process.cwd(), 'rules'));
    const candidate = luaCandidate();
    const without = resolveCapabilitySetId(base, [], 'det-test');
    const withCap = resolveCapabilitySetId(base, [candidate], 'det-test');
    expect(withCap).not.toBe(without);
    expect(resolveCapabilitySetId(base, [candidate], 'det-test')).toBe(withCap);
  });

  it('ignores the order of base pack ids', () => {
    const base = basePackIds(path.resolve(process.cwd(), 'rules'));
    const reversed = [...base].reverse();
    const candidate = luaCandidate();
    expect(resolveCapabilitySetId(base, [candidate], 'det-test')).toBe(
      resolveCapabilitySetId(reversed, [candidate], 'det-test'),
    );
  });
});

describe('store reproducibility', () => {
  it('round-trips the run record and re-putting it returns the same id', () => {
    const store = tempStore();
    const result = runEvolutionCycle({
      target: luaRepo(),
      engineVersion: 'det-test',
      candidateCapability: luaCandidate(),
      benchmarkCases: luaBenchmarkCases(),
      store,
    });

    const runId = result.before.auditRunId;
    const run = store.get<AuditRun>(runId);
    expect(run).not.toBeNull();
    expect(run!.snapshotId).toBe(result.snapshot.id);
    expect(run!.capabilitySetId).toBe(result.before.capabilitySetId);
    expect(store.put(run)).toBe(store.put(run));
  });
});

describe('full-loop determinism', () => {
  it('two identical runs deep-equal on decision, precision, recall, and delta', () => {
    const a = cycle(luaRepo());
    const b = cycle(luaRepo());
    const ra = a.candidate?.release;
    const rb = b.candidate?.release;

    expect(ra?.decision).toBe(rb?.decision);
    expect(ra?.precision).toBe(rb?.precision);
    expect(ra?.recall).toBe(rb?.recall);

    expect(a.after).toBeDefined();
    expect(b.after).toBeDefined();
    expect(a.after!.delta).toEqual(b.after!.delta);
  }, 15000);
});

describe('rejected candidate', () => {
  it('never re-audits and records both run and rejection in the store', () => {
    const store = tempStore();
    const result = runEvolutionCycle({
      target: luaRepo(),
      engineVersion: 'det-test',
      candidateCapability: brokenCandidate(),
      benchmarkCases: luaBenchmarkCases(),
      store,
    });

    expect(result.after).toBeUndefined();
    expect(result.candidate?.release?.decision).toBe('REJECT');
    expect(store.has(result.before.auditRunId)).toBe(true);
    expect(store.get<AuditRun>(result.before.auditRunId)!.snapshotId).toBe(result.snapshot.id);
  });
});

describe('no-candidate BEFORE half', () => {
  it('does not write into the target directory', () => {
    const target = luaRepo();
    const before = listFiles(target);

    const result = runEvolutionCycle({ target, engineVersion: 'det-test' });

    expect(result.candidate).toBeUndefined();
    expect(listFiles(target)).toEqual(before);
  });
});

describe('capabilityFromPack identity', () => {
  it('produces the same capability set id for equal packs', () => {
    const base = basePackIds(path.resolve(process.cwd(), 'rules'));
    const a = capabilityFromPack(luaCandidate().pack!, { version: '0.1.0', createdBy: 'test' });
    const b = capabilityFromPack(luaCandidate().pack!, { version: '0.1.0', createdBy: 'test' });
    expect(resolveCapabilitySetId(base, [a], 'det-test')).toBe(
      resolveCapabilitySetId(base, [b], 'det-test'),
    );
  });
});
