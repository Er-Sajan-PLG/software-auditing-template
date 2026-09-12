import { bootstrapPacks } from '../bootstrap/index.js';
import { parsePackText } from '../engine/loader.js';
import { capabilityFromPack } from './capability.js';
import type { Suggestion } from '../learn/index.js';
import type { Rule, RuleClass, RulePack } from '../types.js';
import type { CapabilityGap, CandidateCapability, CoverageModel } from './types.js';

/**
 * The PROPOSAL stage of the evolution loop.
 *
 * A coverage blind spot yields a `CapabilityGap`; this module turns that gap
 * into a concrete, *unreleased* `CandidateCapability` — deterministically and
 * without any LLM. The proposal is drawn from the same bootstrap catalog that
 * `usa bootstrap` uses, so there is exactly one source of truth for "what could
 * cover this language".
 *
 * This stage never registers anything: the candidate carries a
 * REVIEW-REQUIRED pack and status `PROPOSED`, and is only trusted after it
 * passes the benchmark + release gate. Producer ≠ judge holds end to end.
 */

export interface ProposeOptions {
  /** Called with the language to propose a capability for. */
  language?: string;
  /** Who/what authored the proposal (provenance only). */
  createdBy?: string;
  /** Override the clock for reproducible tests. */
  now?: string;
  /** Emit a reason when no candidate can be proposed. */
  explain?: (reason: string) => void;
}

/**
 * Propose a candidate capability that would close `gap`. Only
 * `unsupported-technology` gaps are proposable today, and only when the
 * bootstrap catalog (or its fallback) can render a pack for the language.
 * Returns `null` when the gap is not proposable — never a half-built candidate.
 */
export function proposeCandidate(
  gap: CapabilityGap,
  opts: ProposeOptions = {},
): CandidateCapability | null {
  const lang = proposableLanguage(gap, opts);
  if (lang === null) return null;

  const pack = bootstrapPackFor(gap.requiredCapability, lang, opts);
  if (!pack) return null;

  const capability = capabilityFromPack(pack, {
    version: pack.version ?? '0.1.0-proposed',
    description: pack.description,
    createdBy: opts.createdBy ?? 'evolution:propose',
    createdAt: opts.now,
    languages: [lang],
  });

  return {
    id: capability.id,
    capability,
    gapIds: [gap.id],
    status: 'PROPOSED',
    createdAt: opts.now ?? new Date().toISOString(),
  };
}

/** The language a gap can be proposed for, or null (with an explanation). */
function proposableLanguage(gap: CapabilityGap, opts: ProposeOptions): string | null {
  if (gap.kind !== 'unsupported-technology') {
    opts.explain?.(`gap ${gap.id} is not a technology gap (kind: ${gap.kind})`);
    return null;
  }
  const lang = opts.language ?? gap.target;
  if (lang !== gap.target) {
    opts.explain?.(`requested language ${lang} does not match gap target ${gap.target}`);
    return null;
  }
  return lang;
}

/**
 * Render the bootstrap starter pack for `lang` and parse it back into a
 * RulePack. The bootstrap generator is the single source of truth for a
 * starter pack; we feed it exactly the fact the gap was derived from so the
 * proposal carries the same `skip_when: lang:<lang> absent` guard as a real one.
 */
function bootstrapPackFor(
  requiredCapability: string,
  lang: string,
  opts: ProposeOptions,
): RulePack | null {
  const outcome = bootstrapPacks({ flags: new Set([`lang:${lang}`]), metrics: {} });
  const proposal = outcome.packs.find((p) => p.packId === requiredCapability);
  if (!proposal) {
    opts.explain?.(`no bootstrap proposal exists for ${lang} (${requiredCapability})`);
    return null;
  }
  const warnings: string[] = [];
  const pack = parsePackText(proposal.yaml, proposal.filename, new Map(), warnings);
  if (!pack) {
    opts.explain?.(
      `bootstrap proposal for ${lang} did not parse as a rule pack: ${warnings.join('; ')}`,
    );
    return null;
  }
  return pack;
}

/**
 * Propose candidates for every open gap in a coverage model. Gaps that cannot
 * be turned into a candidate are reported via `onUnproposable` and skipped —
 * the caller decides whether that is fatal.
 */
