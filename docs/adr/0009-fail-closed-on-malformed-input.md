# 9. Malformed input fails closed and loudly, never silently

- **Date:** 2026-09-09
- **Status:** Accepted

## Context

USAT consumes untrusted, hand-written input at three boundaries: rule packs
(third-party YAML), `.usat.yaml` project config, and `applies_when`
predicates evaluated in the audit hot loop. Each boundary once had a silent
failure mode, and every one of them corrupted results rather than stopping:

- An unknown predicate operator fell through to "present", silently
  **including** rules a typo should have excluded.
- An empty grep pattern (`new RegExp('')` matches every line) turned a
  malformed rule into a mass-FAIL (or free-credit PASS) score weapon.
- An invalid `matches` regex threw out of the hot loop and aborted audits.
- An invalid severity/weight override produced `NaN` overall scores.
- A corrupt pack or index YAML crashed the run with a stack trace.

For an auditing tool, silent corruption is strictly worse than a loud stop:
a crash is visible; a wrong score ships.

## Decision

1. **Evaluation fails closed.** Unknown predicate operators, unknown
   predicate shapes, non-object predicates, and uncompilable `matches`
   regexes all evaluate to `false` (rule skipped). No-constraint (`undefined`
   or `{}`) still means "applies always".
2. **Loading warns.** Every fail-closed case above, plus duplicate rule IDs
   across packs, unsupported check kinds, missing check kinds, empty grep
   patterns, invalid severity/weight overrides, expired or undated
   suppressions, and unknown config sections, produce a named warning on
   stderr. The CLI prints all warnings; the audit continues with the valid
   subset.
3. **One corrupt pack never aborts the audit.** Pack-level YAML errors skip
   that pack with a warning. A corrupt rule index warns and loads zero packs
   rather than throwing — with the warning explaining why the report is
   empty.
4. **Config overrides are validated.** Severity must be on the ladder;
   weight must be a finite number ≥ 0. Anything else is ignored with a
   warning naming the rule.

## Consequences

**Good:** typos and corruption degrade to visible warnings plus conservative
verdicts, never to wrong scores or stack traces. Each rule documents the
invariant in a comment at the decision point.

**Bad:** fail-closed can _hide_ findings when packs are malformed (a skipped
rule finds nothing). The warnings channel is load-bearing — CI that swallows
stderr loses the signal. The self-audit e2e test ("audits itself without
warnings") exists to keep the shipped packs warning-free.

**Neutral:** this ADR does not cover adversarial rule IDs in output channels
— see ADR-0008 for trailer quoting.
