# Implementation plan — SOTA hardening program

One tracking file for the multi-PR program that brought USAT's own hygiene
to the level it demands of others. Each item links its PR; checked means
merged to `master`.

## PR #9 — Self-audit gate fix (CQ-013)

- [x] Run USAT against itself (`--depth deep`): 99.8/100, one open finding
- [x] Enable warn-only `complexity` rule (max 10) in `eslint.config.mjs`
- [x] Re-audit: 100/100 · `main` · commit `e23af70`

## PR #10 — Complexity hotspot refactor (follow-up)

- [x] Decompose all 23 flagged functions to ≤ 10 (dispatch tables,
      per-section renderers, pipeline phases, per-clause matchers)
- [x] Verify: lint 0 warnings, tsc clean, 118/118 tests, self-audit 100/100,
      `usat diff` zero regressions · branch `refactor/complexity-hotspots`

## PR #11 — SOTA hardening (this program)

Correctness (adversarial review, 27 findings):

- [x] F1 SEC-003 `https?` → `http` (flagship FP)
- [x] F2 SEC-013 optional quote → mandatory (flagship FP)
- [x] F3 SEC-005 bare `%s` → `%`-operator form (safe params pass)
- [x] F4 suppression `until` expiry enforced, fail-closed + warning
- [x] F5 `maturity` + `sections` config options implemented (were dead)
- [x] F6 `include` honors documented force-load contract
- [x] F7 detector `implies` fixed-point (was 2 hardcoded passes)
- [x] F8 suppressed findings excluded from counts/tallies
- [x] F9 corrupt pack/index YAML skips loudly instead of crashing
- [x] F10 duplicate rule IDs across packs detected, first wins + warning
- [x] F11 `matches` try/catch; unknown ops/shapes fail closed; loader validates
- [x] F12 `in`/`includes` require metric facts
- [x] F13 empty grep patterns dropped with warning (score weapons)
- [x] F14 severity/weight overrides validated
- [x] F15 `count_min` below threshold → MISSING
- [x] F16 `file_lines_max` over limit → FAIL
- [x] F17 `command` check: output cap + shell-scope comment
- [x] F18/F19/F20 manifest precision (no root fallback, block-scoped
      `contains`, full-segment case-insensitive sections, all blocks)
- [x] F22 test-dir excludes (`__tests__`, `spec`, `*.stories.*`)
- [x] F23 trailer quoting + last-trailer-wins + fence tolerance
- [x] F24 diff surfaces UNKNOWN↔PASS transitions
- [x] F26 fractional dampen steps ignored (full severity)
- [x] SUP-003 floating ranges, SUP-009 bare-`permissions:`, SEC-008 library
      list, NODE-002 tsconfig glob, NODE-006 `parse(env)` form
- [x] Regression tests for every fix above (141/141 green)

Docs:

- [x] ADRs 0006–0011 + `docs/adr/README.md` index
- [x] `ROADMAP.md`, `GOVERNANCE.md`, this file
- [x] `docs/configuration.md` + `docs/concepts.md` updated for new behavior
- [x] `SECURITY.md` stale pre-1.0 line fixed; `CITATION.cff`; `FUNDING.yml`

Automation:

- [x] Trusted publishing (OIDC) + npm provenance in `release.yml`
- [x] SBOM (CycloneDX) + build attestation on releases
- [x] ADR index/link lint in CI (`scripts/check-adrs.mjs`)
- [x] Doc-sync gate: README rule-count floor + section coverage
      (`scripts/check-docs.mjs`)
- [x] Coverage thresholds ratcheted at today's number
- [x] Dependabot automerge for patch/minor (CI-gated)
- [x] Monthly gitleaks-pin freshness check (the one version no bot watches)

Deferred (in ROADMAP with rationale, not forgotten):

- [x] release-please + commitlint (decision: release-please over
      semantic-release — rule content keeps its human gate; commitlint via hook
  - CI `commits` job; bootstrap-sha + manifest pin the 1.0.0 baseline;
    `.github/release.yml` categories retired as dead config)
- [x] release-please authenticates with a repo-scoped PAT, not
      GITHUB_TOKEN (bot-token tag pushes never fire release.yml — learned
      when v1.1.0 tagged but nothing published); workflow_dispatch fallback
      on release.yml for manual retries
- [ ] SARIF/JSON renderers, per-rule fixtures, oracle ingestion (ROADMAP)
- [ ] OpenSSF Scorecard action + badge (ROADMAP)

## How to verify this plan

```bash
npm run lint && npm run typecheck && npm test          # gates
npm run build && node dist/cli.js audit . --depth deep # self-audit: expect 100/100
node dist/cli.js diff <previous-AUDIT> AUDIT.md        # expect no regressions
```

## Self-extension round (this program)

- [x] Honest scale: `MAX_FILES` truncation flag + oversize counter, both
      surfaced as end-of-audit warnings (were silent); caps documented
- [x] `usat bootstrap`: curated starter packs for php/ruby/cpp/csharp/
      swift + generic fallback, fail-closed (never registers, REVIEW header)
- [x] Proof on Vapor (Swift, 249 files, zero shipped coverage): baseline
      71.8 → +4 Swift rules applicable, zero regressions, diff-verified
- [x] ADR-0012 + guides updated + regression tests (160 green)

## Post-merge re-audit round (follow-up)

Vigorous re-verification on `master` found and fixed:

- [x] `release.yml` SBOM step used a nonexistent `npm sbom -o` flag —
      verified broken locally, fixed to stdout redirect (would have failed the
      next release; proven with `npm sbom` after a clean `npm ci`)
- [x] `platform:server` never fired for bare framework apps — 24
      `implies` detectors map request-serving frameworks (express…sveltekit)
      to the platform fact, fixing 16 platform-gated rules at once
- [x] No CI net for rule-pattern rot — new test asserts all 270+ shipped
      grep patterns compile and all `applies_when` validate warning-free
- [x] Scorecard workflow added (API-verified hygiene counterpart)
- [x] 14-check end-to-end harness (`usat` CLI on fixtures: SEC-003/025,
      expiry, overrides, sections, maturity, loader guards, diff) — 14/14
- [x] One-time owner actions outstanding (not code): enable the npmjs
      trusted publisher for OIDC; review first Scorecard/Security-tab results
