import type { Automatability, Check, Rule } from '../types.js';
import { AUTOMATABILITY_LADDER } from '../types.js';

/**
 * How much of a rule the engine can decide without a human (ADR-0021).
 *
 * Deriving this from the check kind — rather than trusting a hand-written tag —
 * means the 281 shipped rules are classified correctly with no per-rule editing,
 * and the classification cannot silently drift from what the check actually
 * does. A pack may still override with `automatability:` when the mapping is
 * wrong for a specific rule, but `full` is refused for a kind that cannot
 * deliver it (see `validateAutomatability`).
 */
export function automatabilityOf(check: Check): Automatability {
  switch (check.kind) {
    // Judgement: no deterministic signal, a human decides.
    case 'manual':
      return 'manual';
    // Context only, never scored — treat as manual (it settles nothing).
    case 'info':
      return 'manual';
    // Opt-in or third-party-evidence checks: the engine helps, but the verdict
    // depends on a command being allowed or an external artifact existing.
    case 'command':
      return 'assist';
    case 'oracle':
      return 'assist';
    // Everything else is a pure function of the tree.
    default:
      return 'full';
  }
}

/** The effective automatability of a rule: explicit override, else derived. */
export function ruleAutomatability(rule: Rule): Automatability {
  return rule.automatability ?? automatabilityOf(rule.check);
}

/**
 * A `full` claim is only honest when the check is deterministic and always
 * evaluated. Returns an error string when the override cannot be honoured, else
 * null. The loader warns and falls back to the derived value (fail closed,
 * ADR-0009) rather than silently trusting the tag.
 */
export function validateAutomatability(claimed: Automatability, check: Check): string | null {
  const derived = automatabilityOf(check);
  if (!AUTOMATABILITY_LADDER.includes(claimed)) {
    return `automatability must be one of ${AUTOMATABILITY_LADDER.join('|')}`;
  }
  // A pack may downgrade (claim less automation than derived) — that is always
  // safe. It may not upgrade to `full` something the engine cannot decide.
  if (claimed === 'full' && derived !== 'full') {
    return `automatability "full" on a "${check.kind}" check (the engine can only offer "${derived}")`;
  }
  return null;
}

/** Parse a `catalogue@version` pin. Version is required. */
export function parseCatalogue(value: string): { name: string; version: string } | null {
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return null;
  const name = value.slice(0, at).trim();
  const version = value.slice(at + 1).trim();
  if (!name || !version) return null;
  return { name, version };
}

/** True when every `/`-separated version segment starts with a digit. */
function isNumericVersion(version: string): boolean {
  return version.split(/[.\-+]/).every((seg) => seg === '' || /^\d/.test(seg));
}

/**
 * A pinned catalogue must be `name@version` where the version looks like a
 * version — an unpinned `asvs` (no `@`) would let the mapping drift silently.
 */
export function validateCatalogue(value: string): string | null {
  const parsed = parseCatalogue(value);
  if (!parsed) return 'catalogue must be pinned as "name@version" (e.g. asvs@5.0.0)';
  if (!isNumericVersion(parsed.version)) {
    return `catalogue version "${parsed.version}" is not a version (expected digits)`;
  }
  return null;
}
