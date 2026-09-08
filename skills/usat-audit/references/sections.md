# The 16 sections and when each applies

Sections are activated by detection, not by the auditor's attention span. The CLI
handles this; use this table when you are auditing by hand, or to sanity-check why a
section did (or did not) appear.

| #       | Section                               | Applies when                                                   | Weight  |
| ------- | ------------------------------------- | -------------------------------------------------------------- | ------- |
| **S1**  | Repository & Project Structure        | always                                                         | 0.7     |
| **S2**  | Security                              | always                                                         | **1.7** |
| **S3**  | Supply Chain & Build Provenance       | always                                                         | 1.3     |
| **S4**  | Architecture & Design                 | always                                                         | 1.0     |
| **S5**  | Code Quality                          | always                                                         | 1.0     |
| **S6**  | Data & Database                       | `has:database`, an ORM, or migrations detected                 | 1.0     |
| **S7**  | Testing & Quality Assurance           | always                                                         | **1.3** |
| **S8**  | CI/CD, Infrastructure & Observability | always                                                         | 1.0     |
| **S9**  | Release & Change Management           | always                                                         | 0.7     |
| **S10** | Dependencies & Third-Party            | always                                                         | 1.2     |
| **S11** | Performance & Resilience              | always                                                         | 0.8     |
| **S12** | Documentation & Knowledge             | always                                                         | 0.7     |
| **S13** | Accessibility, i18n & Compliance      | ≥ MVP stage                                                    | 0.9     |
| **S14** | **AI / LLM-Era Risks**                | `ai:llm-sdk`, `ai:agents`, `ai:mcp`, `ai:rag`, or `ai:prompts` | 1.1     |
| **S15** | Platform-Specific                     | per stack (see below)                                          | 1.0     |
| **S16** | Future Readiness                      | always                                                         | 0.4     |

## S15 platform packs

| Pack              | Activates on                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `node-typescript` | `lang:typescript` / `lang:javascript` / `package.json`               |
| `python`          | `lang:python`                                                        |
| `go`              | `lang:go`                                                            |
| `rust`            | `lang:rust`                                                          |
| `jvm`             | `lang:java` / `kotlin` / `scala`                                     |
| `web-frontend`    | `platform:web` or React/Vue/Svelte/Angular/Next/Nuxt/SvelteKit/Astro |
| `mobile`          | `platform:ios` / `android` / `mobile`, React Native, Expo, Flutter   |
| `containers`      | `has:containers` (Dockerfile, compose)                               |
| `iac`             | Terraform, Kubernetes, Pulumi, or `project:iac`                      |
| `solidity`        | `platform:evm` (`.sol`, Foundry, Hardhat)                            |
| `ml-ai`           | `project:ml` (torch/notebooks/models)                                |
| `cli`             | `project:cli` (`bin`, `[project.scripts]`, `cmd/`)                   |
| `data`            | `has:database`                                                       |
| `api-backend`     | `platform:server` / `project:api`                                    |
| `compliance`      | ≥ MVP                                                                |
| `ai-era`          | any `ai:*` fact                                                      |

## Depth gating

| Depth      | Adds                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `quick`    | high-signal rules only                                                                               |
| `standard` | default set                                                                                          |
| `deep`     | circular-dependency scan, duplication analysis, complexity measurement, mutation testing, EOL review |

## Reading the report's applicability

The appendix lists every rule pack loaded **and** every pack skipped as
not-applicable. If a pack you expected is in the skipped list, check `usat detect .` —
the fact it selects on is missing.
