# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.0.0...v2.0.1) (2026-09-12)


### Bug Fixes

* **cli:** run installed bin through npm symlink ([ae8cd53](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/ae8cd53880c6f57bb070316280ba359556e0ade0))
* **release:** cut 2.0.1 for the shipped CLI entry-point fix ([80884a4](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/80884a4edb6f98bca67685cfab8da28fd334f825))

## [2.0.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v1.3.0...v2.0.0) (2026-09-12)


### ⚠ BREAKING CHANGES

* rename project to Universal Software Auditor (USA)

### Features

* capability registry, benchmark fleet, release gate, evolution loop ([9df8da5](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/9df8da598d4e7227aae29970d7603109ed9a5592))
* coverage model + capability gaps + run-time pack injection ([c4f2a1a](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/c4f2a1a323f5faa09d860a83655367c4de7d8a4d))
* **evolution:** deterministic proposal stage + evidence-required release ([8312b30](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/8312b30920beb356a0169b9f135c457d42373732))
* **evolution:** persistent gap queue + learn-from-report ([e041070](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/e041070947c2aaacc1a07c30b8ca8e67b8310354))
* **evolution:** queue-driven scheduler (usa evolve --all-gaps) ([1c09b91](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/1c09b9147778957ff4bcddeae0b9962272c317e9))
* immutable snapshots + content-addressed store ([87c8085](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/87c8085e47bbbe4cbd9722d0cc2c4a86402f42d6))
* **swift:** add detectors and rules for Validatable and security headers ([394d9db](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/394d9db671c399133d9608e7bce2fe1e7aef77ea))
* usa evolve CLI + docs + ADR-0013 ([6d84b1b](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/6d84b1b78a4e65f4622207fb508f58efedea28fc))


### Bug Fixes

* **ci:** full history for test job; modernize husky hooks ([285069a](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/285069ac9286406292d1b4d2555ad8a549335312))
* **repo:** correct release manifest, package files, and experiment artifacts ([3913824](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/39138241564c456acf8ba8d642630ddf86ddabb1))
* **swift:** simplify validation detection patterns to avoid escape-drift ([40c22f5](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/40c22f536d461f51a90fbdc2ad2e917b839ef558))


### Code Refactoring

* rename project to Universal Software Auditor (USA) ([bd5d6a7](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/bd5d6a739902833f31998c38b728cac7d684da11))

## [1.3.1](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v1.3.0...v1.3.1) (2026-09-12)


### Changed

* **BREAKING:** renamed the project and package from `@xenos1996/usat`
  (USAT, Software Auditing Template) to `@xenos1996/usa` (Universal Software
  Auditor); the CLI binary is now `usa`. This supersedes the `usat` 1.3.0 line.
* Added the deterministic evolution loop (snapshot, coverage, gaps,
  proposal, benchmark, release gate), the persistent gap queue, and the
  queue-driven scheduler (`usa evolve --all-gaps`). See ADR-0013..0016.


## [1.1.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v1.0.0...v1.1.0) (2026-09-09)


### Features

