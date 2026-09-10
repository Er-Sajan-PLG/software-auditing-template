# 12. Self-extension via bootstrap: propose packs, never self-trust

- **Date:** 2026-09-09
- **Status:** Accepted

## Context

Detection names ~20 languages; shipped packs cover ~7 stacks. A PHP, Ruby,
C, C#, or Swift project therefore audits thin: generic rules apply, but
nothing knows `eval()` from `password_hash()`, and the score quietly
rewards the tool's ignorance. Two bad responses: pretend coverage is
complete, or refuse to audit unknown stacks at all.

Meanwhile the fix is data, not code (ADR-0003): a stack pack is a YAML
file with curated patterns. The engine already knows how to load one. The
missing piece is a bridge from "detected but uncovered" to "drafted pack".

## Decision

`usa bootstrap [path]` proposes starter packs for detected-but-uncovered
languages from a curated knowledge catalog (dangerous-function patterns,
lockfiles, review prompts per language), or clearly-marked generic
judgement prompts when the language is unknown even to the catalog.
Fail-closed at three levels:

1. **Nothing is registered automatically.** Generated files are printed
   (or written with explicit `--out`); `rules/index.yaml` is never
   touched by the tool. Registration is a human commit.
2. **Every file carries a REVIEW-REQUIRED header** with the acceptance
   ritual: read each pattern, audit one bad and one good fixture, add
   FP/FN regression tests, then register.
3. **Presence checks are excluded from the catalog.** Without
   applicability facts, "is X used?" rules punish projects that simply
   have no passwords/sessions. Generated packs contain only checks that
   are meaningful wherever they fire, plus `manual` prompts with evidence
   shapes for the rest.

Proven on Vapor (Swift web framework, 249 files): baseline 71.8 with zero
Swift-specific coverage → generated 4-rule pack, human-reviewed against
real hits (force-unwraps triaged, ATS clean, missing Package.resolved
recorded) → re-audit surfaces exactly those four, diff shows +4 newly
applicable, zero regressions.

## Consequences

**Good:** the adaptation loop is closed and honest — detect gap, propose,
human reviews, register, re-audit, diff proves it. Coverage grows as data
PRs, reviewable by non-engine authors per ADR-0003.

**Bad:** generated patterns are unreviewed heuristics until a human does
the work; an unused bootstrap pack is shelfware that implies coverage.
The header and the registration ritual exist to prevent exactly that.

**Neutral:** framework-level detectors (laravel, rails, vapor) remain a
human follow-up, printed as suggestions — not generated. Curated checks
beat inferred ones; the catalog grows by PR, one language at a time.
