import { describe, it, expect } from 'vitest';
import { score } from '../src/engine/score.js';
import { loadProfiles, dampen } from '../src/engine/maturity.js';
import { DEFAULT_SECTIONS } from '../src/engine/sections.js';
import type { Finding, Rule, Status, Severity, RuleClass } from '../src/types.js';

const rule = (id: string, severity: Severity = 'MEDIUM', weight?: number): Rule => ({
  id,
  title: id,
  section: 'S2',
  sectionTitle: 'Security',
  severity,
  weight,
  ruleClass: 'security',
  check: { kind: 'manual' },
});

const finding = (ruleId: string, status: Status, severity: Severity = 'MEDIUM'): Finding => ({
  ruleId,
  title: ruleId,
  section: 'S2',
  sectionTitle: 'Security',
  severity,
  baseSeverity: severity,
  status,
  ruleClass: 'security',
  dampened: false,
  message: '',
  locations: [],
});

describe('scoring', () => {
  const profile = loadProfiles('rules').production;

  it('awards full credit for passes', () => {
    const r = score(
      [{ rule: rule('A'), finding: finding('A', 'PASS') }],
      DEFAULT_SECTIONS,
      profile,
    );
    expect(r.overall).toBe(100);
  });

  it('awards no credit for missing', () => {
    const r = score(
      [{ rule: rule('A'), finding: finding('A', 'MISSING') }],
      DEFAULT_SECTIONS,
      profile,
    );
    expect(r.overall).toBe(0);
  });

  it('weights CRITICAL heavier than LOW', () => {
    const criticalOnly = score(
      [{ rule: rule('C', 'CRITICAL'), finding: finding('C', 'MISSING', 'CRITICAL') }],
      DEFAULT_SECTIONS,
      profile,
    );
    const lowOnly = score(
      [{ rule: rule('L', 'LOW'), finding: finding('L', 'MISSING', 'LOW') }],
      DEFAULT_SECTIONS,
      profile,
    );
    // Both score 0, but the CRITICAL one must move the needle more in a mix.
    const mixed = score(
      [
        { rule: rule('C', 'CRITICAL'), finding: finding('C', 'MISSING', 'CRITICAL') },
        { rule: rule('L', 'LOW'), finding: finding('L', 'PASS', 'LOW') },
      ],
      DEFAULT_SECTIONS,
      profile,
    );
    const mixed2 = score(
      [
        { rule: rule('C', 'CRITICAL'), finding: finding('C', 'PASS', 'CRITICAL') },
        { rule: rule('L', 'LOW'), finding: finding('L', 'MISSING', 'LOW') },
      ],
      DEFAULT_SECTIONS,
      profile,
    );
    expect(criticalOnly.overall).toBe(0);
    expect(lowOnly.overall).toBe(0);
    expect(mixed.overall).toBeLessThan(mixed2.overall);
  });

  it('excludes UNKNOWN from the score but from confidence too', () => {
    const r = score(
      [
        { rule: rule('A'), finding: finding('A', 'PASS') },
        { rule: rule('B'), finding: finding('B', 'UNKNOWN') },
      ],
      DEFAULT_SECTIONS,
      profile,
    );
    expect(r.overall).toBe(100);
    expect(r.sections[0]!.confidence).toBe(50);
    expect(r.automationCoverage).toBe(50);
  });

  it('marks a section with nothing verifiable as null (not 10)', () => {
    const r = score(
      [{ rule: rule('A', 'MEDIUM'), finding: finding('A', 'UNKNOWN') }],
      DEFAULT_SECTIONS,
      profile,
    );
    expect(r.sections[0]!.score).toBeNull();
    expect(r.overall).toBe(0);
  });

  it('gives partial credit for WRONG above MISSING', () => {
    const wrong = score(
      [{ rule: rule('A'), finding: finding('A', 'WRONG') }],
      DEFAULT_SECTIONS,
      profile,
    );
    const missing = score(
      [{ rule: rule('A'), finding: finding('A', 'MISSING') }],
      DEFAULT_SECTIONS,
      profile,
    );
    expect(wrong.overall).toBeGreaterThan(missing.overall);
    expect(wrong.overall).toBe(15);
  });

  it('counts open findings by effective severity', () => {
    const r = score(
      [
        { rule: rule('A', 'HIGH'), finding: finding('A', 'MISSING', 'HIGH') },
        { rule: rule('B', 'HIGH'), finding: finding('B', 'MISSING', 'HIGH') },
        { rule: rule('C', 'LOW'), finding: finding('C', 'MISSING', 'LOW') },
      ],
      DEFAULT_SECTIONS,
      profile,
    );
    expect(r.severityCounts.HIGH).toBe(2);
    expect(r.severityCounts.LOW).toBe(1);
    expect(r.counts.PASS).toBe(0);
  });
});

