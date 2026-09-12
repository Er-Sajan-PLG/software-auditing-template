# 17. Every automatable rule ships a positive/negative fixture

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

USA's rules are data (ADR-0003), and there are 281 of them across 31 packs.
Only about a dozen had any test, and those were hand-written inline per rule.
The packs are the product, yet nothing proved that a rule still fired after a
refactor, or that it did not start firing on innocent code. A regex typo in a
`grep_absent` pattern is invisible: the rule simply stops finding anything and
the audit gets quietly more optimistic. The same failure mode is worse in the
opposite direction — a rule that matches everything inflates the count and
destroys trust in the score.

The engine is deterministic and the check kinds are a closed set of fifteen
(ADR-0003), so a rule's behaviour is a pure function of a file tree. That makes
it mechanically testable in exactly the way the CodeQL test model is: give the
rule a tree it must flag and a tree it must accept, assert the status.

## Decision

Every rule whose check kind is not `manual` must ship a fixture file at
`tests/fixtures/rules/<RULE-ID>.yaml`:

```yaml
rule: SEC-001
negative: # the tree the rule must PASS
  files:
    src/config.ts: |
      export const apiKey = process.env.API_KEY;
positive: # the tree the rule must flag
  files:
    src/config.ts: |
      const apiKey = "EXAMPLE_NOT_A_REAL_KEY_0123456789";
  expect: FAIL # optional; default is "any non-PASS"
```

`tests/rule-fixtures.test.ts` discovers the files, evaluates the real rule
check against each case using the real detector, and asserts:

1. the fixture names a rule that exists, and the filename matches the id;
2. the negative case returns `PASS`;
3. the positive case returns the declared status (or any non-`PASS`);
4. **every automatable rule has a fixture** — the coverage gate.

`manual` rules are exempt by construction: a human decides them, so there is no
deterministic status to assert. A fixture for a `manual` rule fails the gate,
which keeps the exemption honest.

## Rationale

1. **Fixtures catch rule rot.** A refactor that changes a pattern's behaviour
   breaks a named fixture in CI instead of silently changing audit results.
2. **The coverage gate makes the test set complete.** A new rule cannot merge
   without its fixture, so the gap cannot reopen. This is the same ratchet
   philosophy as the coverage thresholds.
3. **Fixtures are data, like the rules.** They live in YAML beside the packs,
   are diffable and reviewable by the same non-authors who review rules, and
   need no TypeScript to add.
4. **Positive _and_ negative is the point.** A fixture set with only positives
   would reward rules that match everything; the negative case is the FP guard.

## Consequences

**Good:** 173 automatable rules gain executable evidence; silent rule rot
becomes a red build; new rules are tested by default; the patterns are exercised
against realistic file trees.

**Bad:** 173 fixture files to author and maintain. Adding a rule is now two
files, not one. A fixture asserts the rule's _current_ behaviour, so a
deliberate change to a rule must edit its fixture too — that is the intended
friction (it forces the change to be a reviewed decision).

**Neutral:** `command`-kind rules are exercised with `allowCommands: false`
(the safe default), so they only assert the fail-closed path. A separate opt-in
harness would be needed to test their executed path; not worth it now.
