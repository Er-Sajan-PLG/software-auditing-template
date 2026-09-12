import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from './helpers.js';
import { Store } from '../src/store/index.js';
import { snapshotOfDir } from '../src/snapshot/index.js';
import { runEvolutionCycle } from '../src/evolution/run.js';
import { brokenCandidate, luaBenchmarkCases, luaCandidate } from './evolution-helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function store(): Store {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-evo-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new Store(dir);
}

function luaRepo(): string {
  const { root, cleanup } = makeProject({
    'app.lua': 'local r = os.execute("rm -rf " .. user_path)\n',
  });
  cleanups.push(cleanup);
  return root;
}

describe('end-to-end evolution loop', () => {
  it('audit → gap → candidate → benchmark → release → re-audit → improvement', () => {
    const target = luaRepo();
    const st = store();

    const result = runEvolutionCycle({
      target,
      engineVersion: '1.1.0-test',
      repository: 'https://example.com/lua-demo.git',
      candidateCapability: luaCandidate(),
      benchmarkCases: luaBenchmarkCases(),
      releaseGate: { minPrecision: 1, minRecall: 1, requireNoRegressions: true },
      store: st,
    });

    // BEFORE: the language is detected but unsupported.
    expect(result.before.coverage.detectedLanguages).toEqual(['lua']);
    expect(result.before.coverage.unsupportedLanguages).toEqual(['lua']);
    expect(result.before.coverage.languageCoverage).toBe(0);
    expect(result.before.gaps.some((g) => g.target === 'lua')).toBe(true);

    // RELEASE: the candidate passes and is accepted.
    expect(result.candidate?.release?.decision).toBe('ACCEPT');

    // AFTER: the same snapshot is re-audited with the released capability.
    expect(result.after).toBeDefined();
    expect(result.after!.coverage.unsupportedLanguages).toEqual([]);
    expect(result.after!.coverage.languageCoverage).toBe(100);

    const delta = result.after!.delta;
    expect(delta.coverageDelta).toBeGreaterThan(0);
    expect(delta.findingsAdded).toContain('LUA-001');
    expect(delta.gapReduced).toBe(true);
    expect(delta.intendedFindingDetectable).toBe(true);

    // The intended finding is now actually present and open.
    const luaFinding = result.after!.report.findings.find((f) => f.ruleId === 'LUA-001');
    expect(luaFinding).toBeDefined();
    expect(luaFinding!.status).toBe('WRONG');
  });

  it('rejects a broken candidate and does not re-audit', () => {
    const result = runEvolutionCycle({
      target: luaRepo(),
      engineVersion: 'test',
      candidateCapability: brokenCandidate(),
      benchmarkCases: luaBenchmarkCases(),
    });
    expect(result.candidate?.release?.decision).toBe('REJECT');
    expect(result.after).toBeUndefined();
  });

  it('produced records are reproducible from the content-addressed store', () => {
    const target = luaRepo();
    const st = store();
    const result = runEvolutionCycle({
      target,
      engineVersion: 'test',
      candidateCapability: luaCandidate(),
      benchmarkCases: luaBenchmarkCases(),
      store: st,
    });

    const runId = result.before.auditRunId;
    const record = st.get<{ snapshotId: string; resultId?: string }>(runId);
    expect(record).toBeDefined();
    expect(record!.snapshotId).toBe(result.snapshot.id);

    // The result identity resolves to the full stored report.
    const report = st.get<{ schema: string; findings: unknown[] }>(record!.resultId!);
    expect(report).toBeDefined();
    expect(report!.schema).toBe('usa-report-v1');
  });

  it('a later repository change produces a new snapshot and leaves the old audit intact', () => {
    const target = luaRepo();
    const st = store();
    const result = runEvolutionCycle({ target, engineVersion: 'test', store: st });

    const originalId = result.snapshot.id;
    fs.writeFileSync(path.join(target, 'app.lua'), 'print("changed")\n');

    const newId = snapshotOfDir(target).id;
    expect(newId).not.toBe(originalId);

    // The stored run still references the original snapshot — immutable.
    const record = st.get<{ snapshotId: string }>(result.before.auditRunId);
    expect(record!.snapshotId).toBe(originalId);
  });
});
