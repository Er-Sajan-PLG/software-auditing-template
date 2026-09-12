import { describe, it, expect } from 'vitest';
import {
  allRules,
  automatableRules,
  loadFixtures,
  evaluateFixture,
} from './rule-fixture-helpers.js';

/**
 * Per-rule expected-finding fixtures (codeql-test model).
 *
 * Each automatable rule must ship a fixture with a negative case (must PASS)
 * and, where the rule has a determinable violation, a positive case. The
 * coverage gate below fails CI when an automatable rule has no fixture, so a
 * newly added rule cannot merge untested. This is what stops silent rule rot:
 * a refactor that breaks a regex shows up as a failing fixture, not as a
 * quietly-wrong audit.
 */
const fixtures = loadFixtures();

describe('rule fixtures — structure', () => {
  it('every fixture names a rule that exists', () => {
    const rules = allRules();
    for (const { file, fixture } of fixtures) {
      expect(rules.has(fixture.rule), `${file} names unknown rule ${fixture.rule}`).toBe(true);
    }
  });

  it('fixture filenames match their rule id', () => {
    for (const { file, fixture } of fixtures) {
      expect(file.replace(/\.ya?ml$/, '')).toBe(fixture.rule);
    }
  });

  it('every fixture has at least one case', () => {
    for (const { file, fixture } of fixtures) {
      expect(
        Boolean(fixture.positive || fixture.negative),
        `${file} has neither a positive nor a negative case`,
      ).toBe(true);
    }
  });

  it('no two fixtures target the same rule', () => {
    const seen = new Set<string>();
    for (const { file, fixture } of fixtures) {
      expect(seen.has(fixture.rule), `duplicate fixture for ${fixture.rule} (${file})`).toBe(false);
      seen.add(fixture.rule);
    }
  });
});

describe('rule fixtures — behaviour', () => {
  for (const { file, fixture } of fixtures) {
    describe(`${fixture.rule} (${file})`, () => {
      const rule = allRules().get(fixture.rule);

      it('negative case passes', () => {
        if (!fixture.negative) return;
        const { status, message, cleanup } = evaluateFixture(rule!.check, fixture.negative);
        try {
          expect(
            status,
            `${fixture.rule} negative case expected PASS but got ${status}: ${message}`,
          ).toBe('PASS');
        } finally {
          cleanup();
        }
      });

      it('positive case fails as declared', () => {
        if (!fixture.positive) return;
        const { status, message, cleanup } = evaluateFixture(rule!.check, fixture.positive);
        try {
          const expected = fixture.positive.expect;
          if (expected) {
            expect(
              status,
              `${fixture.rule} positive case expected ${expected} but got ${status}`,
            ).toBe(expected);
          } else {
            expect(
              status,
              `${fixture.rule} positive case expected a non-PASS status but got PASS`,
            ).not.toBe('PASS');
          }
          expect(message).toBeTruthy();
        } finally {
          cleanup();
        }
      });
    });
  }
});

describe('rule fixtures — coverage gate', () => {
  it('every automatable rule has a fixture', () => {
    const covered = new Set(fixtures.map((f) => f.fixture.rule));
    const missing = automatableRules()
      .filter((r) => !covered.has(r.id))
      .map((r) => r.id)
      .sort();
    expect(
      missing,
      `automatable rules without a fixture (add tests/fixtures/rules/<id>.yaml):\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('manual rules are exempt and never have fixtures', () => {
    const manualIds = new Set(
      [...allRules().values()].filter((r) => r.check.kind === 'manual').map((r) => r.id),
    );
    for (const { fixture } of fixtures) {
      expect(
        manualIds.has(fixture.rule),
        `${fixture.rule} is a manual rule and cannot be fixture-tested`,
      ).toBe(false);
    }
  });
});
