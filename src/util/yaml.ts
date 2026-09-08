/**
 * Shape helpers for decoded YAML.
 *
 * `yaml.parse` hands back plain JS objects, which is exactly the *wrong* thing
 * to sprinkle through the engine: every downstream field access would be `any`
 * and a typo in a rule pack would surface as `undefined` three modules later.
 * These helpers force the parse boundary to state up front what shape it
 * expects, and make the "absent" case explicit rather than implicit.
 */

/** A decoded YAML mapping. Keys are strings; values are whatever the author wrote. */
export type YamlMap = Record<string, unknown>;

export function isMap(v: unknown): v is YamlMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function asMap(v: unknown): YamlMap {
  return isMap(v) ? v : {};
}

/** Present and a string. */
export function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Present and a number. */
export function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Present and a boolean. */
export function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/** Present and an array. */
export function list(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? (v as unknown[]) : undefined;
}

/** Present and an array — every element stringified. */
export function strList(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.map((x) => String(x)) : undefined;
}

/** A scalar suitable for `json_path.equals` comparisons. */
export function scalar(v: unknown): string | number | boolean | null | undefined {
  if (v === null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return undefined;
}

/** One entry of an array, as a mapping. */
export function maps(v: unknown): YamlMap[] {
  return Array.isArray(v) ? v.filter(isMap) : [];
}
