import { describe, it, expect } from 'vitest';
import { computeFacts, regenerate, BLOCKS } from '../scripts/lib/docs-sync.mjs';

/**
 * The docs governance engine (ADR-0020). These tests pin the pure parts:
 * fact derivation and the marker rewriter. The end-to-end gate
 * (`scripts/check-docs.mjs`) runs in CI and via `npm run docs:check`.
 */
describe('docs facts', () => {
  const facts = computeFacts();

  it('derives counts that agree with the shipped registry', () => {
    // Sanity floor: these move as packs change, but never to zero.
    expect(facts.rules).toBeGreaterThan(200);
    expect(facts.packs).toBe(facts.core + facts.stacks);
    expect(facts.sections).toBe(16);
    expect(facts.detectors).toBeGreaterThan(200);
    expect(facts.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(facts.rulesFloor).toBeLessThanOrEqual(facts.rules);
    expect(facts.rulesFloor % 10).toBe(0);
  });
});

describe('marker rewriting', () => {
  const facts = {
    rules: 42,
    rulesFloor: 40,
    packs: 3,
    core: 1,
    stacks: 2,
    detectors: 9,
    detectorsApprox: '~5',
    sections: 16,
    checkKinds: 16,
    adrs: 1,
    version: '1.2.3',
    versionMajor: '1',
  };

  it('replaces an inline fact with the current value', () => {
    const out = regenerate('We ship <!-- usa:fact rules -->999<!-- /usa:fact --> rules.', facts);
    expect(out).toBe('We ship <!-- usa:fact rules -->42<!-- /usa:fact --> rules.');
  });

  it('renders the rules-floor and detectors-approx qualifiers', () => {
    const out = regenerate(
      '<!-- usa:fact rules-floor -->X<!-- /usa:fact --> / <!-- usa:fact detectors-approx -->Y<!-- /usa:fact -->',
      facts,
    );
    expect(out).toContain('40+');
    expect(out).toContain('~5');
  });

  it('replaces a whole generated block', () => {
    const text = 'before\n<!-- usa:begin rules-tree -->\nstale\n<!-- usa:end rules-tree -->\nafter';
    const out = regenerate(text, facts);
    expect(out).not.toContain('stale');
    expect(out).toContain('~5 detection signals'); // rules tree uses detectors-approx
    expect(out.startsWith('before\n')).toBe(true);
    expect(out.endsWith('\nafter')).toBe(true);
  });

  it('is idempotent', () => {
    const once = regenerate('Rules: <!-- usa:fact rules -->1<!-- /usa:fact -->', facts);
    expect(regenerate(once, facts)).toBe(once);
  });

  it('leaves unknown fact keys untouched (the checker reports them)', () => {
    const text = '<!-- usa:fact nope -->keep<!-- /usa:fact -->';
    expect(regenerate(text, facts)).toBe(text);
  });

  it('exposes a rules-tree block generator', () => {
    expect(typeof BLOCKS['rules-tree']).toBe('function');
    expect(BLOCKS['rules-tree'](facts)).toContain('~5 detection signals');
  });
});
