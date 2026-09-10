# 4. Markdown is the only output format

- **Date:** 2026-09-08
- **Status:** Accepted

## Context

Audit tooling usually emits JSON (for machines), SARIF (for GitHub code
scanning), HTML (for executives), and JUnit XML (for CI). Shipping all four is
the conventional move and roughly quadruples the reporter surface.

## Decision

USA renders **Markdown only**.

Two things make this sufficient:

1. **Every report ends with a machine-readable YAML trailer** inside an HTML
   comment (`<!-- USA:TRAILER:BEGIN -->`). `usa diff` parses it to compare two
   runs; CI thresholds read it; a user who wants JSON can extract it in one line.
   The machine interface exists — it just lives inside the human document rather
   than beside it.
2. **Markdown is the native format of the places audits are read.** GitHub
   renders it in a pull request comment, a gist, an issue, or a repo file. No
   hosting, no build step, no stylesheet.

## Consequences

**Good:** one renderer, one set of golden tests, no format skew. The report
committed to a repo stays readable forever without a viewer. `usa diff old.md
new.md` works on any two reports ever generated.

**Bad:** no native SARIF, so USA findings do not appear in GitHub's **Security**
tab as code-scanning alerts. For teams whose compliance workflow centres on the
code-scanning API this is a genuine gap. The workaround is the PR comment plus
`--fail-on`, which covers the enforcement case but not the dashboard case.

**Neutral:** if SARIF demand materialises, it is a ~100-line addition fed from
the same `AuditReport` object — the trailer already carries everything SARIF
needs, so no engine change would be required. Revisit if three or more issues
ask for it.
