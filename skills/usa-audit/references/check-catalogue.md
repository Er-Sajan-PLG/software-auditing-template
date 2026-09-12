# What to look for, per section

The condensed version. The full catalogue is [`USA.md`](../../../USA.md) and the
executable rules live in [`rules/`](../../../rules).

## S1 Repository

`.gitignore` present · no committed `.env`/keys · no secrets in git **history** ·
README · LICENSE · SECURITY.md · CHANGELOG · CONTRIBUTING · `.editorconfig` ·
CODEOWNERS (if >2 contributors) · no committed build output or binaries ·
`AGENTS.md`/`CLAUDE.md` present.

## S2 Security

**Secrets:** none hardcoded, none committed, none in history, none in logs.
**Auth:** per-resource authorisation (not per-route), short-lived tokens, rate-limited
login, MFA where warranted.
**Input:** server-side schema validation, parameterised SQL, no `eval`/`new Function`,
no shell interpolation, no `innerHTML` on untrusted data, no path traversal.
**Crypto:** bcrypt/scrypt/argon2id, TLS enforced, verification never disabled,
`crypto.randomBytes` for tokens.
**Transport:** CORS allowlisted, security headers, CSRF on cookie sessions, generic
error responses.
**Data:** PII inventoried and encrypted, uploads validated, secrets from a manager.

## S3 Supply chain

Lockfile committed **and** installed frozen · versions pinned · Dependabot/Renovate ·
dependency scanning · SAST · secret scanning · **no secrets in CI config** · **no
script injection in workflows** · least-privilege `permissions:` · actions pinned to
SHA · default branch protected · SBOM · provenance attestation · image scanning.

## S4 Architecture

Documented · ADRs · no god files (>800 lines) · layers separated (transport → domain →
data) · no circular dependencies · boundaries enforced by tooling · config
externalised · SPOFs identified · async work on a queue.

## S5 Code quality

Linter + formatter + strict types · no `any` sprawl · **no empty catch / bare except**
· central error handler · structured logs with correlation IDs · no debug statements ·
TODOs tracked · complexity measured.

## S6 Data

Migration system · constraints at DB level · indexes on FKs and hot queries ·
**no N+1** · pagination everywhere · connection pooling · transactions for multi-step
writes · row-level/tenant scoping in the data layer.

## S7 Testing

Suite exists · **runs in CI on every PR** · coverage measured (and gated at
beta+) · integration tests at the seams · E2E for critical journeys · security
negative tests (user A cannot read user B) · independent and deterministic ·
fixtures/factories · flaky tests quarantined.

## S8 CI/CD & observability

Lint → typecheck → test → build → scan · separate environments · automated deploy ·
**rollback rehearsed** · IaC · **backups with a tested restore** · DR plan with
RTO/RPO · `/health` + `/ready` · error tracking · alerting on symptoms · golden signals.

## S9 Release

SemVer · tags · release notes · feature flags for risky changes · migrations ordered
expand → backfill → switch → contract · runbook per service.

## S10 Dependencies

No HIGH/CRITICAL CVEs · nothing unmaintained 24+ months · no redundant duplicates ·
licence compatibility (watch for AGPL) · external timeouts, bounded retries, fallbacks ·
webhook signatures verified.

## S11 Performance & resilience

Profiled critical paths · caching with invalidation · background jobs on a queue ·
no blocking I/O in async contexts · slow queries explained · load tests with recorded
p95/p99 · auto-scaling · CDN · rate limits · retries with jitter + circuit breakers.

## S12 Documentation

README: what / install / run / contribute · setup verified recently · API reference
generated in CI · comments explain **why** · docs in the repo · onboarding page ·
examples executed in CI (future).

## S13 Accessibility, i18n, compliance

Keyboard reachable · visible focus · labelled inputs · contrast ≥4.5:1 · errors linked
to inputs · strings externalised · `Intl` formatting, UTC storage · privacy policy that
matches the code · data subject rights (export/erasure/correction) · card data
tokenised · cookie consent opt-in · SPDX headers.

## S14 AI / LLM-era — OWASP LLM Top 10 (2026) + ASI (2026)

| Ref              | Risk                            | Look for                                                                                    |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| LLM01 / ASI01    | Prompt injection                | Untrusted content separated from instructions by role; never feeds a privileged tool call   |
| LLM02            | Sensitive disclosure            | No credentials/PII in prompts; redaction; no-training terms                                 |
| LLM03 / ASI02-03 | Excessive agency                | Tool allowlist, per-tool credentials, sandboxing, human approval for irreversible actions   |
| LLM04 / ASI04    | Supply chain                    | Model digests pinned, prompts versioned, MCP servers reviewed                               |
| LLM05 / ASI06    | Data & memory poisoning         | Validated ingestion; scoped, inspectable agent memory                                       |
| LLM06 / ASI08    | Unbounded consumption           | Max tokens, timeouts, retry/step caps, per-user spend ceilings                              |
| LLM07            | Misinformation                  | Grounded or labelled outputs; eval coverage                                                 |
| LLM08            | Hidden context exposure         | System prompts and tool schemas not reachable                                               |
| LLM09            | Vector/embedding weaknesses     | Retrieval filtered by tenant/ACL **at query time**                                          |
| LLM10 / ASI05    | Improper output handling        | Output parsed into a schema and validated before shell/SQL/DOM                              |
| ASI07/09/10      | Inter-agent trust, rogue agents | Distinct least-privilege identities; authenticated inter-agent messages; full audit logging |

Also: **`AGENTS.md` / `CLAUDE.md` are executable-ish instructions.** They should carry
an explicit denylist and the exact build/test commands.

## S15 Platform highlights

- **Node/TS:** runtime pinned, strict mode, unhandled rejections, no npmrc tokens, env validated at startup
- **Python:** manifests + pinned versions, no bare `except`, no mutable defaults, no `pickle`, no `shell=True`, `DEBUG=False`
- **Go:** errors checked, context propagated, no `panic` in handlers, `go vet`/lint, bounded goroutines, parameterised SQL, HTTP timeouts
- **Rust:** edition set, no `unwrap` in prod, justified `unsafe`, clippy, `cargo-audit`
- **JVM:** central version management, no config secrets, no `printStackTrace`, no concatenated JPQL, no insecure deserialisation, container-aware heap
- **Web:** Core Web Vitals measured, code splitting, optimised images, a11y, bundle budget, error boundaries, no secrets in bundles
- **Mobile:** crash reporting, no bundle secrets, Keychain/Keystore, ATS/cleartext config, minimal permissions, privacy manifests, device matrix
- **Containers:** non-root, multi-stage, pinned minimal base, `.dockerignore`, no baked secrets, healthchecks, K8s resource limits
- **IaC:** no public buckets/`0.0.0.0/0`, encryption at rest, validate+scan in CI, remote locked state, least-privilege IAM, no privileged pods
- **Solidity:** reentrancy (CEI), compiler ≥0.8, access control, no `tx.origin`, checked external calls, pause, invariant tests, third-party audit
- **ML/AI:** data + model versioned, seeded training, drift monitoring, prediction logging, bias evaluation, pipeline (not notebooks), cost tracked
- **CLI:** `--help`, meaningful exit codes, `--dry-run` for destructive ops, validated input, idempotency, stderr vs stdout, `--json`

## S16 Future readiness (all 🔵 FUTURE)

Path off the current architecture written down · no EOL technology · data archiving
strategy · multi-region designed or explicitly declined · tech radar · cost tagged and
budgeted.
