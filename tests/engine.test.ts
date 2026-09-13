import { describe, it, expect, afterEach } from 'vitest';
import { makeProject, evaluateAt } from './engine-helpers.js';
import { evalPredicate, ruleApplies } from '../src/engine/evaluate.js';
import type { Facts, Rule } from '../src/types.js';

const cleanups: (() => void)[] = [];
const build = (files: Record<string, string>) => {
  const p = makeProject(files);
  cleanups.push(p.cleanup);
  return p.root;
};
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('check kinds', () => {
  it('file_exists → PASS when present, MISSING when absent', () => {
    const root = build({ '.gitignore': 'node_modules\n' });
    expect(evaluateAt(root, { kind: 'file_exists', files: ['.gitignore'] }).status).toBe('PASS');
    expect(evaluateAt(root, { kind: 'file_exists', files: ['LICENSE'] }).status).toBe('MISSING');
  });

  it('file_absent → FAIL with locations when present', () => {
    const root = build({ '.env': 'SECRET=abc' });
    const r = evaluateAt(root, { kind: 'file_absent', files: ['.env'] });
    expect(r.status).toBe('FAIL');
    expect(r.locations[0]!.file).toBe('.env');
  });

  it('grep_absent → FAIL with file:line', () => {
    const root = build({ 'src/config.ts': 'const key = "abcdefgh12345678";\n' });
    const r = evaluateAt(root, {
      kind: 'grep_absent',
      pattern: 'key\\s*=\\s*["\'][A-Za-z0-9]{16,}["\']',
      include: ['**/*.ts'],
    });
    expect(r.status).toBe('FAIL');
    expect(r.locations[0]!.line).toBe(1);
  });

  it('grep_absent → PASS when clean', () => {
    const root = build({ 'src/config.ts': 'const key = process.env.KEY;\n' });
    expect(
      evaluateAt(root, {
        kind: 'grep_absent',
        pattern: 'key\\s*=\\s*["\'][A-Za-z0-9]{16,}["\']',
        include: ['**/*.ts'],
      }).status,
    ).toBe('PASS');
  });

  it('grep_wrong → WRONG (not FAIL)', () => {
    const root = build({ 'src/a.ts': 'try { doThing(); } catch (e) {}\n' });
    const r = evaluateAt(root, {
      kind: 'grep_wrong',
      pattern: 'catch\\s*\\(\\s*\\w*\\s*\\)\\s*\\{\\s*\\}',
      include: ['**/*.ts'],
    });
    expect(r.status).toBe('WRONG');
  });

  it('grep_deprecated → DEPRECATED', () => {
    const root = build({ 'src/a.js': 'const b = new Buffer(10);\n' });
    expect(
      evaluateAt(root, {
        kind: 'grep_deprecated',
        pattern: 'new Buffer\\s*\\(',
        include: ['**/*.js'],
      }).status,
    ).toBe('DEPRECATED');
  });

  it('count_min → PASS at threshold, MISSING below', () => {
    const root = build({ 'a.test.ts': 'x', 'b.test.ts': 'x' });
    expect(evaluateAt(root, { kind: 'count_min', patterns: ['**/*.test.ts'], min: 2 }).status).toBe(
      'PASS',
    );
    // Below threshold means required files are absent (MISSING), not a
    // violated condition (FAIL) — see the status taxonomy in types.ts.
    expect(evaluateAt(root, { kind: 'count_min', patterns: ['**/*.test.ts'], min: 5 }).status).toBe(
      'MISSING',
    );
  });

  it('file_lines_max → FAIL with line counts', () => {
    const root = build({
      'src/god.ts': Array.from({ length: 900 }, (_, i) => `// ${i}`).join('\n'),
    });
    const r = evaluateAt(root, {
      kind: 'file_lines_max',
      patterns: ['src/**/*.ts'],
      max_lines: 800,
    });
    // A god object is a violation (FAIL, 0 credit), not a partial
    // implementation (WRONG would award 0.15 credit for failing modularity).
    expect(r.status).toBe('FAIL');
    expect(r.locations[0]!.excerpt).toContain('900');
  });

  it('json_path → PASS / MISSING / WRONG', () => {
    const root = build({ 'package.json': JSON.stringify({ engines: { node: '>=20' } }) });
    expect(
      evaluateAt(root, { kind: 'json_path', file: 'package.json', path: 'engines.node' }).status,
    ).toBe('PASS');
    expect(
      evaluateAt(root, { kind: 'json_path', file: 'package.json', path: 'engines.bun' }).status,
    ).toBe('MISSING');
    expect(
      evaluateAt(root, {
        kind: 'json_path',
        file: 'package.json',
        path: 'engines.node',
        equals: '>=18',
      }).status,
    ).toBe('WRONG');
  });

  it('manual → UNKNOWN', () => {
    const root = build({ 'a.ts': 'x' });
    expect(evaluateAt(root, { kind: 'manual' }).status).toBe('UNKNOWN');
  });

  it('command → UNKNOWN unless --allow-commands', () => {
    const root = build({ 'a.ts': 'x' });
    expect(
      evaluateAt(root, { kind: 'command', run: 'true' }, { allowCommands: false }).status,
    ).toBe('UNKNOWN');
    expect(evaluateAt(root, { kind: 'command', run: 'true' }, { allowCommands: true }).status).toBe(
      'PASS',
    );
    expect(
      evaluateAt(root, { kind: 'command', run: 'false' }, { allowCommands: true }).status,
    ).toBe('FAIL');
  });

  describe('oracle (ingest external evidence)', () => {
    const sarif = (results: { level: string; ruleId: string }[]) =>
      JSON.stringify({ version: '2.1.0', runs: [{ tool: {}, results }] });

    it('counts SARIF results and passes under the bound', () => {
      const root = build({
        'reports/codeql.sarif': sarif([
          { level: 'error', ruleId: 'js/sql-injection' },
          { level: 'warning', ruleId: 'js/xss' },
        ]),
      });
      const check = {
        kind: 'oracle' as const,
        source: 'sarif' as const,
        file: 'reports/codeql.sarif',
        op: 'at_most' as const,
        value: 5,
      };
      const r = evaluateAt(root, check);
      expect(r.status).toBe('PASS');
      expect(r.message).toContain('2 <= 5');
    });

    it('fails when the SARIF count exceeds the bound', () => {
      const root = build({
        'reports/codeql.sarif': sarif([
          { level: 'error', ruleId: 'a' },
          { level: 'error', ruleId: 'b' },
          { level: 'error', ruleId: 'c' },
        ]),
      });
      const r = evaluateAt(root, {
        kind: 'oracle',
        source: 'sarif',
        file: 'reports/codeql.sarif',
        levels: ['error'],
        op: 'at_most',
        value: 2,
      });
      expect(r.status).toBe('FAIL');
    });

    it('filters by level and rule id', () => {
      const root = build({
        'x.sarif': sarif([
          { level: 'error', ruleId: 'js/sql-injection' },
          { level: 'note', ruleId: 'js/sql-injection' },
          { level: 'error', ruleId: 'js/xss' },
        ]),
      });
      const onlyErrors = evaluateAt(root, {
        kind: 'oracle',
        source: 'sarif',
        file: 'x.sarif',
        levels: ['error'],
        op: 'equals',
        value: 2,
      });
      expect(onlyErrors.status).toBe('PASS');
      const onlySql = evaluateAt(root, {
        kind: 'oracle',
        source: 'sarif',
        file: 'x.sarif',
        rules: ['sql-injection'],
        op: 'equals',
        value: 2,
      });
      expect(onlySql.status).toBe('PASS');
    });

    it('reads a JSON number at a dotted path with at_least', () => {
      const root = build({
        'reports/cov.json': JSON.stringify({ total: { lines: { pct: 87.5 } } }),
      });
      const pass = evaluateAt(root, {
        kind: 'oracle',
        source: 'json',
        file: 'reports/cov.json',
        path: 'total.lines.pct',
        op: 'at_least',
        value: 80,
      });
      expect(pass.status).toBe('PASS');
      const fail = evaluateAt(root, {
        kind: 'oracle',
        source: 'json',
        file: 'reports/cov.json',
        path: 'total.lines.pct',
        op: 'at_least',
        value: 90,
      });
      expect(fail.status).toBe('FAIL');
    });

    it('MISSING when the artifact is absent (no evidence ≠ pass)', () => {
      const root = build({ 'a.ts': 'x' });
      const r = evaluateAt(root, {
        kind: 'oracle',
        source: 'sarif',
        file: 'reports/missing.sarif',
        value: 0,
      });
      expect(r.status).toBe('MISSING');
    });

    it('UNKNOWN (fail closed) when the artifact is not valid JSON', () => {
      const root = build({ 'broken.sarif': 'this is not json' });
      const r = evaluateAt(root, {
        kind: 'oracle',
        source: 'sarif',
        file: 'broken.sarif',
        value: 0,
      });
      expect(r.status).toBe('UNKNOWN');
    });

    it('UNKNOWN when a JSON oracle path is not a number', () => {
      const root = build({ 'x.json': JSON.stringify({ coverage: 'high' }) });
      const r = evaluateAt(root, {
        kind: 'oracle',
        source: 'json',
        file: 'x.json',
        path: 'coverage',
        value: 0,
      });
      expect(r.status).toBe('UNKNOWN');
    });

    it('UNKNOWN when SARIF has no runs[].results', () => {
      const root = build({ 'x.sarif': JSON.stringify({ version: '2.1.0' }) });
      const r = evaluateAt(root, {
        kind: 'oracle',
        source: 'sarif',
        file: 'x.sarif',
        value: 0,
      });
      expect(r.status).toBe('UNKNOWN');
    });
  });

  it('excludes test files from security greps', () => {
    const root = build({
      'src/a.ts': 'const secret = process.env.SECRET;',
      'src/a.test.ts': 'const secret = "abcdefgh12345678";',
    });
    const r = evaluateAt(root, {
      kind: 'grep_absent',
      pattern: 'secret\\s*=\\s*["\'][A-Za-z0-9]{16,}["\']',
      include: ['**/*.ts'],
      exclude: ['**/*.test.ts'],
    });
    expect(r.status).toBe('PASS');
  });
});

