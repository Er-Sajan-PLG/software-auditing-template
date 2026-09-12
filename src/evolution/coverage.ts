import type { AuditReport, Facts } from '../types.js';
import { bootstrapPacks } from '../bootstrap/index.js';
import type { BlindSpot, CoverageModel } from './types.js';

/**
 * Coverage is tied to what the audit *actually resolved* — never to a registry
 * that merely contains a capability. A detected language with a shipped pack is
 * "covered"; one without is "unsupported" regardless of whether a bootstrap
 * proposal happens to exist (a proposal is not capability).
 *
 * Reuses the existing detection/bootstrap knowledge so there is exactly one
 * source of truth for "which languages does USA ship a pack for".
 */
export function computeCoverage(report: AuditReport, facts: Facts): CoverageModel {
  const boot = bootstrapPacks(facts);
  const langs = [...facts.flags]
    .filter((f) => f.startsWith('lang:'))
    .map((f) => f.slice('lang:'.length))
    .sort();
  const coveredSet = new Set(boot.coveredLangs);
  const partialSet = new Set(boot.generatedLangs);

  const blindSpots: BlindSpot[] = [];
  const coveredLanguages: string[] = [];
  const unsupportedLanguages: string[] = [];

  for (const lang of langs) {
    if (coveredSet.has(lang)) {
      coveredLanguages.push(lang);
    } else {
      unsupportedLanguages.push(lang);
      const hint = partialSet.has(lang)
        ? ' (a bootstrap proposal exists, but it is not a shipped capability)'
        : ' (no coverage at all)';
      blindSpots.push({
        kind: 'unsupported-language',
        id: `lang:${lang}`,
        detail: `No production capability analyzes ${lang}${hint}.`,
        evidence: `detected fact "lang:${lang}"; packs loaded: ${report.options.packsLoaded.join(', ') || 'none'}`,
      });
    }
  }

  const unverifiableSections: string[] = [];
  for (const s of report.score.sections) {
    if (s.score === null) {
      unverifiableSections.push(s.id);
      blindSpots.push({
        kind: 'unverifiable-section',
        id: `section:${s.id}`,
        detail: `Section ${s.id} (${s.title}) could not be verified automatically.`,
        evidence: `${s.applicable} applicable rule(s), ${s.unknown} unresolved by the engine`,
      });
    }
  }

  const languageCoverage =
    langs.length > 0 ? Math.round((100 * coveredLanguages.length) / langs.length) : 100;

  return {
    automationCoverage: report.score.automationCoverage,
    languageCoverage,
    detectedLanguages: langs,
    coveredLanguages,
    unsupportedLanguages,
    unverifiableSections,
    unknownFindings: report.score.counts.UNKNOWN,
    blindSpots,
  };
}
