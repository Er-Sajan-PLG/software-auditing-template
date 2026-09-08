# 5. Lifecycle stage dampens severity; CRITICAL is exempt

- **Date:** 2026-09-08
- **Status:** Accepted

## Context

Static analysis has a credibility problem. A 200-line weekend prototype and a
payment service are handed the same list of HIGH findings, the prototype's
authors correctly conclude that the tool does not understand their situation,
and they learn to ignore it — right up until the year the tool would have been
right.

Severity that ignores context is not severity. It is a list of things that
_could_ be wrong.

## Decision

USAT detects a lifecycle stage — `prototype`, `mvp`, `beta`, `production`,
`legacy` — from repository signals (history, tags, CI, tests, security policy,
contributing guide, containerisation, monitoring).

Each stage has a **dampening table**: for each rule class (security,
correctness, maintainability, documentation, …) a number of severity rungs to
step down. `production` steps down nothing; `prototype` steps documentation down
two rungs and security down one.

**CRITICAL is never dampened, at any stage.** A committed credential, a
publicly-exposed secret, and an unauthenticated destructive endpoint are
emergencies on day one of a prototype.

## Rationale

The goal is not to be _nicer_ to prototypes. It is to keep the top of the
findings list true. If the first five things a founder reads are all things
they would defend, the scanner has lost them.

## Consequences

**Good:** a prototype's report leads with "no rate limiting, no auth on the
admin route", not "no ADRs and your README lacks a badge". Findings stay
ordered by what matters _now_. The dampening is visible in every finding, so
nothing is hidden.

**Bad:** a user in a hurry reads a MEDIUM where the rule says HIGH and
under-reacts. Mitigated by `--profile production`, which turns dampening off
entirely, and by `usat explain <rule>`, which always shows the rule's intrinsic
severity.

**Bad:** mis-detected stage mis-dampens everything. Because of this the stage is
always overridable (`--profile`, or `maturity:` in `.usat.yaml`) and always
printed with the signals that produced it, so a wrong guess is visible rather
than silent.

**Neutral:** the band table (prototype 30–65 … production 75–95) is a heuristic,
not a law. Scoring _above_ your band is not a goal.
