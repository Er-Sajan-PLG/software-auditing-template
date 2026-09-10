import { describe, it, expect } from 'vitest';
import { renderMarkdown, parseTrailer } from '../src/report/markdown.js';
import { loadProfiles } from '../src/engine/maturity.js';
import type { AuditReport, Finding } from '../src/types.js';

const finding = (over: Partial<Finding>): Finding => ({
  ruleId: 'X-001',
  title: 'A finding',
  section: 'S2',
  sectionTitle: 'Security',
  severity: 'HIGH',
  baseSeverity: 'HIGH',
  status: 'MISSING',
  ruleClass: 'security',
  dampened: false,
  message: 'Not detected.',
  locations: [],
  ...over,
});

const baseReport = (findings: Finding[]): AuditReport => ({
  schema: 'usa-report-v1',
  generatedAt: '2026-09-08T00:00:00.000Z',
  usaVersion: '1.0.0',
  target: { path: '/tmp/proj', name: 'proj', commit: 'abc1234567890', ref: 'main' },
  detection: {
    maturity: 'beta',
    maturitySignals: ['+1 CI configured', 'maturity score 5.0/7.5 → beta'],
    projectTypes: ['api'],
    platforms: ['server'],
    languages: ['typescript'],
    frameworks: ['express'],
    packageManagers: ['npm'],
    databases: ['postgres'],
    flags: ['has:ci', 'has:tests'],
    metrics: { commits: 42, contributors: 3, tags: 2, branches: 2, files: 120 },
  },
  options: {
    depth: 'standard',
    profile: 'auto',
    rulesDir: 'rules',
    packsLoaded: ['core/security'],
    packsSkipped: ['stacks/solidity'],
  },
  score: {
    overall: 71.4,
    sections: [
      {
        id: 'S2',
        title: 'Security',
        score: 6.2,
        weight: 1.7,
        applicable: 4,
        resolved: 3,
        passed: 2,
        failed: 1,
        unknown: 1,
        confidence: 75,
      },
    ],
    counts: {
      PASS: 2,
      FAIL: 0,
      WRONG: 0,
      MISSING: 1,
      DEPRECATED: 0,
      EXPERIMENTAL: 0,
      UNKNOWN: 1,
      NOT_APPLICABLE: 0,
    },
    severityCounts: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0, FUTURE: 0 },
    automationCoverage: 75,
    expectedBand: [60, 85],
  },
  findings,
});

const profile = loadProfiles('rules').beta;

