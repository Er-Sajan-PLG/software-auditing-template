# Audit report template

> USA's CLI emits this structure automatically (`usa audit .`).
> Use this file when you are writing a report by hand — or when an agent is
> producing one without the tool. Matching the structure is what makes reports
> diffable and comparable across time and teams.

---

```
══════════════════════════════════════════════════════════
              UNIVERSAL SOFTWARE AUDIT REPORT
══════════════════════════════════════════════════════════
Project      : [name]
Repository   : [url]
Commit       : [sha] ([ref])
Audited by   : USA [version] + [agent / human]
Date         : [ISO-8601]
Detected type: [auto-detected]
Platform     : [auto-detected]
Stack        : [auto-detected]
Maturity     : [Prototype / MVP / Beta / Production / Legacy]
Depth        : [quick | standard | deep]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    EXECUTIVE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Health Score : [X/100]
Expected band for [maturity]: [lo]–[hi]  → [verdict]

Dimension                            Score      Confidence
S1  Repository & Structure            X/10      N%
S2  Security                          X/10      N%
S3  Supply Chain & Provenance         X/10      N%
S4  Architecture & Design             X/10      N%
S5  Code Quality                      X/10      N%
S6  Data & Database                   X/10      N%
S7  Testing & Quality Assurance       X/10      N%
S8  CI/CD, Infrastructure & Obs.      X/10      N%
S9  Release & Change Management       X/10      N%
S10 Dependencies & Third-Party        X/10      N%
S11 Performance & Resilience          X/10      N%
S12 Documentation & Knowledge         X/10      N%
S13 Accessibility, i18n & Compliance  X/10      N%
S14 AI / LLM-Era Risks                X/10      N%
S15 Platform-Specific                 X/10      N%
S16 Future Readiness                  X/10      N%

Automation coverage: N%   (the rest is in the judgement queue)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    FINDINGS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ GOOD       : N     🔴 CRITICAL : N
⚠️ WRONG      : N     🟠 HIGH     : N
🚫 MISSING    : N     🟡 MEDIUM   : N
💀 DEPRECATED : N     🟢 LOW      : N
🧪 EXPERIMENTAL: N    🔵 FUTURE   : N
❓ TO REVIEW  : N

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 IMMEDIATE ACTION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 🔴 [Finding] → [file:line] → [why] → [fix]
2. 🟠 [Finding] → [file:line] → [why] → [fix]
   (No CRITICAL/HIGH? Say so, plainly.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION-BY-SECTION FINDINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[S1] Repository & Structure   → X/10
  🔴 [finding] → [location] → [fix]
  🚫 [finding] → [location] → [fix]
  ✅ [N checks passing]

[S2] Security                 → X/10
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                     JUDGEMENT QUEUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Rule | Section | Severity | What to look for | Evidence to record |
|------|---------|----------|------------------|--------------------|
| SEC-015 | S2 | 🟠 HIGH | Authorization per resource | file:line of the ownership check |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        ACCEPTED RISK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Rule | Severity | Reason | Until |
|------|----------|--------|-------|
| PERF-005 | 🟡 MEDIUM | Known N+1 in the admin panel; 40 rows max. | 2026-12-31 |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    RECOMMENDED ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPRINT 0 (now)       : CRITICAL + security HIGH
SPRINT 1 (1–2 weeks) : remaining HIGH
SPRINT 2 (1 month)   : MEDIUM
BACKLOG              : LOW + FUTURE
DEFERRED (this stage): what the maturity profile says to ignore

WHAT MATTERS AT [STAGE]:
  - [focus item from the maturity profile]
  - [focus item]

══════════════════════════════════════════════════════════
```

---

## Rules for filling this in

1. **Every finding carries location + severity + why + fix.** A finding without a
   location is an opinion.
2. **CRITICAL first, always.** Above the summary, above the score.
3. **No ✅ without evidence.** `file:line`, a command output, or a doc link.
4. **Skip non-applicable sections without comment.** Do not write "N/A: not a web app".
5. **Surface ⚠️ WRONG above 🚫 MISSING** within a severity band. Wrong is worse than
   absent because it looks finished.
6. **Record UNKNOWNs in the judgement queue**, not as silent passes. They are what
   confidence measures.
7. **The roadmap is the deliverable.** A score nobody acts on is a number; a sprint
   list is a plan.

## Rendering notes

- Use the emoji tags consistently — they are what makes a long report skimmable.
- Keep the section order fixed (S1 → S16) so two reports can be compared line by line.
- If you are an agent writing this by hand, end the file with the machine-readable
  trailer so `usa diff` works on it:

````markdown
<!-- USA:TRAILER:BEGIN -->

```yaml
schema: usa-report-v1
generated_at: 2026-09-08T00:00:00.000Z
usa_version: 1.0.0
overall: 71.4
sections:
  S1: { score: 8.4, open: 2, review: 2 }
  S2: { score: 6.2, open: 3, review: 1 }
severity_totals:
  CRITICAL: 0
  HIGH: 3
  MEDIUM: 4
  LOW: 6
  FUTURE: 2
rules:
  SEC-001: { status: PASS, severity: CRITICAL, section: S2 }
  SEC-015: { status: UNKNOWN, severity: HIGH, section: S2 }
```

<!-- USA:TRAILER:END -->
````
