import path from 'node:path';
import type {
  AuditReport,
  Depth,
  Facts,
  Finding,
  Maturity,
  RulePack,
  UsatConfig,
} from '../types.js';
import { Project } from '../util/project.js';
import { detect, loadDetectorFile } from '../detect/index.js';
import { loadRulePacks, applyRuleOverrides } from './loader.js';
import { evaluateRule, packApplies, ruleApplies, type EvalContext } from './evaluate.js';
import { loadSections } from './sections.js';
import { loadProfiles, dampen, type MaturityProfile } from './maturity.js';
import { loadConfig } from '../config.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** `rules/`, resolved relative to the installed package (works from src and dist). */
const DEFAULT_RULES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'rules',
);

/** Version of this build, read from package.json so it never drifts. */
const DEFAULT_VERSION = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'),
        'utf8',
      ),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
import { score, type ScoredRule } from './score.js';

export interface AuditOptions {
  target: string;
  rulesDir?: string;
  depth?: Depth;
  profile?: Maturity | 'auto';
  config?: UsatConfig;
  allowCommands?: boolean;
  usatVersion?: string;
  /** Force these pack ids on/off regardless of detection. */
  includePacks?: string[];
  excludePacks?: string[];
}

export interface AuditOutcome {
  report: AuditReport;
  warnings: string[];
  profile: MaturityProfile;
}

export function runAudit(options: AuditOptions): AuditOutcome {
  // The programmatic entry point must be usable with nothing but a target, so
  // every knob the CLI exposes gets a sane default here rather than a crash.
  const config = options.config ?? loadConfig(options.target);
  const opts = normalizeAuditOptions(options, config);
  const warnings: string[] = [];
  const project = new Project(opts.target, config.ignore ?? []);
  const git = project.gitInfo();
  const detectors = loadDetectorFile(opts.rulesDir);
  const detection = detect(project, detectors, git, config.facts ?? []);

  const { packs, warnings: packWarnings } = loadRulePacks(opts.rulesDir);
  warnings.push(...packWarnings);

  const { disabled, overrides } = collectRuleSettings(config);
  applyRuleOverrides(packs, overrides);

  const suppressions = buildSuppressions(config);
  const { include, exclude } = resolvePackSets(options, config);

  // A pack may assert extra facts simply by applying (e.g. "we are a monorepo").
  const facts: Facts = detection.facts;
  const selection = selectInitialPacks(packs, facts, include, exclude);

  // Packs can contribute facts, which can make another pack apply. Resolve to a
  // fixed point (bounded, so a malformed pack cannot hang the audit).
  resolvePackFacts(packs, facts, include, exclude, selection);

  const sections = loadSections(opts.rulesDir);
  const profiles = loadProfiles(opts.rulesDir);
  const forcedProfile = opts.profile !== 'auto' ? opts.profile : null;
  const maturity: Maturity = forcedProfile ?? detection.maturity;
  const profile = profiles[maturity];

  const ctx: EvalContext = {
    project,
    facts,
    depth: opts.depth,
    allowCommands: opts.allowCommands,
    disabled,
    suppressions,
  };

  const evaluated = evaluatePacks(selection.activePacks, facts, opts.depth, include, ctx, profile);
  const card = score(evaluated, sections, profile);
  const report = buildReport(
    opts,
    git,
    detection,
    facts,
    maturity,
    card,
    evaluated,
    selection.packsLoaded,
    selection.packsSkipped,
  );

  return { report, warnings, profile };
}

function normalizeAuditOptions(options: AuditOptions, config: UsatConfig) {
  return {
    rulesDir: options.rulesDir ?? DEFAULT_RULES_DIR,
    depth: options.depth ?? ('standard' as Depth),
    profile: options.profile ?? ('auto' as Maturity | 'auto'),
    allowCommands: options.allowCommands ?? false,
    usatVersion: options.usatVersion ?? DEFAULT_VERSION,
    target: options.target,
    config,
  };
}

function buildSuppressions(config: UsatConfig): Map<string, string> {
  return new Map((config.suppressions ?? []).map((s) => [s.rule, s.reason]));
}

function resolvePackSets(
  options: AuditOptions,
  config: UsatConfig,
): { include: Set<string>; exclude: Set<string> } {
  return {
    include: new Set(options.includePacks ?? config.include ?? []),
    exclude: new Set(options.excludePacks ?? config.exclude ?? []),
  };
}

type RuleOverride = { severity?: Finding['severity']; weight?: number };

function collectRuleSettings(config: UsatConfig): {
  disabled: Set<string>;
  overrides: Record<string, RuleOverride>;
} {
  const disabled = new Set<string>();
  const overrides: Record<string, RuleOverride> = {};
  for (const [id, o] of Object.entries(config.rules ?? {})) {
    if (o.disabled) disabled.add(id);
    if (o.severity || typeof o.weight === 'number') {
      overrides[id] = { severity: o.severity, weight: o.weight };
    }
  }
  return { disabled, overrides };
}

