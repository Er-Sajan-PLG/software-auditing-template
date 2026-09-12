# 14. The proposal stage is deterministic; a release requires positive evidence

- **Date:** 2026-09-12
- **Status:** Accepted

## Context

ADR-0013 established the deterministic evolution loop but left one stage
unwired: where does a `CandidateCapability` come from? The loop could only be
driven by a human handing it a candidate pack on the command line. That made the
"autonomous improvement" claim incomplete, and it left `usa bootstrap` and
`usa learn` as dead-end, human-facing tools.

Separately, the release gate had an evidence hole. `evaluateRelease` computed
precision/recall and treated an empty benchmark summarily: with zero cases,
`tp = fp = fn = 0`, so precision and recall were both a vacuous `1.000` and the
decision was `ACCEPT`. A candidate with _no_ benchmark evidence could ship. That
directly contradicts the project's oldest invariant — evidence over claims.

## Decision

**1. The proposal stage is deterministic and is a first-class loop stage.**

`src/evolution/propose.ts` turns a gap into a candidate with no LLM:

- `proposeCandidate(gap)` renders the bootstrap starter pack for the gap's
  language and parses it back into a `CandidateCapability` (`PROPOSED`). The
  bootstrap catalog is the single source of truth; the proposal inherits the
  pack's `skip_when: lang:<lang> absent` guard because it is generated from the
  very fact the gap was derived from.
- `proposeFromSuggestions(suggestions)` converts `usa learn` suggestions into a
  single `learn-proposals` pack of `manual` checks. `manual` is the honest
  proposal when the missing check cannot be expressed as data yet.
- `runEvolutionCycle` gains `proposeFromGaps`: when no explicit candidate is
  supplied it proposes from the BEFORE gaps and evaluates the first proposable
  candidate. The full proposal list is recorded on the output.
- The proposal path is exposed as `usa evolve --propose`.

Proposals remain **human-gated**: they are unreviewed, carry a REVIEW-REQUIRED
pack, are never registered in `rules/index.yaml`, and are only trusted after
passing the benchmark and gate. This generalizes ADR-0012 from bootstrap into the
loop.

**2. A release requires positive evidence.**

`evaluateRelease` now requires at least one benchmark case. Zero cases is a
`REJECT` with the reason "no benchmark cases: a release requires positive
evidence". Vacuous precision/recall is never a pass.

**3. In-memory pack parsing is shared.**

`parsePackText` was extracted from the file loader so a candidate pack can be
parsed from a string (the rendered bootstrap YAML) without touching disk or the
registry. `loadPackFile` delegates to it; behavior for files is unchanged.

## Consequences

**Good:** the loop is now closed end-to-end without an LLM — `usa evolve
/path --propose` goes audit → gap → proposal → benchmark → gate → re-audit. The
gate can no longer be satisfied by an absence of tests. `bootstrap` and `learn`
are now real inputs to the evolution machinery rather than terminal tools.

**Bad / accepted:** proposals are still only as good as the bootstrap catalog or
the learn suggestions; an unknown language with no catalog entry yields fallback
`manual` prompts, which the benchmark must then prove. Auto-proposing evaluates
only the _first_ proposable candidate per run — batched evaluation is deferred
with the gap queue. The `evolve` CLI cannot yet consume a report directly
(`--learn <report.md>`); callers use the programmatic API for that today.

**Neutral:** the loop's reproducibility boundary is unchanged
(`snapshotId + capabilitySetId + engineVersion`). A proposal is deterministic
given the gap, so the same gap proposes byte-identical candidates.
