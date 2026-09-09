# Configuration — `.usat.yaml`

Generate one with `usat init`. Every field is optional; a missing file is fine.

```yaml
version: 1

# ── Lifecycle stage ────────────────────────────────────────────────────────
# Override auto-detection: prototype | mvp | beta | production | legacy
maturity: production

# ── Rule packs ─────────────────────────────────────────────────────────────
include: [stacks/solidity] # force on, regardless of detection
exclude: [stacks/mobile] # force off

# ── Per-rule overrides ─────────────────────────────────────────────────────
rules:
  DOC-003:
    severity: LOW
    reason: 'Docs live in Notion, not the repo (decision: ADR-014)'
  SEC-042:
    disabled: true
    reason: 'No user-facing auth in this worker'
  CQ-010:
    weight: 4

# ── Accepted risk ──────────────────────────────────────────────────────────
suppressions:
  - rule: PERF-005
    reason: 'Known N+1 in the admin panel; 40 rows max.'
    until: '2026-12-31'

# ── Indexing ───────────────────────────────────────────────────────────────
ignore: # extra globs, on top of .gitignore + USAT defaults
  - 'generated/**'
  - 'vendor/**'

# ── Facts ──────────────────────────────────────────────────────────────────
facts: # assert what detection could not infer
  - 'has:database'
  - 'platform:server'
```

## Field reference

| Field                 | Type                    | Effect                                                                         |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `version`             | `1`                     | Schema version                                                                 |
| `maturity`            | stage                   | Overrides auto-detection; changes dampening and the expected band              |
| `include`             | pack ids                | Force packs on even when `skip_when` says no                                   |
| `exclude`             | pack ids                | Force packs off                                                                |
| `rules.<id>.severity` | severity                | Re-grade one rule (must be on the ladder, else ignored with a warning)         |
| `rules.<id>.weight`   | number                  | Change how much it moves the score (finite, ≥ 0, else ignored with a warning)  |
| `rules.<id>.disabled` | bool                    | Skip entirely (still listed as ➖ SKIPPED)                                     |
| `rules.<id>.reason`   | string                  | **Required in practice** — an override with no reason is an unaudited decision |
| `suppressions[]`      | `{rule, reason, until}` | Excluded from the score, listed under Accepted Risk                            |
| `ignore`              | globs                   | Extra paths to keep out of the index                                           |
| `facts`               | fact strings            | Assert detection facts manually (`ns:value`)                                   |
| `sections`            | section ids             | Restrict the report to these sections                                          |

## What is indexed

The file index skips, in order:

1. `.git/`
2. `DEFAULT_IGNORES` — `node_modules/`, `dist/`, `build/`, `.next/`, `venv/`, `target/`, media, archives, binaries
3. Your `.gitignore`
4. `ignore:` from `.usat.yaml`

Lockfiles **are** indexed (a rule asking "is a lockfile committed?" has to see them)
but are never grepped — they are huge and full of false positives. Files over 2 MB
and anything with a NUL byte in the first 8 KB are skipped as binary.

Build-output checks therefore use `tracked_absent`, which asks git what is tracked
rather than what is on disk:

```yaml
- id: REPO-007
  check:
    kind: tracked_absent
    patterns: ['dist/**', 'build/**', 'node_modules/**']
```

## Rules of thumb

**Prefer `facts:` over `ignore:`.** If detection is wrong, say what is true:

```yaml
facts: ['has:database', 'orm:prisma']
```

**Prefer a suppression over disabling a rule.** A suppression stays visible in the
report under Accepted Risk; a disabled rule disappears and takes its knowledge with it.

**Waivers expire — and expiry fails closed.** An `until` date in the past, or
one that cannot be parsed as a date, excludes the suppression with a warning
and the finding reports normally. Use unambiguous ISO dates (`2026-12-31`).
An audit must never silently honour dead risk acceptances (see ADR-0007).

**`include` forces packs on wholesale.** A force-loaded pack applies all its
rules regardless of depth and `applies_when` — that is the documented
contract, and the operator is responsible for what they force on.

**Keep `.usat.yaml` in the repo.** It is the audit trail for every exception you
have taken. A reviewer should be able to read it and understand what the team decided.
