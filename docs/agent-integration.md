# Agent integration

USA is built to be driven by an AI agent. The division of labour is explicit:

|                      | Who           | Why                                                                             |
| -------------------- | ------------- | ------------------------------------------------------------------------------- |
| Deterministic checks | **the tool**  | An LLM grepping 400 files is slow, expensive, and non-deterministic             |
| Judgement checks     | **the agent** | Coupling, authorisation, threat modelling — nothing settles these but reasoning |
| The report           | **both**      | Tool renders it; agent fills the judgement queue                                |

The tool settles roughly 70% of applicable rules on a typical project. The agent's
job is the remaining 30% — the interesting 30%.

## The workflow

```bash
usa audit . --out AUDIT.md    # 1. deterministic pass
```

Then, to the agent:

> Read `USA.md` and `AUDIT.md`.
> Work the **Judgement Queue** at the bottom of the report.
> For each item, find the evidence and record `file:line` plus one sentence of
> reasoning. Do not mark anything ✅ without evidence (Rule 4).
> Then rewrite the report with your findings folded in.

## Why this is better than "audit this codebase"

A bare prompt produces three failure modes, and the template exists to prevent all
three:

| Failure                                                             | How USA prevents it                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Confident invention** — "✅ MFA is implemented" with no such code | Rule 4: no ✅ without evidence; every judgement item states what proof looks like |
| **Wrong scope** — Solidity reentrancy checks on a Next.js blog      | Detection + `applies_when`; non-applicable sections are skipped silently (Rule 1) |
| **Wrong severity** — a prototype graded like a bank, or vice versa  | Maturity profiles, with a hard floor on CRITICAL                                  |

## Shipped packs

### Agent Skills (`SKILL.md`)

```bash
cp -r skills/usa-audit ~/.claude/skills/       # Claude Code
cp -r skills/usa-audit .cursor/skills/         # Cursor
```

Follows the Agent Skills convention — YAML frontmatter with `name` and `description`,
detailed content in `references/` [1](https://github.com/addyosmani/agent-skills/blob/main/CLAUDE.md).
The same directory works across Claude Code, Cursor, Codex, Gemini CLI, Copilot, and
~60 other tools.

### `AGENTS.md` for a target repository

```bash
usa init .
cp templates/AGENTS.audit.md AGENTS.md
```

Gives any agent working in that repo the build/test/lint commands, the conventions,
and an explicit denylist — which is worth doing on its own. Agent instruction files
are executable-ish: they commit as easily as code and agents follow them literally
(see `AI-011`).

## Prompt you can paste

```
You are auditing this repository with USA (Universal Software Auditor).

1. Run: usa detect .
   Confirm the detected facts. If any are wrong, say so and note the correct ones.

2. Run: usa audit . --out AUDIT.md

3. Read USA.md (the framework) and AUDIT.md (the deterministic results).

4. Work the Judgement Queue in AUDIT.md. For each item:
   - locate the relevant code
   - decide PASS / WRONG / MISSING
   - record file:line evidence and one sentence of reasoning
   - if you cannot determine it, say UNKNOWN and say what you would need

5. Produce a final report that follows the report output template in USA.md:
   - CRITICAL and HIGH findings first, with location and fix
   - then section-by-section
   - then the roadmap
   - then the judgement queue with your recorded evidence

Rules:
- Never mark ✅ without evidence (file:line or command output).
- Skip sections that do not apply — do not explain why.
- ⚠️ WRONG is worse than 🚫 MISSING. Surface it.
- Priority: security > correctness > maintainability > style.
```

## Using the API directly

```ts
import { runAudit, renderMarkdown, loadProfiles } from '@xenos1996/usa';

const { report, profile, warnings } = runAudit({
  target: process.cwd(),
  rulesDir: 'rules',
  depth: 'deep',
  profile: 'auto',
  config: { version: 1 },
  allowCommands: false,
  usaVersion: '2.0.1',
});

console.log(report.score.overall); // 71.4
console.log(report.score.counts.UNKNOWN); // 18 → send these to the agent
const md = renderMarkdown(report, profile);
```

`report.findings.filter(f => f.status === 'UNKNOWN')` is precisely the agent's task
list, and each item carries `why` and `evidenceHint`.

## Notes for agent authors

- **Do not re-run greps the tool already did.** If a finding is already ✅ or 🚫 with
  locations, the tool settled it.
- **Trust `suppressedReason`.** A suppressed finding was a decision someone made. Mention
  it only if the reason has clearly expired.
- **Respect the maturity profile.** If a finding is marked
  _"Downgraded HIGH → MEDIUM by the MVP profile"_, do not re-escalate it — unless it is
  CRITICAL, which is never downgraded.
- **Say UNKNOWN when you do not know.** It is a valid answer and it keeps confidence
  honest. Guessing is the failure mode this whole framework exists to prevent.