describe('predicate hardening (fail closed, never crash)', () => {
  const facts: Facts = { flags: new Set(['has:ci']), metrics: { commits: 25 } };

  it('matches with an invalid regex fails closed without throwing', () => {
    expect(evalPredicate({ fact: 'metric:commits', op: 'matches', value: '([' }, facts)).toBe(
      false,
    );
  });

  it('matches with a valid regex still works', () => {
    expect(evalPredicate({ fact: 'metric:commits', op: 'matches', value: '^2' }, facts)).toBe(true);
    expect(evalPredicate({ fact: 'metric:commits', op: 'matches', value: '^9' }, facts)).toBe(
      false,
    );
  });

  it('unknown operators exclude the rule instead of silently including it', () => {
    expect(evalPredicate({ fact: 'has:ci', op: 'bogus' as never }, facts)).toBe(false);
  });

  it('malformed predicates fail closed; empty constraint still applies always', () => {
    expect(evalPredicate('has:ci' as never, facts)).toBe(false);
    expect(evalPredicate({} as never, facts)).toBe(true);
    expect(evalPredicate(undefined, facts)).toBe(true);
  });

  it('in/includes need metric facts — presence alone never satisfies them', () => {
    expect(evalPredicate({ fact: 'has:ci', op: 'in', value: ['x'] }, facts)).toBe(false);
    expect(evalPredicate({ fact: 'has:ci', op: 'includes', value: ['never'] }, facts)).toBe(false);
    expect(evalPredicate({ fact: 'metric:commits', op: 'in', value: [25, 100] }, facts)).toBe(true);
  });

  it('ruleApplies with includeAll honors the force-load contract', () => {
    const rule: Rule = {
      id: 'T-1',
      title: 't',
      section: 'S1',
      severity: 'HIGH',
      ruleClass: 'security',
      check: { kind: 'manual' },
      appliesWhen: { fact: 'has:something-that-does-not-exist' },
      depths: ['deep'],
    };
    expect(ruleApplies(rule, { flags: new Set(), metrics: {} }, 'quick', true)).toBe(true);
    expect(ruleApplies(rule, { flags: new Set(), metrics: {} }, 'quick', false)).toBe(false);
  });
});
