# 16. The scheduler never releases a capability with no automated evidence

- **Date:** 2026-09-12
- **Status:** Accepted

## Context

ADR-0015 added the persistent queue; the scheduler (`src/evolution/schedule.ts`)
walks every open gap and drives a candidate per gap through BENCHMARK → RELEASE.
The proposal stage (ADR-0014) can propose a capability from the bootstrap
**catalog** (curated, automated checks like `grep_wrong`) or, for a language with
no curated entry, from the bootstrap **fallback**, whose checks are all
`manual`.

While wiring the scheduler we found a vacuous-release path: a benchmark fixture
that expects a `manual` check to be `UNKNOWN` "passes" — a `manual` check emits
`UNKNOWN`, which is non-open, so it is scored as a true negative. A capability
consisting only of `manual` checks therefore trivially scores `0 FP / 0 FN`,
`satisfies precision 1.000 / recall 1.000`, and the release gate returns
`ACCEPT`. Releasing it would **close a real coverage gap with a capability that
detects nothing automatically.**

This is the same failure class as the zero-case benchmark fixed in ADR-0014:
evidence-over-claims, applied one level deeper. Precision/recall against
fixtures only mean something when the capability can actually produce a
determinate verdict.

## Decision

The scheduler refuses to release a candidate whose pack offers no automated
detection, even when the gate says `ACCEPT`:

- `unbenchmarkable(candidate)` returns a reason when the pack has no rules, or
  every rule is a `manual` check. Such a candidate is recorded as `REJECTED`
  with a `blockedReason`; it closes no gaps.
- The gate itself is unchanged: it remains a pure function of the benchmark and
  the gate policy. The refusal is layered in the scheduler, where the decision
  about _what may be promoted_ belongs. Auto-proposed bootstrap fallbacks are
  therefore surfaced as proposals and never silently promoted to released
  capabilities.
- A curated (automated) proposal — e.g. a catalog pack with `grep_*` checks — is
  unaffected and can be released once it matches its fixtures.

## Consequences

**Good:** the scheduler cannot close a gap with an inert capability. A `manual`
proposal remains a useful human-facing artifact (`usa evolve --propose`,
`usa learn`) without being mistaken for automated coverage. The invariant
"a released capability detects something" is now enforced, not assumed.

**Bad / accepted:** a language with no curated bootstrap entry cannot be
auto-released by the scheduler — it can only be proposed. Closing such a gap
requires a human (or a later proposal source, e.g. the deferred model runtime)
to author real checks. This is the correct, honest limitation.

**Neutral:** `ScheduledCandidate.outcome` stays `RELEASED | REJECTED`;
`release.decision` still reports the raw gate result, so a reviewer can
distinguish "the gate rejected it" from "the scheduler blocked a vacuous
accept" via `blockedReason`.
