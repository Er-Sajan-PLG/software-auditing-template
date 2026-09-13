# 18. JSON and SARIF renderers join Markdown (supersedes ADR-0004)

- **Date:** 2026-09-13
- **Status:** Accepted
- **Supersedes:** [0004](0004-markdown-only-output.md)

## Context

ADR-0004 chose Markdown as the _only_ output, betting that the embedded YAML
trailer would cover the machine interface and that a PR comment plus
`--fail-on` would cover enforcement. It named the cost precisely: "no native
SARIF, so USA findings do not appear in GitHub's Security tab as
code-scanning alerts," and set the revisit condition — "if SARIF demand
materialises... Revisit if three or more issues ask for it."

That condition is now met by the project's own adoption goal: composing with
code scanning and dashboards is the difference between a tool people run once
and one wired into CI permanently. The trailer was never a real substitute for
SARIF — a consumer that wants SARIF should not have to parse a YAML block out
of an HTML comment, and GitHub's code-scanning upload endpoint accepts SARIF,
not Markdown.

ADR-0004 also pre-committed to the shape of the change: "a ~100-line addition
fed from the same `AuditReport` object — no engine change." That held. Both
renderers are pure projections of the report the engine already produces.

## Decision

USA renders **Markdown, JSON, or SARIF 2.1.0**, selected by `--format
md|json|sarif`, defaulting to the `--out` extension (`.json` → JSON, `.sarif`
→ SARIF, anything else → Markdown). Markdown remains the default.

- **Markdown** stays the human artifact and the source of the YAML trailer.
  Unchanged.
- **JSON** (`src/report/json.ts`, schema `usa-report-json-v1`) is a faithful,
  stable projection of `AuditReport` for dashboards and gates. No
  re-derivation, so it can never disagree with the Markdown trailer's counts.
- **SARIF** (`src/report/sarif.ts`, 2.1.0) emits actionable findings as
  `results`. PASS and NOT_APPLICABLE are successes, not results. `UNKNOWN`
  (judgement required) is emitted at `note` level with `kind: informational`,
  because "a human must look" is itself the finding. Severity maps to level
  (CRITICAL/HIGH → error, MEDIUM → warning, LOW/FUTURE → note); status maps to
  kind (UNKNOWN → informational, else fail). Suppressed findings carry a SARIF
  `suppressions` entry.

Determinism is preserved: both renderers are pure functions of the report,
rule order is first-seen, and the only non-deterministic field
(`generatedAt`) is the one the report already carries.

## Rationale

1. **The engine is untouched.** Both renderers read `AuditReport`. The claim
   in ADR-0004 that this would be cheap was correct.
2. **Enforcement and dashboards are different needs.** `--fail-on` gates a
   build; SARIF populates a security dashboard. A mature audit tool needs both.
3. **One source of truth.** JSON/SARIF are projections, not parallel scoring
   paths. There is no format skew because there is no second computation.
4. **Opt-in, offline, zero-dependency.** Rendering is local and deterministic;
   no network, no new runtime dependency.

## Consequences

**Good:** USA findings can be uploaded to GitHub code scanning via SARIF and
consumed by any JSON dashboard. `--format` and extension inference make the
common case (`--out report.sarif`) zero-config. The three formats share one
`AuditReport`, so they cannot drift.

**Bad:** three renderers to keep golden-tested instead of one. ADR-0004's
"one renderer, one set of golden tests" simplicity is traded away. This is
mitigated by the renderers being pure projections with their own focused tests,
and by SARIF being validated against the official 2.1.0 schema.

**Neutral:** HTML and JUnit XML remain deliberately unimplemented. ADR-0004's
"not all four formats" instinct still holds — JSON and SARIF earn their place
because they feed standards-based consumers; HTML/JUnit would only feed
bespoke ones.
