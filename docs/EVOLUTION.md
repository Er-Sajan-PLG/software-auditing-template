# Evolution loop

USA's autonomous improvement loop, implemented as a **deterministic, offline
pipeline** (see [ADR-0013](adr/0013-deterministic-evolution-loop.md)). No LLM,
no database, no network. The proof that "USA got better" is a before/after
measurement, not an assertion.

> Status legend used throughout: `[IMPLEMENTED]` / `[PARTIALLY IMPLEMENTED]` /
> `[PLANNED]` / `[DEFERRED]`.

## The loop

```
SNAPSHOT → AUDIT → COVERAGE → GAPS → (CANDIDATE → BENCHMARK → RELEASE) → RE-AUDIT → DELTA
```

| Stage                     | Module                           | Status                                               |
| ------------------------- | -------------------------------- | ---------------------------------------------------- |
| Immutable snapshot        | `src/snapshot/`                  | `[IMPLEMENTED]`                                      |
| Content-addressed store   | `src/store/`                     | `[IMPLEMENTED]`                                      |
| Audit run + provenance    | `src/evolution/run.ts`           | `[IMPLEMENTED]`                                      |
| Coverage model            | `src/evolution/coverage.ts`      | `[IMPLEMENTED]`                                      |
| Capability gaps           | `src/evolution/gap.ts`           | `[IMPLEMENTED]`                                      |
| Capability-set resolution | `src/evolution/capability.ts`    | `[IMPLEMENTED]`                                      |
| Candidate lifecycle       | (types) `src/evolution/types.ts` | `[PARTIALLY IMPLEMENTED]` (states defined; no queue) |
| Benchmark fleet           | `src/evolution/benchmark.ts`     | `[IMPLEMENTED]` (tiny fleet)                         |
| Release gate              | `src/evolution/release.ts`       | `[IMPLEMENTED]`                                      |
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
- `[PLANNED]` Wiring `usa bootstrap` / `usa learn` into the pipeline as the
  _proposal_ stage that feeds `CandidateCapability` (they remain human-gated,
  per ADR-0012).
- `[PARTIALLY IMPLEMENTED]` A persistent gap→candidate→release **queue**; today
  the loop runs per-invocation and persists records in the Store, but does not
  auto-schedule or re-open gaps.
- `[DEFERRED]` Model runtime (`ModelRuntime`, model bundle in provenance) — a
  later, optional layer; producer/judge separation is already enforced by the
  deterministic gate.
