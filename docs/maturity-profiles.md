# Maturity profiles

The same repository deserves a different report at age three days and age three years.
Grading a prototype against a production bar produces a wall of noise nobody reads;
grading production with prototype standards produces a false all-clear.

USAT detects a lifecycle stage and **dampens** severity to match.

## How the stage is detected

A score out of 7.5, from signals that are hard to fake:

| Signal                 | Points |
| ---------------------- | ------ |
| Tests present          | +1     |
| CI configured          | +1     |
| CHANGELOG maintained   | +1     |
| Release tags published | +1     |
| ≥50 commits            | +1     |
| SECURITY.md published  | +1     |
| Containerised          | +0.5   |
| Monitoring configured  | +0.5   |
| CONTRIBUTING guide     | +0.5   |

Then:

| Condition                     | Stage          |
| ----------------------------- | -------------- |
| No commits for ~18 months     | **legacy**     |
| ~12 months idle **and** no CI | **legacy**     |
| Score ≥ 7 **and** tags exist  | **production** |
| Score ≥ 5                     | **beta**       |
| Score ≥ 2.5                   | **mvp**        |
| Otherwise                     | **prototype**  |

A `0.x` version with no tags is never promoted to _production_ — it downgrades to
_beta_ with the reason recorded in the report.

Boundary semantics, stated exactly because auditors must not hedge: staleness
is exclusive (`> 365` and `> 540` days — exactly-365-days-stale counts as
fresh); production needs score ≥ 7 **and** at least one tag (7.0 with zero
tags is beta); prerelease detection reads the **root** `package.json` only,
so monorepos and polyglot version files (`pyproject.toml`, `Cargo.toml`,
`go.mod`) should assert maturity explicitly via `facts:` or `maturity:` if
the auto-detection misreads them.

Every signal and the resulting score are printed in the report appendix, so the
classification can be argued with.

## Dampening

Steps move down the ladder `FUTURE < LOW < MEDIUM < HIGH < CRITICAL`.

| Class             | 🌱 Prototype | 🚀 MVP | 🧪 Beta | 🏭 Production | 🏚️ Legacy |
| ----------------- | ------------ | ------ | ------- | ------------- | --------- |
| `security`        | −1           | −0     | −0      | −0            | −0        |
| `supply-chain`    | −1           | −1     | −0      | −0            | −0        |
| `correctness`     | −1           | −1     | −0      | −0            | −0        |
| `maintainability` | −2           | −1     | −1      | −0            | −1        |
| `operations`      | −2           | −1     | −1      | −0            | −0        |
| `performance`     | −2           | −1     | −1      | −0            | −1        |
| `compliance`      | −2           | −1     | −1      | −0            | −0        |
| `documentation`   | −2           | −2     | −1      | −0            | −1        |
| `style`           | −2           | −2     | −1      | −0            | −1        |

> ### 🔴 CRITICAL is never dampened, at any stage.
>
> A leaked credential in a weekend prototype is still a leaked credential.
> A committed `.env` in an MVP is still a committed `.env`.
> Everything else is negotiable with the calendar. This one is not, and it is
> enforced in code (`src/engine/maturity.ts`), not just documented here.

Every dampened finding says so in the report, so a growing prototype can see what
will climb on its own:

```
- 🚫 **LICENSE present** `REPO-005`
  - 🪶 Downgraded HIGH → LOW by the Prototype / Spike profile
```

## Expected score bands

| Stage         | Band  | Reading                                                                      |
| ------------- | ----- | ---------------------------------------------------------------------------- |
| 🌱 Prototype  | 30–65 | "Above band" here means you started with good hygiene, not that you are done |
| 🚀 MVP        | 45–75 | Real users, real data — the security basics must exist                       |
| 🧪 Beta       | 60–85 | Close the process gaps before they compound                                  |
| 🏭 Production | 75–95 | Full bar; nothing dampened                                                   |
| 🏚️ Legacy     | 40–70 | Graded on risk containment, not modernisation ambition                       |

The report always prints the score **and** the band and a verdict:

```
Overall Health Score: 71.4/100
Expected band for Beta / Growing: 60–85 — within the expected band 👍
```

## Per-stage guidance

Each profile in [`rules/profiles/maturity.yaml`](../rules/profiles/maturity.yaml)
carries a `focus` list (what actually matters now) and a `defer` list (what to
deliberately ignore). Both are rendered in the report's roadmap:

### 🌱 Prototype

**Focus:** secret hygiene and `.gitignore` · a README that says what this is and how
to run it · one smoke test so the happy path is known-good.
**Defer:** Kubernetes, multi-region, formal ADRs, 80% coverage gates.

### 🚀 MVP

**Focus:** input validation and output encoding on every user-facing path · automated
backup plus a restore you have actually performed · CI running lint + tests ·
dependency scanning before the graph grows.
**Defer:** formal threat model, multi-region, chaos engineering, SBOM/VEX.

### 🧪 Beta

**Focus:** branch protection with mandatory review · structured logging with
correlation IDs and real alerting · integration tests around critical flows ·
documented rollback.
**Defer:** full DR site, formal verification, mutation testing.

### 🏭 Production

**Focus:** close every HIGH · provenance/attestation on release artifacts (SLSA) ·
tested DR with a real RTO/RPO · observability that answers "is it broken?" in under
five minutes.

### 🏚️ Legacy

**Focus:** inventory EOL dependencies with a replacement date · confirm backups
restore and that someone still knows how · monitoring, alerting, and a named owner per
service · document well enough to hand over or retire.
**Defer:** rewrites without a strangler plan; framework migrations for their own sake.

## Overriding

```bash
usat audit . --profile production     # grade against the full bar
```

```yaml
# .usat.yaml
maturity: production
```

Use `--profile production` on a younger project when you want the
_"what would it take to ship this?"_ view. Expect the score to drop and the CRITICAL
list to stay exactly the same length — that is the point.

## Customising

Edit [`rules/profiles/maturity.yaml`](../rules/profiles/maturity.yaml) — no code
changes needed. Add a stage, change the dampening table, adjust the expected bands, or
rewrite the focus/defer lists to match how your organisation actually ships.
