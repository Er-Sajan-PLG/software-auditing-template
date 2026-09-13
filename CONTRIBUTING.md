# Contributing to USA

Thanks for helping make software audits less terrible.

The fastest high-value contribution is **a rule pack**: one YAML file, no
TypeScript, no build step. If you have ever run an audit checklist and thought
"nobody ever checks _this_", that is a rule pack waiting to happen.

## Ways to contribute

| Contribution                           | Difficulty | Where                                           |
| -------------------------------------- | ---------- | ----------------------------------------------- |
| A new rule in an existing pack         | Easy       | `rules/core/*.yaml`, `rules/stacks/*.yaml`      |
| A whole new stack pack                 | Easy       | `rules/stacks/<name>.yaml` + `rules/index.yaml` |
| A detector for a technology USA misses | Easy       | `rules/detectors.yaml`                          |
| A false positive you actually hit      | Easy       | open an issue with the reproducer               |
| Fixing a rule that over-fires          | Medium     | the pack + a test in `tests/`                   |
| Engine work                            | Medium     | `src/`                                          |
| Docs and standards mapping             | Easy       | `docs/`, `USA.md`                               |

## Development setup

```bash
git clone https://github.com/Er-Sajan-PLG/universal-software-auditor
cd universal-software-auditor
npm install

npm test                 # vitest
npm run lint             # eslint
npm run typecheck        # tsc --noEmit
npm run format           # prettier --write
```

Run the CLI from source:

```bash
npm run usa -- detect .
npm run usa -- audit . --depth deep
npm run usa -- rules --section S2
npm run usa -- explain SEC-001
```

Or build and run the compiled output:

```bash
npm run build && node dist/cli.js audit .
```

## Adding a rule

Read [`docs/rule-packs.md`](docs/rule-packs.md) for the full schema. The short
version:

```yaml
  - id: WEB-010
    title: Fonts are served with font-display: swap
    section: S15
    section_title: Platform-Specific
    severity: LOW
    class: performance
    applies_when: { fact: 'platform:web' }
    check:
      kind: grep_present
      pattern: 'font-display\s*:\s*swap'
      include: ['**/*.{css,scss,sass,less}']
    why: 'A blocking font swap is a flash of invisible text on every cold load.'
    remediation: 'Add font-display: swap to every @font-face block.'
    references: ['Web-Vitals:CLS']
```

**Every rule needs:**

- `id` — prefix matches the pack (`SEC-`, `WEB-`, `PY-`, `AI-`…)
- `title` — the _desired state_, not the defect
- `section` and `class`
- `check` — one of the 16 kinds in [`docs/rule-packs.md`](docs/rule-packs.md)
- `why` — one sentence, or the rule does not earn its place
- `remediation` — something a person can actually do
- `evidence` — **required** for `manual` checks; this is the prompt a reviewer works from

CI enforces most of this (see `tests/e2e.test.ts`).

## Contributor gates (all enforced in CI)

| Gate              | Rule                                                                                                                            | Where                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Complexity budget | Functions stay at cyclomatic complexity ≤ 10 (warn-only). Over? Split: one branch = one function, dispatch tables over switches | `eslint.config.mjs`             |
| Coverage ratchet  | Thresholds sit at the measured number and only rise (`vitest.config.ts`). Lowering a threshold needs an ADR-level reason        | `npm run test:cov`              |
| Rule fixtures     | Every automatable rule ships a `tests/fixtures/rules/<ID>.yaml` fixture; the coverage gate fails an untested rule (ADR-0017)    | `tests/rule-fixtures.test.ts`   |
| ADR hygiene       | Filenames sequential, title numbers match, Date + Status present, index complete                                                | `node scripts/check-adrs.mjs`   |
| Doc sync          | README rule-count floor holds; every section id appears in `USA.md`; every `--flag` in docs exists in `--help`                  | `node scripts/check-docs.mjs`   |
| CLI reference     | `docs/reference/cli.md` is generated — never hand-edit it; regenerate and commit                                                | `node scripts/gen-cli-docs.mjs` |

**Fixing a rule that over/under-fires** (the highest-value rule contribution):

1. Prove it with a minimal reproducer first (FP line that fires, FN line that does not).
2. Fix the pattern narrowly; add a `NOTE:` comment in the YAML naming the trap and what must never come back (see SEC-003, SEC-005, SEC-013).
3. Add FP _and_ FN cases to `tests/rules.test.ts` following the `ruleOf` + `fixture` + `evaluateAt` pattern.
4. Run the full suite — rule changes move the self-audit score, and `usa diff` against the previous report must show no unintended movement.

## Testing a rule

A rule that fires on its own documentation is worse than no rule. Test against two
projects:

```bash
npm run usa -- audit ~/code/project-with-the-problem
npm run usa -- audit ~/code/project-without-it
```

The second run must stay clean. Then add a case to `tests/`:

```ts
it('does not flag an env-var reference as a hardcoded credential', () => {
  const root = build({ 'src/config.ts': 'export const apiKey = process.env.API_KEY;\n' });
  const { report } = auditAt(root);
  expect(report.findings.find((f) => f.ruleId === 'SEC-001')!.status).toBe('PASS');
});
```

## Branches and commits

- Branches: `feat/…`, `fix/…`, `docs/…`, `rules/…`, `refactor/…`
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) —
  `feat(rules): add Bun runtime checks`, `fix(detect): requirements.txt is a not prose file`
- **Enforced, not asked:** a commit-msg hook runs commitlint, and CI lints
  every PR commit. This is load-bearing — release-please computes version
  bumps and CHANGELOG entries from history, so a non-conventional message
  is silently excluded from releases.
- Squash-merge PRs with a conventional title: the title becomes the commit
  release-please reads. `feat` → minor, `fix` → patch,
  `BREAKING CHANGE:` footer → major; docs/chore/test ride along unbumped.

## Pull requests

1. Branch from `master`.
2. Run `npm test && npm run lint && npm run typecheck && npm run format:check`.
3. Fill in the PR template — especially the **false-positive check**.
4. If the change affects the report structure, paste a before/after excerpt.

## This repo audits itself

`.github/workflows/self-audit.yml` runs USA on USA on every PR. If it fails, either
the tool regressed or the repo picked up a real finding. If the finding is a deliberate
decision, add it to `.usa.yaml` **with a reason** — that is exactly what the
suppression mechanism is for.

## Code of conduct

See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). In particular: criticise the code, not
the person who wrote it.
