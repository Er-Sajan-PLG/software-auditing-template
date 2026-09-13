# 19. Oracle-ingestion check kind: consume evidence, never mint it

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

ADR-0011 set the charter: USA coexists with deep scanners. It verifies that a
scanner is configured and running, and — clause 2 — "where a scanner emits
machine output, future check kinds may ingest it (SARIF/JSON: coverage numbers,
HIGH/CRITICAL CVE counts, attestation verification success) as evidence for the
corresponding rules." Clause 4 added that this must be a check kind fed from
existing artifacts, not a redesign.

Until now there was no such check kind. Rules that wanted to reflect real
scanner output had two bad options: a `command` check that shells out to the
scanner (opt-in, non-deterministic, network-dependent, and it re-runs the tool
rather than reading its result), or a `manual` check that never resolves. So the
supply-chain, dependency, and coverage rules that should reflect CodeQL, npm
audit, or a coverage report could not.

## Decision

Add an `oracle` check kind that ingests a **committed** machine artifact and
asserts a numeric bound.

```yaml
check:
  kind: oracle
  source: sarif # or json
  file: reports/codeql.sarif
  levels: [error] # sarif only: filter by level
  rules: ['sql-injection'] # sarif only: filter by ruleId substring
  path: total.lines.pct # json only: dotted path to the number
  op: at_most # at_most (default) | at_least | equals
  value: 0
```

- **SARIF** counts `runs[].results` across every run, optionally filtered by
  `levels` and `rules`. A result with no `level` counts as `warning`.
- **JSON** reads the number at `path`, reusing the `json_path` resolver.
- The check is **read-only and offline**. It reads a file in the audited tree;
  it never probes the network, runs the scanner, or re-derives a finding. The
  artifact is the evidence.

Verdicts are honest about provenance, per ADR-0009:

| Artifact state         | Status  |
| ---------------------- | ------- |
| absent                 | MISSING |
| present, unparseable   | UNKNOWN |
| path/selection not num | UNKNOWN |
| bound satisfied        | PASS    |
| bound violated         | FAIL    |

Loading fails closed (ADR-0009): an oracle with no `file`, an unknown `source`
or `op`, a missing `path` for `json`, or a non-finite `value` is dropped with a
warning rather than evaluated. A malformed bound must never become a free PASS.

The kind is **opt-in infrastructure**: no shipped rule uses it, so offline
defaults and existing scores are unchanged. Pack authors and fork maintainers
enable it by writing a rule that reads an artifact their CI already produces.

## Rationale

1. **It is the ADR-0011 clause-2 mechanism, finally built.** Consume evidence;
   do not duplicate analysis.
2. **Deterministic and offline.** Reading a committed file preserves the
   reproducibility boundary that a `command` check breaks.
3. **No new dependency.** SARIF is JSON; counting results is a few lines.
4. **Opt-in preserves the default.** A user who commits no SARIF sees no new
   findings; a user who wires CodeQL gets a rule that reflects it.

## Consequences

**Good:** rules can now assert real coverage numbers and real HIGH/CRITICAL
counts from the tools a project already runs. USA composes with those tools
without pretending to be them.

**Bad:** the check is only as fresh as the committed artifact. A stale
`codeql.sarif` yields a confident PASS that the reader must remember to
distrust. This is inherent to file-based evidence and is the same tradeoff the
`evidence:` field already documents for `manual` rules. A future enhancement
could add an artifact-age field, but that reintroduces wall-clock dependence and
is deliberately not done now.

**Neutral:** the SARIF and JSON renderers added in ADR-0018 already define the
interchange in both directions. This ADR closes the loop by consuming it.
