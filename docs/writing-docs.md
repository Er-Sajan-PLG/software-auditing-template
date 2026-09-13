# Writing documentation that does not rot

This is the contract every contributor — human or agent — follows when writing
USAT documentation. It exists because documentation drifts, and drift is a
process failure, not a character failure. Follow the rules and the build keeps
the docs true for you; ignore them and CI names the exact line to fix.

> **The one idea:** anything a machine can derive should be _derived, never
> typed_. Anything a machine cannot derive should be _dated and reviewed_, never
> silently trusted.

See [ADR-0020](adr/0020-machine-synced-documentation.md) for why the system is
shaped this way.

---

## 1 · The two kinds of statement

Every sentence in a doc is one of two things:

| Kind                  | Examples                                                       | Who keeps it true                        |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| **Mechanical fact**   | "281 rules", "16 sections", "package 2.0.1", the CLI help text | **The tooling** — derived from source    |
| **Judgement / prose** | "USA is not a penetration test", "why WRONG scores 0.15"       | **A human/agent review** — no automation |

Rule of thumb: **if you could compute it, do not type it — mark it.** Everything
else is prose, and prose is reviewed, not synced.

---

## 2 · Writing a mechanical fact (markers)

Any number, version, or generated list that describes _USAT itself_ must come
from the source, not your fingers. Wrap it in a marker:

```markdown
Rules: <!-- usa:fact rules -->281<!-- /usa:fact -->
```

The text between the markers is **overwritten** on every sync. Never hand-edit
it — edit the source (the YAML/code the fact is derived from) and let the tool
fill it in.

### The fact vocabulary

Only these keys exist. Using an unknown key fails CI.

| Marker key         | Renders | Derived from                          |
| ------------------ | ------- | ------------------------------------- |
| `rules`            | `281`   | `rules/index.yaml` → pack files       |
| `rules-floor`      | `280+`  | `rules`, rounded down to 10           |
| `detectors-approx` | `~230`  | `rules/detectors.yaml`, floored to 10 |
| `detectors`        | `236`   | `rules/detectors.yaml` exact          |
| `packs`            | `28`    | pack registry                         |
| `core`             | `11`    | `core/` packs                         |
| `stacks`           | `17`    | `stacks/` packs                       |
| `sections`         | `16`    | `src/engine/sections.ts`              |
| `check-kinds`      | `16`    | `src/types.ts`                        |
| `adrs`             | `20`    | `docs/adr/*.md`                       |
| `version`          | `2.0.1` | `package.json`                        |
| `version-major`    | `2`     | `package.json`                        |

### Generated blocks

For something longer than a value — a directory tree, a flag table — use a
block. The content between the markers is replaced wholesale:

```markdown
<!-- usa:begin rules-tree -->
```

rules/
├── index.yaml pack registry
├── detectors.yaml ~230 detection signals → facts
├── profiles/maturity.yaml the five lifecycle profiles
├── core/ 11 universal packs
│ ├── repo.yaml ├── security.yaml ├── supply-chain.yaml
│ ├── architecture.yaml ├── code-quality.yaml ├── testing.yaml
│ ├── cicd.yaml ├── release.yaml ├── dependencies.yaml
│ ├── documentation.yaml └── future-readiness.yaml
└── stacks/ 17 conditional packs
├── node-typescript ├── python ├── go ├── rust
├── jvm ├── web-frontend├── mobile ├── containers
├── iac ├── solidity ├── ml-ai ├── cli
├── data ├── api-backend ├── compliance ├── ai-era
└── swift

```

<!-- usa:end rules-tree -->
```

Block names are fixed in `scripts/lib/docs-sync.mjs`. Add a generator there if
you need a new one; do not inline a block you cannot regenerate.

### If you are an agent

1. Never write a count, size, or version as a literal. If a fact key exists for
   it, emit the marker; the sync fills the value.
2. If no key exists for a number you need, first ask whether it should be a
   fact at all. If it describes USAT and is derivable, add a key to
   `computeFacts()` and a `CLAIM_NOUNS` entry — one place, then it is reusable.
3. Run `npm run docs:sync && npm run docs:check` before you finish.

---

