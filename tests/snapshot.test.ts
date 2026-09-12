import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalJson,
  identityFromFiles,
  snapshotOfDir,
  snapshotOfProject,
  type SnapshotFile,
} from '../src/snapshot/index.js';
import { Project } from '../src/util/project.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tempProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-snap-'));
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return root;
}

describe('snapshot identity', () => {
  it('produces the same id for the same content in two different directories', () => {
    const files = { 'src/a.ts': 'export const a = 1;\n', 'README.md': '# hi\n' };
    const s1 = snapshotOfDir(tempProject(files));
    const s2 = snapshotOfDir(tempProject(files));
    expect(s1.id).toBe(s2.id);
    expect(s1.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes id when a file content changes', () => {
    const base = { 'src/a.ts': 'export const a = 1;\n' };
    const s1 = snapshotOfDir(tempProject(base));
    const s2 = snapshotOfDir(tempProject({ 'src/a.ts': 'export const a = 2;\n' }));
    expect(s1.id).not.toBe(s2.id);
  });

  it('changes id when a file is added or removed', () => {
    const s1 = snapshotOfDir(tempProject({ 'a.ts': '1\n' }));
    const s2 = snapshotOfDir(tempProject({ 'a.ts': '1\n', 'b.ts': '2\n' }));
    const s3 = snapshotOfDir(tempProject({ 'a.ts': '1\n', 'b.ts': '2\n', 'c.ts': '3\n' }));
    expect(s1.id).not.toBe(s2.id);
    expect(s2.id).not.toBe(s3.id);
  });

  it('changes id when a path is renamed even with identical bytes', () => {
    const s1 = snapshotOfDir(tempProject({ 'src/a.ts': 'same\n' }));
    const s2 = snapshotOfDir(tempProject({ 'lib/a.ts': 'same\n' }));
    expect(s1.id).not.toBe(s2.id);
  });

  it('records per-file content hashes and sizes', () => {
    const snap = snapshotOfDir(tempProject({ 'a.ts': 'hello world' }));
    expect(snap.files).toEqual([
      { path: 'a.ts', sha256: expect.stringMatching(/^[0-9a-f]{64}$/), bytes: 11 },
    ]);
  });
});

describe('identityFromFiles', () => {
  it('is order-independent: sorted input yields a stable identity', () => {
    const a: SnapshotFile = { path: 'a', sha256: 'x', bytes: 1 };
    const b: SnapshotFile = { path: 'b', sha256: 'y', bytes: 2 };
    expect(identityFromFiles([b, a])).toBe(identityFromFiles([a, b]));
  });
});

describe('canonicalJson', () => {
  it('sorts object keys and is stable across insertion order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
  it('serializes nested arrays and objects deterministically', () => {
    const v = { z: [{ b: 1, a: 2 }], y: 'x' };
    expect(canonicalJson(v)).toBe('{"y":"x","z":[{"a":2,"b":1}]}');
  });
});

describe('snapshotOfProject', () => {
  it('honours the project index (ignores node_modules and .git)', () => {
    const root = tempProject({ 'src/a.ts': '1\n', 'node_modules/x.ts': 'x\n' });
    const project = new Project(root);
    const snap = snapshotOfProject(project, null);
    expect(snap.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('attaches git identity when the tree is a repository', () => {
    const root = tempProject({ 'a.ts': '1\n' });
    const project = new Project(root);
    // Not a git repo — git identity is null.
    expect(snapshotOfProject(project, null).git).toBeNull();
    expect(snapshotOfProject(project, { commit: 'abc123', ref: 'main', repoUrl: 'u' }).git).toEqual(
      {
        commit: 'abc123',
        ref: 'main',
        repoUrl: 'u',
      },
    );
  });
});
