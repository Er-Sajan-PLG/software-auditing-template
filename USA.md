# 🧠 USA — Universal Software Auditor

### _A self-adapting audit framework: any project, any stack, any stage_

**USA is two things at once.**

1. **A prompt/process template** — this document. Point any coding agent at a repository and say _"audit this with USA"_, and it will detect what it is looking at, activate the relevant sections, skip the rest, and produce a severity-tagged report.
2. **A deterministic rule engine** — `rules/` plus the `usa` CLI. Everything that can be settled by looking at a file is settled by the tool, so the agent spends its budget on the things only judgement can settle.

Run both. The tool gives you a reproducible number; the agent gives you the reasoning. Neither is complete alone.

```
usa audit .                      # 1. deterministic pass → AUDIT.md
# then hand AUDIT.md + this file to your agent for the judgement queue
```

---

## 0 · How the agent uses this template

| Step | Action                                                    | Output                         |
| ---- | --------------------------------------------------------- | ------------------------------ |
| 1    | Run `usa detect <path>` (or read `rules/detectors.yaml`)  | The project's **facts**        |
| 2    | Match facts against `applies_when` in `rules/`            | The **applicable rule set**    |
| 3    | Run `usa audit <path>`                                    | Deterministic findings + score |
| 4    | Work the **Judgement Queue** in the generated report      | Evidence-backed findings       |
| 5    | Emit the [Section 14 report](#14--report-output-template) | The deliverable                |

**Ten behaviour rules.** They are not stylistic; each one prevents a specific failure mode.

| #   | Rule                                                                                   | Failure it prevents                                     |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | **Skip non-applicable sections silently.** Do not write "N/A: not a web app" 40 times. | Report bloat that hides the signal.                     |
| 2   | **Partially applicable ⇒ audit the applicable parts only.**                            | Abandoning a section because 3 of 10 checks do not fit. |
| 3   | **CRITICAL findings always go first**, above every summary and chart.                  | Burying the one thing that matters.                     |
| 4   | **Never mark ✅ GOOD without evidence.** Cite `file:line` or a command output.         | Confident-sounding audits that are fiction.             |
| 5   | **Every finding carries: location + severity + why + fix.**                            | Findings nobody can act on.                             |
| 6   | **Score sections 0–10** from the share of applicable checks that pass.                 | Ungrounded vibes-based scores.                          |
| 7   | **Never assume.** A file you did not find is 🚫 MISSING, not "probably fine".          | Optimistic audits.                                      |
| 8   | **Audit what is absent as well as what is present.**                                   | The dangerous gaps are omissions.                       |
| 9   | **Always surface ⚠️ WRONG over 🚫 MISSING.** Wrong is worse than absent.               | Prioritising the cheaper problem.                       |
| 10  | **Priority order: Security > Correctness > Maintainability > Style.**                  | Perfect formatting over a leaked key.                   |

---

## The severity model

Most checklists conflate two different axes. USA keeps them separate, which is what makes the scoring reproducible.

**Severity — how bad, if violated.** Set by the rule, not by the auditor.

| Tag           | Meaning                                           | Response                    |
| ------------- | ------------------------------------------------- | --------------------------- |
| 🔴 `CRITICAL` | Breaks security, data integrity, or core function | Fix now. Today.             |
| 🟠 `HIGH`     | Major risk or substantial debt                    | Fix before the next release |
| 🟡 `MEDIUM`   | Important gap                                     | Fix in the near-term sprint |
| 🟢 `LOW`      | Minor improvement                                 | Fix when convenient         |
| 🔵 `FUTURE`   | Not needed now, needed at scale                   | Plan it; do not do it       |

**Status — what was actually observed.** Set by the evidence.

| Tag               | Status                                   | Score credit |
| ----------------- | ---------------------------------------- | ------------ |
| ✅ `GOOD`         | Verified present and correct             | 1.00         |
| 🧪 `EXPERIMENTAL` | Present but unvalidated                  | 0.50         |
| 💀 `DEPRECATED`   | Present but EOL / abandoned              | 0.40         |
| ⚠️ `WRONG`        | Present but implemented incorrectly      | 0.15         |
| 🚫 `MISSING`      | Required and absent                      | 0.00         |
| ❓ `NEEDS REVIEW` | Judgement required, no evidence recorded | _excluded_   |
| ➖ `SKIPPED`      | Not applicable to this project           | _excluded_   |

> ⚠️ WRONG scoring 0.15 and not 0.00 is deliberate: something exists, so there is partial credit — but a wrong implementation is more dangerous than nothing, because it looks done.

---

## Maturity profiles — the "any stage" part

The same repository deserves a different report at different ages. Grading a three-day prototype against a production bar produces a wall of noise nobody reads; grading production with prototype standards produces a false all-clear.

USA detects a lifecycle stage and **dampens** severity accordingly.

| Stage             | Detected when                                 | Security | Docs/Style | Expected score |
| ----------------- | --------------------------------------------- | -------- | ---------- | -------------- |
| 🌱 **Prototype**  | Score < 2.5 — no tests, no CI, no history     | −1 step  | −2 steps   | 30–65          |
| 🚀 **MVP**        | Score ≥ 2.5 — some process, real users        | −0       | −2 steps   | 45–75          |
| 🧪 **Beta**       | Score ≥ 5 — CI, tests, changelog              | −0       | −1 step    | 60–85          |
| 🏭 **Production** | Score ≥ 7 **and** release tags exist          | −0       | −0         | 75–95          |
| 🏚️ **Legacy**     | No commits in ~18 months, or stale with no CI | −0       | −1 step    | 40–70          |

> **Hard rule: 🔴 CRITICAL is never dampened, at any stage.**
> A leaked credential in a weekend prototype is still a leaked credential.
> Everything else is negotiable with the calendar.

Two consequences worth internalising:

- A low score on a prototype is **not** an indictment. Check the band, not the number.
- Use `usa audit . --profile production` to grade against the full bar regardless of detected age. This is the "what would it take to ship this?" view.

---

## Sections

Sections are activated by detection, not by the auditor's attention span. `S15 · Platform-Specific` is where every stack pack lands.

| #       | Section                               | Activated when                                                                               | Weight  |
| ------- | ------------------------------------- | -------------------------------------------------------------------------------------------- | ------- |
| **S1**  | Repository & Project Structure        | always                                                                                       | 0.7     |
| **S2**  | Security                              | always                                                                                       | **1.7** |
| **S3**  | Supply Chain & Build Provenance       | always                                                                                       | 1.3     |
| **S4**  | Architecture & Design                 | always                                                                                       | 1.0     |
| **S5**  | Code Quality                          | always                                                                                       | 1.0     |
| **S6**  | Data & Database                       | database / ORM / migrations detected                                                         | 1.0     |
| **S7**  | Testing & Quality Assurance           | always                                                                                       | **1.3** |
| **S8**  | CI/CD, Infrastructure & Observability | always                                                                                       | 1.0     |
| **S9**  | Release & Change Management           | always                                                                                       | 0.7     |
| **S10** | Dependencies & Third-Party            | always                                                                                       | 1.2     |
| **S11** | Performance & Resilience              | always                                                                                       | 0.8     |
| **S12** | Documentation & Knowledge             | always                                                                                       | 0.7     |
| **S13** | Accessibility, i18n & Compliance      | ≥ MVP                                                                                        | 0.9     |
| **S14** | **AI / LLM-Era Risks**                | LLM SDK, agents, MCP, RAG, or prompts detected                                               | 1.1     |
| **S15** | Platform-Specific                     | per stack: Node, Python, Go, Rust, JVM, Web, Mobile, Containers, IaC, Solidity, ML, CLI, API | 1.0     |
| **S16** | Future Readiness                      | always                                                                                       | 0.4     |

The machine-readable version of every section lives in [`rules/core/`](rules/core), [`rules/stacks/`](rules/stacks), and [`rules/sections.yaml`](rules/sections.yaml).

### What USA added to the classic 14-section audit

The original checklist this project grew from covered sections S1–S13 well. Four additions:

- **S3 Supply Chain & Build Provenance** was four bullets under "Dependency Security". It is now a full section: SLSA provenance, workflow script-injection, token permissions, action pinning, SBOM. You can write flawless code and still ship someone else's backdoor.
- **S9 Release & Change Management** — versioning, tags, migration ordering, feature flags, runbooks. The gap between "we deploy" and "we ship".
- **S14 AI / LLM-Era Risks** — mapped to OWASP Top 10 for LLM Applications (2026) and OWASP Top 10 for Agentic AI (ASI, 2026): prompt injection, excessive agency, unbounded consumption, RAG tenant leakage, memory/context poisoning.
- **Maturity profiles** and **approved-risk suppressions**, so the report is honest about stage and about decisions that were made deliberately.

---

## 1 · Repository & Project Structure

### 1.1 Root hygiene

- [ ] Is the folder structure logical, consistent, and predictable?
- [ ] Are concerns separated (`/src`, `/tests`, `/docs`, `/scripts`, `/config`)?
- [ ] Is there unnecessary nesting — or flat chaos?
- [ ] Are there orphan files: unused, forgotten, `foo-v2-final-FINAL.ts`?
- [ ] Is the project root clean of build artifacts?

### 1.2 Essential files

| File                      | Severity if missing | Note                                  |
| ------------------------- | ------------------- | ------------------------------------- |
| `.gitignore`              | 🔴 `CRITICAL`       | Everything else is downstream of this |
| `README.md`               | 🟠 `HIGH`           | The front door                        |
| `LICENSE`                 | 🟠 `HIGH`           | No license ⇒ all rights reserved      |
| `SECURITY.md`             | 🟠 `HIGH`           | Disclosure route for researchers      |
| `.env.example`            | 🟠 `HIGH`           | Only when config is actually required |
| `CHANGELOG.md`            | 🟡 `MEDIUM`         | What changed, and will it break me?   |
| `CONTRIBUTING.md`         | 🟢 `LOW`            | Turns questions into links            |
| `CODE_OF_CONDUCT.md`      | 🟢 `LOW`            |                                       |
| `.editorconfig`           | 🟢 `LOW`            | Kills whitespace diffs                |
| `AGENTS.md` / `CLAUDE.md` | 🟢 `LOW`            | Agents follow it literally — see S14  |

### 1.3 Version control quality

- [ ] 🔴 Are secrets or `.env` files in the repository?
- [ ] 🔴 Are secrets present in **git history**? (Deleting from HEAD does not remove them.)
- [ ] Are commit messages meaningful and consistent?
- [ ] Is there a branching strategy, and are stale branches pruned?
- [ ] Are large binaries committed? (Use LFS or object storage.)
- [ ] Is the default branch protected? (Required review, required checks, no force-push.)

---

## 2 · Security

> Applicable to every project type. Severity is never dampened below CRITICAL here.

### 2.1 Secrets & credentials

- [ ] 🔴 No API keys, passwords, or tokens hardcoded in source
- [ ] 🔴 No `.env`, `*.pem`, `*.key`, or credential files committed
- [ ] 🔴 No secrets in git history (`gitleaks detect --log-opts=--all`)
- [ ] Environment variables validated at startup
- [ ] A secret manager is used in production

### 2.2 Authentication & authorization

- [ ] Authentication matches the project type
- [ ] **Authorization is enforced per resource, not per route** (IDOR is the most common auth bug and no linter finds it)
- [ ] Tokens are short-lived; refresh with rotation and revocation
- [ ] Sessions invalidated on logout and password change
- [ ] Failed logins rate-limited and eventually locked out
- [ ] MFA available where the risk warrants it

### 2.3 Input validation & output encoding

- [ ] 🔴 All input validated server-side — client validation is a UX feature
- [ ] 🔴 SQL/NoSQL/command injection prevented (parameterise everything)
- [ ] 🔴 XSS prevented — no `dangerouslySetInnerHTML` / `innerHTML` / `v-html` on untrusted data
- [ ] 🔴 CSRF protection for cookie-based sessions
- [ ] Uploads validated by allowlist, size, and content sniffing
- [ ] Path traversal prevented on every filesystem call

### 2.4 Data protection

- [ ] Sensitive data encrypted at rest
- [ ] TLS enforced — no plaintext HTTP to real hosts, TLS verification never disabled
- [ ] Passwords hashed with bcrypt/scrypt/argon2id — never a plain digest
- [ ] PII inventoried, encrypted, and retention-scheduled
- [ ] Secrets and PII redacted from logs and telemetry

### 2.5 API security

- [ ] Every endpoint authenticated by default; allowlist the public ones
- [ ] Rate limiting on auth and on expensive endpoints
- [ ] API versioned
- [ ] CORS restricted to named origins — never `*`
- [ ] GraphQL depth/complexity limits; introspection off in production

### 2.6 Platform-specific controls

| Platform        | Controls                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| **Web**         | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`                          |
| **Mobile**      | Certificate/ATS config, Keychain & Keystore, jailbreak/root signals, privacy manifests                |
| **Cloud / IaC** | IAM least privilege, no public buckets, no `0.0.0.0/0`, encryption at rest, remote state with locking |
| **Blockchain**  | Reentrancy (CEI), access control, `tx.origin`, unchecked external calls, pause mechanism              |
| **Containers**  | Non-root user, minimal pinned base, no baked secrets, healthchecks, resource limits                   |
| **Desktop**     | Auto-update signature verification, local data encryption                                             |

---

## 3 · Supply Chain & Build Provenance

> Aligned with **SLSA v1.2**, **NIST SSDF (SP 800-218)**, and the **OpenSSF Scorecard**.

- [ ] A lockfile is committed **and** CI installs with it frozen (`npm ci`, `--frozen-lockfile`, `--locked`)
- [ ] Dependency versions pinned — no `*` or `latest`
- [ ] Automated dependency updates (Dependabot / Renovate)
- [ ] Dependency vulnerability scanning in CI
- [ ] SAST in CI (CodeQL / Semgrep)
- [ ] Secret scanning in CI _and_ as a pre-commit hook
- [ ] 🔴 No secrets in CI configuration
- [ ] 🔴 Workflows free of script injection — never interpolate `github.event.*` into `run:`
- [ ] Least-privilege `permissions:` declared per workflow
- [ ] Third-party actions pinned to a SHA or version, never `@main`
- [ ] Default branch protected (≥1 review, dismiss stale approvals, checks required)
- [ ] SBOM published with releases (CycloneDX / SPDX)
- [ ] Release artifacts carry provenance attestation (SLSA Build L2+)
- [ ] Container images scanned and signed

---

## 4 · Architecture & Design

- [ ] Architecture documented (one page: components, data flow, external dependencies)
- [ ] Architecture decisions recorded as ADRs
- [ ] Pattern appropriate to scale — monolith, modular monolith, services, serverless, event-driven
- [ ] No god files (>800 lines) and no god objects
- [ ] Layers separated: transport → domain → data
- [ ] No circular dependencies between modules
- [ ] Boundaries enforced by tooling, not by memory
- [ ] Configuration externalised — no hardcoded production URLs
- [ ] Side effects isolated and injectable
- [ ] Single points of failure identified, with a mitigation or an accepted risk
- [ ] Async work offloaded to a queue

---

## 5 · Code Quality

- [ ] Linter configured **and** run in CI
- [ ] Formatter configured
- [ ] Type checking enabled and strict
- [ ] Type escapes (`any`, `@ts-ignore`) used sparingly, with cause
- [ ] 🔴 No empty catch / bare except — errors are handled, not swallowed
- [ ] A central error handler or error boundary exists
- [ ] Errors returned to clients are generic + correlation ID, never stack traces
- [ ] Logging is structured and levelled; every request carries a trace/correlation ID
- [ ] No debug statements in production paths
- [ ] `TODO`/`FIXME` linked to tracked issues, or deleted
- [ ] Complexity measured (cyclomatic/cognitive) — at least reported

**Language anti-patterns**

| Stack           | Look for                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| JavaScript / TS | `var`, callback hell, unhandled rejections, `any` sprawl, mixed ESM/CJS                   |
| Python          | Mutable default args, bare `except`, `shell=True`, `pickle.load`, `DEBUG=True`            |
| Go              | Discarded errors, missing context, `panic` in handlers, goroutine leaks, no HTTP timeouts |
| Rust            | `unwrap()` in prod paths, unjustified `unsafe`, `todo!()`                                 |
| Java / Kotlin   | `printStackTrace`, empty catch, concatenated JPQL, `!!`, insecure deserialisation         |
| Solidity        | `tx.origin` auth, unchecked calls, timestamp dependence, missing access control           |

---

## 6 · Data & Database

- [ ] A migration system exists; no manual production schema edits
- [ ] Foreign keys and constraints enforced **at the DB level**
- [ ] Indexes on every foreign key and every large-table query path
- [ ] 🔴 No N+1 query patterns on list endpoints
- [ ] All list queries paginated, with a maximum page size
- [ ] Connection pooling configured
- [ ] Multi-step writes wrapped in transactions
- [ ] Row-level / tenant scoping enforced in the data layer, not by remembering a `WHERE`
- [ ] Migrations separated from application deploys; destructive changes use expand/contract
- [ ] Delete strategy (hard vs soft) defined, consistent with retention and erasure duties

---

## 7 · Testing & Quality Assurance

| Type        | Present | Target                                     |
| ----------- | ------- | ------------------------------------------ |
| Unit        | ✅ / 🚫 | 80%+ on new code                           |
| Integration | ✅ / 🚫 | Every external seam                        |
| End-to-end  | ✅ / 🚫 | The 3 critical journeys                    |
| Security    | ✅ / 🚫 | Every permission boundary (negative tests) |
| Performance | ✅ / 🚫 | Critical paths                             |
| Mutation    | ✅ / 🚫 | 🔵 FUTURE                                  |

- [ ] Tests run in CI on every PR and block merge
- [ ] Coverage measured; thresholds set at today's number and ratcheted
- [ ] Tests are independent — pass in random order, twice in a row
- [ ] No test depends on wall-clock time, network, or global state
- [ ] Fixtures/factories rather than hand-built literals in every test
- [ ] Flaky tests quarantined, then fixed within a sprint
- [ ] Mocks used at boundaries, not to make the code under test disappear

---

## 8 · CI/CD, Infrastructure & Observability

- [ ] CI runs lint → typecheck → test → build → scan
- [ ] Separate environments; dev cannot reach production data
- [ ] Deployment automated from a tag or main-branch push
- [ ] Rollback is one command, and has been rehearsed
- [ ] Infrastructure defined as code
- [ ] 🔴 Backups exist **and** a restore has actually been performed
- [ ] Disaster recovery plan with RTO/RPO and a named owner
- [ ] Health (`/health`) and readiness (`/ready`) endpoints wired to the orchestrator
- [ ] Error tracking (Sentry et al.) with release/source-map tracking
- [ ] Alerting on symptoms users feel — error rate, latency, saturation
- [ ] Golden signals on one dashboard, linked from the runbook

---

## 9 · Release & Change Management

- [ ] Semantic versioning, applied consistently
- [ ] Every release tagged; deploys reference the tag
- [ ] Release notes published (generated + a hand-written breaking-changes section)
- [ ] Risky changes behind feature flags with a kill switch
- [ ] Migrations ordered: expand → backfill → switch → contract
- [ ] A runbook exists per service: health, restart, rollback, escalate, owner

---

## 10 · Dependencies & Third-Party

- [ ] 🔴 No known HIGH/CRITICAL CVEs in the dependency graph
- [ ] 💀 No dependency unmaintained for 24+ months without a decision
- [ ] No unused or redundant dependencies (two HTTP clients = two CVE surfaces)
- [ ] Licenses inventoried; copyleft reviewed before shipping
- [ ] External services have explicit timeouts, bounded retries, and a fallback
- [ ] Webhook payloads signature-verified before processing
- [ ] Peer dependencies compatible with the runtime version

---

## 11 · Performance & Resilience

- [ ] Profiling data for the critical paths
- [ ] Expensive operations cached, with an invalidation story
- [ ] Background jobs on a queue with retries and a dead-letter queue
- [ ] No blocking I/O inside async contexts
- [ ] Slow queries identified and explained
- [ ] Load tests run before releases; p95/p99 recorded
- [ ] Auto-scaling configured
- [ ] CDN/edge caching for static assets
- [ ] Rate limits protect against traffic spikes
- [ ] Retries bounded with jitter; circuit breakers on failing dependencies

---

## 12 · Documentation & Knowledge

- [ ] README has: what it is · how to install · how to run · how to contribute
- [ ] Setup instructions verified recently (a clean-machine clone-and-run)
- [ ] Public APIs documented (OpenAPI / typedoc, generated in CI)
- [ ] Complex logic explained with **why**, not what
- [ ] Docs live in the repo, next to the code
- [ ] Onboarding page for new contributors
- [ ] Doc examples executed in CI (🔵 FUTURE)

---

## 13 · Accessibility, i18n & Compliance

- [ ] WCAG 2.2 AA: keyboard reachable, visible focus, labelled inputs, contrast ≥4.5:1
- [ ] Screen reader tested on the main flow
- [ ] Error messages descriptive and linked to their inputs (`aria-describedby`)
- [ ] Strings externalised, not hardcoded
- [ ] Dates/numbers/currencies formatted with `Intl`, stored in UTC
- [ ] Privacy policy and terms match what the code actually does
- [ ] Data subject rights implemented: access, export, erasure, correction
- [ ] Card data kept out of scope via tokenisation (PCI-DSS)
- [ ] Cookie consent is opt-in and as easy to refuse as to accept
- [ ] SPDX license identifiers on source files

---

## 14 · AI / LLM-Era Risks

> New in USA. Mapped to **OWASP Top 10 for LLM Applications (2026)** and
> **OWASP Top 10 for Agentic AI — ASI (2026)**.

| Ref                   | Risk                                          | Check                                                                                                                                      |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| LLM01 / ASI01         | **Prompt injection**                          | Untrusted content (retrieved docs, web pages, tickets) is separated from instructions by role; never feeds a privileged tool call directly |
| LLM02                 | **Sensitive information disclosure**          | No credentials or PII in prompts; redaction before send; no-training/no-retention terms                                                    |
| LLM03 / ASI02, ASI03  | **Excessive agency**                          | Tool allowlist, per-tool credentials, sandboxed FS/network, human approval for irreversible actions                                        |
| LLM04 / ASI04         | **Supply chain**                              | Model versions and digests pinned; prompts versioned in git; MCP servers reviewed as production dependencies                               |
| LLM05 / ASI06         | **Data & model poisoning / memory poisoning** | Ingestion is validated; agent memory is scoped and inspectable                                                                             |
| LLM06 / ASI08         | **Unbounded consumption**                     | Max tokens, timeouts, retry caps, step limits, per-user spend ceilings                                                                     |
| LLM07                 | **Misinformation**                            | Outputs grounded or labelled; eval suite covers the failure cases                                                                          |
| LLM08                 | **Hidden context exposure**                   | System prompts and tool schemas are not reachable by end users or error paths                                                              |
| LLM09                 | **Vector & embedding weaknesses**             | Retrieval is filtered by tenant/ACL at query time, not after generation                                                                    |
| LLM10 / ASI05         | **Improper output handling**                  | Model output parsed into a constrained schema and validated before reaching a shell, SQL, or the DOM                                       |
| ASI07 / ASI09 / ASI10 | **Inter-agent trust, rogue agents**           | Agent identities are distinct and least-privileged; inter-agent messages authenticated; logging covers who did what                        |

Also: **`AGENTS.md` / `CLAUDE.md` are executable-ish instructions.** They commit as easily as code and agents follow them literally. They should carry an explicit denylist (no force-push, no `rm -rf`, no reading `.env`) plus the exact build/test commands to use.

---

## 15 · Platform-Specific Playbooks

Activated by detection. Each lives in [`rules/stacks/`](rules/stacks).

| Pack              | Activates on                                           | Highlights                                                                                                                     |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `node-typescript` | `lang:typescript` / `lang:javascript` / `package.json` | Runtime pinning, strict mode, unhandled rejections, npmrc tokens, deprecated APIs, env validation                              |
| `python`          | `lang:python`                                          | Manifests, pinned versions, bare `except`, mutable defaults, `pickle`, `shell=True`, `DEBUG=True`                              |
| `go`              | `lang:go`                                              | Error checking, context propagation, panic-free handlers, `go vet`/lint, goroutine lifecycle, parameterised SQL, HTTP timeouts |
| `rust`            | `lang:rust`                                            | Edition, `unwrap`, `unsafe` justification, clippy, `todo!`, cargo-audit/deny, release profiles                                 |
| `jvm`             | `lang:java` / `kotlin` / `scala`                       | Central version management, config secrets, `printStackTrace`, JPQL injection, nullability, SpotBugs/detekt, container memory  |
| `web-frontend`    | React / Vue / Svelte / Angular / Next / Nuxt           | Core Web Vitals, code splitting, image optimisation, a11y, bundle budget, error boundaries, secrets in bundles                 |
| `mobile`          | iOS / Android / RN / Expo / Flutter                    | Crash reporting, bundle secrets, Keychain/Keystore, ATS/cleartext, permissions, privacy manifests, device matrix               |
| `containers`      | Dockerfile / compose                                   | Non-root, multi-stage, pinned base, `.dockerignore`, no baked secrets, healthchecks, K8s limits, image signing                 |
| `iac`             | Terraform / K8s / Pulumi                               | Public exposure, encryption at rest, validate+scan in CI, remote locked state, least-privilege IAM, no privileged pods         |
| `solidity`        | `.sol` / Foundry / Hardhat                             | Reentrancy, compiler ≥0.8, access control, `tx.origin`, unchecked calls, timestamp dependence, pause, invariants, audit        |
| `swift`           | Swift / SwiftPM / Vapor                                | Force-unwrap discipline, ATS policy, `Package.resolved` for apps, Keychain review                                              |
| `ml-ai`           | torch / notebooks / models                             | Data & model versioning, reproducibility, drift monitoring, prediction logging, bias evaluation, notebook-to-pipeline, cost    |
| `cli`             | `bin` / `[project.scripts]` / `cmd/`                   | `--help`, exit codes, `--dry-run`, input validation, idempotency, stderr/stdout, `--json`                                      |
| `data`            | database / ORM / migrations                            | Migrations, constraints, indexes, N+1, pagination, pooling, transactions, row-level scoping                                    |
| `api-backend`     | server / API                                           | Versioning, timeouts, retry policy, idempotency keys, response envelopes, OpenAPI, GraphQL limits                              |
| `compliance`      | ≥ MVP                                                  | Keyboard/labels/contrast, i18n, locale formatting, privacy policy, data subject rights, PCI scope, cookie consent, SPDX        |
| `ai-era`          | LLM SDK / agents / MCP / RAG / prompts                 | The full table in §14, as enforceable rules                                                                                    |

---

## 16 · Future Readiness

All 🔵 `FUTURE` — these are plans, not defects, and they never block a release.

- [ ] A path off the current architecture is written down (limits, trigger, direction)
- [ ] No core technology at or near EOL
- [ ] Data archiving/retention strategy exists
- [ ] Multi-region or failover is designed — or explicitly declined with a stated RTO
- [ ] A tech radar exists (adopt / trial / assess / hold) if the team is >4 people
- [ ] Cost is tagged, budgeted, and alerted on

---

## 14 · Report Output Template

> The `usa` CLI emits exactly this structure. If you are an agent writing it by hand, match it — a report that looks the same every time is a report you can diff.

```
══════════════════════════════════════════════════════════
              UNIVERSAL SOFTWARE AUDIT REPORT
══════════════════════════════════════════════════════════
Project      : [name]
Repository   : [url]
Commit       : [sha] ([ref])
Audited by   : USA [version] + [agent/human]
Date         : [ISO-8601]
Detected type: [auto]        Stack: [auto]
Platform     : [auto]        Maturity: [auto-detected stage]
Depth        : [quick | standard | deep]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    EXECUTIVE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Health Score : [X/100]
Expected band for [maturity]: [lo]–[hi]  → [verdict]

Dimension                     Score   Confidence
S1  Repository & Structure     X/10    N%
S2  Security                   X/10    N%
S3  Supply Chain               X/10    N%
...  (one row per applicable section)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    FINDINGS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 CRITICAL : N     ✅ GOOD       : N
🟠 HIGH     : N     ⚠️ WRONG      : N
🟡 MEDIUM   : N     🚫 MISSING    : N
🟢 LOW      : N     💀 DEPRECATED : N
🔵 FUTURE   : N     ❓ TO REVIEW  : N

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 IMMEDIATE ACTION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 🔴 [Finding] → [file:line] → [fix]
2. 🟠 [Finding] → [file:line] → [fix]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION-BY-SECTION FINDINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[S1] Repository & Structure    → X/10 → [findings]
[S2] Security                  → X/10 → [findings]
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  JUDGEMENT QUEUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Rule | Section | Severity | What to look for | Evidence to record |
| SEC-015 | S2 | 🟠 HIGH | Authorization per resource | file:line of the ownership check |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                     ACCEPTED RISK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Suppressed findings, each with a reason and an expiry]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  RECOMMENDED ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPRINT 0 (now)      : CRITICAL + security HIGH
SPRINT 1 (1–2 wk)   : remaining HIGH
SPRINT 2 (1 month)  : MEDIUM
BACKLOG             : LOW + FUTURE
DEFERRED (this stage): what the maturity profile says to ignore

