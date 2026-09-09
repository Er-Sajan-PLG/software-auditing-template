import { parse as parseYaml } from 'yaml';
import fs from 'node:fs';
import path from 'node:path';
import type { UsatConfig } from './types.js';
import { asMap, maps, num, str, strList } from './util/yaml.js';

function parseLimits(v: unknown): UsatConfig['limits'] {
  const m = asMap(v);
  const maxFiles = num(m.max_files);
  const maxBytes = num(m.max_bytes);
  if (maxFiles === undefined && maxBytes === undefined) return undefined;
  return { max_files: maxFiles, max_bytes: maxBytes };
}

export const CONFIG_FILE = '.usat.yaml';

export const EMPTY_CONFIG: UsatConfig = { version: 1 };

/** Loads `<target>/.usat.yaml` when present. Missing config is not an error. */
export function loadConfig(target: string, explicit?: string): UsatConfig {
  const file = explicit ?? path.join(target, CONFIG_FILE);
  if (!fs.existsSync(file)) return { ...EMPTY_CONFIG };
  try {
    const raw = parseYaml(fs.readFileSync(file, 'utf8'));
    if (raw === null || typeof raw === 'undefined') return { ...EMPTY_CONFIG };
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`${file}: expected a YAML mapping at the top level`);
    }
    const doc: Record<string, unknown> = raw as Record<string, unknown>;
    return {
      version: 1,
      maturity: str(doc.maturity) as UsatConfig['maturity'],
      include: strList(doc.include),
      exclude: strList(doc.exclude),
      rules: asMap(doc.rules) as UsatConfig['rules'],
      suppressions: maps(doc.suppressions).map((s) => ({
        rule: String(s.rule ?? ''),
        reason: str(s.reason) ?? 'no reason recorded',
        until: str(s.until),
      })),
      ignore: strList(doc.ignore),
      facts: strList(doc.facts),
      sections: strList(doc.sections),
      limits: parseLimits(doc.limits),
    };
  } catch (err) {
    throw new Error(`Could not parse ${file}: ${(err as Error).message}`, { cause: err });
  }
}

export const EXAMPLE_CONFIG = `# USAT project configuration — commit this file.
# Docs: docs/configuration.md
version: 1

# Force a lifecycle stage instead of auto-detecting (prototype|mvp|beta|production|legacy).
# maturity: production

# Rule packs to force on or off, regardless of auto-detection.
# include: [stacks/node-typescript]
# exclude: [stacks/solidity]

# Per-rule overrides. Every entry should carry a reason — this file is audited too.
rules:
  # DOC-003:
  #   severity: LOW
  #   reason: "Docs live in Notion, not the repo (decision: ADR-014)"
  # SEC-042:
  #   disabled: true
  #   reason: "Not applicable — no user-facing auth in this worker"

# Accepted risk. USAT still lists these, but excludes them from the score.
suppressions:
  # - rule: PERF-005
  #   reason: "Known N+1 in the admin panel; 40 rows max. Revisit Q4."
  #   until: "2026-12-31"

# Extra globs to exclude from indexing (on top of .gitignore + USAT defaults).
ignore: []

# Assert facts detection could not infer. Useful for non-standard layouts.
facts: []

# Indexing caps for bigger-than-comfortable trees (defaults: 60000 files,
# 2 MiB per file). Raise deliberately for monorepos; the audit warns when
# caps truncate coverage. CLI flags (--max-files, --max-bytes) win.
# limits:
#   max_files: 120000
#   max_bytes: 4194304
`;
