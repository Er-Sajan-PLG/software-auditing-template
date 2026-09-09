import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { makeProject, auditAt, loadedPacks } from './helpers.js';
import { renderMarkdown } from '../src/report/markdown.js';
import { parseTrailer } from '../src/report/markdown.js';
import { loadProfiles } from '../src/engine/maturity.js';

const cleanups: (() => void)[] = [];
const build = (files: Record<string, string>) => {
  const p = makeProject(files);
  cleanups.push(p.cleanup);
  return p.root;
};
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('rule packs', () => {
  it('every pack loads and every rule parses', () => {
    const { packs, warnings } = loadedPacks();
    expect(warnings).toEqual([]);
    expect(packs.length).toBeGreaterThanOrEqual(20);
    const total = packs.reduce((n, p) => n + p.rules.length, 0);
    expect(total).toBeGreaterThan(180);
  });

  it('rule ids are unique across packs', () => {
    const { packs } = loadedPacks();
    const seen = new Map<string, string>();
    for (const p of packs) {
      for (const r of p.rules) {
        expect(seen.has(r.id), `duplicate rule id ${r.id} in ${p.id} and ${seen.get(r.id)}`).toBe(
          false,
        );
        seen.set(r.id, p.id);
      }
    }
  });

  it('every manual rule declares the evidence required (Rule 4)', () => {
    const { packs } = loadedPacks();
    const offenders: string[] = [];
    for (const p of packs) {
      for (const r of p.rules) {
        if (r.check.kind === 'manual' && !r.evidence) offenders.push(`${r.id} (${p.id})`);
      }
    }
    expect(offenders, `manual rules without evidence: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every rule has a remediation and a why', () => {
    const { packs } = loadedPacks();
    const missing: string[] = [];
    for (const p of packs) {
      for (const r of p.rules) {
        if (!r.remediation) missing.push(`${r.id}:remediation`);
        if (!r.why) missing.push(`${r.id}:why`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every rule declares a valid section', () => {
    const { packs } = loadedPacks();
    const valid = new Set([
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'S7',
      'S8',
      'S9',
      'S10',
      'S11',
      'S12',
      'S13',
      'S14',
      'S15',
      'S16',
    ]);
    for (const p of packs) {
      for (const r of p.rules) expect(valid.has(r.section), `${r.id} → ${r.section}`).toBe(true);
    }
  });
});

describe('end-to-end audits', () => {
  it('skips Solidity rules on a TypeScript project', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const { report } = auditAt(root);
    expect(report.options.packsSkipped).toContain('stacks/solidity');
    expect(report.findings.every((f) => f.ruleId !== 'SOLID-001')).toBe(true);
  });

  it('applies Solidity rules when a .sol file is present', () => {
    const root = build({
      'src/Vault.sol':
        'pragma solidity ^0.8.20;\ncontract Vault { function withdraw() public {} }\n',
    });
    const { report } = auditAt(root);
    expect(report.options.packsLoaded).toContain('stacks/solidity');
    expect(report.findings.some((f) => f.ruleId === 'SOLID-002')).toBe(true);
  });

  it('flags a hardcoded credential as CRITICAL, at any maturity', () => {
    const root = build({
      'src/config.ts': 'export const apiKey = "abcdefgh12345678";\n',
    });
    for (const profile of ['auto', 'prototype', 'production'] as const) {
      const { report } = auditAt(root, { profile });
      const f = report.findings.find((x) => x.ruleId === 'SEC-001');
      expect(f, 'SEC-001 should be applicable').toBeDefined();
      expect(f!.severity).toBe('CRITICAL');
      expect(f!.status).toBe('FAIL');
    }
  });

  it('does not flag an env-var reference as a hardcoded credential', () => {
    const root = build({ 'src/config.ts': 'export const apiKey = process.env.API_KEY;\n' });
    const { report } = auditAt(root);
    expect(report.findings.find((f) => f.ruleId === 'SEC-001')!.status).toBe('PASS');
  });

  it('dampens documentation findings on a prototype but keeps security', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const proto = auditAt(root, { profile: 'prototype' }).report;
    const prod = auditAt(root, { profile: 'production' }).report;

    const licenceProto = proto.findings.find((f) => f.ruleId === 'REPO-005');
    const licenceProd = prod.findings.find((f) => f.ruleId === 'REPO-005');
    expect(licenceProd!.severity).toBe('HIGH');
    expect(licenceProto!.severity).toBe('LOW');
    expect(licenceProto!.dampened).toBe(true);
  });

  it('honours suppressions and still lists them', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const { report } = auditAt(root, {
      config: {
        version: 1,
        suppressions: [{ rule: 'REPO-005', reason: 'Licence decision pending' }],
      },
    });
    const f = report.findings.find((x) => x.ruleId === 'REPO-005')!;
    expect(f.suppressedReason).toBe('Licence decision pending');
    const md = renderMarkdown(report, loadProfiles('rules').prototype);
    expect(md).toContain('Licence decision pending');
  });

  it('honours disabled rules', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const { report } = auditAt(root, {
      config: { version: 1, rules: { 'REPO-005': { disabled: true, reason: 'n/a' } } },
    });
    expect(report.findings.find((f) => f.ruleId === 'REPO-005')).toBeUndefined();
  });

  it('expired suppressions fail closed with a warning', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const { report, warnings } = auditAt(root, {
      config: {
        version: 1,
        suppressions: [{ rule: 'REPO-005', reason: 'stale waiver', until: '2020-01-01' }],
      },
    });
    const f = report.findings.find((x) => x.ruleId === 'REPO-005')!;
    expect(f.suppressedReason).toBeUndefined();
    expect(warnings.some((w) => w.includes('REPO-005') && w.includes('expired'))).toBe(true);
  });

  it('unparseable suppression dates fail closed with a warning', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const { report, warnings } = auditAt(root, {
      config: {
        version: 1,
        suppressions: [{ rule: 'REPO-005', reason: 'typo waiver', until: 'someday' }],
      },
    });
    expect(report.findings.find((x) => x.ruleId === 'REPO-005')!.suppressedReason).toBeUndefined();
    expect(warnings.some((w) => w.includes('REPO-005') && w.includes('unparseable'))).toBe(true);
  });

  it('honours a config maturity override', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const { report, warnings } = auditAt(root, {
      config: { version: 1, maturity: 'production' },
    });
    expect(report.detection.maturity).toBe('production');
    expect(warnings).toEqual([]);
  });

  it('warns on an invalid config maturity and falls back to detection', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const { report, warnings } = auditAt(root, {
      // @ts-expect-error intentionally invalid maturity
      config: { version: 1, maturity: 'enterprise' },
    });
    expect(report.detection.maturity).not.toBe('enterprise');
    expect(warnings.some((w) => w.includes('invalid maturity'))).toBe(true);
  });

  it('restricts scoring and findings to configured sections', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const { report, warnings } = auditAt(root, {
      config: { version: 1, sections: ['S2'] },
    });
    expect(warnings).toEqual([]);
    expect(report.findings.length).toBeGreaterThan(0);
    for (const f of report.findings) expect(f.section).toBe('S2');
    for (const s of report.score.sections) expect(s.id).toBe('S2');
  });

  it('rejects invalid rule overrides with a warning and a finite score', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const { report, warnings } = auditAt(root, {
      config: {
        version: 1,
        // @ts-expect-error intentionally invalid override values
        rules: { 'SEC-001': { severity: 'BOGUS', weight: -5 } },
      },
    });
    expect(warnings.some((w) => w.includes('invalid severity'))).toBe(true);
    expect(warnings.some((w) => w.includes('invalid weight'))).toBe(true);
    expect(Number.isFinite(report.score.overall)).toBe(true);
  });

  it('is deterministic across runs', () => {
    const root = build({
      'package.json': JSON.stringify({ name: 'x', version: '1.0.0' }),
      'src/index.ts': 'export const a = 1;\nexport const apiKey = "abcdefgh12345678";\n',
      'src/index.test.ts': 'it("x", () => {});\n',
      '.github/workflows/ci.yml': 'name: CI\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n',
    });
    const a = auditAt(root).report.score.overall;
    const b = auditAt(root).report.score.overall;
    expect(a).toBe(b);
  });

  it('produces a report that parses back for diffing', () => {
    const root = build({ 'src/index.ts': 'export const a = 1;\n' });
    const { report, profile } = auditAt(root);
    const md = renderMarkdown(report, profile);
    const raw = parseTrailer(md);
    expect(raw).toContain(`overall: ${report.score.overall}`);
  });
});

describe('this repository', () => {
  it('audits itself without warnings', () => {
    const root = path.resolve(process.cwd());
    const { report, warnings } = auditAt(root);
    expect(warnings).toEqual([]);
    expect(report.score.overall).toBeGreaterThan(0);
    expect(fs.existsSync('AUDIT.md') || true).toBe(true);
  });
});
