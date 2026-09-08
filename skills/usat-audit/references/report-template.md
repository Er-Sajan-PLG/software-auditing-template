# Report template

The canonical structure is [`templates/AUDIT_REPORT.md`](../../../templates/AUDIT_REPORT.md)
— read that file and reproduce it. Point 6 below explains why matching it matters.

## Structure

```
══════════════════════════════════════════════════════════
              UNIVERSAL SOFTWARE AUDIT REPORT
══════════════════════════════════════════════════════════
Project · Repository · Commit · Audited by · Date
Detected type · Platform · Stack · Maturity · Depth

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    EXECUTIVE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Health Score : [X/100]
Expected band for [maturity]: [lo]–[hi]  → [verdict]

Dimension                     Score   Confidence
S1  Repository & Structure     X/10    N%
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    FINDINGS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ GOOD : N     🔴 CRITICAL : N
⚠️ WRONG : N    🟠 HIGH     : N
🚫 MISSING : N  🟡 MEDIUM   : N
💀 DEPRECATED : N  🟢 LOW   : N
🧪 EXPERIMENTAL : N  🔵 FUTURE : N
❓ TO REVIEW : N

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 IMMEDIATE ACTION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 🔴 [Finding] → [file:line] → [why] → [fix]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION-BY-SECTION FINDINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[S1] Repository & Structure → X/10
  🔴 [finding] → [location] → [fix]
  ✅ [N checks passing]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                     JUDGEMENT QUEUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Rule | Section | Severity | What to look for | Evidence to record |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        ACCEPTED RISK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Rule | Severity | Reason | Until |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    RECOMMENDED ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPRINT 0 (now)        : CRITICAL + security HIGH
SPRINT 1 (1–2 weeks)  : remaining HIGH
SPRINT 2 (1 month)    : MEDIUM
BACKLOG               : LOW + FUTURE
DEFERRED (this stage) : what the maturity profile says to ignore
══════════════════════════════════════════════════════════
```

## Six rules for filling it in

1. **Every finding carries location + severity + why + fix.** Without a location it is an opinion.
2. **CRITICAL first**, above the score and the charts.
3. **No ✅ without evidence** — `file:line`, command output, or a doc link.
4. **Skip non-applicable sections without comment.**
5. **⚠️ WRONG above 🚫 MISSING** within a severity band. Wrong is worse than absent because it looks finished.
6. **Match the structure exactly.** It is what makes two reports diffable — and
   `usat diff` depends on it.

## Machine-readable trailer

If you are writing the report by hand, end with this so `usat diff` works:

````markdown
<!-- USAT:TRAILER:BEGIN -->

```yaml
schema: usat-report-v1
generated_at: 2026-09-08T00:00:00.000Z
usat_version: 1.0.0
overall: 71.4
sections:
  S1: { score: 8.4, open: 2, review: 2 }
severity_totals:
  CRITICAL: 0
  HIGH: 3
rules:
  SEC-001: { status: PASS, severity: CRITICAL, section: S2 }
  SEC-015: { status: UNKNOWN, severity: HIGH, section: S2 }
```

<!-- USAT:TRAILER:END -->
````

Status values: `PASS` · `FAIL` · `WRONG` · `MISSING` · `DEPRECATED` · `EXPERIMENTAL` ·
`UNKNOWN` · `NOT_APPLICABLE`.
