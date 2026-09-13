# Architecture

USA is a **rule interpreter**, not a linter. Nothing about any particular
language, framework, or standard is hard-coded in TypeScript. The engine knows
how to walk a directory, match a glob, grep a file, and do arithmetic on
weights. Everything _opinionated_ lives in `rules/`, as YAML.

That split is the whole design. It is why a user can delete every pack we ship,
drop in their own, and still get a working audit — and why adding support for a
new framework is a five-line YAML diff rather than a release.

## The five stages

```
   project tree
        │
        ▼
  ┌───────────┐   rules/detectors.yaml    ┌──────────┐
  │  Project  │ ─────────────────────────▶│  Facts   │  lang, pm, fw, maturity…
  │  (index)  │                           └────┬─────┘
  └───────────┘                                │
        │                                      ▼
        │                        ┌──────────────────────────┐
        │                        │  Pack selection          │
        │                        │  pack.applies_when ⊨ facts│
        │                        └────────────┬─────────────┘
        │                                     ▼
        │                        ┌──────────────────────────┐
        │                        │  Rule evaluation         │
        │                        │  <!-- usa:fact check-kinds -->16<!-- /usa:fact --> check kinds → status │
        │                        └────────────┬─────────────┘
        │                                     ▼
        │                        ┌──────────────────────────┐
        └───────────────────────▶│  Maturity dampening      │
                                 │  severity × profile      │
                                 └────────────┬─────────────┘
                                              ▼
                                 ┌──────────────────────────┐
                                 │  Scoring → report        │
                                 │  Markdown · JSON · SARIF │
                                 └──────────────────────────┘
```

| Module        | File                                            | Responsibility                                                                                                            |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Project index | `src/util/project.ts`                           | One pass over the tree. Honours `.gitignore` + user ignores. Caches reads. Never greps lockfiles.                         |
| Glob matcher  | `src/util/glob.ts`                              | Dependency-free glob → RegExp. Handles `**`, `{a,b}`, `[abc]`, `?`.                                                       |
| YAML shape    | `src/util/yaml.ts`                              | Makes the parse boundary explicit, so a typo in a pack is a warning, not `undefined`.                                     |
| Detection     | `src/detect/index.ts`                           | Evaluates <!-- usa:fact detectors -->236<!-- /usa:fact --> detector primitives into a fact set, then classifies maturity. |
| Pack loading  | `src/engine/loader.ts`                          | Parses + validates packs, applies user overrides. Bad packs warn, never crash.                                            |
| Evaluation    | `src/engine/evaluate.ts`                        | Runs one check against the index; resolves `applies_when` predicates.                                                     |
| Maturity      | `src/engine/maturity.ts`                        | Dampens severity by lifecycle stage. CRITICAL is never dampened.                                                          |
| Scoring       | `src/engine/score.ts`                           | Weighted credit arithmetic. Returns `null` for unverified sections.                                                       |
| Report        | `src/report/`                                   | Deterministic Markdown (+ YAML trailer), JSON, and SARIF 2.1.0 — three views of one report.                               |
| Diff          | `src/engine/diff.ts`                            | Compares two reports via their trailers.                                                                                  |
| Evolution     | `src/evolution/`, `src/store/`, `src/snapshot/` | Optional self-extension loop; see [EVOLUTION.md](EVOLUTION.md).                                                           |

## Why the fact system

A rule that checks something needs to know when it is relevant. The naive
approach — `if (hasFile('package.json'))` — is a decision hard-coded in the
rule, invisible to the reader and impossible to override.

USA separates the two. Detectors produce **facts** (`lang:typescript`,
`fw:next`, `maturity:mvp`, `has:ci`). Rules declare **predicates over facts**
(`applies_when`). The consequence:

- Detection is shared. Two hundred rules can key off `lang:typescript`
  without re-deriving it.
- Users can inject facts (`--fact monorepo`, or `facts:` in `.usa.yaml`)
  when detection guesses wrong.
- `usa detect` prints the fact set, so a wrong audit is _debuggable_ — you
  can see exactly what the engine believes before you argue with it.

## Why severity dampening exists

A prototype with no rate limiting and a payment service with no rate limiting
are not the same finding. Most scanners report both as HIGH, which teaches
teams to ignore the scanner.

USA keeps the _rule's_ severity (the intrinsic badness) and computes a
_reported_ severity from the project's lifecycle stage. The rule never lies
about what it found; the report just stops shouting about the wrong things
right now. CRITICAL is exempt — a hardcoded credential is a hardcoded
credential on day one.

## Why scores can be `null`

A section the engine could not verify is not a 10 and it is not a 0. It is
_unknown_, and it is excluded from both the numerator and the denominator.
Pretending otherwise is how dashboards end up at 94/100 while 30% of the
checklist sits in a queue nobody reads. Every section therefore reports a
**confidence** figure alongside its score.

## Performance

The tree is walked once. File contents are cached lazily and never read twice.
Grep excludes lockfiles, minified bundles, source maps, and generated files,
which is where the bytes are. A repository of 10k files audits in a couple of
seconds; the cost is `O(patterns × matching files)`, not `O(patterns × repo)`.

## What USA deliberately does not do

- **No plugins.** Packs are data. Data can be forked, diffed, reviewed, and
  vendored; a plugin ABI cannot.
- **No network calls.** Ever. An audit must be reproducible offline.
- **No auto-fixing.** USA reports; humans decide. (It does print the exact
  remediation text, which is the part that actually helps.)
- **No daemon, no config server.** One process, one tree, one report. The
  optional [evolution loop](EVOLUTION.md) can persist runs to a local,
  content-addressed store (`--store`), but a plain `usa audit` touches nothing
  outside the target tree and its `--out` file.

## Extension points

| To add…                         | You touch…                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------- |
| A check                         | any `rules/**/*.yaml`                                                             |
| A technology USA must recognise | `rules/detectors.yaml`                                                            |
| A lifecycle profile             | `rules/profiles/maturity.yaml`                                                    |
| A new check _kind_              | `src/engine/evaluate.ts` + `src/types.ts` — the only change that needs TypeScript |

See [`adr/`](adr/) for the decisions behind each of these.