describe('markdown report', () => {
  it('renders the headline score and the expected band', () => {
    const md = renderMarkdown(baseReport([finding({})]), profile);
    expect(md).toContain('Overall Health Score: **71.4/100**');
    expect(md).toContain('Expected band for **Beta / Growing**');
  });

  it('puts CRITICAL findings under Immediate Action Required', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          ruleId: 'SEC-001',
          severity: 'CRITICAL',
          status: 'FAIL',
          title: 'Hardcoded key',
        }),
      ]),
      profile,
    );
    const idx = md.indexOf('Immediate Action Required');
    expect(idx).toBeGreaterThan(-1);
    expect(md.slice(idx, idx + 600)).toContain('SEC-001');
  });

  it('renders locations as file:line', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          status: 'WRONG',
          locations: [{ file: 'src/config.ts', line: 14, excerpt: 'const k = "abc"' }],
        }),
      ]),
      profile,
    );
    expect(md).toContain('`src/config.ts:14`');
  });

  it('shows when a finding was downgraded by the maturity profile', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          severity: 'LOW',
          baseSeverity: 'HIGH',
          dampened: true,
          ruleClass: 'documentation',
        }),
      ]),
      loadProfiles('rules').prototype,
    );
    expect(md).toContain('Downgraded HIGH → LOW');
  });

  it('renders the judgement queue with evidence prompts', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          ruleId: 'SEC-015',
          status: 'UNKNOWN',
          title: 'Authorization per resource',
          why: 'IDOR is invisible to linters.',
          evidenceHint: 'file:line of the ownership check',
        }),
      ]),
      profile,
    );
    expect(md).toContain('Judgement Queue');
    expect(md).toContain('file:line of the ownership check');
  });

  it('lists suppressed findings under Accepted Risk', () => {
    const md = renderMarkdown(
      baseReport([finding({ suppressedReason: 'Accepted: admin-only, 40 rows' })]),
      profile,
    );
    expect(md).toContain('Accepted Risk');
    expect(md).toContain('Accepted: admin-only, 40 rows');
  });

  it('shows "not verified" for sections nothing could resolve', () => {
    const report = baseReport([]);
    report.score.sections = [
      {
        id: 'S16',
        title: 'Future Readiness',
        score: null,
        weight: 0.4,
        applicable: 3,
        resolved: 0,
        passed: 0,
        failed: 0,
        unknown: 3,
        confidence: 0,
      },
    ];
    const md = renderMarkdown(report, profile);
    expect(md).toContain('— not verified');
  });

  it('embeds a machine-readable trailer that round-trips', () => {
    const report = baseReport([finding({ ruleId: 'SEC-001', status: 'PASS' })]);
    const md = renderMarkdown(report, profile);
    expect(md).toContain('<!-- USA:TRAILER:BEGIN -->');
    const raw = parseTrailer(md);
    expect(raw).not.toBeNull();
    expect(raw).toContain('schema: usa-report-v1');
    expect(raw).toContain('overall: 71.4');
    // Rule IDs are YAML-quoted: pack-author-controlled keys must not corrupt
    // the machine-parsed trailer (colons, hashes, newlines, fences).
    expect(raw).toContain('"SEC-001": {status: PASS');
  });

  it('quotes hostile rule IDs in the trailer so the YAML stays valid', () => {
    const report = baseReport([finding({ ruleId: 'X\n```\nY: #', status: 'FAIL' })]);
    const md = renderMarkdown(report, profile);
    const raw = parseTrailer(md);
    expect(raw).not.toBeNull();
    expect(raw).toContain('"X\\n```\\nY: #": {status: FAIL');
  });

  it('escapes pipes in table cells', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          ruleId: 'X-1',
          status: 'UNKNOWN',
          title: 'A | B',
          why: 'either | or',
          evidenceHint: 'one | two',
        }),
      ]),
      profile,
    );
    expect(md).toContain('A \\| B');
  });

  // Escaping `|` without escaping `\\` first lets an input backslash become an
  // escape for the next character (CodeQL: incomplete multi-character escaping).
  // This runs on the judgement-queue table, where rule text is a cell value.
  it('escapes backslashes before pipes in table cells', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          status: 'UNKNOWN',
          title: 'Check C:\\temp | hot',
          why: 'a trailing backslash \\',
          evidenceHint: 'output of ls C:\\temp',
        }),
      ]),
      profile,
    );
    const row = md.split('\n').find((l) => l.includes('Check C:'))!;
    // Backslash doubled, then pipe escaped: `C:\\temp \\| hot`
    expect(row).toContain('C:\\\\temp');
    expect(row).toContain('\\| hot');
    // Only the table's own delimiters survive: every `|` that came from the
    // rule text is escaped, so the row still has the header's column count.
    const header = md.split('\n').find((l) => l.includes('| Rule |'))!;
    const delimiters = (line: string) => (line.match(/(?<!\\)\|/g) ?? []).length;
    expect(delimiters(row)).toBe(delimiters(header));
  });

  // The wildcard form /BEGIN([\\s\\S]*?)END/ is polynomial on input with many
  // partial BEGIN markers; parseTrailer walks back from END for that reason.
  it('parses the trailer out of a document full of decoy markers', () => {
    const real = renderMarkdown(baseReport([finding({})]), profile);
    const noise = `${'<!-- USA:TRAILER:BEGIN -->'.repeat(200)}x`;
    const started = Date.now();
    const parsed = parseTrailer(`${noise}\n${real}\n${noise}`);
    expect(parsed).toContain('schema: usa-report-v1');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('trailer is valid YAML', async () => {
    const { parse } = await import('yaml');
    const raw = parseTrailer(renderMarkdown(baseReport([finding({})]), profile))!;
    const doc = parse(raw) as any;
    expect(doc.schema).toBe('usa-report-v1');
    expect(doc.overall).toBe(71.4);
    expect(doc.rules).toBeTypeOf('object');
  });
});
