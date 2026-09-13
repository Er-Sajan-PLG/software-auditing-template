# 21. Catalogues are pinned, and automatability is derived

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

`docs/standards-mapping.md` maps USA's sections and representative rules to the
standards they draw from — ASVS, CWE, SSDF, SLSA, Scorecard, WCAG, and the rest.
The mapping was prose. It named versions ("ASVS 5.0", "SLSA v1.2", "Scorecard
v5.5.0") that no code checked, and it could not answer two questions a consumer
of an audit tool reasonably asks:

1. **How much of each standard does USA actually cover?** The document listed
   where USA's sections _differ_ from the field, but not what fraction of a
   standard is represented, nor which rules map to it.
2. **How much of each rule can the engine decide on its own?** A rule backed by
   a `grep` is settled deterministically; a rule backed by a `command` needs
   `--allow-commands`; a rule backed by `manual` needs a human. Nothing in the
   data said which was which, so the split could only be described in prose —
   and prose about a count is exactly what [ADR-0020](0020-machine-synced-documentation.md)
   exists to eliminate.

Two naive designs were rejected:

- **A new per-rule `catalogue:` field for all 281 rules.** Redundant. Every rule
  that draws from a standard already cites it in `references:` (`CWE-754`,
  `ASVS-2.4.1`, `OWASP-MASVS-STORAGE-1`). A second field would be a copy that
  drifts from the citation that justifies it.
- **A new per-rule `automatability:` field.** Redundant for the same reason:
  the check kind is the ground truth. A rule with `kind: grep_wrong` is
  deterministic by construction; asking the author to also write
  `automatability: full` invites the tag to disagree with the check.

## Decision

**A rule's catalogue and automatability are derived, with a pinned registry as
the single source for versions and an explicit override as the escape hatch.**

**1. A catalogue registry.** `rules/catalogues.yaml` (schema
`usa-catalogues-v1`) lists every standard USA draws from, each pinned:
`id`, `name`, a `version`, the reference `prefixes` that identify it, and a
`url`. Versions live in exactly one place. A catalogue with no `version` is
skipped with a warning — an unpinned standard is the drift this registry exists
to stop.

**2. Catalogue is derived from `references:`.** A rule's catalogue is the first
registered prefix that matches one of its references (`CWE-79` → `cwe@4.19`).
No rule needs a new field, and the mapping cannot disagree with the citations
already present. A rule or pack may still set `catalogue:` explicitly, which
wins over derivation; the loader validates that any explicit pin is
`name@version` with a numeric version (`validateCatalogue`).

**3. Automatability is derived from the check kind.** `automatabilityOf` maps
each kind to one of three honest levels:

| Kind                                     | Level    | Why                                          |
| ---------------------------------------- | -------- | -------------------------------------------- |
| `file_exists`, `grep*`, `json*`, `count` | `full`   | a pure function of the tree                  |
| `command`                                | `assist` | opt-in (`--allow-commands`); a human enables |
| `oracle`                                 | `assist` | reads an artifact another tool produced      |
| `manual`, `info`                         | `manual` | judgement, or context that scores nothing    |

A rule or pack may override, but the loader is **fail-closed** (ADR-0009): an
override may _downgrade_ (claim less automation than derived) but never
_upgrade_ to `full` a kind that cannot deliver it. An illegal override is
dropped with a warning and the derived value is used; the rule keeps loading.

**4. `usa standards` reports both.** The CLI loads the real packs and the
registry and prints a table — catalogue, rule count, and the full/assisted/
manual split. `--format json` emits the same rows structurally. The table is
injected into `docs/standards-mapping.md` as a generated block
(`usa:begin standards-coverage`), so ADR-0020's sync/check machinery keeps the
document matched to the rules that exist.

Rules whose references name a concept, a tool, or a blog post rather than a
codified standard (`arc42`, `Testing-Trophy`, `12-Factor`) fall into an honest
`(uncatalogued)` bucket. The registry is deliberately not padded with
non-standards just to raise the number.

## Rationale

1. **Derivation beats declaration.** The catalogue is the citation; the
   automatability is the check kind. Asking authors to restate either creates a
   second source of truth that can only drift.
2. **One place for versions.** A standard revision is a one-line change in
   `catalogues.yaml`, not a sweep across rules and prose.
3. **Fail-closed stays consistent.** An updatable-in-error tag cannot claim more
   automation than the engine actually has, matching the engine's refusal to
   report a verdict it cannot support.
4. **The mapping becomes checkable.** Because the table is generated from the
   loaded rules, `docs/standards-mapping.md` can no longer describe rules that
   were renamed or removed — ADR-0020's gate fails the build if it does.

## Consequences

**Good:** `usa explain` prints each rule's effective catalogue and
automatability; `usa standards` answers "how much of ASVS does USA cover, and
how much of that is automatic?" without a human counting; the standards doc is
machine-synced. The 281 shipped rules classify as 170 full / 4 assist / 107
manual, and 194 carry a pinned catalogue — numbers the tool reports itself.

**Bad:** the `(uncatalogued)` bucket is large (87 rules) because many rules are
internal heuristics with no external standard. That is honest but easy to
misread as an omission; the documentation must state plainly what the bucket
means. Derived automatability is only as good as the kind→level mapping, which
is a judgement encoded in `automatability.ts` — changing it changes the reported
split for every rule at once.

**Neutral:** the registry introduces a new file format to maintain when a new
standard is adopted, but adding a standard is still less work than tagging each
rule that cites it. Explicit `catalogue:`/`automatability:` overrides remain
available for the cases where derivation is wrong, and are validated rather than
trusted.
