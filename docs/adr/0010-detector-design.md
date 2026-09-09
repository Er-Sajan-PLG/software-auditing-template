# 10. Detectors are cheap syntactic signals resolved to a fixed point

- **Date:** 2026-09-09
- **Status:** Accepted

## Context

Rule selection needs facts ("is this a Node project? does it have a
database?"), and facts must come from the tree itself with no network, no
build, and no language server. The temptation is a clever detector: parse
`pyproject.toml` properly, resolve `extends` chains in tsconfig, understand
TOML tables. The constraint is that detectors run over arbitrary repos in
milliseconds and must never crash the audit.

The opposing risk is over-firing: docs, tests, examples, and templates _talk
about_ technology without _using_ it. A detector that counts the word
"postgres" in `docs/` reports a database the project does not have.

## Decision

1. **Syntactic signals only.** Detectors match file names, directory names,
   manifest keys, and single-line content patterns. No parsing beyond
   section-scoped text search and JSON path lookup.
2. **Prose is excluded from content signals.** Markdown, docs, examples,
   templates, tests, fixtures, and mocks never count as technology evidence
   (`CONTENT_EXCLUDES`). A deliberately conservative list, extended only
   with evidence of a miss — `__tests__/`, `spec/`, and `*.stories.*` were
   added after review showed Jest and Storybook layouts leaking through.
3. **Manifest queries are section-scoped where sections exist.** A dotted
   key (`tool.poetry.dependencies`) must match a full header segment
   (case-insensitive; `[dev-dependencies]` is not `[dependencies]`), the
   leaf must match on word boundaries (`test` is not `latest`), and
   `contains` is checked against the matched block — never the whole file.
   Flat files with no headers keep whole-text search (YAML has no sections
   to scope to).
4. **`implies` chains resolve to a fixed point**, bounded by
   `detectors.length + 1` passes with early exit. Two hardcoded passes
   silently dropped chains of length 3+ declared worst-first, inflating
   scores — the bound is now structural, not a magic number.

## Consequences

**Good:** detection is fast, total (no network), crash-free, and order-
independent. The precision rules above each cite the false positive they
killed, so future relaxations know what they are re-introducing.

**Bad:** syntactic detection has a ceiling: `extends` chains leaving the
repo, aliased imports, and commented-out config are invisible. Detectors
report evidence, not proof — rules that need proof belong in the judgement
queue, not in a cleverer regex.

**Neutral:** the fixed-point bound is `detectors.length + 1` passes worst
case; typical runs exit after two. Performance is unchanged for existing
registries.
