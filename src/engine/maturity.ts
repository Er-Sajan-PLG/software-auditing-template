import { parse as parseYaml } from 'yaml';
import { asMap, list, num, str, strList } from '../util/yaml.js';
import fs from 'node:fs';
import path from 'node:path';
import type { Maturity, RuleClass, Severity } from '../types.js';

export interface MaturityProfile {
  key: Maturity;
  label: string;
  summary: string;
  dampen: Record<RuleClass, number>;
  expectedBand: [number, number];
  focus: string[];
  defer: string[];
}

const LADDER: Severity[] = ['FUTURE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const FALLBACK: Record<Maturity, MaturityProfile> = {
  prototype: {
    key: 'prototype',
    label: 'Prototype / Spike',
    summary: 'Proving an idea.',
    dampen: {
      security: 1,
      'supply-chain': 1,
      correctness: 1,
      maintainability: 2,
      operations: 2,
      performance: 2,
      compliance: 2,
      documentation: 2,
      style: 2,
    },
    expectedBand: [30, 65],
    focus: [],
    defer: [],
  },
  mvp: {
    key: 'mvp',
    label: 'MVP / Early product',
    summary: 'Real users, real data.',
    dampen: {
      security: 0,
      'supply-chain': 1,
      correctness: 1,
      maintainability: 1,
      operations: 1,
      performance: 1,
      compliance: 1,
      documentation: 2,
      style: 2,
    },
    expectedBand: [45, 75],
    focus: [],
    defer: [],
  },
  beta: {
    key: 'beta',
    label: 'Beta / Growing',
    summary: 'Scaling users and contributors.',
    dampen: {
      security: 0,
      'supply-chain': 0,
      correctness: 0,
      maintainability: 1,
      operations: 1,
      performance: 1,
      compliance: 1,
      documentation: 1,
      style: 1,
    },
    expectedBand: [60, 85],
    focus: [],
    defer: [],
  },
  production: {
    key: 'production',
    label: 'Production / GA',
    summary: 'Full bar.',
    dampen: {
      security: 0,
      'supply-chain': 0,
      correctness: 0,
      maintainability: 0,
      operations: 0,
      performance: 0,
      compliance: 0,
      documentation: 0,
      style: 0,
    },
    expectedBand: [75, 95],
    focus: [],
    defer: [],
  },
  legacy: {
    key: 'legacy',
    label: 'Legacy / Maintenance',
    summary: 'Contain risk, plan exit.',
    dampen: {
      security: 0,
      'supply-chain': 0,
      correctness: 0,
      maintainability: 1,
      operations: 0,
      performance: 1,
      compliance: 0,
      documentation: 1,
      style: 1,
    },
    expectedBand: [40, 70],
    focus: [],
    defer: [],
  },
};

/** `[min, max]` if the pack wrote a two-number band, else the built-in. */
function expectedBand(v: unknown, fallback: [number, number]): [number, number] {
  const band = list(v);
  if (!band || band.length < 2) return fallback;
  const min = num(band[0]);
  const max = num(band[1]);
  return min !== undefined && max !== undefined ? [min, max] : fallback;
}

export function loadProfiles(rulesDir: string): Record<Maturity, MaturityProfile> {
  const file = path.join(rulesDir, 'profiles', 'maturity.yaml');
  if (!fs.existsSync(file)) return { ...FALLBACK };
  try {
    const doc = asMap(parseYaml(fs.readFileSync(file, 'utf8')));
    const profiles = asMap(doc.profiles);
    const out = { ...FALLBACK };
    for (const key of Object.keys(FALLBACK) as Maturity[]) {
      const p = asMap(profiles[key]);
      if (!profiles[key]) continue;
      out[key] = {
        key,
        label: str(p.label) ?? FALLBACK[key].label,
        summary: (str(p.summary) ?? '').trim(),
        dampen: { ...FALLBACK[key].dampen, ...asMap(p.dampen) },
        expectedBand: expectedBand(p.expected_band, FALLBACK[key].expectedBand),
        focus: strList(p.focus) ?? [],
        defer: strList(p.defer) ?? [],
      };
    }
    return out;
  } catch {
    return { ...FALLBACK };
  }
}

/**
 * Apply the maturity profile to a rule's declared severity.
 * CRITICAL is never dampened — see the hard rule in profiles/maturity.yaml.
 */
export function dampen(
  severity: Severity,
  ruleClass: RuleClass,
  profile: MaturityProfile,
): { severity: Severity; dampened: boolean } {
  if (severity === 'CRITICAL') return { severity, dampened: false };
  const steps = profile.dampen[ruleClass] ?? 0;
  if (steps <= 0) return { severity, dampened: false };
  const idx = LADDER.indexOf(severity);
  const next = Math.max(0, idx - steps);
  return { severity: LADDER[next]!, dampened: next !== idx };
}