══════════════════════════════════════════════════════════
```

Every generated report also embeds a machine-readable trailer, so
`usa diff previous.md current.md` turns the next audit into a progress report.

---

## Scoring

Deterministic and reproducible — the same tree, rules, and depth always produce the same number.

```
creditᵢ  = weightᵢ × CREDIT[statusᵢ] × sectionWeight(sectionᵢ)
overall  = 100 × Σ creditᵢ / Σ (weightᵢ × sectionWeightᵢ)

section  = 10 × Σ(weightᵢ × CREDIT[statusᵢ]) / Σ weightᵢ
```

- Rule-level weighting (not an average of section scores) means a section with three rules cannot swing the total as hard as one with thirty.
- Default weights follow severity: `CRITICAL 10 · HIGH 6 · MEDIUM 3 · LOW 1.5 · FUTURE 0.5`.
- Sections with **zero** resolvable rules are reported as _not verified_ and excluded from the total — you cannot earn points for questions nobody answered.
- **Confidence** = resolved ÷ applicable. A 90/100 at 40% confidence is a report that found nothing wrong with a fifth of the surface.

---

## Using USA as an agent skill

```
skills/usa-audit/SKILL.md      # drop into ~/.claude/skills, .cursor/skills, …
templates/AGENTS.audit.md       # paste into a target repo as AGENTS.md
```

Both follow the Agent Skills convention (YAML frontmatter + `references/`), so the same pack works in Claude Code, Cursor, Codex, Copilot, and Gemini CLI.

---

## What USA is not

Stated plainly, because an audit tool that oversells itself is worse than none:

- **Not a penetration test.** No dynamic analysis, no fuzzing, no exploit chain. It finds open doors; it does not walk through them.
- **Not a replacement for CodeQL / Semgrep / Snyk / Trivy.** It checks whether those tools are _configured_, and tells you to run them.
- **Not a compliance certification.** It maps to ASVS, SSDF, SLSA, WCAG, and GDPR, and tells you what evidence you would need. An auditor still has to certify.
- **Not a code review.** It does not understand your product. A senior engineer reading a diff still catches things no rule pack will.
- **Not a guarantee.** A 95/100 means the observable hygiene is good. It does not mean there is no bug.

---

## Licence

MIT. Use it, fork it, ship it in a product, add rule packs and send them back.
