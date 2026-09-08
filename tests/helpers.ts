import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Project } from '../src/util/project.js';
import { loadDetectorFile, detect } from '../src/detect/index.js';
import { loadRulePacks } from '../src/engine/loader.js';
import { runAudit } from '../src/engine/audit.js';
import type { Facts, UsatConfig } from '../src/types.js';

const RULES_DIR = path.resolve(process.cwd(), 'rules');

/** Creates a throwaway project on disk and returns { root, write }. */
export function makeProject(files: Record<string, string>): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usat-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** A project index rooted at a fixture, no config. */
export function projectAt(root: string, ignore: string[] = []): Project {
  return new Project(root, ignore);
}

export function detectAt(root: string, extraFacts: string[] = []) {
  const project = new Project(root);
  return detect(project, loadDetectorFile(RULES_DIR), project.gitInfo(), extraFacts);
}

export function auditAt(
  root: string,
  opts: Partial<{
    depth: 'quick' | 'standard' | 'deep';
    profile: 'auto' | 'prototype' | 'mvp' | 'beta' | 'production' | 'legacy';
    config: UsatConfig;
    allowCommands: boolean;
    include: string[];
    exclude: string[];
  }> = {},
) {
  return runAudit({
    target: root,
    rulesDir: RULES_DIR,
    depth: opts.depth ?? 'standard',
    profile: opts.profile ?? 'auto',
    config: opts.config ?? { version: 1 },
    allowCommands: opts.allowCommands ?? false,
    usatVersion: 'test',
    includePacks: opts.include,
    excludePacks: opts.exclude,
  });
}

export function emptyFacts(): Facts {
  return { flags: new Set<string>(), metrics: {} };
}

export { RULES_DIR };

export function loadedPacks() {
  return loadRulePacks(RULES_DIR);
}
