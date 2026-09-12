import { describe, it, expect } from 'vitest';
import { diffReports } from '../src/engine/diff.js';
import { renderMarkdown, parseTrailer } from '../src/report/markdown.js';
import { loadProfiles } from '../src/engine/maturity.js';
import type { AuditReport, Finding } from '../src/types.js';

const finding = (
  ruleId: string,
  status: Finding['status'],
  severity: Finding['severity'] = 'HIGH',
): Finding => ({
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

function md(findings: Finding[], overall: number, at = '2026-06-01T00:00:00.000Z'): string {
  const report: AuditReport = {
    schema: 'usa-report-v1',
    generatedAt: at,
    usaVersion: '1.0.0',
    target: { path: '/p', name: 'p' },
    detection: {
      maturity: 'beta',
      maturitySignals: [],
      projectTypes: [],
      platforms: [],
      languages: [],
      frameworks: [],
      packageManagers: [],
      databases: [],
      flags: [],
      metrics: {},
    },
    options: {
      depth: 'standard',
      profile: 'auto',
      rulesDir: 'rules',
      packsLoaded: [],
      packsSkipped: [],
    },
    score: {
      overall,
      sections: [],
      counts: {
        PASS: 0,
        FAIL: 0,
        WRONG: 0,
        MISSING: 0,
        DEPRECATED: 0,
        EXPERIMENTAL: 0,
        UNKNOWN: 0,
        NOT_APPLICABLE: 0,
      },
      severityCounts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, FUTURE: 0 },
      automationCoverage: 100,
      expectedBand: [60, 85],
    },
    findings,
  };
  return renderMarkdown(report, loadProfiles('rules').beta);
}

const before = md(
  [finding('SEC-001', 'FAIL'), finding('SEC-002', 'MISSING'), finding('DOC-001', 'MISSING', 'LOW')],
  55,
);
const after = md(
  [
    finding('SEC-001', 'PASS'),
    finding('SEC-002', 'WRONG'),
    finding('DOC-001', 'PASS', 'LOW'),
    finding('API-001', 'MISSING', 'MEDIUM'),
  ],
  71,
);

describe('usa diff', () => {
  it('reports the net movement', () => {
    const out = diffReports(parseTrailer(before)!, parseTrailer(after)!);
    expect(out).toContain('+16');
  });

  it('lists fixed findings', () => {
    const out = diffReports(parseTrailer(before)!, parseTrailer(after)!);
    expect(out).toContain('✅ Fixed');
    expect(out).toContain('SEC-001');
    expect(out).toContain('DOC-001');
  });

  it('separates "changed but still open" from regressions', () => {
    const out = diffReports(parseTrailer(before)!, parseTrailer(after)!);
    // SEC-002 went MISSING → WRONG: still open, so it is not a fix and not a regression.
    expect(out).toContain('Changed (still open)');
    expect(out).toMatch(/SEC-002 — MISSING → WRONG/);
  });

  it('flags newly applicable rules', () => {
    const out = diffReports(parseTrailer(before)!, parseTrailer(after)!);
    expect(out).toContain('Newly applicable');
    expect(out).toContain('API-001');
  });

  it('detects regressions', () => {
    const regressed = md([finding('SEC-001', 'PASS'), finding('SEC-002', 'FAIL')], 60);
    const out = diffReports(parseTrailer(before)!, parseTrailer(regressed)!);
    expect(out).toContain('SEC-002 — MISSING → FAIL');
  });

  it('explains a zero delta', () => {
    const out = diffReports(parseTrailer(before)!, parseTrailer(before)!);
    expect(out).toContain('No net movement');
  });
});

describe('judgement-queue transitions are visible', () => {
  it('shows UNKNOWN → PASS as fixed (resolved by review)', () => {
    const b = md([finding('SEC-015', 'UNKNOWN')], 70);
    const a = md([finding('SEC-015', 'PASS')], 71);
    const out = diffReports(parseTrailer(b)!, parseTrailer(a)!);
    expect(out).toMatch(/SEC-015 — UNKNOWN → PASS \(resolved by review\)/);
  });

  it('shows PASS → UNKNOWN as regressed (needs review)', () => {
    const b = md([finding('SEC-015', 'PASS')], 71);
    const a = md([finding('SEC-015', 'UNKNOWN')], 70);
    const out = diffReports(parseTrailer(b)!, parseTrailer(a)!);
    expect(out).toMatch(/SEC-015 — PASS → UNKNOWN \(needs review\)/);
  });
});
