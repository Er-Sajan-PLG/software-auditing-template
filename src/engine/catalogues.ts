import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Rule, RulePack } from '../types.js';
import { ruleAutomatability } from './automatability.js';

/**
 * Catalogue registry (ADR-0021).
 *
 * `rules/catalogues.yaml` pins every standard USA draws from to the version the
 * rules were written against. A rule's catalogue is *derived* from its existing
 * `references:` — the first matching prefix wins — so no rule needs a new field
 * and the mapping cannot drift from the references that already justify it.
 *
 * This is what makes `docs/standards-mapping.md` machine-checkable: the coverage
 * table is generated from here, and CI fails if the pin or the tally drifts.
 */
export interface Catalogue {
  id: string;
  name: string;
  version: string;
  prefixes: string[];
  url?: string;
}

const CATALOGUES_FILE = 'catalogues.yaml';

/** Load and validate the catalogue registry. Returns sorted by id. */
export function loadCatalogues(rulesDir: string): { catalogues: Catalogue[]; warnings: string[] } {
  const file = path.join(rulesDir, CATALOGUES_FILE);
  const warnings: string[] = [];
  if (!fs.existsSync(file)) {
    warnings.push(`catalogue registry not found at ${CATALOGUES_FILE} — catalogues unavailable`);
    return { catalogues: [], warnings };
  }
  let raw: unknown;
  try {
    raw = parseYaml(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    warnings.push(`${CATALOGUES_FILE} is not valid YAML (${(err as Error).message}) — ignored`);
    return { catalogues: [], warnings };
  }
  const list = (raw as { catalogues?: unknown[] })?.catalogues;
  if (!Array.isArray(list)) {
    warnings.push(`${CATALOGUES_FILE}: "catalogues" must be a list — ignored`);
    return { catalogues: [], warnings };
  }
  const catalogues: Catalogue[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const catalogue = parseCatalogueEntry(entry, seen, warnings);
    if (catalogue) catalogues.push(catalogue);
  }
  return { catalogues: catalogues.sort((a, b) => a.id.localeCompare(b.id)), warnings };
}

/** Parse one registry entry; null (with a warning) when it is unusable. */
function parseCatalogueEntry(
  entry: unknown,
  seen: Set<string>,
  warnings: string[],
): Catalogue | null {
  const c = entry as Record<string, unknown>;
  const id = String(c.id ?? '').trim();
  if (!id) {
    warnings.push(`${CATALOGUES_FILE}: an entry is missing "id" — skipped`);
    return null;
  }
  if (seen.has(id)) {
    warnings.push(`${CATALOGUES_FILE}: duplicate catalogue id "${id}" — later ignored`);
    return null;
  }
  const version = String(c.version ?? '').trim();
  if (!version) {
    // An unpinned catalogue is the exact drift this registry exists to stop.
    warnings.push(`${CATALOGUES_FILE}: catalogue "${id}" has no version — skipped`);
    return null;
  }
  seen.add(id);
  return {
    id,
    name: String(c.name ?? id),
    version,
    prefixes: Array.isArray(c.prefixes) ? c.prefixes.map(String) : [],
    url: c.url ? String(c.url) : undefined,
  };
}

/** A rule's effective catalogue pin (`id@version`), or null when none matches. */
export function catalogueOf(rule: Rule, catalogues: Catalogue[]): string | null {
  if (rule.catalogue) return rule.catalogue;
  for (const ref of rule.references ?? []) {
    const upper = ref.toUpperCase();
    for (const c of catalogues) {
      if (c.prefixes.some((p) => upper.startsWith(p.toUpperCase()))) {
        return `${c.id}@${c.version}`;
      }
    }
  }
  return null;
}

/** Automation tally for one catalogue (or the `(uncatalogued)` bucket). */
export interface CatalogueCoverage {
  catalogue: string;
  name: string;
  rules: number;
  automatable: { full: number; assist: number; manual: number };
}

/**
 * Tally rules by catalogue and automatability, derived entirely from the loaded
 * packs and the registry. Deterministic and pure.
 */
export function catalogueCoverage(packs: RulePack[], catalogues: Catalogue[]): CatalogueCoverage[] {
  const byKey = new Map<string, CatalogueCoverage>();
  const names = new Map(catalogues.map((c) => [c.id, c.name]));
  for (const pack of packs) {
    for (const rule of pack.rules ?? []) {
      const pin = catalogueOf(rule, catalogues) ?? '(uncatalogued)';
      const id = pin.split('@')[0] ?? pin;
      const row =
        byKey.get(pin) ??
        ({
          catalogue: pin,
          name: pin === '(uncatalogued)' ? '(uncatalogued)' : (names.get(id) ?? id),
          rules: 0,
          automatable: { full: 0, assist: 0, manual: 0 },
        } as CatalogueCoverage);
      row.rules += 1;
      row.automatable[ruleAutomatability(rule)] += 1;
      byKey.set(pin, row);
    }
  }
  // Uncatalogued last; the rest alphabetical by pin.
  return [...byKey.values()].sort((a, b) => {
    if (a.catalogue === '(uncatalogued)') return 1;
    if (b.catalogue === '(uncatalogued)') return -1;
    return a.catalogue.localeCompare(b.catalogue);
  });
}
