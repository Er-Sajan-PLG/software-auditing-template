# Concepts

## Two axes: severity and status

Most audit checklists merge "how bad is it" and "what did we find" into one column.
That makes scoring impossible to reproduce — two auditors tag the same observation
differently, and the totals diverge. USAT keeps them apart.

### Severity — a property of the rule

Set by whoever wrote the rule. It says: _if this is violated, how bad is that?_

| Tag | Severity   | Meaning                                           | Default weight |
| --- | ---------- | ------------------------------------------------- | -------------- |
| 🔴  | `CRITICAL` | Breaks security, data integrity, or core function | 10             |
| 🟠  | `HIGH`     | Major risk or substantial debt                    | 6              |
| 🟡  | `MEDIUM`   | Important gap                                     | 3              |
| 🟢  | `LOW`      | Minor improvement                                 | 1.5            |
| 🔵  | `FUTURE`   | Not needed now, needed at scale                   | 0.5            |

### Status — a property of the observation

Produced by the engine (or by a reviewer, for judgement checks).

| Tag | Status         | Score credit | When                                               |
| --- | -------------- | ------------ | -------------------------------------------------- |
| ✅  | `GOOD`         | 1.00         | Verified present and correct                       |
| 🧪  | `EXPERIMENTAL` | 0.50         | Present, unvalidated (`grep_experimental`)         |
| 💀  | `DEPRECATED`   | 0.40         | Present but EOL (`grep_deprecated`)                |
| ⚠️  | `WRONG`        | 0.15         | Present but implemented incorrectly (`grep_wrong`) |
| 🚫  | `MISSING`      | 0.00         | Required and absent                                |
| ❓  | `NEEDS REVIEW` | _excluded_   | Judgement required; no evidence recorded           |
| ➖  | `SKIPPED`      | _excluded_   | Not applicable to this project                     |

**Why WRONG scores 0.15 and not 0.00.** Something exists, so there is partial
credit — the intent was right and the surface is smaller than a greenfield fix.
But a wrong implementation is _more dangerous_ than an absent one, because it looks
finished: nobody puts "add CSRF protection" on the roadmap when CSRF protection
appears to be there. Rule 9 of the agent behaviour rules exists for exactly this.

**Why NEEDS REVIEW is excluded rather than scored zero.** An unanswered question is
not a failure. It is a hole in the audit, and the place it shows up is
**confidence**, not the score.

---

## Scoring

### Per rule

```
creditᵢ = weightᵢ × CREDIT[statusᵢ]
```

### Per section

```
sectionScore = 10 × Σ creditᵢ / Σ weightᵢ        (over resolved, applicable rules)
```

### Overall

```
overall = 100 × Σ (creditᵢ × sectionWeight) / Σ (weightᵢ × sectionWeight)
```

Rule-level weighting, rather than averaging section scores, means a section with
three rules cannot swing the total as hard as one with thirty.

### Section weights

Security, supply chain, and testing carry the heaviest multipliers — a repo that
fails an authorisation control is worse than one with a slightly untidy README, and
the number should say so.

|                     | Section                                           | Weight  |
| ------------------- | ------------------------------------------------- | ------- |
| **S2**              | Security                                          | **1.7** |
| **S3**              | Supply Chain & Build Provenance                   | 1.3     |
| **S7**              | Testing & Quality Assurance                       | 1.3     |
| **S10**             | Dependencies & Third-Party                        | 1.2     |
| **S14**             | AI / LLM-Era Risks                                | 1.1     |
| S4, S5, S6, S8, S15 | Architecture, Code Quality, Data, CI/CD, Platform | 1.0     |
| **S13**             | Accessibility, i18n & Compliance                  | 0.9     |
| **S11**             | Performance & Resilience                          | 0.8     |
| S1, S9, S12         | Repository, Release, Documentation                | 0.7     |
| **S16**             | Future Readiness                                  | 0.4     |

