# Architecture Decision Records

Short, numbered, immutable records of the non-obvious choices in this
repository — see [ADR-0001](0001-record-architecture-decisions.md) for why
they exist and the rules for writing them (context, decision, consequences;
a changed decision gets a _new_ ADR that supersedes the old one).

## Index

| #    | Title                                                      | Status     | Supersedes |
| ---- | ---------------------------------------------------------- | ---------- | ---------- |
| 0001 | Record architecture decisions                              | Accepted   | —          |
| 0002 | Build the engine in TypeScript, not Python                 | Accepted   | —          |
| 0003 | Rule packs are YAML data, not TypeScript code              | Accepted   | —          |
| 0004 | Markdown is the only output format                         | Superseded | —          |
| 0005 | Lifecycle stage dampens severity; CRITICAL exempt          | Accepted   | —          |
| 0006 | Severity/status two axes; WRONG outranks MISSING           | Accepted   | —          |
| 0007 | Accepted risk stays visible, stops scoring, expires        | Accepted   | —          |
| 0008 | Machine-readable trailer; audits are diffable              | Accepted   | —          |
| 0009 | Malformed input fails closed and loudly                    | Accepted   | —          |
| 0010 | Detectors are cheap signals, fixed-point resolved          | Accepted   | —          |
| 0011 | Coexist with deep scanners; consume evidence               | Accepted   | —          |
| 0012 | Self-extension via bootstrap: propose, never self-trust    | Accepted   | —          |
| 0013 | Deterministic, offline evolution loop; no LLM in the spine | Accepted   | —          |
| 0014 | Deterministic proposal stage; release requires evidence    | Accepted   | —          |
| 0015 | Persistent gap queue: append-only state, derived latest    | Accepted   | —          |
| 0016 | Scheduler requires automated evidence to release           | Accepted   | —          |
| 0017 | Every automatable rule ships a positive/negative fixture   | Accepted   | —          |
| 0018 | JSON and SARIF renderers join Markdown                     | Accepted   | 0004       |
| 0019 | Oracle-ingestion check kind consumes evidence              | Accepted   | —          |
| 0020 | Documentation facts are machine-synced and machine-checked | Accepted   | —          |

## Coverage map (what has no ADR, and why)

- **Scoring maths** — specified normatively in `docs/concepts.md`, not an
  ADR: it is a formula with tests, not a judgement call. Disagreeing with it
  means changing code, and the tests adjudicate.
- **Individual rule wordings** — rules are data (ADR-0003). Disputed rules
  get fixed in `rules/` with a regression test, not an ADR.
- **Release mechanics** — tracked in `ROADMAP.md` until decided, then
  recorded here (e.g. the eventual release-automation choice).
