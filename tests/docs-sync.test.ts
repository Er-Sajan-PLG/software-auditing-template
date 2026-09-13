import { describe, it, expect } from 'vitest';
import {
  computeFacts,
  regenerate,
  BLOCKS,
  findUnmarkedClaims,
  stripMarkedRegions,
  markdownTable,
} from '../scripts/lib/docs-sync.mjs';

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

  it('registers a standards-coverage block generator', () => {
    // Derived from the real loaded rules via `usa standards` (ADR-0021); the
    // generator needs dist/, so its output is asserted by the end-to-end gate
    // (`npm run docs:check`) rather than here. This pins registration only.
    expect(typeof BLOCKS['standards-coverage']).toBe('function');
  });
});

describe('markdownTable', () => {
  it('pads every cell to its column width (Prettier-stable form)', () => {
    const out = markdownTable(
      ['A', 'BB'],
      [
        ['x', 'y'],
        ['longer', 'z'],
      ],
    );
    expect(out).toBe(
      ['| A      | BB |', '| ------ | -- |', '| x      | y  |', '| longer | z  |'].join('\n'),
    );
  });

  it('handles a single row and numeric cells', () => {
    const out = markdownTable(['Catalogue', 'Rules'], [['asvs@5.0.0', 15]]);
    expect(out.split('\n')[1]).toBe('| ---------- | ----- |');
  });
});

describe('unmarked claim scanner', () => {
  const facts = {
    rules: 281,
    rulesFloor: 280,
    packs: 28,
    core: 11,
    stacks: 17,
    detectors: 236,
    detectorsApprox: '~230',
    sections: 16,
    checkKinds: 16,
    adrs: 20,
    version: '1.0.0',
    versionMajor: '1',
  };

  it('flags a bare count that is not the current value', () => {
    const found = findUnmarkedClaims('We ship 999 rules today.', facts);
    expect(found).toHaveLength(1);
    expect(found[0].text).toBe('999 rules');
    expect(found[0].key).toBe('rules');
  });

  it('does not flag a bare count that matches the current value', () => {
    expect(findUnmarkedClaims('We ship 281 rules today.', facts)).toEqual([]);
  });

  it('does not flag a marked fact', () => {
    const text = 'We ship <!-- usa:fact rules -->281<!-- /usa:fact --> rules today.';
    expect(findUnmarkedClaims(text, facts)).toEqual([]);
  });

  it('honours the explicit usa:allow-claim opt-out', () => {
    expect(findUnmarkedClaims('The spec has 3 sections. <!-- usa:allow-claim -->', facts)).toEqual(
      [],
    );
  });

  it('matches section, detector, and ADR nouns', () => {
    for (const [text, key] of [
      ['999 sections', 'sections'],
      ['999 detectors', 'detectors'],
      ['999 ADRs', 'adrs'],
    ] as const) {
      const found = findUnmarkedClaims(text, facts);
      expect(found[0]?.key, text).toBe(key);
    }
  });

  it('stripMarkedRegions removes inline facts and blocks but keeps prose', () => {
    const text =
      'keep <!-- usa:fact rules -->999<!-- /usa:fact --> keep\n\n<!-- usa:begin rules-tree -->\n900 rules\n<!-- usa:end rules-tree -->\nend';
    const stripped = stripMarkedRegions(text);
    expect(stripped).not.toContain('999');
    expect(stripped).not.toContain('900 rules');
    expect(stripped).toContain('keep');
    expect(stripped).toContain('end');
  });
});
