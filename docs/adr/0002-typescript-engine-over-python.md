# 2. Build the engine in TypeScript, not Python

- **Date:** 2026-09-08
- **Status:** Accepted
- **Supersedes:** an earlier `src/auditor.py` prototype (deleted)

## Context

USAT audits software projects. Most of those projects are JavaScript or
TypeScript, and the two natural candidate languages for the tool were:

- **Python**, the traditional home of linters and security tooling
  (Bandit, Semgrep's original core, most scanners).
- **TypeScript**, which can run in the same process and on the same runtime as
  the projects it audits.

The repository already contained a bare-minimum `src/index.ts` stub when this
work started, which biased towards TypeScript but did not decide it.

## Decision

Build the engine in TypeScript, published as an npm package, distributed as a
GitHub Action.

## Rationale

1. **The audience is the runtime.** Anyone auditing a Node project already has
   Node. `npx usat audit .` requires no interpreter negotiation, no virtualenv,
   no `pip install --user` foot-gun.
2. **TypeScript's type system pays for itself here.** The engine is a
   tree-walker with fifteen check kinds and a scoring formula; those are exactly
   the shapes where a compiler catches the "renamed a field, missed a call site"
   class of bug.
3. **GitHub Actions runs Node natively.** A TypeScript action starts in
   milliseconds; a Python action pays interpreter setup on every run.

## Consequences

**Good:** zero-install path for the largest audience; `tsc` catches whole bug
classes; the Action is fast; the tool audits itself with `npm run self-audit`.

**Bad:** Python, Go, Rust, and Java projects auditing themselves now need Node
present, even though the tool has nothing to do with Node. This is a real cost
and the reason the Action exists — CI brings the runtime so the user does not
have to. The check _contents_ are language-agnostic (globs and regexes), so a
future second engine would reuse all 27 rule packs unchanged.

**Neutral:** `pyproject.toml` and `src/auditor.py` were deleted; the CONTRIBUTING
document was rewritten to match.
