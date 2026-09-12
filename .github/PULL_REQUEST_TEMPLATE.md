## What changed

<!-- One or two sentences. What does this PR do? -->

## Why

<!-- The problem it solves, or the issue it closes. -->

Closes #

## Type of change

- [ ] Rule pack (new rules, or changes to existing ones)
- [ ] Detector (new or fixed detection signals)
- [ ] Engine (TypeScript in `src/`)
- [ ] Documentation
- [ ] CI / tooling
- [ ] Bug fix

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run format:check` passes
- [ ] New rules have `why`, `remediation`, and — for `manual` checks — `evidence`
- [ ] New rules have been tested against a project that **does** and one that **does not** have the problem
- [ ] `usa audit .` on this repo shows no new failures (or the new ones are justified in `.usa.yaml`)

## False-positive check

For new or changed `grep_*` rules, what did you test against?

<!-- A rule that fires on its own documentation is worse than no rule. -->

## Screenshots / report excerpts

<!-- For report changes, paste the before/after. -->
