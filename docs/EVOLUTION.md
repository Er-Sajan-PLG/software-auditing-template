# Evolution loop

USA's autonomous improvement loop, implemented as a **deterministic, offline
pipeline** (see [ADR-0013](adr/0013-deterministic-evolution-loop.md)). No LLM,
no database, no network. The proof that "USA got better" is a before/after
measurement, not an assertion.

> Status legend used throughout: `[IMPLEMENTED]` / `[PARTIALLY IMPLEMENTED]` /
> `[PLANNED]` / `[DEFERRED]`.

## The loop

```
SNAPSHOT → AUDIT → COVERAGE → GAPS → PROPOSE → CANDIDATE → BENCHMARK → RELEASE → RE-AUDIT → DELTA
```

| Stage                     | Module                           | Status                                               |
| ------------------------- | -------------------------------- | ---------------------------------------------------- |
| Immutable snapshot        | `src/snapshot/`                  | `[IMPLEMENTED]`                                      |
| Content-addressed store   | `src/store/`                     | `[IMPLEMENTED]`                                      |
| Audit run + provenance    | `src/evolution/run.ts`           | `[IMPLEMENTED]`                                      |
| Coverage model            | `src/evolution/coverage.ts`      | `[IMPLEMENTED]`                                      |
| Capability gaps           | `src/evolution/gap.ts`           | `[IMPLEMENTED]`                                      |
| Proposal stage            | `src/evolution/propose.ts`       | `[IMPLEMENTED]` (gap→candidate; learn→candidate)     |
| Capability-set resolution | `src/evolution/capability.ts`    | `[IMPLEMENTED]`                                      |
| Candidate lifecycle       | (types) `src/evolution/types.ts` | `[PARTIALLY IMPLEMENTED]` (states defined; no queue) |
| Benchmark fleet           | `src/evolution/benchmark.ts`     | `[IMPLEMENTED]` (tiny fleet)                         |
| Release gate              | `src/evolution/release.ts`       | `[IMPLEMENTED]` (vacuous benchmarks rejected)        |
| Re-audit delta            | `src/evolution/run.ts`           | `[IMPLEMENTED]`                                      |
| End-to-end orchestrator   | `src/evolution/run.ts`           | `[IMPLEMENTED]`                                      |
| CLI                       | `usa evolve` in `src/cli.ts`     | `[IMPLEMENTED]`                                      |

## What is a capability here

For this milestone a **capability is a rule pack** (a `data` capability, per
ADR-0003). A _candidate_ capability is a pack that is not in `rules/index.yaml`.
A _released_ capability is injected into a re-audit through `runAudit`'s
`extraPacks` — the on-disk registry is never mutated.

## Modules and the core/platform split

- **Core (deterministic, offline, stateless):** `src/snapshot/`,
  `src/evolution/coverage.ts`, `src/evolution/gap.ts`,
  `src/evolution/capability.ts`, `src/evolution/release.ts`, plus the existing
  engine. These are pure functions of (snapshot, capability set, engine version).
- **Platform (stateful, still zero-dep):** `src/store/` (persistence) and
  `src/evolution/run.ts` (orchestration that records run/result identities).

## Reproducibility / provenance

An audit's reproducibility boundary is:

```
snapshotId  +  capabilitySetId  +  engineVersion  →  report (content-addressed)
```

`capabilitySetId` is a hash of (engine version, base pack ids, extra capability
id@version). The full `AuditReport` is stored content-addressed (`resultId`), so
a stored run can be reconstructed byte-for-byte.

## The proposal stage

`src/evolution/propose.ts` answers "where does a candidate come from?" **without
an LLM**. Two deterministic sources:

- **From a gap** — `proposeCandidate(gap)` renders the bootstrap starter pack for
  the gap's language (the same catalog `usa bootstrap` uses, the single source of
  truth) and parses it back into a `CandidateCapability` with status `PROPOSED`.
- **From learn suggestions** — `proposeFromSuggestions(suggestions)` turns the
  manual checks emitted by `usa learn` into a single `learn-proposals` candidate
  pack of `manual` checks. `manual` is the honest proposal when a missing check
  cannot yet be expressed as data.

Both are pure functions and both are **human-gated**: a proposal is unreviewed
and never reaches `rules/index.yaml`. It only becomes trusted after it clears the
benchmark fleet and the release gate (producer ≠ judge, per
[ADR-0014](adr/0014-proposal-stage-and-release-evidence.md)).

Enable it in the loop:

```bash
# propose from gaps, then benchmark/release the first proposable candidate
usa evolve /some/lua/repo --propose --bench-dir examples/evolution/bench
```

## Release requires evidence

`evaluateRelease` rejects a benchmark with **zero cases**. An unbenchmarked
candidate would otherwise score a vacuous precision/recall of 1.000 and sail
through the gate; requiring positive evidence keeps the "evidence over claims"
invariant (ADR-0014).

## Worked example (end-to-end, runnable test)

The integration test `tests/evolution.test.ts` proves the loop on a Lua target —
a language USA detects but ships no pack for:

1. **BEFORE** — `lang:lua` is detected, coverage reports it unsupported, and a
   `CapabilityGap` (`unsupported-technology:lua`) is derived.
2. **CANDIDATE** — a `stacks/lua` pack (rule `LUA-001` flags `os.execute` /
   `loadstring` / `load`).
3. **BENCHMARK** — known-positive flags correctly, known-negative does not, and
   no existing rule regresses → precision 1.0, recall 1.0, 0 regressions.
4. **RELEASE** — deterministic gate returns `ACCEPT`.
5. **AFTER** — the same snapshot re-audited with the released capability: Lua is
   covered, `LUA-001` is now detectable (WRONG), the gap is closed, coverage rises.

Run it manually:

```bash
# deterministic BEFORE half
usa evolve /some/lua/repo

# full loop with a candidate pack + benchmark cases
usa evolve /some/lua/repo \
  --candidate examples/evolution/stacks-lua.yaml \
  --bench-dir examples/evolution/bench \
  --store /tmp/usa-store
```

## Deferred (deliberately, in this milestone)

- `[DEFERRED]` Dynamic/sandbox execution, model roles, discovery, scheduling,
  n8n, dashboards, PostgreSQL/NATS — none are needed to prove the feedback loop.
- `[PARTIALLY IMPLEMENTED]` Wiring `usa learn` into the proposal stage is done
  (`proposeFromSuggestions`); feeding a _report_ directly from the `evolve` CLI
  (`--learn <report.md>`) is still `[PLANNED]`.
- `[PARTIALLY IMPLEMENTED]` A persistent gap→candidate→release **queue**; today
  the loop runs per-invocation and persists records in the Store, but does not
  auto-schedule or re-open gaps.
- `[DEFERRED]` Model runtime (`ModelRuntime`, model bundle in provenance) — a
  later, optional layer; producer/judge separation is already enforced by the
  deterministic gate.
