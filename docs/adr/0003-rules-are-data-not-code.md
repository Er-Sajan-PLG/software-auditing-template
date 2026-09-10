# 3. Rule packs are YAML data, not TypeScript code

- **Date:** 2026-09-08
- **Status:** Accepted

## Context

The alternative design was a plugin API: each rule pack is a TypeScript module
exporting checks, loaded dynamically. That is what Semgrep started with, what
ESLint does, and what most mature linters converge on — because a rule that can
run arbitrary code can express anything.

## Decision

A rule pack is a **YAML file**. The engine supplies exactly fifteen check kinds
(`file_exists`, `grep_present`, `json_path`, `count_min`, `manual`, …). A pack
declares what to look for; the engine does the looking. `manual` is the escape
hatch for anything a regex cannot honestly decide.

## Rationale

1. **Forkability is the product.** USA is a _template_. A user who wants their
   company's engineering standard should be able to fork `rules/`, delete what
   they disagree with, and commit. Data can be diffed, reviewed, vendored, and
   disagreed with in a pull request. A plugin ABI can only be _used_.
2. **Rules get read by non-authors.** A security lead who will never open
   `src/` can still read `rules/core/security.yaml` and say "that's wrong, and
   here's why."
3. **No sandboxing problem.** Running third-party rule code is running
   third-party code. Data cannot exfiltrate your source tree.
4. **The audit is reproducible.** Rules are declarative, so the same tree always
   produces the same findings — no rule can depend on the date, the network, or
   a cache.

## Consequences

**Good:** packs are auditable by the people who own the standard; adding a
framework is a five-line diff; no sandboxing; deterministic output; the same
packs could drive a second engine in another language.

**Bad:** the fifteen check kinds are a ceiling. Anything needing real parsing —
"this SQL string is built by concatenation" — cannot be expressed, and lands in
the `manual` queue instead. That is deliberate (a scanner that guesses at taint
analysis produces confident nonsense), but it caps automation coverage at roughly
70–80%, which is why the report shows a confidence figure instead of pretending
otherwise.

**Neutral:** adding a sixteenth check kind requires a TypeScript change. This has
happened zero times since the initial design, which suggests the set is close to
sufficient.
