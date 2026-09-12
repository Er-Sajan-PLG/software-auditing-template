import { describe, it, expect } from 'vitest';
import {
  basePackIds,
  capabilityFromPack,
  resolveCapabilitySetId,
} from '../src/evolution/capability.js';
import { RULES_DIR } from './helpers.js';
import { luaCandidatePack } from './evolution-helpers.js';

describe('capability-set resolution', () => {
  it('is deterministic for identical inputs', () => {
    const a = resolveCapabilitySetId(['core/repo', 'stacks/go'], [], '1.1.0');
    const b = resolveCapabilitySetId(['stacks/go', 'core/repo'], [], '1.1.0');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the base pack set changes', () => {
    const a = resolveCapabilitySetId(['core/repo'], [], '1.1.0');
    const b = resolveCapabilitySetId(['core/repo', 'stacks/go'], [], '1.1.0');
    expect(a).not.toBe(b);
  });

  it('changes when a capability is added, and when its version changes', () => {
    const base = ['core/repo'];
    const cap = capabilityFromPack(luaCandidatePack(), { version: '1.0.0', createdBy: 't' });
    const none = resolveCapabilitySetId(base, [], '1.1.0');
    const withCap = resolveCapabilitySetId(base, [cap], '1.1.0');
    const cap2 = capabilityFromPack(luaCandidatePack(), { version: '2.0.0', createdBy: 't' });
    expect(withCap).not.toBe(none);
    expect(resolveCapabilitySetId(base, [cap2], '1.1.0')).not.toBe(withCap);
  });

  it('changes when the engine version changes', () => {
    expect(resolveCapabilitySetId(['a'], [], '1.0.0')).not.toBe(
      resolveCapabilitySetId(['a'], [], '1.1.0'),
    );
  });

  it('is stable while the on-disk registry does not change', () => {
    const ids = basePackIds(RULES_DIR);
    expect(ids.length).toBeGreaterThan(10);
    expect(resolveCapabilitySetId(ids, [], 'test')).toBe(
      resolveCapabilitySetId(basePackIds(RULES_DIR), [], 'test'),
    );
  });
});

describe('capabilityFromPack', () => {
  it('wraps a rule pack with explicit identity and provenance', () => {
    const cap = capabilityFromPack(luaCandidatePack(), { version: '1.2.3', createdBy: 'me' });
    expect(cap.id).toBe('stacks/lua');
    expect(cap.version).toBe('1.2.3');
    expect(cap.kind).toBe('data');
    expect(cap.pack?.rules).toHaveLength(1);
    expect(cap.provenance.createdBy).toBe('me');
  });
});
