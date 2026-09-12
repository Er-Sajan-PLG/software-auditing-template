# 13. The evolution loop is deterministic and offline; no LLM in the spine

- **Date:** 2026-09-12
- **Status:** Accepted

## Context

The long-term ambition (see `docs/ARCHITECTURE-NEXT.md`) is an autonomous,
continuously-improving auditor: audit → measure coverage → discover a
capability gap → propose a candidate → test → benchmark → release → re-audit →
prove improvement.

The obvious temptation is to wire an LLM into the middle of that loop and call
it "self-improvement". That would break every hard-won invariant of this codebase:
audits are deterministic, reproducible, offline, and evidence-first (ADR-0002,
ADR-0004, the "never mark ✅ without evidence" rule). A model that both proposes
a capability and judges whether it improved is circular — the same model would
generate and validate its own conclusion.

## Decision

The first implementation of the evolution loop (`src/evolution/`, `src/snapshot/`,
`src/store/`) is **entirely deterministic and offline**:

1. **Snapshot** — the target is content-addressed (`sha256` over sorted
   path/sha/size rows), so "what bytes did the audit analyze" has a byte-exact
   answer.
2. **AuditRun + Store** — a content-addressed, append-only filesystem store
   persists runs and results; a record's address _is_ its identity, so it cannot
   be mutated after the fact. No database, no network.
3. **Coverage** — derived only from executed capabilities (a capability merely
   present in the registry counts for nothing), reusing the existing
   detection/bootstrap knowledge as the single source of truth for "which
   languages ship a pack".
4. **Gap** — derived from coverage blind spots with evidence (fact + audit run +
   snapshot), never from intuition.
5. **Candidate → Benchmark → Release** — a candidate capability (a rule pack, per
   ADR-0003) is measured against a fleet (known-positive / known-negative /
   regression) for TP/TN/FP/FN, precision/recall, and regressions; a deterministic
   gate decides ACCEPT/REJECT. A released capability is injected into a re-audit
   via `runAudit`'s `extraPacks` — it never mutates the on-disk `rules/` registry.

An LLM may later act as a _proposal assistant_ (authoring candidates and gap
descriptions). But the authority — measurement, gate, release — stays
deterministic. The producer and the judge are never the same actor.

## Consequences

**Good:** the loop is provable from first principles and fully tested without any
provider, key, or network dependency. "Did USA get better?" is answered by
before/after coverage and finding deltas, not by a model's self-assessment.
ADR-0011 is _not_ reopened: no CVE database, resolver, dataflow engine, or signer
was introduced.

**Bad:** the loop is deliberately narrow for now. It improves language coverage
(detected-but-unsupported stacks) and nothing else; dynamic analysis, model
roles, discovery, and scheduling remain future work. `usa bootstrap`/`usa learn`
are not wired into the pipeline yet — they remain the human-facing proposal
stage (ADR-0012).

**Neutral:** nothing here contradicts ADR-0012; it generalizes its
"propose, never self-trust" principle from bootstrap into a governed,
benchmark-gated release path.
