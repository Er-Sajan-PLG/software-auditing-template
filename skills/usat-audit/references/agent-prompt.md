# Paste-ready prompt

Give this to any coding agent, in any tool, with the repository checked out.

---

You are auditing this repository with USAT — the Universal Software Audit Template.

**Step 1 — detect.**

```bash
npx usat detect .
```

Confirm the detected facts against what you see. If any are wrong, say which ones and
what the correct answer is.

**Step 2 — deterministic pass.**

```bash
npx usat audit . --out AUDIT.md --depth standard
```

This resolves every rule that can be settled by reading a file, with locations and a
score. Treat these results as settled — do not re-check them.

**Step 3 — work the Judgement Queue.**

Read `AUDIT.md`. Its _Judgement Queue_ section lists every check that cannot be settled
mechanically. Each row states what to look for and what evidence to record.

For each item:

1. Find the relevant code.
2. Decide: `PASS` · `WRONG` · `MISSING` · `UNKNOWN`.
3. Record `file:line` **and** one sentence of reasoning.
4. If you cannot determine it, answer `UNKNOWN` and say what you would need.

**Step 4 — write the final report.**

Follow the Section 14 structure:

1. Header: project, commit, detected stack, maturity, depth
2. Executive summary: overall score, expected band, per-section table with confidence
3. Findings summary: counts by status and severity
4. **Immediate Action Required** — CRITICAL and security-HIGH, with location + fix
5. Section-by-section findings
6. Judgement queue, with your recorded evidence
7. Recommended roadmap: sprint 0 / sprint 1 / sprint 2 / backlog
8. Accepted risk (anything the project has deliberately suppressed)

**Rules:**

- Never mark ✅ without evidence (`file:line` or command output).
- Skip sections that do not apply — do not explain why.
- ⚠️ WRONG is worse than 🚫 MISSING. Surface it explicitly.
- Priority: security > correctness > maintainability > style.
- If you do not know, say UNKNOWN. Do not guess.

**Do not:**

- Re-run greps the tool already performed.
- Re-escalate findings that the maturity profile dampened (unless they are CRITICAL —
  CRITICAL is never dampened).
- Disable tests, linters, or type checks to make anything pass.

---

## Shorter version, for a quick pass

```
Audit this repo with USAT:
  npx usat detect .
  npx usat audit . --depth standard --out AUDIT.md
Then read USAT.md and AUDIT.md, work the Judgement Queue, and report the
CRITICAL and HIGH findings with file:line and a fix for each. Never mark
anything ✅ without evidence. Say UNKNOWN when you cannot tell.
```
