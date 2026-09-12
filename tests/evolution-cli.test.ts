import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from './helpers.js';
import { loadPackFile } from '../src/engine/loader.js';
import { main } from '../src/cli.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const LUA_PACK = `id: stacks/lua
title: Lua
version: '0.1.0'
skip_when:
  all:
    - fact: lang:lua
      op: absent
rules:
  - id: LUA-001
    title: No dynamic code or shell execution
    section: S15
    severity: HIGH
    class: security
    check:
      kind: grep_wrong
      pattern: '(os\\.execute|loadstring|load)\\s*\\('
      include: ['**/*.lua']
    why: os.execute runs a shell from user input.
    remediation: Restrict dynamic code to allow-listed inputs.
`;

function tmpdir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-cli-evo-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function benchCase(id: string, kind: string, lua: string, status: string): string {
  return JSON.stringify({
    id,
    kind,
    description: kind,
    fixture: { 'app.lua': lua },
    expected: [{ ruleId: 'LUA-001', status }],
  });
}

describe('loadPackFile', () => {
  it('parses a standalone candidate pack without an index', () => {
    const dir = tmpdir();
    const file = path.join(dir, 'lua.yaml');
    fs.writeFileSync(file, LUA_PACK, 'utf8');
    const { pack, warnings } = loadPackFile(file);
    expect(pack).not.toBeNull();
    expect(pack!.id).toBe('stacks/lua');
    expect(pack!.rules).toHaveLength(1);
    expect(warnings).toEqual([]);
  });
});

describe('usa evolve CLI', () => {
  it('runs the full loop and accepts a correct candidate', () => {
    const target = makeProject({ 'app.lua': 'local r = os.execute("rm " .. p)\n' }).root;
    cleanups.push(() => fs.rmSync(target, { recursive: true, force: true }));

    const dir = tmpdir();
    const packFile = path.join(dir, 'lua.yaml');
    fs.writeFileSync(packFile, LUA_PACK, 'utf8');

    const benchDir = path.join(dir, 'bench');
    fs.mkdirSync(benchDir);
    fs.writeFileSync(
      path.join(benchDir, 'positive.json'),
      benchCase('p', 'known-positive', 'os.execute("x")\n', 'WRONG'),
    );
    fs.writeFileSync(
      path.join(benchDir, 'negative.json'),
      benchCase('n', 'known-negative', 'print("hi")\n', 'PASS'),
    );

    const storeDir = path.join(dir, 'store');
    const exit = main([
      'evolve',
      target,
      '--candidate',
      packFile,
      '--bench-dir',
      benchDir,
      '--store',
      storeDir,
    ]);

    expect(exit).toBe(0);
    // The store persisted audit/result records.
    expect(fs.existsSync(path.join(storeDir, 'objects'))).toBe(true);
    expect(fs.readdirSync(path.join(storeDir, 'objects')).length).toBeGreaterThan(0);
  });

  it('prints the BEFORE half when no candidate is supplied', () => {
    const target = makeProject({ 'app.lua': 'print("hi")\n' }).root;
    cleanups.push(() => fs.rmSync(target, { recursive: true, force: true }));
    expect(main(['evolve', target])).toBe(0);
  });

  it('exits 2 for a missing target', () => {
    expect(main(['evolve', '/nonexistent/path/xyz'])).toBe(2);
  });

  it('auto-proposes a candidate from gaps with --propose', () => {
    const target = makeProject({ 'app.lua': 'local r = os.execute("rm " .. p)\n' }).root;
    cleanups.push(() => fs.rmSync(target, { recursive: true, force: true }));
    expect(main(['evolve', target, '--propose'])).toBe(0);
  });
});
