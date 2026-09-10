/**
 * USA — Universal Software Auditor
 * Programmatic API. Everything the CLI does is available here.
 */

export { Project } from './util/project.js';
export { detect, loadDetectors, classifyMaturity, loadDetectorFile } from './detect/index.js';
export {
  loadRulePacks,
  applyRuleOverrides,
  validatePredicate,
  DEFAULT_WEIGHT,
  SEVERITY_LADDER,
} from './engine/loader.js';
export { loadSections, DEFAULT_SECTIONS } from './engine/sections.js';
export { loadProfiles, dampen } from './engine/maturity.js';
export { runAudit } from './engine/audit.js';
export { score } from './engine/score.js';
export { evaluateRule, evalPredicate, ruleApplies, packApplies } from './engine/evaluate.js';
export { renderMarkdown, parseTrailer, trailer } from './report/markdown.js';
export { diffReports } from './engine/diff.js';
export { evaluateGate, blockingFindings } from './engine/gate.js';
export { loadConfig, EXAMPLE_CONFIG, CONFIG_FILE } from './config.js';

export type * from './types.js';
export type { SectionDef } from './engine/sections.js';
export type { MaturityProfile } from './engine/maturity.js';
export type { AuditOutcome, AuditOptions } from './engine/audit.js';
export type { ScoredRule } from './engine/score.js';
export type { EvalContext } from './engine/evaluate.js';
