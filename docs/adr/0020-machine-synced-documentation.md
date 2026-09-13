# 20. Documentation facts are machine-synced and machine-checked

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

The same facts appear in many documents: the rule count, the number of packs,
detectors, sections, and check kinds, the current version, and the CLI help.
Every one of them drifted at least once — the detector count said 230 when it
was 236; the sample report said USA 1.0.0 while the package was 2.0.1; a
`rules/sections.yaml` that never existed was linked from three files; a
`grep_experimental` check kind was documented that no code implemented. Two
sections of `USA.md` were both numbered 14.

A full manual documentation pass fixed all of that (commit `daabf29`), but a
manual pass is not a system. The repository is deliberately good at refusing to
let code rot: lint, typecheck, coverage thresholds, ADR hygiene, a generated
CLI reference. Documentation was the one surface guarded only by discipline,
and discipline is exactly what fails at 10,000 lines across 1,000 files.

Two failure classes were conflated under "keep the docs updated":

1. **Mechanical facts** — counts, versions, CLI help, cross-links. A machine
   can own these completely: derive them from source, write them in, fail the
   build when they drift.
2. **Prose truth** — "is this sentence still accurate?" A machine cannot own
   this. It needs a reader, and no amount of tooling removes that.

This ADR removes class 1 entirely so human attention is spent only on class 2.

## Decision

Documentation facts are **derived from source and enforced by CI**, using
in-repo markers plus a single facts computation.

**Markers** (HTML comments, so they survive Prettier and render invisibly):

```markdown
Rules: <!-- usa:fact rules -->281<!-- /usa:fact -->

<!-- usa:begin rules-tree -->

generated block, replaced wholesale
<!-- usa:end rules-tree -->
```

**One facts source.** `scripts/lib/docs-sync.mjs` computes every shared fact
from the checked-in files — `rules/index.yaml` (rule and pack counts),
`rules/detectors.yaml`, `src/engine/sections.ts`, `src/types.ts`, `docs/adr/`,
and `package.json` (version). Offline, deterministic, no network.

**Sync writes; check verifies by re-deriving.** `scripts/sync-docs.mjs` rewrites
every marker in place (idempotent). `scripts/check-docs.mjs` recomputes and
diffs; it never trusts a stored value, so the two scripts cannot disagree.

**Automation at three layers:**

1. **Pre-commit** (`scripts/docs-autosync.mjs`, in the husky hook): syncs and
   re-stages marked docs, so a contributor who changes a count commits the
   corrected count without knowing the mechanism exists.
2. **CI** (`npm run docs:check`): fails the build on any drift, and additionally
   enforces link integrity (targets **and** heading anchors), index coverage
   (every `docs/**/*.md` listed in `docs/README.md`), version pins
   (`@xenos1996/usa@N` matches the major; `SECURITY.md` lists it), banned stale
   strings (`from 'usa'`, `rules/sections.yaml`, `grep_experimental`,
   `@xenos1996/usat`, `Section 14 template`), and unique section numbers.
3. **Scripts** (`docs:sync`, `docs:check`, `docs:adrs`, `docs:cli`, `docs:all`).

## Rationale

1. **Class 1 becomes impossible to get wrong.** A count that moves updates
   itself; a link that breaks fails the build. There is no "remember to update
   the docs" step left for the mechanical half.
2. **Markers survive formatting.** HTML comments are untouched by Prettier
   (verified), so the mechanism composes with the existing format gate instead
   of fighting it.
3. **Checks re-derive, never trust.** Because `check` computes the fact again
   rather than reading a cached value, a stale file is detected even if the
   sync was never run.
4. **Prose is explicitly out of scope.** The system never pretends to judge
   whether a sentence is true, which keeps it honest about what it guarantees.
5. **It scales.** Marker regions are bounded, so adding a fact to 1,000 files
   is still one derivation and one string replace per file.

## Consequences

**Good:** counts, versions, CLI help, and links are self-maintaining. CI names
the exact file that drifted. The repository can grow to thousands of docs
without a documentation-update task ever being created again for a mechanical
fact.

**Bad:** markdown now contains marker comments, which are noise to anyone
editing the raw text. A contributor who wants to hand-edit a _count_ will have
their edit overwritten by the sync — that is intentional (edit the source, not
the mirror), but it must be explained, which this ADR and the docs do.

**Neutral:** the system governs only docs that opt in by containing a marker,
plus the global checks (links, index, pins, banned strings) that apply to every
tracked markdown file. Prose fidelity remains a periodic review, now cheap
because the facts no longer need re-verifying.
