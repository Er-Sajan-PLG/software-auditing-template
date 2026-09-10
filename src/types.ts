/**
 * USA — Universal Software Auditor
 * Core type definitions.
 *
 * Design note: USA deliberately separates two orthogonal axes that most audit
 * checklists conflate:
 *
 *   SEVERITY  = how bad it is *if this rule is violated* (impact).
 *   STATUS    = what the audit actually observed (outcome).
 *
 * The emoji tags in USA.md map onto these two axes (see `TAG_TABLE`) so the
 * report still reads like a classic severity-tagged audit while the underlying
 * model stays machine-checkable and scoreable.
 */

/* ------------------------------------------------------------------ axes -- */

/** Impact axis — attached to a rule, meaning "severity when violated". */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'FUTURE';

/** Outcome axis — what the engine or the agent observed. */
export type Status =
  | 'PASS' // ✅ GOOD        — verified present and correct
  | 'FAIL' // 🔴/🟠/🟡/🟢/🔵 — required condition violated
  | 'WRONG' // ⚠️ WRONG      — present but implemented incorrectly
  | 'MISSING' // 🚫 MISSING  — required condition absent
  | 'DEPRECATED' // 💀       — present but EOL / abandoned
  | 'EXPERIMENTAL' // 🧪     — present but unstable or unvalidated
  | 'UNKNOWN' // ❓ REVIEW   — judgement required, no evidence recorded
  | 'NOT_APPLICABLE'; // ➖  — skipped for this project

/** Why a rule exists — used by maturity profiles to decide what may be relaxed. */
export type RuleClass =
  | 'security'
  | 'supply-chain'
  | 'correctness'
  | 'maintainability'
  | 'operations'
  | 'performance'
  | 'compliance'
  | 'documentation'
  | 'style';

/** How thorough the audit should be. */
export type Depth = 'quick' | 'standard' | 'deep';

/** Lifecycle stage — drives maturity-aware severity dampening. */
export type Maturity = 'prototype' | 'mvp' | 'beta' | 'production' | 'legacy';

/* --------------------------------------------------------------- findings -- */

export interface Location {
  file: string;
  line?: number;
  excerpt?: string;
}

export interface Finding {
  ruleId: string;
  title: string;
  section: string;
  sectionTitle: string;
  /** Severity after the maturity profile has been applied. */
  severity: Severity;
  /** Severity declared by the rule pack, before dampening. */
  baseSeverity: Severity;
  status: Status;
  ruleClass: RuleClass;
  /** True when the finding was downgraded by the maturity profile. */
  dampened: boolean;
  message: string;
  locations: Location[];
  /** Why the rule exists — surfaces in the judgement queue. */
  why?: string;
  /** What the agent/human must produce to resolve a judgement call. */
  evidenceHint?: string;
  remediation?: string;
  references?: string[];
  /** Set when a project-level suppression (`nack:`) hid this finding. */
  suppressedReason?: string;
}

/* ------------------------------------------------------------------ rules -- */

export type Predicate =
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate }
  | { fact: string; op?: FactOp; value?: string | number | string[] };

export type FactOp =
  'exists' | 'absent' | 'eq' | 'neq' | 'in' | 'includes' | 'gt' | 'lt' | 'matches';

export type Check =
  | { kind: 'manual' }
  /** PASS when at least one of `files` exists. */
  | { kind: 'file_exists'; files: string[] }
  /** PASS when none of `files` exist (fail → MISSING/FAIL). */
  | { kind: 'file_absent'; files: string[] }
  /** PASS when at least one file matches `patterns`. */
  | { kind: 'any_file'; patterns: string[] }
  /** PASS when `pattern` is found in the scanned files. */
  | { kind: 'grep_present'; pattern: string; include: string[]; exclude?: string[]; flags?: string }
  /** PASS when `pattern` is NOT found. Any hit is a FAIL with a location. */
  | { kind: 'grep_absent'; pattern: string; include: string[]; exclude?: string[]; flags?: string }
  /** Any hit is ⚠️ WRONG — present but implemented incorrectly. */
  | { kind: 'grep_wrong'; pattern: string; include: string[]; exclude?: string[]; flags?: string }
  /** Any hit is 💀 DEPRECATED — present but EOL / abandoned. */
  | {
      kind: 'grep_deprecated';
      pattern: string;
      include: string[];
      exclude?: string[];
      flags?: string;
    }
  /** PASS when `path` resolves in the JSON file (`equals` optional). */
  | { kind: 'json_path'; file: string; path: string; equals?: string | number | boolean }
  /** PASS when at least one file matching `patterns` is TRACKED by git. */
  | { kind: 'tracked_present'; patterns: string[] }
  /** PASS when NO file matching `patterns` is tracked by git (committed junk). */
  | { kind: 'tracked_absent'; patterns: string[] }
  /** PASS when the number of distinct files matching `patterns` >= `min`. */
  | { kind: 'count_min'; patterns: string[]; min: number }
  /** PASS when no indexed file matching `patterns` exceeds `max_lines`. */
  | { kind: 'file_lines_max'; patterns: string[]; max_lines: number }
  /** PASS when the command exits with `expect_exit` (default 0). Opt-in. */
  | { kind: 'command'; run: string; expect_exit?: number }
  /** Never evaluated — informational context for the reader/agent. */
  | { kind: 'info' };

