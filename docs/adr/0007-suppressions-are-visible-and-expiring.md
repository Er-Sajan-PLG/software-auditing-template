# 7. Accepted risk stays visible, stops costing points, and expires

- **Date:** 2026-09-09
- **Status:** Accepted

## Context

Every real project has findings it will not fix: a known N+1 in an admin
panel with 40 rows, docs living in Notion instead of the repo, a prototype
with no runbook. An audit tool has three options for these: keep failing the
build (teams disable the tool), silently ignore them (the audit lies), or
record the decision.

The failure mode that matters most: a waiver granted in 2024 silently
suppressing a finding in 2027, long after the context changed. An auditing
tool that honours expired risk acceptances without a murmur produces false
assurance — the one failure it must never have.

## Decision

Suppressions live in `.usat.yaml`, each with a mandatory `reason` and an
optional `until` date:

1. A suppressed finding is **excluded from the score and the severity
   tallies** but **listed under Accepted Risk** in every report. Deliberate
   decisions stay visible but stop costing points.
2. An `until` date in the past — or one that cannot be parsed — **fails
   closed**: the waiver is ignored, the finding reports normally, and a
   warning names the rule. Expired risk is re-audited, not grandfathered.
3. Suppressed findings never appear in Immediate Action or the roadmap.
   The Findings Summary counts only active findings, so it cannot contradict
   those sections.

## Consequences

**Good:** the report is honest about what was decided vs what was found.
Stale waivers resurface automatically instead of rotting silently.

**Bad:** teams must maintain waiver dates to keep a green build — a small
recurring cost, and the correct one. `until` parsing follows `Date.parse`,
so only unambiguous ISO dates should be used (documented in
`docs/configuration.md`).

**Neutral:** suppressions are rule-ID-granular, not file:line-anchored.
Site-level waivers with unused-suppression reporting (the ESLint model) are
a documented future direction, not this decision.
