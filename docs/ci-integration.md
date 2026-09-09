# CI integration

## GitHub Actions

`usat init` writes a ready-made workflow. The minimum viable version:

```yaml
name: USAT Audit
on: [pull_request]

permissions:
  contents: read
  pull-requests: write

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run USAT
        id: usat
        run: npx --yes @xenos1996/usat@1 audit . --depth standard --out AUDIT.md

      - name: Publish to job summary
        if: always()
        run: cat AUDIT.md >> "$GITHUB_STEP_SUMMARY"

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: usat-audit
          path: AUDIT.md
```

### Quality gate

```yaml
- name: Quality gate
  run: npx --yes @xenos1996/usat@1 audit . --fail-on high
```

| Exit | Meaning                                   |
| ---- | ----------------------------------------- |
| `0`  | No findings at or above the threshold     |
| `1`  | Gate tripped — findings printed to stderr |
| `2`  | Usage or configuration error              |

**Roll-out advice:** start with `--fail-on critical`. Move to `high` once the backlog
is clear. Never start at `medium` — you will teach the team to bypass the check.

### Comment the score on the PR

```yaml
- name: Comment
  if: github.event_name == 'pull_request'
  uses: marocchino/sticky-pull-request-comment@v2
  with:
    path: AUDIT.md
```

### Composite action

```yaml
- uses: Er-Sajan-PLG/software-auditing-template@v1
  with:
    depth: standard
    fail-on: high
```

See [`action.yml`](../action.yml).

---

## GitLab CI

```yaml
usat-audit:
  image: node:20
  stage: test
  script:
    - npx --yes @xenos1996/usat@1 audit . --out usat-report.md --fail-on critical
  artifacts:
    when: always
    paths: [usat-report.md]
    expose_as: 'USAT Audit'
```

---

## Scheduled drift detection

The highest-value CI job is not the PR gate — it is a monthly audit that shows
movement:

```yaml
on:
  schedule:
    - cron: '0 6 1 * *' # 1st of the month
  workflow_dispatch:

jobs:
  audit:
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: npx --yes @xenos1996/usat@1 audit . --out reports/$(date +%Y-%m).md
      - run: |
          PREV=$(ls reports/*.md | tail -2 | head -1)
          npx --yes @xenos1996/usat@1 diff "$PREV" "reports/$(date +%Y-%m).md" --out DIFF.md || true
          cat DIFF.md >> "$GITHUB_STEP_SUMMARY"
      - uses: peter-evans/create-pull-request@v6
        with:
          title: 'chore: monthly USAT audit'
          body-path: DIFF.md
```

A dated report per month plus `usat diff` gives you an audit trail that shows
improvement — the thing a single audit can never do.

---

## Reference: this repo's own CI (`.github/workflows/`)

USAT audits itself with the full stack — copy what fits:

| Workflow           | What it does                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`           | lint+format+typecheck · Vitest with coverage thresholds · build + CLI smoke · rule-pack validation · npm audit + gitleaks + license scan · **hygiene** (`check-adrs` + `check-docs`) |
| `self-audit.yml`   | `usat audit . --depth deep --fail-on critical` on every PR, score as PR comment                                                                                                      |
| `scorecard.yml`    | OpenSSF Scorecard monthly + on push (API-verified hygiene; SARIF to Security tab)                                                                                                    |
| `automerge.yml`    | Dependabot patch/minor auto-merge once CI is green (majors stay manual)                                                                                                              |
| `gitleaks-pin.yml` | Monthly check that the curl-pinned gitleaks binary in `ci.yml` is current (no bot watches it) — opens a deduped issue when stale                                                     |
| `release.yml`      | Tag push `v*` → OIDC trusted publishing (no long-lived token) + `--provenance` + CycloneDX SBOM artifact                                                                             |

Release setup note: trusted publishing needs a one-time owner step on
npmjs.com (package Settings → Trusted Publisher → this repo + workflow)
before the first OIDC publish succeeds.

## Choosing a depth in CI

| Depth      | Rules                                          | Runtime (≈10k files) | Use for              |
| ---------- | ---------------------------------------------- | -------------------- | -------------------- |
| `quick`    | high-signal only                               | ~1–3 s               | Every PR             |
| `standard` | default                                        | ~3–10 s              | PRs + nightly        |
| `deep`     | adds cycles, duplication, complexity, mutation | ~10–30 s             | Weekly / pre-release |

`deep` is where the judgement-heavy rules live; the extra cost is mostly I/O.

## Notes

- **No network at audit time.** USAT reads files and writes Markdown. It never uploads
  anything, which is why it is safe on private repositories.
- **`--allow-commands` in CI.** Only if you trust the target repo — it shells out for
  checks like `npm audit`. Off by default; those rules report ❓ NEEDS REVIEW instead.
- **Pin the version** in production pipelines (`@xenos1996/usat@1`, not `@latest`) so a
  rule-pack change cannot fail your build without a commit.
- **Commit `.usat.yaml`.** Suppressions and overrides without a commit are invisible
  decisions, and they are the first thing a reviewer asks about.