interface PackSelection {
  activePacks: RulePack[];
  packsLoaded: string[];
  packsSkipped: string[];
}

function selectInitialPacks(
  packs: RulePack[],
  facts: Facts,
  include: Set<string>,
  exclude: Set<string>,
): PackSelection {
  const selection: PackSelection = { activePacks: [], packsLoaded: [], packsSkipped: [] };
  selection.activePacks = packs.filter((p) => selectPack(p, facts, include, exclude, selection));
  return selection;
}

function selectPack(
  pack: RulePack,
  facts: Facts,
  include: Set<string>,
  exclude: Set<string>,
  selection: PackSelection,
): boolean {
  if (exclude.has(pack.id)) {
    selection.packsSkipped.push(pack.id);
    return false;
  }
  if (include.has(pack.id)) {
    selection.packsLoaded.push(pack.id);
    pack.provides?.forEach((f) => facts.flags.add(f));
    return true;
  }
  if (!packApplies(pack, facts)) {
    selection.packsSkipped.push(pack.id);
    return false;
  }
  selection.packsLoaded.push(pack.id);
  pack.provides?.forEach((f) => facts.flags.add(f));
  return true;
}

function resolvePackFacts(
  packs: RulePack[],
  facts: Facts,
  include: Set<string>,
  exclude: Set<string>,
  selection: PackSelection,
): void {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const p of packs) {
      if (selection.packsLoaded.includes(p.id) || exclude.has(p.id) || include.has(p.id)) continue;
      if (!packApplies(p, facts)) continue;
      selection.packsLoaded.push(p.id);
      p.provides?.forEach((f) => facts.flags.add(f));
      selection.activePacks.push(p);
      changed = true;
    }
    if (!changed) break;
  }
}

function evaluatePacks(
  activePacks: RulePack[],
  facts: Facts,
  depth: Depth,
  include: Set<string>,
  ctx: EvalContext,
  profile: MaturityProfile,
): ScoredRule[] {
  const evaluated: ScoredRule[] = [];
  for (const pack of activePacks) {
    for (const rule of pack.rules) {
      if (!ruleApplies(rule, facts, depth, include.has(pack.id))) continue;
      evaluated.push(scoreFinding(rule, ctx, profile));
    }
  }
  return evaluated;
}

function scoreFinding(
  rule: RulePack['rules'][number],
  ctx: EvalContext,
  profile: MaturityProfile,
): ScoredRule {
  const finding = evaluateRule(rule, ctx);
  if (finding.status === 'PASS' || finding.status === 'NOT_APPLICABLE') {
    return { rule, finding };
  }
  const { severity, dampened } = dampen(rule.severity, rule.ruleClass, profile);
  finding.severity = severity;
  finding.dampened = dampened;
  return { rule, finding };
}

function buildReport(
  opts: {
    target: string;
    depth: Depth;
    profile: Maturity | 'auto';
    rulesDir: string;
    usatVersion: string;
  },
  git: ReturnType<Project['gitInfo']>,
  detection: ReturnType<typeof detect>,
  facts: Facts,
  maturity: Maturity,
  card: AuditReport['score'],
  evaluated: ScoredRule[],
  packsLoaded: string[],
  packsSkipped: string[],
): AuditReport {
  return {
    schema: 'usat-report-v1',
    generatedAt: new Date().toISOString(),
    usatVersion: opts.usatVersion,
    target: {
      path: path.resolve(opts.target),
      name: path.basename(path.resolve(opts.target)) || opts.target,
      commit: git.commit,
      ref: git.ref,
      repoUrl: git.repoUrl,
    },
    detection: {
      maturity,
      maturitySignals: detection.maturitySignals,
      projectTypes: pick(facts, 'project'),
      platforms: pick(facts, 'platform'),
      languages: pick(facts, 'lang'),
      frameworks: pick(facts, 'fw'),
      packageManagers: pick(facts, 'pm'),
      databases: pick(facts, 'db'),
      flags: [...facts.flags].filter((f) => f.startsWith('has:')).sort(),
      metrics: facts.metrics,
    },
    options: {
      depth: opts.depth,
      profile: opts.profile,
      rulesDir: opts.rulesDir,
      packsLoaded,
      packsSkipped,
    },
    score: card,
    findings: evaluated
      .map((e) => e.finding)
      .filter((f) => f.status !== 'NOT_APPLICABLE')
      .sort(bySeverityThenSection),
  };
}

function pick(facts: Facts, prefix: string): string[] {
  const out: string[] = [];
  for (const f of facts.flags) {
    if (f.startsWith(`${prefix}:`)) out.push(f.slice(prefix.length + 1));
  }
  return out.sort();
}

const ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, FUTURE: 4 };

function bySeverityThenSection(a: Finding, b: Finding): number {
  const sa = ORDER[a.severity] ?? 9;
  const sb = ORDER[b.severity] ?? 9;
  if (sa !== sb) return sa - sb;
  if (a.section !== b.section)
    return a.section.localeCompare(b.section, undefined, { numeric: true });
  return a.ruleId.localeCompare(b.ruleId);
}
