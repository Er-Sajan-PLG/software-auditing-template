# USA Roadmap

Short, dated, explicitly non-committal. Rule-coverage direction first (this
is an audit template — the packs _are_ the product), automation second.
Items graduate to ADRs when decided and to `CHANGELOG.md` when shipped.

> Charter constraint (ADR-0011): no CVE database, no resolver, no dataflow
> engine, no signer. Proposals crossing that line re-open ADR-0011 first.

## Shipped

Rule coverage (the product):

- [x] **`usa bootstrap` self-extension** — curated starter packs for
      uncovered stacks (php/ruby/cpp/csharp/swift + fallback), fail-closed
      per ADR-0012, proven on Vapor.
- [x] **Honest scale limits** — truncation/oversize warnings instead of
      silent absorption.
- [x] **First graduation** — Swift pack + vapor/platform/executable
      detectors shipped from the bootstrap proof; catalog entry replaced.
      _(the standing rule: every bigger repo expands the template)_
- [x] **SARIF + JSON renderers** — `--format md|json|sarif`, `--out`
      extension inference; SARIF 2.1.0 schema-validated. ADR-0018 supersedes
      ADR-0004.
- [x] **Per-rule expected-finding fixtures** — positive/negative fixture per
      automatable rule, coverage gate blocks untested rules. ADR-0017.
- [x] **Oracle-ingestion check kind** — `oracle` ingests a committed
      SARIF/JSON artifact and asserts a bound; offline-by-default preserved.
      ADR-0019.

Automation and governance:

- [x] **Complexity budget** — warn-only `complexity` rule + dispatch-table
      refactors; lint is warning-free.
- [x] **Self-audit correctness hardening** — 27-finding adversarial review
      (fail-closed inputs, expiry-aware suppressions, fixed-point detection,
      trailer hygiene).
- [x] **release-please + commitlint** — reviewable Release PRs (version +
      CHANGELOG + tag atomically); human gate kept on rule-content releases.
- [x] **Trusted publishing + npm provenance + SBOM** — OIDC (no long-lived
      `NPM_TOKEN`), `--provenance`, CycloneDX SBOM artifact on every release.
- [x] **Generated CLI reference + diff gate** — `docs/reference/cli.md`
      regenerated from the real parser and asserted with `--check` in CI.
- [x] **Coverage thresholds** — ratcheted at the measured number.
- [x] **OpenSSF Scorecard action** — monthly + on push, SARIF to the
      Security tab.

## Next: rule coverage

- [ ] **Catalogue pinning + automatability tags** — `catalogue: asvs@5.0.0`,
      `automatability: full|assist|manual` per rule; makes
      `docs/standards-mapping.md` machine-checkable. _(S)_
- [ ] **Provenance verification checks (verify, don't mint)** — `cosign
verify` success, attestation/VSA presence where network allows; existence
      checks at beta, chain verification at production. _(L)_
- [ ] **Site-level suppressions** — file:line-anchored waivers with reason +
      expiry + unused-suppression reporting (ESLint model). _(M)_
- [ ] **Hotspot triage + review staleness** — split "tool uncertain, human
      confirms once" from deterministic violations; per-item last-reviewed
      dates next to confidence. _(M)_
- [ ] **New-code quality gates** — gate on newly-introduced ≥ HIGH plus
      regressed rules (trailer + `diff` already compute the inputs), instead of
      absolute `--fail-on` which punishes legacy adoption. _(M)_

## Next: automation and governance

- [ ] **OpenSSF Best Practices badge** — self-certify the CII baseline
      (the Scorecard action and branch protection are already in place). _(S)_
- [ ] **Signed reports (Sigstore)** — optional detached signature for
      `AUDIT.md` as supply-chain-grade evidence. _(M)_
- [ ] **MADR/log4brains** — only when the ADR corpus triples or decisions
      become routinely contested. Not now.

## Deliberately not planned

- CVE database / lockfile resolver / reachability analysis (ADR-0011)
- Interprocedural analysis, DAST, fuzzing (see "What USA is not")
- Compliance certification (USA maps to standards; auditors certify)
- Full DORA platform (no deployment to measure at this scale)
- Renovate migration (no problem to solve at ~10 dependencies)
- HTML / JUnit renderers (JSON and SARIF feed standards-based consumers;
  HTML/JUnit would only feed bespoke ones — ADR-0018)
