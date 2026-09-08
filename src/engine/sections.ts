import { parse as parseYaml } from 'yaml';
import { asMap, isMap, list, num, str } from '../util/yaml.js';
import fs from 'node:fs';
import path from 'node:path';

export interface SectionDef {
  id: string;
  title: string;
  /** Multiplier applied to every rule in the section when computing the total. */
  weight: number;
}

/**
 * Section registry. Security, supply chain and testing carry the heaviest
 * multipliers: a repo that fails an auth control is worse than one with a
 * slightly untidy README, and the score should say so.
 */
export const DEFAULT_SECTIONS: SectionDef[] = [
  { id: 'S1', title: 'Repository & Project Structure', weight: 0.7 },
  { id: 'S2', title: 'Security', weight: 1.7 },
  { id: 'S3', title: 'Supply Chain & Build Provenance', weight: 1.3 },
  { id: 'S4', title: 'Architecture & Design', weight: 1.0 },
  { id: 'S5', title: 'Code Quality', weight: 1.0 },
  { id: 'S6', title: 'Data & Database', weight: 1.0 },
  { id: 'S7', title: 'Testing & Quality Assurance', weight: 1.3 },
  { id: 'S8', title: 'CI/CD, Infrastructure & Observability', weight: 1.0 },
  { id: 'S9', title: 'Release & Change Management', weight: 0.7 },
  { id: 'S10', title: 'Dependencies & Third-Party', weight: 1.2 },
  { id: 'S11', title: 'Performance & Resilience', weight: 0.8 },
  { id: 'S12', title: 'Documentation & Knowledge', weight: 0.7 },
  { id: 'S13', title: 'Accessibility, i18n & Compliance', weight: 0.9 },
  { id: 'S14', title: 'AI / LLM-Era Risks', weight: 1.1 },
  { id: 'S15', title: 'Platform-Specific', weight: 1.0 },
  { id: 'S16', title: 'Future Readiness', weight: 0.4 },
];

export function loadSections(rulesDir: string): SectionDef[] {
  const file = path.join(rulesDir, 'sections.yaml');
  if (!fs.existsSync(file)) return DEFAULT_SECTIONS;
  try {
    const doc = asMap(parseYaml(fs.readFileSync(file, 'utf8')));
    const raw = list(doc.sections);
    if (!raw) return DEFAULT_SECTIONS;
    const parsed = raw.filter(isMap).map((s) => ({
      id: str(s.id) ?? 'S0',
      title: str(s.title) ?? str(s.id) ?? 'Untitled',
      weight: num(s.weight) ?? 1,
    }));
    // Keep defaults for any section the override file omits.
    const ids = new Set(parsed.map((s) => s.id));
    return [...parsed, ...DEFAULT_SECTIONS.filter((s) => !ids.has(s.id))];
  } catch {
    return DEFAULT_SECTIONS;
  }
}