describe('maturity dampening', () => {
  const profiles = loadProfiles('rules');

  it('never dampens CRITICAL', () => {
    for (const key of ['prototype', 'mvp', 'beta', 'production', 'legacy'] as const) {
      const out = dampen('CRITICAL', 'security', profiles[key]);
      expect(out.severity).toBe('CRITICAL');
      expect(out.dampened).toBe(false);
    }
  });

  it('dampens documentation hardest on a prototype', () => {
    const out = dampen('HIGH', 'documentation', profiles.prototype);
    expect(out.severity).toBe('LOW');
    expect(out.dampened).toBe(true);
  });

  it('does not dampen security on an MVP', () => {
    const out = dampen('HIGH', 'security', profiles.mvp);
    expect(out.severity).toBe('HIGH');
    expect(out.dampened).toBe(false);
  });

  it('does not dampen anything at production', () => {
    const classes: RuleClass[] = [
      'security',
      'supply-chain',
      'correctness',
      'maintainability',
      'operations',
      'performance',
      'compliance',
      'documentation',
      'style',
    ];
    for (const c of classes) {
      const out = dampen('HIGH', c, profiles.production);
      expect(out.dampened).toBe(false);
    }
  });

  it('does not go below FUTURE', () => {
    const out = dampen('LOW', 'documentation', profiles.prototype);
    expect(out.severity).toBe('FUTURE');
  });

  it('provides an expected band per stage', () => {
    expect(profiles.production.expectedBand).toEqual([75, 95]);
    expect(profiles.prototype.expectedBand[0]).toBeLessThan(profiles.beta.expectedBand[0]!);
  });
});

describe('suppression accounting (Accepted Risk must agree with Findings Summary)', () => {
  const profile = loadProfiles('rules').production;

  it('excludes suppressed findings from counts and severity tallies', () => {
    const r = score(
      [
        {
          rule: rule('A', 'HIGH'),
          finding: { ...finding('A', 'FAIL', 'HIGH'), suppressedReason: 'accepted risk' },
        },
        { rule: rule('B'), finding: finding('B', 'PASS') },
      ],
      DEFAULT_SECTIONS,
      profile,
    );
    expect(r.counts.FAIL).toBe(0);
    expect(r.severityCounts.HIGH).toBe(0);
    expect(r.counts.PASS).toBe(1);
  });

  it('still counts unsuppressed UNKNOWN in the review-queue total', () => {
    const r = score(
      [
        { rule: rule('A'), finding: finding('A', 'UNKNOWN') },
        { rule: rule('B'), finding: finding('B', 'PASS') },
      ],
      DEFAULT_SECTIONS,
      profile,
    );
    expect(r.counts.UNKNOWN).toBe(1);
  });
});

describe('dampen input validation', () => {
  const profiles = loadProfiles('rules');

  it('ignores fractional dampen steps (full severity, never undefined)', () => {
    const hacked = {
      ...profiles.production,
      dampen: { ...profiles.production.dampen, security: 1.5 },
    };
    expect(dampen('HIGH', 'security', hacked)).toEqual({ severity: 'HIGH', dampened: false });
  });
});