* **release:** developer-style versioning via release-please + commitlint ([#16](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/16)) ([6dc28e3](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/6dc28e3a49c92f2da39fb17755c77ab72f4ca6fd))


### Bug Fixes

* Node 24 + npm floor for OIDC trusted publishing ([#15](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/15)) ([73f321d](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/73f321d4302eec13e7187ceb58dd5d56922b5a89))
* pin scorecard-action to v2.4.4 (no v2 major tag exists) ([#17](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/17)) ([9967ddf](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/9967ddf564d4883426961091fe8170bf85578ac0))
* unblock releases — SUP-008 self-finding, CHANGELOG prettierignore, TEST-005 pattern ([#19](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/19)) ([9304f0a](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/9304f0a32e465507e526ca6adc44a157246b7f9a))

## [Unreleased]

## [1.0.0] — 2026-09-08

The first full release. Previously this repository was a scaffold: a README, a
CONTRIBUTING guide, a CI stub, and two empty `Auditor` classes in Python and
TypeScript. Everything below is new.

### Added

**The engine**

- A deterministic audit engine in TypeScript (`src/`), published as the `usa` CLI:
  `audit` · `detect` · `rules` · `explain` · `diff` · `init`.
- Dependency-free glob matching, a project index that respects `.gitignore`, and
  git-aware checks (`tracked_present` / `tracked_absent`) so committed build output and
  committed `.env` files are detectable.
- Zero runtime dependencies except `yaml`. No network access at audit time; USA never
  uploads anything.

**Detection**

- ~200 declarative signals in `rules/detectors.yaml` covering 20 languages, 20 package
  managers, 40+ frameworks, 10 databases, 11 ORMs, auth mechanisms, CI providers,
  observability, and the AI/LLM stack.
- Prose, tests, and examples are excluded from content scans, so a README that mentions
  Postgres no longer makes a project look like it uses Postgres.
- Lifecycle classification (prototype → legacy) from tests, CI, changelog, tags,
  history, and commit recency, with every signal printed in the report.

**Rules**

- 27 rule packs, ~220 rules, across 16 sections:
  - `core/` — 11 universal packs (repo, security, supply chain, architecture,
    code quality, testing, CI/CD, release, dependencies, documentation,
    future readiness)
  - `stacks/` — 16 conditional packs (node-typescript, python, go, rust, jvm,
    web-frontend, mobile, containers, iac, solidity, ml-ai, cli, data, api-backend,
    compliance, ai-era)
- 15 check kinds: `file_exists`, `file_absent`, `any_file`, `grep_present`,
  `grep_absent`, `grep_wrong`, `grep_deprecated`, `tracked_present`,
  `tracked_absent`, `count_min`, `file_lines_max`, `json_path`, `command`, `manual`,
  `info`.

**Sections new in USA**

- **S3 Supply Chain & Build Provenance** — promoted from four bullets under dependency
  security. SLSA v1.2 provenance, workflow script injection, token permissions, action
  pinning, SBOM, image signing.
- **S9 Release & Change Management** — SemVer, tags, release notes, migration ordering,
  feature flags, runbooks.
- **S14 AI / LLM-Era Risks** — mapped to OWASP Top 10 for LLM Applications (2026) and
  OWASP Top 10 for Agentic AI (ASI, 2026). Prompt injection, excessive agency,
  unbounded consumption, RAG tenant leakage, memory poisoning, and `AGENTS.md` as
  executable-ish instruction.

**Modelling**

- **Severity × status** split: severity is a property of the rule, status a property of
  the observation. This is what makes scoring reproducible instead of vibes.
- **⚠️ WRONG as a distinct status** (credit 0.15) — present-but-incorrect is worse than
  absent, because it looks finished.
- **Maturity-aware severity dampening** across five lifecycle profiles, with a hard
  floor: 🔴 CRITICAL is never dampened, at any stage.
- **Confidence** reported next to every score; sections with nothing verifiable say
  _"— not verified"_ rather than quietly scoring 10/10.
- **Approved-risk suppressions** — excluded from the score, still listed in the report,
  and always require a reason.
- **`usa diff`** — every report embeds a machine-readable YAML trailer, so consecutive
  audits produce fixed / regressed / newly-applicable lists and a net movement.

**Integrations**

- `action.yml` composite action; `usa init` scaffolds `.usa.yaml` and a workflow.
- Agent Skills pack (`skills/usa-audit/SKILL.md`) following the `SKILL.md` convention,
  with `references/`.
- `templates/AGENTS.audit.md` — drop into any repository to make it agent-auditable.
- Public TypeScript API (`src/index.ts`).

**Docs**

- `USA.md` — the full template: 16 sections, severity model, maturity profiles,
  scoring, agent behaviour rules, and the report template.
- `docs/` — getting started, concepts, configuration, rule-pack authoring, detectors,
  maturity profiles, agent integration, CI integration, and a standards mapping
  comparing USA to ASVS 5.0, NIST SSDF, SLSA v1.2, OpenSSF Scorecard, ISO/IEC 5055,
  WCAG 2.2, EU CRA, and the OWASP LLM/ASI Top 10 (2026).

**Operations**

- This repository audits itself on every PR (`.github/workflows/self-audit.yml`).

### Changed

- **Consolidated on TypeScript.** The Python scaffold (`src/auditor.py`,
  `pyproject.toml`) was removed — it was an empty stub, and maintaining two parallel
  engines for a template is a liability. The rule packs are pure YAML, so a Python
  implementation remains possible without a rewrite of the rules.

[Unreleased]: https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Er-Sajan-PLG/universal-software-auditor/releases/tag/v1.0.0
