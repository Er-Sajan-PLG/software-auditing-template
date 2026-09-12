# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
