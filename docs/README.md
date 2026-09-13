# USA documentation

| Doc                                           | What's in it                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`USA.md`](../USA.md)                         | **The template itself** — all 16 sections, the severity model, the agent behaviour rules  |
| [Getting started](getting-started.md)         | Install, first audit, reading the report                                                  |
| [Concepts](concepts.md)                       | Severity × status, scoring maths, confidence, applicability                               |
| [Configuration](configuration.md)             | `.usa.yaml` reference                                                                     |
| [Rule packs](rule-packs.md)                   | Every check kind, with examples — start here to contribute a pack                         |
| [Detectors](detectors.md)                     | The fact catalogue and how to add signals                                                 |
| [Maturity profiles](maturity-profiles.md)     | Lifecycle stages, dampening, expected bands                                               |
| [Agent integration](agent-integration.md)     | Driving USA from Claude, Cursor, Codex, Copilot                                           |
| [CI integration](ci-integration.md)           | GitHub Actions, GitLab CI, quality gates, drift detection                                 |
| [Standards mapping](standards-mapping.md)     | USA ↔ ASVS 5.0, SSDF, SLSA, Scorecard, ISO 5055, WCAG, CRA, OWASP LLM/ASI                 |
| [Architecture](ARCHITECTURE.md)               | How the engine is put together, and what it deliberately does not do                      |
| [Evolution loop](EVOLUTION.md)                | The deterministic self-extension pipeline: snapshot → gap → propose → benchmark → release |
| [Experiment protocol](EXPERIMENT_PROTOCOL.md) | The mandatory process for capability-stress experiments                                   |
| [Release runbook](release.md)                 | How releases, publishing, and trusted publishing work (maintainers)                       |
| [API reference](reference/api.md)             | Programmatic use: `runAudit`, `detect`, `Project`, scoring, diffing, renderers            |
| [CLI reference](reference/cli.md)             | Generated from the real `--help` — every command and flag                                 |
| [ADRs](adr/)                                  | The decisions behind the design, and what each one cost                                   |

## Reading order

- **Auditing a project?** → [Getting started](getting-started.md) → [Concepts](concepts.md)
- **Wiring up CI?** → [CI integration](ci-integration.md)
- **Using an agent?** → [Agent integration](agent-integration.md)
- **Contributing a rule pack?** → [Rule packs](rule-packs.md) → [Detectors](detectors.md)
- **Comparing to a standard?** → [Standards mapping](standards-mapping.md)
- **Embedding USA in a tool?** → [API reference](reference/api.md)
- **Wondering why it is built this way?** → [Architecture](ARCHITECTURE.md) → [ADRs](adr/)
- **Extending USA itself?** → [Evolution loop](EVOLUTION.md) → [Experiment protocol](EXPERIMENT_PROTOCOL.md)
