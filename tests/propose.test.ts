import { describe, it, expect, afterEach } from 'vitest';
import { makeProject } from './helpers.js';
import {
  proposeCandidate,
  proposeCandidates,
  proposeFromSuggestions,
} from '../src/evolution/propose.js';
import { runEvolutionCycle } from '../src/evolution/run.js';
import type { CapabilityGap } from '../src/evolution/types.js';
import type { Suggestion } from '../src/learn/index.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function luaRepo(): string {
  const { root, cleanup } = makeProject({ 'app.lua': 'local r = os.execute("x")\n' });
  cleanups.push(cleanup);
  return root;
}

/** Run the BEFORE half of the loop and return the real Lua gap. */
function luaGap(): CapabilityGap {
  const result = runEvolutionCycle({ target: luaRepo(), engineVersion: 'test' });
  const gap = result.before.gaps.find((g) => g.target === 'lua');
  expect(gap).toBeDefined();
  return gap!;
}

describe('proposeCandidate', () => {
  it('turns a Lua technology gap into a PROPOSED candidate with a Lua pack', () => {
    const gap = luaGap();
    expect(gap.kind).toBe('unsupported-technology');
    expect(gap.requiredCapability).toBe('stacks/lua');

    const candidate = proposeCandidate(gap, { now: '2020-01-01T00:00:00.000Z' });
    expect(candidate).not.toBeNull();
    expect(candidate!.id).toBe('stacks/lua');
    expect(candidate!.status).toBe('PROPOSED');
    expect(candidate!.gapIds).toEqual([gap.id]);
    expect(candidate!.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(candidate!.capability.kind).toBe('data');
    expect(candidate!.capability.languages).toEqual(['lua']);
    expect(candidate!.capability.pack!.rules.length).toBeGreaterThan(0);
    // The proposal guards on the very fact the gap was derived from.
    expect(candidate!.capability.pack!.skipWhen).toEqual({
      all: [{ fact: 'lang:lua', op: 'absent' }],
    });
  });

  it('refuses a gap that is not a technology gap', () => {
    const gap = luaGap();
    const reasons: string[] = [];
    const candidate = proposeCandidate(
      { ...gap, kind: 'unverifiable-property' },
      { explain: (r) => reasons.push(r) },
    );
    expect(candidate).toBeNull();
    expect(reasons.join(' ')).toContain('not a technology gap');
  });

  it('refuses a language override that does not match the gap target', () => {
    const reasons: string[] = [];
    const candidate = proposeCandidate(luaGap(), {
      language: 'python',
      explain: (r) => reasons.push(r),
    });
    expect(candidate).toBeNull();
    expect(reasons.join(' ')).toContain('does not match');
  });

  it('is deterministic: the same gap proposes byte-identical candidates', () => {
    const gap = luaGap();
    const a = proposeCandidate(gap, { now: '2020-01-01T00:00:00.000Z' });
    const b = proposeCandidate(gap, { now: '2020-01-01T00:00:00.000Z' });
    expect(JSON.stringify(a?.capability)).toBe(JSON.stringify(b?.capability));
  });
});

describe('proposeCandidates', () => {
  it('proposes one candidate per open gap, skipping duplicates', () => {
    const gap = luaGap();
    const coverage = {
      detectedLanguages: ['lua'],
    } as never;
    const unproposable: string[] = [];
    const candidates = proposeCandidates(coverage, [gap, { ...gap, id: gap.id }], {
      now: '2020-01-01T00:00:00.000Z',
      onUnproposable: (g) => unproposable.push(g.id),
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.id).toBe('stacks/lua');
    expect(unproposable).toHaveLength(0);
  });

  it('ignores gaps that are not open', () => {
    const gap = { ...luaGap(), state: 'closed' as const };
    const candidates = proposeCandidates({ detectedLanguages: ['lua'] } as never, [gap]);
    expect(candidates).toHaveLength(0);
  });
});

describe('proposeFromSuggestions (usa learn → candidate)', () => {
  const suggestions: Suggestion[] = [
    {
      id: 'LEARN-001',
      title: 'Review auth sink',
      section: 'S2',
      sectionTitle: 'Security',
      severity: 'HIGH',
      ruleClass: 'security',
      check: { kind: 'manual' },
      why: 'No automated check exists yet.',
      remediation: 'Review file:line and record the verdict.',
      evidence: 'file:line + reasoning',
      triggeredBy: 'AUTH-001',
    },
    {
      id: 'LEARN-002',
      title: 'Unclassified class',
      section: 'S3',
      sectionTitle: 'Correctness',
      severity: 'LOW',
      ruleClass: 'not-a-real-class',
      check: { kind: 'manual' },
      why: 'Why.',
      remediation: 'Fix.',
      triggeredBy: 'X-1',
    },
  ];

  it('renders a manual-check candidate pack and maps class names safely', () => {
    const candidate = proposeFromSuggestions(suggestions, { now: '2020-01-01T00:00:00.000Z' });
    expect(candidate).not.toBeNull();
    expect(candidate!.status).toBe('PROPOSED');
    expect(candidate!.id).toBe('learn-proposals');
    const rules = candidate!.capability.pack!.rules;
    expect(rules).toHaveLength(2);
    expect(rules[0]!.check).toEqual({ kind: 'manual' });
    expect(rules[0]!.ruleClass).toBe('security');
    // Unknown class degrades to maintainability rather than producing invalid YAML.
    expect(rules[1]!.ruleClass).toBe('maintainability');
    expect(candidate!.gapIds).toEqual(['AUTH-001', 'X-1']);
  });

  it('returns null when there is nothing to propose', () => {
    const reasons: string[] = [];
    const candidate = proposeFromSuggestions([], { explain: (r) => reasons.push(r) });
    expect(candidate).toBeNull();
    expect(reasons.join(' ')).toContain('no learn suggestions');
  });
});

describe('auto-propose inside the evolution loop', () => {
  it('proposes from gaps when no candidate is supplied', () => {
    const result = runEvolutionCycle({
      target: luaRepo(),
      engineVersion: 'test',
      proposeFromGaps: true,
    });
    expect(result.proposed).toHaveLength(1);
    expect(result.proposed[0]!.id).toBe('stacks/lua');
    // The proposed candidate is then carried into the loop as the candidate.
    expect(result.candidate?.capabilityId).toBe('stacks/lua');
    // With no benchmark cases the release is vacuous → not accepted.
    expect(result.candidate?.release?.decision).toBe('REJECT');
  });

  it('proposes nothing when proposeFromGaps is not requested', () => {
    const result = runEvolutionCycle({ target: luaRepo(), engineVersion: 'test' });
    expect(result.proposed).toHaveLength(0);
    expect(result.candidate).toBeUndefined();
  });
});
