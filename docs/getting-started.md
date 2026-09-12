# Getting started

## Install

```bash
npx @xenos1996/usa audit .          # zero-install
npm i -g @xenos1996/usa             # or globally
npm i -D @xenos1996/usa             # or per project, so CI and laptops agree
```

Requires Node 20+. No network access is needed at audit time, and USA never
uploads anything — it reads files and writes one Markdown file.

## Your first audit

```bash
cd ~/code/my-project
usa detect .     # 1. check what it thinks you are
usa audit .      # 2. audit it
open AUDIT.md
```

Start with `detect`. If the detected facts are wrong, the report will be wrong —
and fixing it takes one line of config:

```yaml
# .usa.yaml
facts: ['has:database'] # assert anything detection missed
```

## Reading the report

**1 · Look at the band, not the number.**

```
Overall Health Score: 71.4/100
Expected band for Beta / Growing: 60–85 — within the expected band 👍
```

A 55/100 on a prototype is healthy. The same 55/100 on a production service is a
problem. USA tells you which you are looking at.

**2 · Read Immediate Action Required.** CRITICAL and security-HIGH findings, with
location and fix. Everything else waits.

**3 · Check confidence before celebrating.**

| Dimension          | Score | Confidence |
| ------------------ | ----- | ---------- |
| S10 · Dependencies | 10/10 | 25%        |

A 10/10 at 25% confidence means one of four applicable rules could be checked
automatically. The other three are in the judgement queue. Sections where
_nothing_ could be verified say **"— not verified"** and are excluded from the
total rather than quietly scoring 10.

**4 · Work the judgement queue.** These are the checks grep cannot settle. Take them
to an agent or a reviewer. Every row says what to look for and what evidence to
record. **Do not mark anything ✅ without evidence.**

**5 · Ship the roadmap.** SPRINT 0 → SPRINT 1 → SPRINT 2 → BACKLOG, generated from
severity. `DEFERRED` lists what the maturity profile says you should deliberately
ignore _at this stage_.

## Common flags

```bash
usa audit . --depth deep                 # include deep-only rules (cycles, duplication, complexity)
usa audit . --profile production         # grade against the full bar regardless of age
usa audit . --fail-on high               # exit 1 on HIGH+ (for CI gates)
usa audit . --out reports/2026-09.md     # dated reports, so you can diff them later
usa audit . --allow-commands             # run shell checks (npm audit, depcheck, dpdm)
usa audit . --include stacks/solidity    # force a pack on
usa rules --section S2                   # list rules
usa explain SEC-001                      # everything about one rule
```

`--allow-commands` is **off by default** because it shells out. Those rules appear
as ❓ NEEDS REVIEW until you enable it — which is the point: they are real checks,
they just need your permission to run.

## Compare two audits

```bash
usa audit . --out reports/2026-06.md
# ... three months of work ...
usa audit . --out reports/2026-09.md
usa diff reports/2026-06.md reports/2026-09.md
```

The diff reads the YAML trailer embedded in every report — so a Markdown report is
still the only artefact you need to keep.

## Next steps

- [Concepts](concepts.md) — how severity, status, and scoring actually work
- [Configuration](configuration.md) — `.usa.yaml` reference
- [Rule packs](rule-packs.md) — write your own rules
- [Agent integration](agent-integration.md) — drive USA from Claude, Cursor, Codex