## 3 · What CI enforces (so you do not have to remember)

Run `npm run docs:check` (or let CI run `docs:all`). It fails on:

1. **Marker drift** — a marked value no longer matches source.
2. **Unknown marker key** — a typo in `usa:fact <key>`.
3. **Unmarked claim** — a bare "N rules/sections/packs/detectors/ADRs" that is
   not the current number and is not marked. **Mark it or correct it.**
4. **Sections** — a section id in `sections.ts` never mentioned in `USA.md`.
5. **Flags** — a `--flag` in a `usa …` snippet that does not exist in `--help`.
6. **Links** — a relative link whose target or `#anchor` does not resolve.
7. **Index coverage** — a `docs/**/*.md` not listed in `docs/README.md`.
8. **Version pins** — `@xenos1996/usa@N` not matching the current major; the
   `SECURITY.md` supported-versions table not listing it.
9. **Banned strings** — a known-stale token reappearing (`from 'usa'`,
   `rules/sections.yaml`, `grep_experimental`, `@xenos1996/usat`).
10. **Duplicate section numbers** — two `## 14` headings in one doc.
11. **CLI reference / sample report** — generated files that are out of date.

### Opting a line out of the claim scanner

A line that legitimately uses these words for _another_ project (e.g. "the
standard has 3 sections") carries an explicit comment:

```markdown
This benchmark has 3 sections. <!-- usa:allow-claim -->
```

Explicit, never silent — the reviewer sees the override.

---

## 4 · Writing prose (the part no tool can check)

Markers keep facts true. They cannot keep a _sentence_ true. When you write
prose, follow these rules so the periodic review is cheap:

1. **State what changed, not just what is.** "SARIF is a renderer away" became
   false the day SARIF shipped. Prefer timeless phrasing ("USA can emit SARIF —
   see `--format`") or link to the fact instead of asserting it.
2. **Link, do not duplicate.** If another doc owns a fact, link to it. Two
   copies of the same claim are two things to keep in sync.
3. **Date anything time-sensitive.** "As of 2.1, …" tells the reader when to
   distrust it. Undated prose reads as always-true.
4. **Separate the claim from the evidence.** Say what is true, then say where
   the reader can verify it (a command, a file, a link).
5. **Delete, do not rot.** A whole paragraph describing a feature that is gone
   is worse than nothing — it teaches the reader something false. Remove it or
   move the decision to an ADR (which is immutable by design).

### ADRs are immutable

`docs/adr/**` is **frozen history**. Do not edit an accepted ADR to match the
present; write a new one that supersedes it. The tooling treats ADRs
accordingly: they are exempt from the marker sync and the claim scanner, because
they legitimately quote old states. This is the one place a stale number is
correct.

---

## 5 · The redundancy net (scheduled)

Even with all of the above, two things only a calendar can catch:

- **External links** rot (we never fetch them at audit time — offline is a
  hard invariant — so they are checked **only** on a schedule).
- **Prose review** ages: a sentence can be true the day it is written and false
  a quarter later.

Two scheduled GitHub Actions close this:

| Workflow              | Cadence    | What it does                                                     |
| --------------------- | ---------- | ---------------------------------------------------------------- |
| `docs-link-check.yml` | every 15 d | Fetches every external link in the docs; opens one deduped issue |
| `docs-review.yml`     | every 15 d | Opens one deduped "docs review due" issue with a checklist       |

They are **redundancy, not the primary gate** — CI already blocks mechanical
drift. The schedule exists for the residue that no commit-time check can see.

---

## 6 · The contributor checklist

Before opening a PR that touches docs:

```bash
npm run build            # CLI/sample facts need dist/
npm run docs:sync        # fill every marker from source
npm run docs:check       # fail-fast: markers, claims, links, index, pins
npm run docs:all         # the full gate CI runs
```

Or just commit — the pre-commit hook runs `docs:sync` and re-stages for you —
but run `docs:check` once before pushing, because it catches links and claims
that the sync alone will not.

**You should never need to be told "update the docs."** If a mechanical fact is
wrong, the build reflects it the moment source changes. If prose is wrong, that
is a review, and the schedule is there to prompt it.
