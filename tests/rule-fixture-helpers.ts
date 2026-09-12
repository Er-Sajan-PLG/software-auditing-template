import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { parse } from 'yaml';
import type { Rule, Check } from '../src/types.js';
import { loadRulePacks } from '../src/engine/loader.js';
import { Project } from '../src/util/project.js';
import { evaluateRule } from '../src/engine/evaluate.js';
import { detect, loadDetectorFile } from '../src/detect/index.js';

export const RULES_DIR = path.resolve(process.cwd(), 'rules');
export const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures/rules');

/**
 * Fixture file contract (see docs/adr/0017-per-rule-fixtures.md):
 *
 *   rule: SEC-001            # must match the rule id in the packs
 *   positive:                # optional block; the case(s) the rule must flag
 *     files: { <relpath>: <content> }
 *     expect: WRONG          # status the rule must return (default: any non-PASS)
 *   negative:                # optional block; the case(s) the rule must pass
 *     files: { <relpath>: <content> }
 *
 * `manual` rules cannot be fixture-tested — a human decides them — so they are
 * exempt from the coverage gate.
 */
export interface FixtureCase {
  files: Record<string, string>;
  expect?: string;
}

export interface RuleFixture {
  rule: string;
  positive?: FixtureCase;
  negative?: FixtureCase;
}

/** Every rule in every pack, keyed by id. Throws on duplicate ids. */
export function allRules(): Map<string, Rule> {
  const { packs } = loadRulePacks(RULES_DIR);
  const byId = new Map<string, Rule>();
  for (const pack of packs) {
    for (const rule of pack.rules ?? []) {
      byId.set(rule.id, rule);
    }
  }
  return byId;
}

/** Rule ids that a fixture can honestly cover (deterministic kinds only). */
export function automatableRules(): Rule[] {
  return [...allRules().values()].filter((r) => r.check.kind !== 'manual');
}

/** Reads every fixture file in tests/fixtures/rules, sorted by filename. */
export function loadFixtures(): { file: string; fixture: RuleFixture }[] {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map((f) => ({
      file: f,
      fixture: parse(fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf8')) as RuleFixture,
    }));
}

/** Materialises a fixture case on disk and evaluates the rule's check. */
export function evaluateFixture(
  check: Check,
  c: FixtureCase,
): { status: string; message: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-fixture-'));
  for (const [rel, content] of Object.entries(c.files ?? {})) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  const project = new Project(root);
  const git = project.gitInfo();
  const { facts } = detect(project, loadDetectorFile(RULES_DIR), git, []);
  const finding = evaluateRule(
    {
      id: 'FIXTURE-000',
      title: 'fixture',
      section: 'S0',
      severity: 'MEDIUM',
      ruleClass: 'correctness',
      check,
    },
    {
      project,
      facts,
      depth: 'standard',
      allowCommands: false,
      disabled: new Set(),
      suppressions: new Map(),
    },
  );
  return {
    status: finding.status,
    message: finding.message,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
