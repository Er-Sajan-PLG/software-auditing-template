import { loadRulePacks } from '../engine/loader.js';
import { hashText } from '../snapshot/index.js';
import { canonicalJson } from '../snapshot/index.js';
import type { RulePack } from '../types.js';
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
    languages: opts.languages,
    status: 'stable',
    provenance: {
      createdAt: opts.createdAt ?? new Date().toISOString(),
      createdBy: opts.createdBy ?? 'evolution',
    },
  };
}