export function proposeCandidates(
  coverage: CoverageModel,
  gaps: CapabilityGap[],
  opts: ProposeOptions & { onUnproposable?: (gap: CapabilityGap, reason: string) => void } = {},
): CandidateCapability[] {
  const out: CandidateCapability[] = [];
  const seen = new Set<string>();

  // Prefer explicit language order from the coverage model so results are
  // deterministic regardless of map/Set iteration in the caller.
  const order = new Map(coverage.detectedLanguages.map((lang, i) => [lang, i]));
  const ordered = [...gaps].sort((a, b) => {
    const ai = order.get(a.target) ?? Number.MAX_SAFE_INTEGER;
    const bi = order.get(b.target) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.id.localeCompare(b.id);
  });

  for (const gap of ordered) {
    if (gap.state !== 'open') continue;
    if (seen.has(gap.requiredCapability)) continue;
    const candidate = proposeCandidate(gap, opts);
    if (!candidate) {
      opts.onUnproposable?.(gap, `no proposal for ${gap.requiredCapability}`);
      continue;
    }
    seen.add(gap.requiredCapability);
    out.push(candidate);
  }
  return out;
}

/**
 * Turn `usa learn` suggestions into a single candidate capability pack of
 * manual checks. Manual checks are honest: they assert nothing automatically,
 * they queue a judgement. They are the correct proposal when the engine cannot
 * express the missing check as data yet. Still PROPOSED, still REVIEW-REQUIRED.
 */
export function proposeFromSuggestions(
  suggestions: Suggestion[],
  opts: ProposeOptions & { packId?: string } = {},
): CandidateCapability | null {
  if (suggestions.length === 0) {
    opts.explain?.('no learn suggestions to propose from');
    return null;
  }

  const packId = opts.packId ?? 'learn-proposals';
  const rules: Rule[] = suggestions.map((s) => ({
    id: s.id,
    title: s.title,
    section: s.section,
    sectionTitle: s.sectionTitle,
    severity: s.severity,
    ruleClass: toRuleClass(s.ruleClass),
    check: { kind: 'manual' },
    why: s.why,
    remediation: s.remediation,
    evidence: s.evidence,
    references: s.references,
  }));

  const pack = parsePackText(
    renderProposalPackYaml(packId, rules),
    `${packId}.yaml`,
    new Map(),
    [],
  );
  if (!pack) {
    opts.explain?.(`could not render proposal pack ${packId}`);
    return null;
  }

  const capability = capabilityFromPack(pack, {
    version: pack.version ?? '0.1.0-proposed',
    description: 'Manual checks proposed by usa learn from open findings.',
    createdBy: opts.createdBy ?? 'evolution:propose:learn',
    createdAt: opts.now,
    languages: [],
  });

  return {
    id: capability.id,
    capability,
    gapIds: suggestions.map((s) => s.triggeredBy),
    status: 'PROPOSED',
    createdAt: opts.now ?? new Date().toISOString(),
  };
}

const VALID_RULE_CLASSES: ReadonlySet<RuleClass> = new Set<RuleClass>([
  'security',
  'supply-chain',
  'correctness',
  'maintainability',
  'operations',
  'performance',
  'compliance',
  'documentation',
  'style',
]);

function toRuleClass(value: string): RuleClass {
  return VALID_RULE_CLASSES.has(value as RuleClass) ? (value as RuleClass) : 'maintainability';
}

/** Minimal YAML emitter for a proposal pack; values are quoted defensively. */
function renderProposalPackYaml(packId: string, rules: Rule[]): string {
  const q = (s: string): string => JSON.stringify(s);
  const lines: string[] = [
    `id: ${packId}`,
    `title: ${q('Proposals from usa learn')}`,
    `section: S0`,
    `section_title: ${q('Generated Proposals')}`,
    `description: ${q('Unreviewed manual checks proposed from open audit findings.')}`,
    `version: '0.1.0-proposed'`,
    'rules:',
  ];
  for (const r of rules) {
    lines.push(`  - id: ${r.id}`);
    lines.push(`    title: ${q(r.title)}`);
    lines.push(`    section: ${r.section}`);
    lines.push(`    section_title: ${q(r.sectionTitle ?? r.section)}`);
    lines.push(`    severity: ${r.severity}`);
    lines.push(`    class: ${r.ruleClass}`);
    lines.push(`    check:`);
    lines.push(`      kind: manual`);
    lines.push(`    why: ${q(r.why ?? '')}`);
    if (r.remediation) lines.push(`    remediation: ${q(r.remediation)}`);
    if (r.evidence) lines.push(`    evidence: ${q(r.evidence)}`);
    if (r.references?.length) {
      lines.push(`    references: [${r.references.map(q).join(', ')}]`);
    }
  }
  return `${lines.join('\n')}\n`;
}
