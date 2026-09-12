import { loadRulePacks } from '../engine/loader.js';
import { hashText } from '../snapshot/index.js';
import { canonicalJson } from '../snapshot/index.js';
import type { Predicate, RulePack } from '../types.js';
import type { Capability } from './types.js';

/**
 * Capability-set resolution.
 *
 * The resolved set is an immutable value, hashed once at the start of a run.
 * It depends on: engine version, the base pack ids in the on-disk registry, and
 * any released capabilities injected for this run. A model bundle would become
 * part of this boundary once models exist — until then it is recorded as absent.
 */
export function resolveCapabilitySetId(
  basePackIds: string[],
  extraCapabilities: Capability[],
  engineVersion: string,
): string {
  const payload = canonicalJson({
    engineVersion,
    basePacks: [...basePackIds].sort(),
    extraCapabilities: extraCapabilities.map((c) => `${c.id}@${c.version}`).sort(),
  });
  return hashText(payload);
}

/** Pack ids present in the on-disk registry (the source of truth). */
export function basePackIds(rulesDir: string): string[] {
  const { packs } = loadRulePacks(rulesDir);
  return packs.map((p) => p.id).sort();
}

/** Wrap a candidate rule pack as a `data` capability. */
export function capabilityFromPack(
  pack: RulePack,
  opts: {
    version?: string;
    description?: string;
    createdBy?: string;
    createdAt?: string;
    languages?: string[];
  } = {},
): Capability {
  return {
    id: pack.id,
    version: opts.version ?? pack.version ?? '0.1.0',
    kind: 'data',
    description: opts.description ?? pack.description ?? pack.title,
    pack,
    languages: opts.languages ?? inferLanguages(pack),
    status: 'stable',
    provenance: {
      createdAt: opts.createdAt ?? new Date().toISOString(),
      createdBy: opts.createdBy ?? 'evolution',
    },
  };
}

/**
 * Infer which languages a pack analyzes from its declared applicability
 * (`skip_when` / per-rule `applies_when` `lang:*` facts). A capability should
 * declare what it covers so coverage accounting stays honest and automatic.
 */
function inferLanguages(pack: RulePack): string[] {
  const langs = new Set<string>();
  collectLangFacts(pack.skipWhen, langs);
  for (const rule of pack.rules) collectLangFacts(rule.appliesWhen, langs);
  const out = [...langs].sort();
  return out.length > 0 ? out : [];
}

function collectLangFacts(p: Predicate | undefined, out: Set<string>): void {
  if (!p) return;
  const q = p as Record<string, unknown>;
  for (const key of ['all', 'any'] as const) {
    if (Array.isArray(q[key])) for (const x of q[key] as Predicate[]) collectLangFacts(x, out);
  }
  if (q.not !== undefined && q.not !== null) collectLangFacts(q.not as Predicate, out);
  const fact = q.fact;
  if (typeof fact === 'string' && fact.startsWith('lang:')) out.add(fact.slice('lang:'.length));
}
