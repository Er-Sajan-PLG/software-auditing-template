import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main, isEntryPoint } from '../src/cli.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function run(argv: string[]): { code: number; out: string; err: string } {
  const logs: string[] = [];
  const errs: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errs.push(a.join(' '));
  });
  const code = main(argv);
  return { code, out: logs.join('\n'), err: errs.join('\n') };
}

describe('global flags', () => {
  // Regression: the arg parser files `--help` under flags (never `_`), so
  // the old dispatch fell through to the default `audit` command and
  // audited the tree instead of printing help.
  it('--help prints usage and does not audit', () => {
    const r = run(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('usa audit [path]');
  });

  it('--version prints the version and does not audit', () => {
    const r = run(['--version']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/usa \d+\.\d+\.\d+/);
  });

  it('positional help/version still work', () => {
    expect(run(['help']).code).toBe(0);
    expect(run(['version']).out).toMatch(/usa \d+\.\d+\.\d+/);
    expect(run(['-h']).code).toBe(0);
  });

  it('unknown commands still exit 2', () => {
    const r = run(['frobnicate']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown command');
  });

  it('rejects non-positive --max-files/--max-bytes', () => {
    const badFiles = run(['audit', '.', '--max-files', 'abc']);
    expect(badFiles.code).toBe(2);
    expect(badFiles.err).toContain('--max-files must be a positive number');
    const badBytes = run(['audit', '.', '--max-bytes', '0']);
    expect(badBytes.code).toBe(2);
    expect(badBytes.err).toContain('--max-bytes must be a positive number');
  });

  describe('entry-point guard (npm bin symlink regression)', () => {
    // Regression: npm installs the `usa` bin as a symlink to dist/cli.js.
    // process.argv[1] is then the symlink path while import.meta.url is the
    // real path, so a naive `file://${argv[1]}` comparison never matches and
    // the installed CLI exited 0 without doing anything.
    it('recognises the entry point through a symlink', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-bin-'));
      try {
        const real = path.join(dir, 'cli.js');
        fs.writeFileSync(real, '// stub\n');
        const link = path.join(dir, 'usa');
        fs.symlinkSync(real, link);
        const thisUrl = pathToFileURL(real).href;

        expect(isEntryPoint(link, thisUrl)).toBe(true);
        expect(isEntryPoint(real, thisUrl)).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects a different file, a missing file, and an undefined argv', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-bin-'));
      try {
        const real = path.join(dir, 'cli.js');
        fs.writeFileSync(real, '// stub\n');
        const other = path.join(dir, 'other.js');
        fs.writeFileSync(other, '// other\n');
        const thisUrl = pathToFileURL(real).href;

        expect(isEntryPoint(other, thisUrl)).toBe(false);
        expect(isEntryPoint(path.join(dir, 'missing.js'), thisUrl)).toBe(false);
        expect(isEntryPoint(undefined, thisUrl)).toBe(false);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
