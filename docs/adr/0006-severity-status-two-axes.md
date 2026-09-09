# 6. Severity and status are separate axes; WRONG outranks MISSING in credit

- **Date:** 2026-09-09
- **Status:** Accepted

## Context

Most checklists conflate two questions: "how bad is this?" and "what did we
find?". A single pass/fail bit cannot distinguish "auth is missing" from
"auth is present but checks the wrong field" — yet those demand different
responses, and an auditor that cannot tell them apart teaches teams that a
decorative control scores the same as a working one.

Worse, binary scoring rewards box-ticking: a `passwords-hashed: true` flag in
a config file earns full marks whether the hasher is argon2id or ROT13.

## Decision

Every rule carries a **severity** (set by the rule author: how bad, if
violated) and every finding carries a **status** (set by the evidence: what
was actually observed). Score credit comes from status:

| Status         | Credit | Meaning                             |
| -------------- | ------ | ----------------------------------- |
| GOOD           | 1.00   | Verified present and correct        |
| EXPERIMENTAL   | 0.50   | Present, unvalidated                |
| DEPRECATED     | 0.40   | Present, EOL                        |
| WRONG          | 0.15   | Present but incorrectly implemented |
| MISSING / FAIL | 0.00   | Absent, or present and violated     |

`WRONG` deliberately scores _above_ `MISSING` (0.15, not 0.00): something
exists, so there is partial credit — but a wrong implementation is _more
dangerous_ than nothing, because it looks finished. Surfacing always orders
`WRONG` above `MISSING` so the dangerous problem gets fixed first.

## Consequences

**Good:** reports distinguish "you have no auth" from "your auth checks the
wrong field", and the roadmap prioritises the scarier of the two. Partial
credit keeps teams from hiding half-done work to avoid a zero.

**Bad:** two axes are harder to explain than pass/fail (see `docs/concepts.md`,
which exists largely to teach this). Any consumer that collapses status to a
boolean (a badge, a gate) must decide where WRONG lands — and document it.

**Neutral:** `EXPERIMENTAL` and `DEPRECATED` exist so the engine can describe
reality instead of rounding it to good/bad. They cost scoring-model surface
in exchange for honest reports.
