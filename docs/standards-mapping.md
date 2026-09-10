# Standards mapping — how USA compares to the state of the art

> _USA did not invent most of these checks. It reorganised them so one tool can
> apply them to any project, at any stage, without a certification budget._

## The short version

| Framework                               | What it is                                                                                                                                                      | What USA takes                                                                              | What USA adds                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **OWASP ASVS 5.0**                      | ~350 verification requirements across 17 chapters, levels L1–L3 [1](https://quality.arc42.org/standards/owasp-asvs)                                             | The requirement set behind most `SEC-*` rules; ASVS IDs in `references`                     | Executable versions of the mechanically-checkable subset; level selection replaced by maturity profiles |
| **OpenSSF Scorecard**                   | 18 automated checks, 0–10, run against public repos [1](https://rywalker.com/research/openssf-scorecard)                                                        | The shape of S3 and S8; score-per-check                                                     | Runs on private repos and monorepos; mixes in code-level checks; adds the other 15 sections             |
| **NIST SSDF (SP 800-218)**              | Secure-development practice outcomes                                                                                                                            | Practice-level outcomes: protect, produce well-secured software, respond to vulnerabilities | Concrete evidence requirements per outcome                                                              |
| **SLSA v1.2**                           | Build L0–L3 plus an approved Source track (Nov 2025) [1](https://rywalker.com/research/slsa)                                                                    | Provenance, attestation, and source-integrity requirements                                  | Progressive rules (SBOM now, attestation at production) rather than a level you claim                   |
| **OWASP LLM Top 10 (2026)**             | LLM01–LLM10 for LLM applications [1](https://www.cybersaint.io/cybersecurity-frameworks-and-standards/glossary/what-is-the-owasp-top-10-for-llm-and-agentic-ai) | The entire S14 section                                                                      | Executable detection of AI stacks so the section self-activates                                         |
| **OWASP Agentic AI Top 10 (ASI, 2026)** | ASI01–ASI10 for agent systems [2](https://www.trydeepteam.com/docs/frameworks-owasp-top-10-for-agentic-applications)                                            | Excessive agency, tool misuse, memory poisoning, inter-agent trust                          | Rules for `AGENTS.md`/`CLAUDE.md` as executable-ish instructions                                        |
| **CII Best Practices**                  | Open-source project maturity badge                                                                                                                              | README/LICENSE/SECURITY/CONTRIBUTING baseline                                               | Automated, no self-assessment questionnaire                                                             |
| **ISO/IEC 5055**                        | Automated code-quality measurement (security, reliability, performance, maintainability)                                                                        | The four quality characteristics behind S4/S5                                               | Free, YAML, and diffable                                                                                |
| **WCAG 2.2 AA**                         | Accessibility success criteria                                                                                                                                  | S13 checks                                                                                  | Same criteria, expressed as things a reviewer can verify in ten minutes                                 |
| **EU CRA**                              | Cyber-resilience obligations for products with digital elements                                                                                                 | SBOM, vulnerability handling, provenance expectations                                       | A roadmap toward the obligations, not an audit                                                          |
| **OWASP SAMM**                          | Organisational assurance programme                                                                                                                              | Maturity-by-dimension thinking                                                              | Applies to a repository, not an org                                                                     |

---

## Where USA differs from the field

### 1 · It is stage-aware; they are not

ASVS asks you to pick L1/L2/L3 _before_ you start [2](https://www.securecodinghub.com/blog/owasp-asvs-developers-complete-guide).
Scorecard gives an absolute 0–10. Neither asks "how old is this project, and does
that matter?"

USA detects the stage and dampens severity accordingly — while holding a hard floor
on CRITICAL. [maturity-profiles.md](maturity-profiles.md)

### 2 · It is agent-executable, not just human-readable

Every framework above is a document a human interprets. USA ships:

- `rules/` — machine-readable versions of the same checks
- a deterministic engine that settles ~70% of them
- a **judgement queue** that tells an agent or reviewer exactly what evidence to produce

That split is the whole design. An LLM should not be asked to grep for `eval(`; it
should be asked whether authorisation is enforced per resource.

### 3 · It separates "absent" from "wrong"

Every framework above has a checkbox. None distinguishes 🚫 MISSING from ⚠️ WRONG —
yet wrong is worse, because it looks finished. USA gives WRONG its own status, its
own check kind (`grep_wrong`), and a score of 0.15 rather than 0.00.

### 4 · It reports confidence alongside score

A 90/100 where only 40% of applicable rules could be verified is not a 90/100. USA
prints confidence next to every dimension and marks unverifiable sections
_"— not verified"_ instead of silently awarding 10/10.

### 5 · It is diffable

Every report embeds a machine-readable trailer so `usa diff` turns the next audit
into a progress report: fixed, regressed, newly applicable, net movement. None of the
frameworks above give you a first-class way to show you improved.

### 6 · It covers the AI era as a first-class section

S14 is mapped to the OWASP LLM Top 10 (2026) and the OWASP Agentic AI Top 10 (ASI, 2026) — including risks that did not exist when the other frameworks were written:
excessive agency, unbounded consumption, RAG tenant leakage, memory/context poisoning,
and the fact that `AGENTS.md` is executable-ish instruction that commits like code.

---

## Detailed mapping

### USA section → standards

| USA                   | ASVS 5.0              | SSDF            | SLSA                | Scorecard                                                                                                       | Other                                                                    |
| --------------------- | --------------------- | --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| S1 Repository         | —                     | PO.3, PS.1      | Source L1–L2        | Binary-Artifacts, License, Security-Policy                                                                      | CII                                                                      |
| S2 Security           | V2–V14 (all chapters) | PW.1–PW.8, RV.1 | —                   | —                                                                                                               | CWE, OWASP Top 10                                                        |
| S3 Supply Chain       | V14.1, V14.2          | PS.3, PO.3      | Build L1–L3, Source | Pinned-Dependencies, Vulnerabilities, Dangerous-Workflow, Token-Permissions, Signed-Releases, Branch-Protection | CRA Annex I                                                              |
| S4 Architecture       | V1, V4                | PW.1            | —                   | —                                                                                                               | ISO 5055 Maintainability                                                 |
| S5 Code Quality       | V5, V7                | PW.7, PW.8      | —                   | —                                                                                                               | ISO 5055 Reliability                                                     |
| S6 Data               | V8, V5.3              | PW.4            | —                   | —                                                                                                               | GDPR Art. 32                                                             |
| S7 Testing            | V1.1, V4.2            | RV.1.1, PW.8    | —                   | CI-Tests, Fuzzing                                                                                               | —                                                                        |
| S8 CI/CD & Infra      | V14.1                 | PO.5, RV.3      | Build L2            | CI-Tests, Branch-Protection                                                                                     | DORA                                                                     |
| S9 Release            | V1.14                 | PO.5, RV.2      | Build L2, Source L2 | Signed-Releases                                                                                                 | SemVer                                                                   |
| S10 Dependencies      | V14.2                 | PW.4, RV.1.1    | —                   | Vulnerabilities, Dependency-Update-Tool, Maintained                                                             | SPDX, Criticality Score                                                  |
| S11 Performance       | V13                   | —               | —                   | —                                                                                                               | ISO 5055 Performance                                                     |
| S12 Documentation     | —                     | PS.1, PW.1      | —                   | —                                                                                                               | CII                                                                      |
| S13 A11y & Compliance | V14.4 (partly)        | —               | —                   | —                                                                                                               | WCAG 2.2 AA, GDPR, CCPA, PCI-DSS 4.0                                     |
| S14 AI / LLM          | —                     | —               | —                   | —                                                                                                               | OWASP LLM Top 10 (2026), OWASP ASI Top 10 (2026), NIST AI RMF, EU AI Act |
| S15 Platform          | V-per-stack           | —               | —                   | —                                                                                                               | MASVS, CIS Docker/K8s, SCWE                                              |
| S16 Future            | —                     | —               | —                   | —                                                                                                               | endoflife.date, FinOps                                                   |

### Representative rule → control

| Rule                                        | Control                                                 |
| ------------------------------------------- | ------------------------------------------------------- |
| `SEC-001` No hardcoded credentials          | ASVS 2.10.4 · CWE-798 · OWASP A02:2021                  |
| `SEC-005` SQL not built by concatenation    | ASVS 5.3.4 · CWE-89 · OWASP A03:2021                    |
| `SEC-011` Modern adaptive password hash     | ASVS 2.4.1 · CWE-916                                    |
| `SEC-025` Adaptive hash present where auth  | ASVS 2.4.1 · CWE-916                                    |
| `SEC-015` Authorization per request         | ASVS 4.2.1 · CWE-639 · OWASP A01:2021                   |
| `SEC-013` No `alg:none`                     | ASVS 3.2.3 · CWE-347                                    |
| `SUP-001` Lockfile committed                | OpenSSF Pinned-Dependencies · SSDF PS.3.2 · SLSA Source |
| `SUP-005` Dependency scanning in CI         | OpenSSF Vulnerabilities · SSDF RV.1.1                   |
| `SUP-008` No workflow script injection      | OpenSSF Dangerous-Workflow · CWE-94                     |
| `SUP-009` Least-privilege token permissions | OpenSSF Token-Permissions · SLSA Build L2               |
| `SUP-012` Default branch protected          | OpenSSF Branch-Protection · SLSA Source L2 · SSDF PO.2  |
| `SUP-014` SBOM published                    | SLSA · SSDF PS.3.2 · EU CRA Annex I                     |
| `SUP-015` Provenance attestation            | SLSA Build L2 (v1.2)                                    |
| `TEST-002` Tests run in CI on PRs           | OpenSSF CI-Tests · SSDF RV.1.1                          |
| `CICD-004` Rollback rehearsed               | DORA time-to-restore · SSDF RV.3                        |
| `CICD-010` Backups **and** tested restores  | SSDF RV.3 · CIS Control 11                              |
| `CTNR-001` Container not running as root    | CIS Docker 4.1 · CWE-250                                |
| `IAC-001` No public buckets / `0.0.0.0/0`   | CIS AWS 2.1.5 · CWE-284                                 |
| `SOLID-001` Reentrancy protection           | SWC-107 · Consensys best practices                      |
| `AI-001` Prompt injection                   | OWASP LLM01:2026 · ASI01:2026                           |
| `AI-003` Least-privilege agents             | OWASP LLM03:2026 · ASI02/ASI03:2026                     |
| `AI-005` Bounded consumption                | OWASP LLM06:2026 · ASI08:2026                           |
| `AI-007` RAG tenant isolation               | OWASP LLM09:2026 · ASI06:2026                           |
| `COMP-001` Keyboard accessibility           | WCAG 2.1.1 · EN 301 549                                 |
| `COMP-007` Data subject rights              | GDPR Art. 15/17 · CCPA                                  |

---

## Deliberate gaps

Things USA intentionally does **not** do. An audit tool that oversells is worse than
none.

| Not done                     | Why                                                | Do this instead                                               |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| **Penetration testing**      | No dynamic analysis, no fuzzing, no exploit chains | OWASP ASVS L2/L3 assessment, a pentest                        |
| **Deep SAST**                | Requires whole-program analysis                    | CodeQL, Semgrep, Snyk Code — USA checks they are _configured_ |
| **CVE lookup**               | Needs network + advisory databases                 | `npm audit`, `osv-scanner`, `trivy`, Dependabot               |
| **Compliance certification** | Only an accredited auditor certifies               | Use USA as the evidence checklist, then certify               |
| **Runtime/DAST**             | Nothing is executed                                | OWASP ZAP, Burp, your staging environment                     |
| **Formal verification**      | Out of scope for a checklist                       | Certora, Halmos, Kani                                         |
| **Org-level maturity**       | USA audits repositories                            | OWASP SAMM for programmes                                     |

### On Scorecard specifically

Scorecard is excellent and USA's S3/S8 borrow its shape. Two honest caveats, both
documented by its own users: it measures **process hygiene, not code quality**, and
peer-reviewed research found **no clean correlation** between high scores and fewer
vulnerabilities [1](https://rywalker.com/research/openssf-scorecard). Scorecard also
needs a public repo and network access. USA is the offline, code-level,
private-repo complement — run both.

### On SARIF

SARIF 2.1.0 is the right interchange format for static-analysis _results_, and most
SAST tools emit it. USA reports are prose-oriented — a scored, prioritised document
for humans and agents, not a machine-ingestible findings stream. If you need to feed
results into a dashboard, that is a small renderer away
(`src/report/`); the internal model already carries file, line, severity, and rule
identity for every finding. Contributions welcome.

---

## Sources

- [1](https://quality.arc42.org/standards/owasp-asvs) OWASP ASVS — version history, 17 chapters, cumulative L1–L3
- [2](https://www.securecodinghub.com/blog/owasp-asvs-developers-complete-guide) OWASP ASVS 5.0 — choosing a verification level
- [1](https://rywalker.com/research/openssf-scorecard) OpenSSF Scorecard — 18 checks, v5.5.0 (April 2026), and the caveats on what scores mean
- [1](https://rywalker.com/research/slsa) SLSA — spec v1.2 (Nov 2025), Build L0–L3, Source track approved
- [1](https://www.cybersaint.io/cybersecurity-frameworks-and-standards/glossary/what-is-the-owasp-top-10-for-llm-and-agentic-ai) OWASP Top 10 for LLM Applications, 2026 (LLM01–LLM10)
- [3](https://blog.ogwilliam.com/post/owasp-top-10-llm-applications-2026-whats-new) OWASP LLM Top 10 — 2025 vs 2026 changes
- [2](https://www.trydeepteam.com/docs/frameworks-owasp-top-10-for-agentic-applications) OWASP Top 10 for Agents, 2026 (ASI01–ASI10)
- [1](https://github.com/addyosmani/agent-skills/blob/main/CLAUDE.md) Agent Skills convention — `SKILL.md` + `references/`
