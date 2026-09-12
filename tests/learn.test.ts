import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject, auditAt } from './helpers.js';
import { renderMarkdown } from '../src/report/markdown.js';
import { learnFromReport, renderSuggestions } from '../src/learn/index.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tmpfile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-learn-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

/** Render a real report for a project that trips at least one rule. */
function realReport(): string {
  const { root, cleanup } = makeProject({
    'package.json': JSON.stringify({ name: 'x', version: '1.0.0' }),
    'index.js': 'const password = "hunter2";\nconsole.log(password);\n',
  });
  cleanups.push(cleanup);
  const { report, profile } = auditAt(root, { depth: 'standard' });
  return renderMarkdown(report, profile);
}

describe('learnFromReport', () => {
  it('parses the YAML trailer and returns suggestions for open findings', () => {
    const markdown = realReport();
    const file = tmpfile('AUDIT.md', markdown);

    const suggestions = learnFromReport({ reportPath: file, minSeverity: 'LOW' });
    expect(Array.isArray(suggestions)).toBe(true);
    // Every suggestion maps back to a real rule id and carries evidence guidance.
    for (const s of suggestions) {
      expect(s.id).toMatch(/^LEARN-\d{3}$/);
      expect(s.triggeredBy).toBeTruthy();
      expect(s.check.kind).toBe('manual');
    }
  });

  it('throws a clear error for a file with no USA trailer', () => {
    const file = tmpfile('plain.md', '# not a report\n');
    expect(() => learnFromReport({ reportPath: file })).toThrow(/trailer/i);
  });

  it('throws a clear error for an unparseable trailer', () => {
    const file = tmpfile(
      'bad.md',
      '<!-- USA-TRAILER:BEGIN -->\n```yaml\n: : not yaml [\n```\n<!-- USA-TRAILER:END -->\n',
    );
    expect(() => learnFromReport({ reportPath: file })).toThrow(/trailer/i);
  });

  it('renders a REVIEW-REQUIRED suggestion pack', () => {
    const suggestions = [
      {
        id: 'LEARN-001',
        title: 'Review auth',
        section: 'S2',
        sectionTitle: 'Security',
        severity: 'HIGH' as const,
        ruleClass: 'security',
        check: { kind: 'manual' },
        why: 'why',
        remediation: 'fix',
        evidence: 'file:line',
        triggeredBy: 'AUTH-1',
      },
    ];
    const yaml = renderSuggestions(suggestions);
    expect(yaml).toContain('REVIEW REQUIRED');
    expect(yaml).toContain('LEARN-001');
    expect(yaml).toContain('kind: manual');
  });
});
