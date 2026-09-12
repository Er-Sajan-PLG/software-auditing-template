import { describe, it, expect, afterEach } from 'vitest';
import { makeProject, auditAt, detectAt } from './helpers.js';
import { computeCoverage } from '../src/evolution/coverage.js';
import { deriveGaps } from '../src/evolution/gap.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function fixture(files: Record<string, string>): string {
  const { root, cleanup } = makeProject(files);
  cleanups.push(cleanup);
  return root;
}

describe('coverage model', () => {
  it('reports a covered language with 100% language coverage', () => {
    const root = fixture({ 'src/app.ts': 'export const x: number = 1;\n' });
    const { report } = auditAt(root);
    const { facts } = detectAt(root);
    const cov = computeCoverage(report, facts);
    expect(cov.detectedLanguages).toContain('typescript');
    expect(cov.coveredLanguages).toContain('typescript');
    expect(cov.unsupportedLanguages).not.toContain('typescript');
    expect(cov.languageCoverage).toBe(100);
  });

  it('flags an unsupported language as a blind spot', () => {
    const root = fixture({ 'main.lua': 'print("hi")\n' });
    const { report } = auditAt(root);
    const { facts } = detectAt(root);
    const cov = computeCoverage(report, facts);
    expect(cov.detectedLanguages).toEqual(['lua']);
    expect(cov.unsupportedLanguages).toEqual(['lua']);
    expect(cov.languageCoverage).toBe(0);
    expect(
      cov.blindSpots.some((b) => b.kind === 'unsupported-language' && b.id === 'lang:lua'),
    ).toBe(true);
  });

  it('does not count a merely-available capability as coverage', () => {
    // .usa.yaml `include` of an unrelated pack must not make an unsupported
    // language look covered — coverage comes from *executed* capabilities.
    const root = fixture({ 'main.lua': 'print("hi")\n' });
    const { report } = auditAt(root, { include: ['stacks/solidity'] });
    const { facts } = detectAt(root);
    const cov = computeCoverage(report, facts);
    expect(cov.unsupportedLanguages).toContain('lua');
  });
});

describe('capability gaps', () => {
  it('derives an unsupported-technology gap with evidence', () => {
    const root = fixture({ 'main.lua': 'print("hi")\n' });
    const { report } = auditAt(root);
    const { facts } = detectAt(root);
    const cov = computeCoverage(report, facts);
    const gaps = deriveGaps(cov, 'run-1', 'snap-1', '2026-01-01T00:00:00Z');
    const lua = gaps.find((g) => g.target === 'lua');
    expect(lua).toBeDefined();
    expect(lua!.kind).toBe('unsupported-technology');
    expect(lua!.requiredCapability).toBe('stacks/lua');
    expect(lua!.priority).toBe('high');
    expect(lua!.auditRunId).toBe('run-1');
    expect(lua!.snapshotId).toBe('snap-1');
    expect(lua!.evidence.join(' ')).toContain('lang:lua');
  });

  it('produces no gaps when nothing is unsupported', () => {
    const root = fixture({ 'src/app.ts': 'export const x = 1;\n' });
    const { report } = auditAt(root);
    const { facts } = detectAt(root);
    const cov = computeCoverage(report, facts);
    const gaps = deriveGaps(cov, 'run-1', 'snap-1');
    expect(gaps.filter((g) => g.kind === 'unsupported-technology')).toHaveLength(0);
  });
});
