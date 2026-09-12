/**
 * USA — Universal Software Auditor
 * Programmatic API. Everything the CLI does is available here.
 */

export { Project } from './util/project.js';
export { detect, loadDetectors, classifyMaturity, loadDetectorFile } from './detect/index.js';
export {
  loadRulePacks,
  loadPackFile,
  parsePackText,
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

// Evolution layer: the deterministic audit → gap → candidate → benchmark →
// release → re-audit loop.
export {
  snapshotOfProject,
  snapshotOfDir,
  identityFromFiles,
  canonicalJson,
  hashText,
} from './snapshot/index.js';
export { Store } from './store/index.js';
export { computeCoverage } from './evolution/coverage.js';
export { deriveGaps } from './evolution/gap.js';
export { resolveCapabilitySetId, capabilityFromPack, basePackIds } from './evolution/capability.js';
export { runBenchmark } from './evolution/benchmark.js';
export { evaluateRelease, DEFAULT_RELEASE_GATE } from './evolution/release.js';
export {
  proposeCandidate,
  proposeCandidates,
  proposeFromSuggestions,
} from './evolution/propose.js';
export { GapQueue } from './evolution/queue.js';
export { runEvolutionCycle } from './evolution/run.js';

export type * from './types.js';
export type * from './snapshot/index.js';
export type * from './evolution/types.js';
export type { SectionDef } from './engine/sections.js';
export type { MaturityProfile } from './engine/maturity.js';
export type { AuditOutcome, AuditOptions } from './engine/audit.js';
export type { ScoredRule } from './engine/score.js';
export type { EvalContext } from './engine/evaluate.js';
