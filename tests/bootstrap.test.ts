import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from './helpers.js';
import { detectAt } from './helpers.js';
import { bootstrapPacks } from '../src/bootstrap/index.js';
import { loadRulePacks } from '../src/engine/loader.js';
import { BOOTSTRAP_CATALOG } from '../src/bootstrap/catalog.js';

const cleanups: (() => void)[] = [];
const build = (files: Record<string, string>) => {
  const p = makeProject(files);
  cleanups.push(p.cleanup);
  return p.root;
};
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tmpDir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-bootstrap-'));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

describe('usa bootstrap', () => {
  it('treats graduated swift as covered, not generated', () => {
    const root = build({
      'Package.swift': '// swift-tools-version: 5.9\nimport PackageDescription\n',
      'Sources/App/App.swift': 'print("hi")\n',
    });
    const outcome = bootstrapPacks(detectAt(root).facts);
    expect(outcome.coveredLangs).toContain('swift');
    expect(outcome.packs.map((p) => p.packId)).not.toContain('stacks/swift');
  });

  it('generates a php pack for a php project', () => {
    const root = build({
      'composer.json': JSON.stringify({ name: 't/t', require: { php: '>=8.0' } }),
      'index.php': '<?php\neval($_GET["c"]);\n',
    });
    const outcome = bootstrapPacks(detectAt(root).facts);
    expect(outcome.coveredLangs).not.toContain('php');
    expect(outcome.generatedLangs).toContain('php');
    expect(outcome.packs.map((p) => p.packId)).toContain('stacks/php');
    const php = outcome.packs.find((p) => p.packId === 'stacks/php')!;
    expect(php.yaml).toContain('REVIEW REQUIRED');
    expect(php.yaml).toContain('PHP-001');
  });

  it('reports covered stacks as needing nothing', () => {
    const root = build({
      'package.json': JSON.stringify({ name: 't' }),
      'index.ts': 'export const a = 1;\n',
    });
    const outcome = bootstrapPacks(detectAt(root).facts);
    expect(outcome.packs).toEqual([]);
    expect(outcome.coveredLangs).toContain('typescript');
  });

  it('falls back to judgement prompts for unknown languages', () => {
    const root = build({ 'Main.hs': 'main = putStrLn "hi"\n' });
    const outcome = bootstrapPacks(detectAt(root).facts);
    expect(outcome.fallbackLangs).toContain('haskell');
    const pack = outcome.packs.find((p) => p.packId === 'stacks/haskell')!;
    expect(pack.yaml).toContain('kind: manual');
  });

  it('every generated pack loads with zero warnings', () => {
    const root = build({
      'composer.json': JSON.stringify({ name: 't/t' }),
      'index.php': '<?php echo "hi";\n',
      'app.rb': 'puts "hi"\n',
      'main.c': 'int main(void) { return 0; }\n',
      'App.cs': 'class App {}\n',
      'App.swift': 'print("hi")\n',
    });
    const outcome = bootstrapPacks(detectAt(root).facts);
    // swift graduated to a shipped pack — it must never be proposed again.
    expect(outcome.generatedLangs.sort()).toEqual(['cpp', 'csharp', 'php', 'ruby']);
    const { dir, cleanup } = tmpDir();
    try {
      const index: string[] = [];
      for (const pack of outcome.packs) {
        const file = path.join(dir, path.basename(pack.filename));
        fs.writeFileSync(file, pack.yaml, 'utf8');
        index.push(path.basename(pack.filename));
      }
      fs.writeFileSync(
        path.join(dir, 'index.yaml'),
        `schema: usa-rules-index-v1\npacks:\n${index.map((f) => `  - ${f}`).join('\n')}\n`,
        'utf8',
      );
      const { packs, warnings } = loadRulePacks(dir);
      expect(warnings).toEqual([]);
      expect(packs.length).toBe(outcome.packs.length);
    } finally {
      cleanup();
    }
  });

  it('generated rule ids do not collide with shipped ids', async () => {
    const { loadedPacks } = await import('./helpers.js');
    const shipped = new Set<string>();
    for (const pack of loadedPacks().packs) {
      for (const rule of pack.rules) shipped.add(rule.id);
    }
    for (const entry of BOOTSTRAP_CATALOG) {
      for (const check of entry.checks) {
        expect(shipped.has(check.id)).toBe(false);
      }
    }
  });
});