Override any of them in `rules/sections.yaml`.

### Confidence

```
confidence = resolved / applicable
```

`resolved` counts rules the engine could settle (PASS, FAIL, WRONG, MISSING,
DEPRECATED, EXPERIMENTAL). `applicable` counts everything `applies_when` let through.

- Sections with **zero** resolved rules are reported as _"— not verified"_ and
  excluded from the overall score. You cannot earn points for questions nobody answered.
- A high score at low confidence is the single most misleading thing an audit tool
  can produce, which is why confidence sits next to every score in the report.

---

## Maturity dampening

Severity is reduced by the detected lifecycle stage, per rule class — but
**CRITICAL is never dampened, at any stage.**

| Stage      | security | supply-chain | correctness | maintainability | operations | performance | compliance | documentation | style |
| ---------- | -------- | ------------ | ----------- | --------------- | ---------- | ----------- | ---------- | ------------- | ----- |
| Prototype  | −1       | −1           | −1          | −2              | −2         | −2          | −2         | −2            | −2    |
| MVP        | −0       | −1           | −1          | −1              | −1         | −1          | −1         | −2            | −2    |
| Beta       | −0       | −0           | −0          | −1              | −1         | −1          | −1         | −1            | −1    |
| Production | −0       | −0           | −0          | −0              | −0         | −0          | −0         | −0            | −0    |
| Legacy     | −0       | −0           | −0          | −1              | −0         | −1          | −0         | −1            | −1    |

Steps move down the ladder `FUTURE < LOW < MEDIUM < HIGH < CRITICAL`.

Every dampened finding says so in the report:

```
- 🚫 **LICENSE present** `REPO-005`
  - 🪶 Downgraded HIGH → LOW by the Prototype / Spike profile
```

so a prototype reading knows which items will climb on their own as it grows up.
See [maturity-profiles.md](maturity-profiles.md).

---

## Applicability

A rule participates when **all** of these hold:

1. Its pack is not skipped (`skip_when` is false)
2. `applies_when` evaluates true against the detected facts
3. Its `depths` (if any) include the current `--depth`
4. It is not disabled in `.usat.yaml`

Two escape hatches, both loud: a force-included pack (`include:`) applies
all its rules regardless of 2 and 3 — the operator asked for it — and a
malformed `applies_when` (unknown key or operator, bad regex, non-mapping)
warns at load time and evaluates to false, so a typo can never silently
include rules. See ADR-0009.

```yaml
- id: DATA-007
  applies_when: { fact: 'has:database' }
  depths: [deep]
  check: { kind: manual }
```

Packs can contribute facts (`provides:`), and facts can make further packs apply.
The engine resolves this to a fixed point (max 3 passes) so a monorepo pack can pull
in boundary-enforcement rules without either pack knowing about the other.

---

## Suppressions

Anything suppressed needs a reason. That is not bureaucracy — it is the difference
between "we decided not to do this" and "we forgot".

```yaml
suppressions:
  - rule: PERF-005
    reason: 'Known N+1 in the admin panel; 40 rows max.'
    until: '2026-12-31'
```

Suppressed findings are **excluded from the score, the severity tallies, and
the action sections, but still listed** under _Accepted Risk_. Anyone reading
the report can see what was waived and why — and the Findings Summary can
never contradict Immediate Action over a waived item.

Waivers **expire**: an `until` date in the past (or one that cannot be
parsed) is ignored with a warning, and the finding reports normally. See
ADR-0007.

---

## Reproducibility

The same tree, rules, depth, and profile always produce the same score. The only
inputs that can change a result between runs:

- file contents (obviously)
- the rule packs in `rules/`
- `--depth`, `--profile`, `--allow-commands`
- `.usat.yaml` suppressions and overrides

This is what makes `usat diff` meaningful, and it is why the report records the
commit SHA, the USAT version, and every option it ran with.
