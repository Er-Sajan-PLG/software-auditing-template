import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Check } from '../src/types.js';
import { Project } from '../src/util/project.js';
import { evaluateRule } from '../src/engine/evaluate.js';
import { detect, loadDetectorFile } from '../src/detect/index.js';

const RULES_DIR = path.resolve(process.cwd(), 'rules');

export function makeProject(files: Record<string, string>): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-eval-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** Evaluates a single ad-hoc check against a fixture. */
export function evaluateAt(
  root: string,
  check: Check,
  opts: { allowCommands?: boolean } = {},
): { status: string; message: string; locations: { file: string; line?: number }[] } {
  const project = new Project(root);
  const git = project.gitInfo();
  const { facts } = detect(project, loadDetectorFile(RULES_DIR), git, []);
  const finding = evaluateRule(
    {
      id: 'TEST-000',
      title: 'ad hoc',
      section: 'S0',
      severity: 'MEDIUM',
      ruleClass: 'correctness',
      check,
    },
    {
      project,
      facts,
      depth: 'standard',
      allowCommands: opts.allowCommands ?? false,
      disabled: new Set(),
      suppressions: new Map(),
    },
  );
  return { status: finding.status, message: finding.message, locations: finding.locations };
}
