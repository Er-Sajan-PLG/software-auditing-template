# 8. Every report embeds a machine-readable trailer; audits are diffable

- **Date:** 2026-09-09
- **Status:** Accepted

## Context

An audit you cannot compare to the last one is just a number. Teams need to
answer "did we get better since June?" and CI needs to gate on "did this PR
introduce a new HIGH?". The conventional answer is a second machine format
(JSON/SARIF beside the human report) plus a server to store history in.

USAT already decided Markdown is the only output format (ADR-0004). The
question was how to get trendability without a second artifact or a server.

## Decision

Every rendered report ends with a machine-readable YAML trailer inside an
HTML comment (`<!-- USAT:TRAILER:BEGIN --> … <!-- USAT:TRAILER:END -->`):
schema version, timestamp, overall score, per-section scores, severity
totals, and every rule's status/severity/section. `usat diff old.md new.md`
parses two trailers and reports fixed, regressed, changed-still-open, and
newly-applicable rules with net point movement.

Trailer hygiene rules, learned the hard way:

1. Rule IDs are pack-author-controlled input to a machine channel, so keys
   are YAML-quoted with escaping. An unquoted id containing `:`, `#`, a
   newline, or a fence once corrupted the mapping `usat diff` parses.
2. Extraction takes the **last** trailer in the document (concatenations
   yield the newest report, not the oldest) and tolerates trailing spaces,
   CRLF, and `yml` vs `yaml` fences.
3. The closing fence is located from the end, because a hostile id may
   legally contain a fence inside its quoted string.

## Consequences

**Good:** the report stays a single self-contained artifact — committable,
emailable, pasteable into a PR — that is also its own database row. Progress
reports (`usat diff Q2.md Q3.md`) work with zero infrastructure.

**Bad:** the trailer duplicates human-visible content, so reports are larger
than prose alone. Any renderer change must keep the trailer schema stable;
`schema: usat-report-v1` exists so a future v2 can be detected, not guessed.

**Neutral:** the trailer is unsigned. Anyone with write access to the report
file can edit history. Signed reports (Sigstore) are a documented future
direction for supply-chain-grade evidence, not this decision.
