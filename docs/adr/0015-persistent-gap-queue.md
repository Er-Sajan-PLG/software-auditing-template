# 15. Persistent gap queue: append-only state, derived latest, no mutable index

- **Date:** 2026-09-12
- **Status:** Accepted

## Context

The evolution loop (ADR-0013, ADR-0014) derives `CapabilityGap`s from every
audit, but treated each run as isolated: the same gap was rediscovered and then
forgotten. There was no durable answer to "which gaps are open right now?", no
way to close a gap when a capability released, and no memory to re-open a gap if
it reappeared. The `CandidateStatus` lifecycle existed in types but had nowhere
to live across runs.

The Store (ADR-0013) is content-addressed and append-only: a record's address is
the hash of its bytes, so records cannot be mutated. Any queue built on it must
respect that — a mutable "latest state" pointer would be exactly the kind of
drifting source of truth the codebase forbids.

## Decision

Add `src/evolution/queue.ts`: a persistent gap queue whose state is **entirely
derived from append-only records**.

1. **One transition = one record.** Every open/close/accept writes a
   `{ kind: 'gap-record', namespace, gapId, seq, state, gap, transition }` object
   through `Store.put`. Nothing is ever rewritten; a new state is a new object.
2. **Latest state is a pure fold.** `openGaps`/`allGaps`/`history`/`summarize`
   gather records in a namespace, sort by `(gapId, seq)`, and take the last per
   id. There is no index object that can disagree with the records — replay the
   store and the queue is reproduced byte-for-byte.
3. **Idempotent re-observation.** Re-recording an unchanged gap returns
   `existing` and appends nothing. A change to the gap's evidence trail is a
   genuine update and appends. Re-opening a `closed` gap appends an `open`
   transition and reports `reopened`.
4. **Release closes.** `runEvolutionCycle`, when a Store backs the run
   (`persistGaps`, default on with a store), records the BEFORE gaps and closes
   the gap(s) a released candidate targeted.

## Consequences

**Good:** the loop now has durable memory without introducing a mutable store of
truth or any new dependency. "Which gaps are open?" survives process restarts
and is provable by replay. Multi-run scenarios (a gap closes on release, then
re-opens on a later capability-less audit) are represented honestly.

**Bad / accepted:** the append-only trail grows one evidence-refreshing record
per gap per run, since each run's `auditRunId`/`snapshotId` differ. This is an
audit log, not a state change, but it is unbounded without a future compaction
step. Queue-driven auto-scheduling (walking `openGaps()` to evaluate many
candidates per run) is deferred; a run still evaluates only the first proposable
candidate.

**Neutral:** `Store.ids()` was added (sorted content addresses) to let the queue
scan deterministically; it is a read-only convenience and changes no stored
record.
