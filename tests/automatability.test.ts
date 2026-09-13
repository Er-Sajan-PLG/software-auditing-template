import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  automatabilityOf,
  ruleAutomatability,
  validateAutomatability,
  parseCatalogue,
  validateCatalogue,
} from '../src/engine/automatability.js';
import { loadCatalogues, catalogueOf, catalogueCoverage } from '../src/engine/catalogues.js';
import { loadRulePacks, parsePackText } from '../src/engine/loader.js';
import type { Check, Rule } from '../src/types.js';

const RULES = path.resolve(process.cwd(), 'rules');

function rule(overrides: Partial<Rule>): Rule {
  return {
    id: 'X-1',
    title: 'x',
    section: 'S1',
    sectionTitle: 's',
    severity: 'LOW',
    ruleClass: 'style',
    check: { kind: 'file_exists', files: ['x'] } as Check,
    ...overrides,
  };
}

describe('automatabilityOf', () => {
  it('derives full for deterministic check kinds', () => {
    for (const kind of ['file_exists', 'grep_wrong', 'json_path', 'count'] as const) {
      expect(automatabilityOf({ kind } as Check)).toBe('full');
    }
  });

  it('derives assist for opt-in and evidence checks', () => {
    expect(automatabilityOf({ kind: 'command' } as Check)).toBe('assist');
    expect(automatabilityOf({ kind: 'oracle' } as Check)).toBe('assist');
  });

  it('derives manual for judgement-only kinds', () => {
    expect(automatabilityOf({ kind: 'manual' } as Check)).toBe('manual');
    expect(automatabilityOf({ kind: 'info' } as Check)).toBe('manual');
  });

  it('falls back to full for an unknown kind (deterministic default)', () => {
    expect(automatabilityOf({ kind: 'anything-else' } as Check)).toBe('full');
  });
});

describe('ruleAutomatability', () => {
  it('uses the explicit override when present', () => {
    expect(ruleAutomatability(rule({ automatability: 'manual' }))).toBe('manual');
  });

  it('derives when there is no override', () => {
    expect(ruleAutomatability(rule({ check: { kind: 'command' } as Check }))).toBe('assist');
  });
});

describe('validateAutomatability', () => {
  it('accepts a downgrade from the derived value', () => {
    expect(validateAutomatability('assist', { kind: 'grep_wrong' } as Check)).toBeNull();
    expect(validateAutomatability('manual', { kind: 'grep_wrong' } as Check)).toBeNull();
  });

  it('refuses full on a kind that cannot deliver it (fail closed)', () => {
    expect(validateAutomatability('full', { kind: 'command' } as Check)).toMatch(/command/);
    expect(validateAutomatability('full', { kind: 'oracle' } as Check)).toMatch(/oracle/);
    expect(validateAutomatability('full', { kind: 'manual' } as Check)).toMatch(/manual/);
  });

  it('accepts full when it matches the derived value', () => {
    expect(validateAutomatability('full', { kind: 'grep_wrong' } as Check)).toBeNull();
  });
});

describe('parseCatalogue / validateCatalogue', () => {
  it('parses name@version', () => {
    expect(parseCatalogue('asvs@5.0.0')).toEqual({ name: 'asvs', version: '5.0.0' });
  });

  it('handles versions containing slashes and colons', () => {
    expect(parseCatalogue('gdpr@2016/679')).toEqual({ name: 'gdpr', version: '2016/679' });
  });

  it('rejects an unpinned catalogue', () => {
    expect(parseCatalogue('asvs')).toBeNull();
    expect(validateCatalogue('asvs')).toMatch(/pinned/);
  });

  it('rejects a non-numeric version', () => {
    expect(validateCatalogue('asvs@latest')).toMatch(/not a version/);
  });

  it('accepts a pinned numeric version', () => {
    expect(validateCatalogue('asvs@5.0.0')).toBeNull();
  });
});

