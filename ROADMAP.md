# USA Roadmap

Short, dated, explicitly non-committal. Rule-coverage direction first (this
is an audit template — the packs _are_ the product), automation second.
Items graduate to ADRs when decided and to `CHANGELOG.md` when shipped.

> Charter constraint (ADR-0011): no CVE database, no resolver, no dataflow
> engine, no signer. Proposals crossing that line re-open ADR-0011 first.

## Next: rule coverage (the product)

- [x] **`usa bootstrap` self-extension** — curated starter packs for
      uncovered stacks (php/ruby/cpp/csharp/swift + fallback), fail-closed
      per ADR-0012, proven on Vapor. _(shipped)_
- [x] **Honest scale limits** — truncation/oversize warnings instead of
      silent absorption. _(shipped)_
- [x] **First graduation** — Swift pack + vapor/platform/executable
      detectors shipped from the bootstrap proof; catalog entry replaced.
      _(shipped — the standing rule: every bigger repo expands the template)_

- [x] **SARIF + JSON renderers** — findings already carry file/line/severity/
      rule identity; add renderers so USA composes with dashboards and code
      scanning. Engine unchanged. _(shipped — `--format md|json|sarif`, `--out`
      extension inference; SARIF 2.1.0 schema-validated; ADR-0018 supersedes
      ADR-0004)_
- [x] **Per-rule expected-finding fixtures** — positive/negative fixture per
      rule run in CI (`codeql test` model). Rule packs are the highest FP/FN
      risk in the system; fixtures catch silent rule rot. _(shipped — 174
      automatable rules fixtured, coverage gate blocks untested rules; ADR-0017)_
- [ ] **Oracle-ingestion check kinds** — `evidence: { source: sarif|json }`
      for coverage numbers, CVE counts, attestation verification. Opt-in,
      offline-by-default preserved. _(M)_
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

- [x] **Complexity budget** — warn-only `complexity` rule + dispatch-table
      refactors; lint is warning-free. _(shipped)_
- [x] **Self-audit correctness hardening** — 27-finding adversarial review
      fixed (fail-closed inputs, expiry-aware suppressions, fixed-point
      detection, trailer hygiene). _(shipped)_
- [x] **release-please + commitlint** — reviewable Release PRs (version +
      CHANGELOG + tag atomically); keep the human gate on rule-content
      releases. Not semantic-release (wrong risk profile for curated rules).
- [ ] **Trusted publishing + npm provenance + SBOM + attestation** — remove
      the long-lived `NPM_TOKEN`; close the preach/practice gap on S3.
- [ ] **Generated CLI reference + diff gate** — `docs/reference/cli.md`
      regenerated from the real parser, asserted with `diff --exit-code`.
- [ ] **Coverage thresholds** — ratchet at today's number once measured.
- [ ] **OpenSSF Scorecard action + Best Practices badge** — fix expected
      findings (unpinned SHAs, branch protection), then self-certify.
- [ ] **Signed reports (Sigstore)** — optional detached signature for
      `AUDIT.md` as supply-chain-grade evidence.
- [ ] **MADR/log4brains** — only when the ADR corpus triples or decisions
      become routinely contested. Not now.

## Deliberately not planned

- CVE database / lockfile resolver / reachability analysis (ADR-0011)
- Interprocedural analysis, DAST, fuzzing (see "What USA is not")
- Compliance certification (USA maps to standards; auditors certify)
- Full DORA platform (no deployment to measure at this scale)
- Renovate migration (no problem to solve at ~10 dependencies)