export interface Rule {
  id: string;
  title: string;
  section: string;
  sectionTitle?: string;
  severity: Severity;
  weight?: number;
  ruleClass: RuleClass;
  appliesWhen?: Predicate;
  /** Depths at which the rule participates. Omit = always. */
  depths?: Depth[];
  check: Check;
  /** Why this rule matters — keeps agents from cargo-culting. */
  why?: string;
  /** Required proof. Mandatory for `manual` checks (RULE 4). */
  evidence?: string;
  remediation?: string;
  references?: string[];
  tags?: string[];
}

export interface RulePack {
  id: string;
  title: string;
  description?: string;
  version?: string;
  /** Section id this pack primarily contributes to. */
  section?: string;
  sectionTitle?: string;
  /** Facts that, if present, cause the whole pack to be skipped. */
  skipWhen?: Predicate;
  /** Extra facts this pack contributes simply by being loaded. */
  provides?: string[];
  rules: Rule[];
  source?: string;
}

/* ------------------------------------------------------------------ facts -- */

export interface Facts {
  /** Set membership facts, e.g. `lang:typescript`, `has:ci`, `maturity:beta`. */
  flags: Set<string>;
  /** Numeric facts, e.g. `commits`, `contributors`, `loc`, `daysSinceCommit`. */
  metrics: Record<string, number>;
}

/* ----------------------------------------------------------------- config -- */

export interface Suppression {
  rule: string;
  reason: string;
  until?: string;
}

export interface UsaConfig {
  version: 1;
  /** Override auto-detection: force a maturity stage. */
  maturity?: Maturity;
  /** Rule pack ids to always load, even if `appliesWhen` says no. */
  include?: string[];
  /** Rule pack ids to never load. */
  exclude?: string[];
  /** Per-rule overrides: severity, weight, or full suppression. */
  rules?: Record<
    string,
    { severity?: Severity; weight?: number; disabled?: boolean; reason?: string }
  >;
  /** Suppressed findings — must carry a reason (auditable). */
  suppressions?: Suppression[];
  /** Extra globs to ignore while indexing. */
  ignore?: string[];
  /** Extra facts asserted by the operator. */
  facts?: string[];
  /** Restrict the report to these sections. */
  sections?: string[];
  /** Indexing caps for bigger-than-comfortable trees (validated, else defaults). */
  limits?: { max_files?: number; max_bytes?: number };
}

/* ------------------------------------------------------------------ score -- */

export interface SectionScore {
  id: string;
  title: string;
  /** null when no rule in the section could be resolved automatically. */
  score: number | null; // 0..10
  weight: number;
  applicable: number;
  resolved: number;
  passed: number;
  failed: number;
  unknown: number;
  /** resolved / applicable — how much of this section the tool could verify. */
  confidence: number;
}

export interface ScoreCard {
  overall: number; // 0..100
  sections: SectionScore[];
  counts: Record<Status, number>;
  severityCounts: Record<Severity, number>;
  /** Share of applicable rules the engine could verify without a human. */
  automationCoverage: number;
  /** Expected score band for the detected maturity stage. */
  expectedBand: [number, number];
}

export interface AuditReport {
  schema: 'usa-report-v1';
  generatedAt: string;
  usaVersion: string;
  target: {
    path: string;
    name: string;
    commit?: string;
    ref?: string;
    repoUrl?: string;
  };
  detection: {
    maturity: Maturity;
    maturitySignals: string[];
    projectTypes: string[];
    platforms: string[];
    languages: string[];
    frameworks: string[];
    packageManagers: string[];
    databases: string[];
    flags: string[];
    metrics: Record<string, number>;
  };
  options: {
    depth: Depth;
    profile: Maturity | 'auto';
    rulesDir: string;
    packsLoaded: string[];
    packsSkipped: string[];
  };
  score: ScoreCard;
  findings: Finding[];
}