describe('catalogue derivation (loader)', () => {
  it('derives a rule catalogue from its references', () => {
    const { catalogues } = loadCatalogues(RULES);
    const r = rule({ references: ['CWE-79', 'ASVS-5.3.4'] });
    expect(catalogueOf(r, catalogues)).toBe('cwe@4.19');
  });

  it('prefers an explicit catalogue over references', () => {
    const { catalogues } = loadCatalogues(RULES);
    const r = rule({ references: ['CWE-79'], catalogue: 'asvs@5.0.0' });
    expect(catalogueOf(r, catalogues)).toBe('asvs@5.0.0');
  });

  it('returns null when nothing matches', () => {
    const { catalogues } = loadCatalogues(RULES);
    expect(catalogueOf(rule({ references: ['No-Such-Standard'] }), catalogues)).toBeNull();
  });

  it('applies a valid pack-level catalogue to its rules', () => {
    const pack = parsePackText(
      [
        'id: demo',
        'title: Demo',
        'section: S1',
        'catalogue: asvs@5.0.0',
        'rules:',
        '  - id: D-1',
        '    title: t',
        '    severity: LOW',
        '    class: style',
        '    check: { kind: file_exists, files: [x] }',
      ].join('\n'),
      'demo.yaml',
    );
    expect(pack?.catalogue).toBe('asvs@5.0.0');
    expect(pack?.rules[0]?.catalogue).toBe('asvs@5.0.0');
  });

  it('lets a rule override the pack catalogue', () => {
    const pack = parsePackText(
      [
        'id: demo',
        'title: Demo',
        'section: S1',
        'catalogue: asvs@5.0.0',
        'rules:',
        '  - id: D-1',
        '    title: t',
        '    severity: LOW',
        '    class: style',
        '    catalogue: cwe@4.19',
        '    check: { kind: file_exists, files: [x] }',
      ].join('\n'),
      'demo.yaml',
    );
    expect(pack?.rules[0]?.catalogue).toBe('cwe@4.19');
  });

  it('drops an invalid catalogue with a warning (fail closed)', () => {
    const warnings: string[] = [];
    const pack = parsePackText(
      [
        'id: demo',
        'title: Demo',
        'section: S1',
        'rules:',
        '  - id: D-1',
        '    title: t',
        '    severity: LOW',
        '    class: style',
        '    catalogue: notpinned',
        '    check: { kind: file_exists, files: [x] }',
      ].join('\n'),
      'demo.yaml',
      new Map(),
      warnings,
    );
    expect(pack?.rules[0]?.catalogue).toBeUndefined();
    expect(warnings.some((w) => /pinned/.test(w))).toBe(true);
  });
});

describe('automatability validation (loader)', () => {
  function packWith(automatability: string, kind = 'command') {
    return parsePackText(
      [
        'id: demo',
        'title: Demo',
        'section: S1',
        'rules:',
        '  - id: D-1',
        '    title: t',
        '    severity: LOW',
        '    class: style',
        `    automatability: ${automatability}`,
        `    check: { kind: ${kind}, command: echo }`,
      ].join('\n'),
      'demo.yaml',
    );
  }

  it('keeps a valid override', () => {
    expect(packWith('manual')?.rules[0]?.automatability).toBe('manual');
  });

  it('refuses to upgrade a command check to full, falling back to derived', () => {
    const warnings: string[] = [];
    const pack = parsePackText(
      [
        'id: demo',
        'title: Demo',
        'section: S1',
        'rules:',
        '  - id: D-1',
        '    title: t',
        '    severity: LOW',
        '    class: style',
        '    automatability: full',
        '    check: { kind: command, command: echo }',
      ].join('\n'),
      'demo.yaml',
      new Map(),
      warnings,
    );
    expect(pack?.rules[0]?.automatability).toBeUndefined();
    expect(ruleAutomatability(pack!.rules[0]!)).toBe('assist');
    expect(warnings.some((w) => /full/.test(w))).toBe(true);
  });
});

describe('catalogueCoverage (shipped rules)', () => {
  it('accounts for every rule exactly once', () => {
    const { packs } = loadRulePacks(RULES);
    const { catalogues } = loadCatalogues(RULES);
    const rows = catalogueCoverage(packs, catalogues);
    const total = packs.reduce((n, p) => n + p.rules.length, 0);
    expect(rows.reduce((n, r) => n + r.rules, 0)).toBe(total);
    for (const row of rows) {
      expect(row.automatable.full + row.automatable.assist + row.automatable.manual).toBe(
        row.rules,
      );
    }
  });

  it('sorts the uncatalogued bucket last', () => {
    const { packs } = loadRulePacks(RULES);
    const { catalogues } = loadCatalogues(RULES);
    const rows = catalogueCoverage(packs, catalogues);
    expect(rows.at(-1)?.catalogue).toBe('(uncatalogued)');
  });

  it('pins each catalogue to an id@version', () => {
    const { packs } = loadRulePacks(RULES);
    const { catalogues } = loadCatalogues(RULES);
    for (const row of catalogueCoverage(packs, catalogues)) {
      if (row.catalogue === '(uncatalogued)') continue;
      expect(validateCatalogue(row.catalogue)).toBeNull();
    }
  });
});
