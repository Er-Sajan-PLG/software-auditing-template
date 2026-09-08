import path from 'node:path';
import type { AuditReport, Depth, Facts, Finding, Maturity, UsatConfig } from '../types.js';
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
  const opts = {
    rulesDir: options.rulesDir ?? DEFAULT_RULES_DIR,
    depth: options.depth ?? ('standard' as Depth),
    profile: options.profile ?? ('auto' as Maturity | 'auto'),
    allowCommands: options.allowCommands ?? false,
    usatVersion: options.usatVersion ?? DEFAULT_VERSION,
    target: options.target,
    config,
  };
  const warnings: string[] = [];
  const project = new Project(opts.target, config.ignore ?? []);
  const git = project.gitInfo();
  const detectors = loadDetectorFile(opts.rulesDir);
  const detection = detect(project, detectors, git, config.facts ?? []);

  const { packs, warnings: packWarnings } = loadRulePacks(opts.rulesDir);
  warnings.push(...packWarnings);

  const overrides: Record<string, { severity?: Finding['severity']; weight?: number }> = {};
  const disabled = new Set<string>();
  for (const [id, o] of Object.entries(config.rules ?? {})) {
    if (o.disabled) disabled.add(id);
    if (o.severity || typeof o.weight === 'number') {
      overrides[id] = { severity: o.severity, weight: o.weight };
    }
  }
  applyRuleOverrides(packs, overrides);

  const suppressions = new Map<string, string>(
    (config.suppressions ?? []).map((s) => [s.rule, s.reason]),
  );

  const include = new Set(options.includePacks ?? config.include ?? []);
  const exclude = new Set(options.excludePacks ?? config.exclude ?? []);

  // A pack may assert extra facts simply by applying (e.g. "we are a monorepo").
  const facts: Facts = detection.facts;
  const packsLoaded: string[] = [];
  const packsSkipped: string[] = [];

  const activePacks = packs.filter((p) => {
    if (exclude.has(p.id)) {
      packsSkipped.push(p.id);
      return false;
    }
    if (include.has(p.id)) {
      packsLoaded.push(p.id);
      p.provides?.forEach((f) => facts.flags.add(f));
      return true;
    }
    if (!packApplies(p, facts)) {
      packsSkipped.push(p.id);
      return false;
    }
    packsLoaded.push(p.id);
    p.provides?.forEach((f) => facts.flags.add(f));
    return true;
  });

  // Packs can contribute facts, which can make another pack apply. Resolve to a
  // fixed point (bounded, so a malformed pack cannot hang the audit).
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const p of packs) {
      if (packsLoaded.includes(p.id) || exclude.has(p.id) || include.has(p.id)) continue;
      if (!packApplies(p, facts)) continue;
      packsLoaded.push(p.id);
      p.provides?.forEach((f) => facts.flags.add(f));
      activePacks.push(p);
      changed = true;
    }
    if (!changed) break;
  }

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

  const evaluated: ScoredRule[] = [];
  for (const pack of activePacks) {
    for (const rule of pack.rules) {
      if (!ruleApplies(rule, facts, opts.depth, include.has(pack.id))) continue;
      const finding = evaluateRule(rule, ctx);
      if (finding.status === 'PASS' || finding.status === 'NOT_APPLICABLE') {
        evaluated.push({ rule, finding });
        continue;
      }
      const { severity, dampened } = dampen(rule.severity, rule.ruleClass, profile);
      finding.severity = severity;
      finding.dampened = dampened;
      evaluated.push({ rule, finding });
    }
  }

  const card = score(evaluated, sections, profile);

  const report: AuditReport = {
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

  return { report, warnings, profile };
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
