import { describe, it, expect, afterEach } from 'vitest';
import { makeProject, evaluateAt } from './engine-helpers.js';

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

  it('count_min → PASS at threshold, FAIL below', () => {
    const root = build({ 'a.test.ts': 'x', 'b.test.ts': 'x' });
    expect(evaluateAt(root, { kind: 'count_min', patterns: ['**/*.test.ts'], min: 2 }).status).toBe(
      'PASS',
    );
    expect(evaluateAt(root, { kind: 'count_min', patterns: ['**/*.test.ts'], min: 5 }).status).toBe(
      'FAIL',
    );
  });

  it('file_lines_max → WRONG with line counts', () => {
    const root = build({
      'src/god.ts': Array.from({ length: 900 }, (_, i) => `// ${i}`).join('\n'),
    });
    const r = evaluateAt(root, {
      kind: 'file_lines_max',
      patterns: ['src/**/*.ts'],
      max_lines: 800,
    });
    expect(r.status).toBe('WRONG');
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
