import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { makeProject } from './helpers.js';
import { Project } from '../src/util/project.js';

const cleanups: (() => void)[] = [];
const build = (files: Record<string, string>) => {
  const p = makeProject(files);
  cleanups.push(p.cleanup);
  return p.root;
};
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('Project index', () => {
  it('indexes source files', () => {
    const root = build({ 'src/a.ts': 'export const a = 1;', 'src/b.ts': 'export const b = 2;' });
    const p = new Project(root);
    expect(p.files).toContain('src/a.ts');
    expect(p.files).toContain('src/b.ts');
  });

  it('skips node_modules, dist and .git', () => {
    const root = build({
      'src/a.ts': 'x',
      'node_modules/dep/index.js': 'x',
      'dist/out.js': 'x',
    });
    const p = new Project(root);
    expect(p.files).toEqual(['src/a.ts']);
  });

  it('honours .gitignore', () => {
    const root = build({
      'src/a.ts': 'x',
      'src/generated.ts': 'x',
      '.gitignore': 'generated.ts\n',
    });
    const p = new Project(root);
    expect(p.files).toContain('src/a.ts');
    expect(p.files).not.toContain('src/generated.ts');
  });

  it('honours extra ignore globs from config', () => {
    const root = build({ 'src/a.ts': 'x', 'rules/foo.yaml': 'id: x' });
    const p = new Project(root, ['rules/**']);
    expect(p.files).toEqual(['src/a.ts']);
  });

  it('keeps lockfiles in the index but never greps them', () => {
    const root = build({
      'package.json': '{"name":"x"}',
      'package-lock.json': '{"packages":{"left-pad":{"version":"1.0.0"}}}',
    });
    const p = new Project(root);
    // Visible to file-based checks (is a lockfile committed?).
    expect(p.glob(['package-lock.json'])).toEqual(['package-lock.json']);
    // Invisible to content searches (noise + size).
    expect(p.grep('left-pad', ['**/*.json'])).toHaveLength(0);
  });

  it('greps with file and line numbers', () => {
    const root = build({ 'src/a.ts': 'const a = 1;\nconst secret = "abcd1234efgh5678";\n' });
    const p = new Project(root);
    const hits = p.grep('secret', ['**/*.ts']);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.file).toBe('src/a.ts');
    expect(hits[0]!.line).toBe(2);
    expect(hits[0]!.excerpt).toContain('secret');
  });

  it('respects exclude globs when grepping', () => {
    const root = build({
      'src/a.ts': 'secret here',
      'src/a.test.ts': 'secret here too',
    });
    const p = new Project(root);
    expect(p.grep('secret', ['**/*.ts'], ['**/*.test.ts'])).toHaveLength(1);
    expect(p.grep('secret', ['**/*.ts'])).toHaveLength(2);
  });

  it('skips binary files', () => {
    const root = build({ 'src/a.ts': 'x' });
    fs.writeFileSync(`${root}/src/blob.bin`, Buffer.from([1, 0, 0, 0, 2, 3]));
    const p = new Project(root);
    expect(p.read('src/blob.bin')).toBeNull();
  });

  it('reads JSON with comments and trailing commas', () => {
    const root = build({ 'tsconfig.json': '{\n // a comment\n "strict": true,\n}\n' });
    const p = new Project(root);
    expect(p.readJson('tsconfig.json')).toEqual({ strict: true });
  });

  it('reports directories and top-level dirs', () => {
    const root = build({ 'src/deep/a.ts': 'x', 'tests/a.test.ts': 'x' });
    const p = new Project(root);
    expect(p.dirExists('src')).toBe(true);
    expect(p.dirExists('nope')).toBe(false);
    expect(p.topLevelDirs()).toEqual(['src', 'tests']);
  });

  it('counts files matching patterns', () => {
    const root = build({
      'src/a.test.ts': 'x',
      'src/b.test.ts': 'x',
      'src/c.ts': 'x',
    });
    const p = new Project(root);
    expect(p.count(['**/*.test.ts'])).toBe(2);
    expect(p.anyFile(['**/*.test.ts'])).toBe(true);
    expect(p.anyFile(['**/*.rs'])).toBe(false);
  });
});

describe('scale honesty', () => {
  it('tracks oversize files and starts untruncated', () => {
    const { root, cleanup } = makeProject({
      'small.ts': 'export const a = 1;\n',
      'big.ts': 'x'.repeat(2 * 1024 * 1024 + 10) + '\n',
    });
    try {
      const project = new Project(root);
      expect(project.truncated).toBe(false);
      expect(project.skippedLarge).toBe(0);
      expect(project.read('small.ts')).not.toBeNull();
      expect(project.read('big.ts')).toBeNull();
      expect(project.skippedLarge).toBe(1);
      // Cached: re-reads do not double-count.
      expect(project.read('big.ts')).toBeNull();
      expect(project.skippedLarge).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('audit warns about skipped oversize files', async () => {
    const { runAudit } = await import('../src/engine/audit.js');
    const { root, cleanup } = makeProject({
      'package.json': JSON.stringify({ name: 'big' }),
      'huge.ts': 'y'.repeat(2 * 1024 * 1024 + 10) + '\n',
    });
    try {
      const { warnings } = runAudit({
        target: root,
        rulesDir: 'rules',
        depth: 'quick',
        profile: 'auto',
        config: { version: 1 },
      });
      expect(warnings.some((w) => w.includes('exceeding') && w.includes('skipped'))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
