# 1. Record architectural decisions

- **Date:** 2026-09-08
- **Status:** Accepted

## Context

USAT is a template that other people will fork and extend. Every non-obvious
choice in it will be questioned by a contributor who was not in the room: "why
is the engine TypeScript instead of Python?", "why is everything YAML instead of
code?", "why is the output only Markdown?"

Those questions get asked in issues, answered from memory, and then re-asked six
months later by the next person.

## Decision

Architecture decisions are recorded as short numbered files in `docs/adr/`,
following the [Nygard
format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
context, decision, consequences. They are immutable — a decision that changes
gets a new ADR that supersedes the old one, rather than an edit.

## Consequences

**Good:** the reasoning survives the people; disagreeing with a decision becomes
a reviewable act rather than an archaeology project; USAT's own `ARCH-002` rule
(ADRs exist) now passes on itself, which is the only honest way to ship a rule.

**Bad:** ADRs rot. An ADR whose context no longer holds is worse than no ADR,
because it lends false authority to a stale choice. Mitigation: each file carries
a status, and superseded ones are kept, not deleted.

**Neutral:** three ADRs is a start, not a corpus. The convention matters more
than the count.
