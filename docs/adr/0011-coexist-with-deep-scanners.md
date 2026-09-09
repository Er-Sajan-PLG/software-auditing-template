# 11. Coexist with deep scanners: verify configuration, consume evidence

- **Date:** 2026-09-09
- **Status:** Accepted

## Context

A regex engine cannot do dataflow analysis (CodeQL), reachability-filtered
CVE prioritisation (Snyk, Semgrep Supply Chain), whole-program taint
tracking, or API-verified hygiene (Scorecard branch protection, SLSA
attestation verification). Pretending otherwise would mean shipping weak
copies of those tools and claiming parity — the fastest way to destroy an
auditor's credibility.

But USAT's value proposition includes supply chain, vulnerability posture,
and hygiene verdicts. Ignoring those dimensions leaves the report with
holes exactly where executives look first.

## Decision

USAT **verifies configuration and consumes evidence; it does not duplicate
analysis**:

1. Where a deep scanner exists, the rule checks that it is **configured and
   running** (lockfile + frozen install, scanner in CI, SBOM published,
   attestations present) — never that USAT re-derives its findings.
2. Where a scanner emits machine output, future check kinds may **ingest**
   it (SARIF/JSON: coverage numbers, HIGH/CRITICAL CVE counts, attestation
   verification success) as evidence for the corresponding rules.
3. USAT never claims what an oracle would contradict: API-verifiable checks
   (branch protection, token permissions, signed releases) are file-text
   approximations, documented as such, and the report prefers MISSING
   ("not verified") over a confident verdict it cannot support.
4. SARIF (and JSON) renderers are the approved interchange in both
   directions: USAT findings out to dashboards and code scanning, oracle
   findings in as evidence. The internal finding model already carries
   file/line/severity/rule identity, so this is a renderer, not a redesign.

## Consequences

**Good:** no vulnerability database to maintain, no resolver to build, no
dataflow engine to write — and no weak-duplicate claims. Each tool does
what it is good at; the audit composes them.

**Bad:** USAT reports are only as strong as the oracles the project runs.
A repo with no scanners gets MISSING verdicts where a bundled scanner
would give answers. That is honest but less satisfying, and must be
explained in every such report (the confidence column exists for this).

**Neutral:** this ADR draws the scope boundary that keeps USAT small. Any
proposal to add a CVE database, a resolver, or interprocedural analysis
re-opens this decision explicitly.
