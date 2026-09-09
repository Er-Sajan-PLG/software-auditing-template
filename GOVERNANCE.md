# Governance

Single-maintainer project with a low-friction path for rule contributors.
This file is the whole model — forty lines, no committees.

## Roles

| Role          | Who                                          | Can do                                                                |
| ------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| Maintainer    | Repo owner                                   | Everything: merge, release, set direction                             |
| Rule reviewer | Any repeat contributor the maintainer trusts | Approve YAML-only PRs (rules, detectors, docs)                        |
| Contributor   | Everyone                                     | Open PRs and issues; rule packs are the advertised first contribution |

There is no second tier of code review: TypeScript engine changes need the
maintainer. YAML-only changes need one rule reviewer or the maintainer.

## How decisions get made

1. **Small and reversible** — PR review. Two sentences of rationale in the
   PR body suffice.
2. **Architectural or contested** — an ADR in `docs/adr/` (see ADR-0001).
   Disagreeing with a merged ADR means writing the superseding ADR as a PR,
   not relitigating in issues.
3. **Rule wording disputes** — rules are data (ADR-0003). The fix is a YAML
   edit plus a regression test in `tests/rules.test.ts` proving the FP/FN.
   "This pattern also matches X" without a reproducer does not block a PR.

## Release authority

Only the maintainer tags releases and publishes to npm. Release PRs (see
ROADMAP: release-please) are reviewable; merging one is the release act.
The `NPM_TOKEN`/OIDC publisher is never shared.

## Security

Report vulnerabilities privately per `SECURITY.md` (7-day ack, 30-day
update SLA). Never open a public issue for an active vulnerability — in
this repo _or_ in a rule pattern that would teach exploitation.

## Code of conduct

`CODE_OF_CONDUCT.md` applies everywhere in this project. The maintainer
enforces it; violations mean warning, then removal from the contributor
ladder, then ban, in that order.

## Changing this document

This file changes by PR like any other, except role changes require the
maintainer's explicit approval in the review — not just a merge.
