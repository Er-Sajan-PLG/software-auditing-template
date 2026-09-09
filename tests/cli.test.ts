import { describe, it, expect, vi, afterEach } from 'vitest';
import { main } from '../src/cli.js';

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
    expect(r.out).toContain('usat audit [path]');
  });

  it('--version prints the version and does not audit', () => {
    const r = run(['--version']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/usat \d+\.\d+\.\d+/);
  });

  it('positional help/version still work', () => {
    expect(run(['help']).code).toBe(0);
    expect(run(['version']).out).toMatch(/usat \d+\.\d+\.\d+/);
    expect(run(['-h']).code).toBe(0);
  });

  it('unknown commands still exit 2', () => {
    const r = run(['frobnicate']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown command');
  });
});
