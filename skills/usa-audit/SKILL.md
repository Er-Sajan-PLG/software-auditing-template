---
name: usa-audit
description: >
  Audit any software repository with USA (Universal Software Auditor).
  Use when asked to audit, review, assess, or score a codebase; when asked for a
  security review, code-quality review, tech-debt assessment, pre-release check,
  or "is this production-ready?". Auto-detects the stack, activates the applicable
  sections, grades against a maturity-appropriate bar, and produces a
  severity-tagged report with a prioritised roadmap.
license: MIT
---

# USA audit

Audit any project, any stack, any stage — and grade it against a bar appropriate to
how old it is.

## When to use

- "Audit this repo" / "review this codebase" / "is this production-ready?"
- Security review, tech-debt assessment, pre-release or pre-raise diligence
- Onboarding onto an unfamiliar codebase (the report is a map)
- Periodic drift checks: run it monthly and `usa diff` against the last one

## Do not

- Do not use it as a penetration test. It finds open doors; it does not walk through
  them. Say so if someone treats a clean report as a security guarantee.
- Do not re-do the tool's work. If the CLI already resolved a rule, it is settled.
- Do not guess. `UNKNOWN` is a valid answer and keeps the confidence figure honest.

## Process

### 1 · Detect

```bash
npx @xenos1996/usa detect .
```

Read the facts. If any are wrong, say so — the operator can assert them with
`--fact has:database` or in `.usa.yaml`.

### 2 · Deterministic pass

```bash
npx @xenos1996/usa audit . --out AUDIT.md --depth standard
# --depth deep        for architecture/coupling/complexity rules
# --profile production to grade against the full bar regardless of age
```

This resolves ~70% of applicable rules with file:line evidence. **Treat these as
settled.**

### 3 · Work the Judgement Queue

The report's _Judgement Queue_ is your actual task list: every check that cannot be
settled by reading a file. Each row says what to look for and what evidence to record.

For each item: find the code → decide `PASS` / `WRONG` / `MISSING` / `UNKNOWN` →
record `file:line` plus one sentence of reasoning.

### 4 · Report

Follow the report output template (`references/report-template.md`). CRITICAL and
security-HIGH first, then section-by-section, then the roadmap, then the judgement
queue with your evidence filled in.

## The ten rules

| #   | Rule                                                                           |
| --- | ------------------------------------------------------------------------------ |
| 1   | **Skip non-applicable sections silently.** No "N/A: not a web app" × 40.       |
| 2   | **Partially applicable ⇒ audit the applicable parts only.**                    |
| 3   | **CRITICAL first**, above every summary and chart.                             |
| 4   | **Never mark ✅ without evidence** — `file:line`, command output, or doc link. |
| 5   | **Every finding: location + severity + why + fix.**                            |
| 6   | **Score sections 0–10** from the share of applicable checks that pass.         |
| 7   | **Never assume.** A file you did not find is 🚫 MISSING.                       |
| 8   | **Audit what is absent** as well as what is present.                           |
| 9   | **⚠️ WRONG is worse than 🚫 MISSING.** Surface it.                             |
| 10  | **Priority: Security > Correctness > Maintainability > Style.**                |

## Severity × status

**Severity** (how bad, if violated): 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · 🟢 LOW · 🔵 FUTURE

**Status** (what you observed):

|     | Status       | Credit   |
| --- | ------------ | -------- |
| ✅  | GOOD         | 1.00     |
| 🧪  | EXPERIMENTAL | 0.50     |
| 💀  | DEPRECATED   | 0.40     |
| ⚠️  | WRONG        | 0.15     |
| 🚫  | MISSING      | 0.00     |
| ❓  | NEEDS REVIEW | excluded |

⚠️ WRONG scoring above MISSING is deliberate: something exists, so there is partial
credit — but a wrong implementation is _more dangerous_ than nothing, because it looks
finished.

## Maturity awareness

Detected stage: 🌱 prototype · 🚀 mvp · 🧪 beta · 🏭 production · 🏚️ legacy

Severity is dampened by stage — **except 🔴 CRITICAL, which is never dampened at any
stage.** If a finding says _"Downgraded HIGH → MEDIUM by the MVP profile"_, that is the
framework working. Leave it alone.

Read the **band**, not the number: 55/100 is healthy for a prototype and alarming for
production.

## Red flags in your own work

- Reporting ✅ for something you did not open. **Rule 4 exists because of this.**
- Re-grepping a rule the tool already resolved.
- Escalating every dampened finding — you are grading a prototype like a bank.
- A report with no UNKNOWNs. Either it is a tiny project or you guessed.
- Findings without locations. Unactionable.

## References

- [`references/sections.md`](references/sections.md) — the 16 sections and when each applies
- [`references/check-catalogue.md`](references/check-catalogue.md) — what to look for, per section
- [`references/report-template.md`](references/report-template.md) — output structure
- [`references/agent-prompt.md`](references/agent-prompt.md) — a prompt you can paste

Upstream: [`USA.md`](../../USA.md) · [`docs/`](../../docs)
