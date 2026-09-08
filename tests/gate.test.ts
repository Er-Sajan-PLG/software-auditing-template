import { describe, it, expect, vi, afterEach } from 'vitest';
import { blockingFindings, evaluateGate } from '../src/engine/gate.js';
import type { AuditReport, Finding, Severity } from '../src/types.js';

const finding = (severity: Severity, over: Partial<Finding> = {}): Finding => ({
  ruleId: 'X-001',
  title: 'A finding',
  section: 'S2',
  sectionTitle: 'Security',
  severity,
  baseSeverity: severity,
  status: 'MISSING',
  ruleClass: 'security',
  dampened: false,
  message: 'Not detected.',
  locations: [],
  ...over,
});

const report = (findings: Finding[]): AuditReport => ({ findings }) as unknown as AuditReport;

afterEach(() => vi.restoreAllMocks());

describe('quality gate', () => {
  // This is a regression test for an inverted comparison that made
  // `--fail-on critical` block every finding in the report, including FUTURE.
  it('--fail-on critical blocks only CRITICAL findings', () => {
    const r = report([
      finding('CRITICAL'),
      finding('HIGH'),
      finding('MEDIUM'),
      finding('LOW'),
      finding('FUTURE'),
    ]);
    const blocked = blockingFindings(r, 'CRITICAL');
    expect(blocked.map((f) => f.severity)).toEqual(['CRITICAL']);
  });

  it('lowering the threshold blocks more, never fewer', () => {
    const r = report([finding('CRITICAL'), finding('HIGH'), finding('MEDIUM'), finding('LOW')]);
    expect(blockingFindings(r, 'LOW')).toHaveLength(4);
    expect(blockingFindings(r, 'MEDIUM')).toHaveLength(3);
    expect(blockingFindings(r, 'HIGH')).toHaveLength(2);
    expect(blockingFindings(r, 'CRITICAL')).toHaveLength(1);
  });

  it('FUTURE findings are below every other rung', () => {
    const r = report([finding('FUTURE')]);
    expect(blockingFindings(r, 'FUTURE')).toHaveLength(1);
    expect(blockingFindings(r, 'LOW')).toHaveLength(0);
  });

  it('never blocks passing, unverified, or accepted-risk findings', () => {
    const r = report([
      finding('CRITICAL', { status: 'PASS' }),
      finding('CRITICAL', { status: 'UNKNOWN' }),
      finding('CRITICAL', { suppressedReason: 'accepted in ADR-007' }),
      finding('CRITICAL', { status: 'NOT_APPLICABLE' }),
    ]);
    expect(blockingFindings(r, 'CRITICAL')).toHaveLength(0);
  });

  it('an accepted risk is still a finding, just not a blocker', () => {
    const r = report([finding('HIGH', { suppressedReason: 'accepted' })]);
    expect(r.findings).toHaveLength(1);
    expect(blockingFindings(r, 'HIGH')).toHaveLength(0);
  });

  describe('exit codes', () => {
    it('is 0 when nothing meets the threshold', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(evaluateGate(report([finding('LOW')]), 'critical', false)).toBe(0);
      expect(err).not.toHaveBeenCalled();
    });

    it('is 1 and names the findings when the gate trips', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(
        evaluateGate(report([finding('CRITICAL', { ruleId: 'SEC-001' })]), 'critical', false),
      ).toBe(1);
      expect(err.mock.calls.flat().join('\n')).toContain('SEC-001');
    });

    it('is silent under --quiet even when it trips', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(evaluateGate(report([finding('CRITICAL')]), 'critical', true)).toBe(1);
      expect(err).not.toHaveBeenCalled();
    });

    it('is 2 for an unrecognised threshold, not a silent pass', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(evaluateGate(report([]), 'catastrophic', false)).toBe(2);
      expect(err).toHaveBeenCalled();
    });

    it('"none" disables the gate entirely', () => {
      expect(evaluateGate(report([finding('CRITICAL')]), 'none', false)).toBe(0);
    });

    it('is case-insensitive', () => {
      expect(evaluateGate(report([finding('HIGH')]), 'High', true)).toBe(1);
    });
  });
});
