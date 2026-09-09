# Writing rule packs

A rule pack is one YAML file. Register it in `rules/index.yaml`, and USAT decides at
audit time whether it applies.

```yaml
id: stacks/mobile
title: Mobile (iOS / Android / Cross-platform)
section: S15
section_title: Platform-Specific
description: 'Activated when iOS, Android, React Native, Expo, or Flutter is detected.'
version: '1.0'
skip_when: # skip the WHOLE pack when true
  all:
    - { fact: 'platform:mobile', op: 'absent' }
    - { fact: 'platform:ios', op: 'absent' }
    - { fact: 'platform:android', op: 'absent' }
provides: ['platform:mobile'] # facts this pack asserts
rules:
  - id: MOB-001
    title: Crash reporting is integrated
    section: S15
    section_title: Platform-Specific
    severity: HIGH
    class: operations
    applies_when: { fact: 'maturity:beta' } # optional per-rule gating
    depths: [standard, deep] # optional
    check:
      kind: grep_present
      pattern: '(Crashlytics|Sentry|BugSnag|Instabug)'
      include: ['**/*.{ts,tsx,js,json,plist,xml,gradle,swift,kt}']
      exclude: ['**/node_modules/**', '**/Pods/**']
      flags: i
    why: "On mobile you cannot watch the user's screen."
    evidence: 'Where tokens/PII live: Keychain/Keystore, not AsyncStorage.'
    remediation: 'Add Crashlytics or Sentry with dSYM upload.'
    references: ['OWASP-MASVS-STORAGE-2']
```

## Pack fields

| Field           | Required | Notes                                                 |
| --------------- | -------- | ----------------------------------------------------- |
| `id`            | ✅       | Convention: `core/<name>` or `stacks/<name>`          |
| `title`         | ✅       |                                                       |
| `section`       |          | Default section for rules that omit one               |
| `section_title` |          |                                                       |
| `description`   |          | Shown by `usat rules`                                 |
| `skip_when`     |          | Predicate; pack is skipped when **true**              |
| `provides`      |          | Facts to add when the pack applies — lets packs chain |
| `rules`         | ✅       |                                                       |

## Rule fields

| Field          | Required | Notes                                                    |
| -------------- | -------- | -------------------------------------------------------- |
| `id`           | ✅       | Convention: `<PREFIX>-<NNN>`, e.g. `SEC-007`             |
| `title`        | ✅       | Imperative and specific: "Tokens and sessions expire"    |
| `section`      | ✅       | `S1`…`S16`                                               |
| `severity`     | ✅       | `CRITICAL` \| `HIGH` \| `MEDIUM` \| `LOW` \| `FUTURE`    |
| `class`        | ✅       | See below                                                |
| `check`        | ✅       | See below                                                |
| `weight`       |          | Overrides the severity default                           |
| `applies_when` |          | Predicate over detected facts                            |
| `depths`       |          | `[quick]` / `[standard]` / `[deep]`; omit for all        |
| `why`          |          | Shown in the report and the judgement queue              |
| `evidence`     |          | **Required for `manual` checks** — what proof looks like |
| `remediation`  |          | The fix                                                  |
| `references`   |          | Standard IDs: `CWE-89`, `ASVS-5.3.4`, `OWASP-LLM01:2026` |
| `tags`         |          | Free-form                                                |

### `class` drives dampening

`security` · `supply-chain` · `correctness` · `maintainability` · `operations` ·
`performance` · `compliance` · `documentation` · `style`

---

## Check kinds

### `manual` — needs a human or an agent

```yaml
check: { kind: manual }
```

Produces ❓ NEEDS REVIEW and lands in the judgement queue. Always pair with
`evidence:` — it is the prompt the reviewer works from.

### `file_exists` / `file_absent`

```yaml
check: { kind: file_exists, files: ['.gitignore'] }
check: { kind: file_absent, files: ['.env', '*.pem'] }
```

`file_absent` fails with locations when something is found.

### `any_file`

```yaml
check:
  kind: any_file
  patterns: ['README.md', 'readme.md', 'README.rst']
```

### `grep_present` / `grep_absent`

```yaml
check:
  kind: grep_present # PASS when found
  pattern: '(zod|joi|pydantic|class-validator)'
  include: ['**/*.{ts,tsx,js,jsx,py,go}']
  exclude: ['**/*.test.*', '**/node_modules/**']
  flags: i # i = case-insensitive
```

`grep_absent` inverts it: any hit is a FAIL **with file:line locations** — this is
the workhorse for "no hardcoded secrets", "no `shell=True`", "no `http://`".

### `grep_wrong` / `grep_deprecated`

```yaml
check:
  kind: grep_wrong # hits → ⚠️ WRONG
  pattern: 'catch\s*\(\s*\w*\s*\)\s*\{\s*\}'

check:
  kind: grep_deprecated # hits → 💀 DEPRECATED
  pattern: 'new Buffer\s*\('
```

Use `grep_wrong` for "present but done incorrectly" — the status auditors most often
miss (Rule 9).

### `tracked_present` / `tracked_absent`

Asks **git** what is tracked, not what is on disk. Use for committed build output,
committed `.env`, committed model weights — anything whose presence in the working
tree is normal but whose presence in git is a bug.

```yaml
check:
  kind: tracked_absent
  patterns: ['dist/**', 'node_modules/**', '.env', '**/*.pt']
```

### `count_min`

```yaml
check:
  kind: count_min
  patterns: ['**/*.test.{ts,tsx}', '**/test_*.py']
  min: 5
```

### `file_lines_max`

```yaml
check:
  kind: file_lines_max
  patterns: ['src/**/*.ts']
  max_lines: 800
```

Any hit is ⚠️ WRONG with the line count. A cheap proxy for god objects.

### `json_path`

```yaml
check:
  kind: json_path
  file: 'package.json'
  path: 'engines.node'
  equals: '>=20'
```

`equals` omitted ⇒ PASS when the key is merely set. Works on JSON (JSONC tolerated).

### `command`

```yaml
check:
  kind: command
  run: '! npm audit --production --audit-level=high | grep -qiE "critical|high"'
  expect_exit: 0
```

**Skipped unless `--allow-commands`** — reported as ❓ NEEDS REVIEW otherwise.
USAT never shells out without being asked.

### `info`

Context only, never scored. Useful for explaining a section to a reader.

---

## Predicates

```yaml
applies_when: { fact: 'has:database' }

applies_when:
  any:
    - { fact: 'lang:typescript' }
    - { fact: 'lang:javascript' }

applies_when:
  all:
    - { fact: 'maturity:production' }
    - { not: { fact: 'project:library' } }

# Numeric facts use metric:
applies_when: { fact: 'metric:contributors', op: 'gt', value: 2 }
applies_when: { fact: 'metric:tags', op: 'exists' }
```

Operators: `exists` (default) · `absent` · `eq` · `neq` · `in` · `includes` · `gt` · `lt` · `matches`

Combinators: `all` · `any` · `not`

### Fail-closed contracts (the engine does not guess)

Malformed input warns at load time and evaluates conservatively — see
ADR-0009. What to know as an author:

- `in` / `includes` compare **metric** values against the list. On flag
  facts they are always false: presence alone never satisfies a value
  comparison.
- `matches` compiles `value` as a regex; an invalid regex warns and the
  predicate is false. Unknown operators and unknown predicate keys behave
  the same way (rule skipped, warning on stderr).
- An empty grep `pattern` drops the rule with a warning — `new RegExp('')`
  matches every line, so a missing pattern would otherwise FAIL (or PASS)
  the whole repo.
- Duplicate rule IDs across packs: first definition wins, later ones warn.
- Override `severity` must be on the ladder and `weight` a finite number
  ≥ 0, or the override is ignored with a warning. Run `node
scripts/check-docs.mjs`-adjacent `usat rules` after editing: the shipped
  packs must load with **zero warnings** (enforced by `tests/e2e.test.ts`).

---

## Available facts

Run `usat detect .` on any project to see them. Namespaces:

`lang:*` `pm:*` `fw:*` `project:*` `platform:*` `db:*` `orm:*` `auth:*` `test:*`
`ci:*` `infra:*` `api:*` `obs:*` `ai:*` `has:*` `doc:*` `practice:*` `maturity:*`

Metrics (use `metric:<name>`): `commits`, `contributors`, `tags`, `branches`,
`files`, `daysSinceLastCommit`.

Full catalogue: [detectors.md](detectors.md).

---

## Style guide for rule authors

1. **Title = the desired state**, not the defect. "Tokens and sessions expire", not "Missing token expiry".
2. **`why` earns the rule its place.** If you cannot say why in one sentence, cut the rule.
3. **`remediation` must be actionable.** "Improve security" is not a fix. "Set `SameSite=Lax` and require a CSRF token" is.
4. **`evidence` is the deliverable for manual checks.** It tells the reviewer exactly what to produce.
5. **Exclude tests and docs from security greps.** A rule that fires on its own documentation is a rule people will disable.
6. **Prefer `grep_wrong` over `grep_absent`** when the _pattern_ is fine but a specific usage is not.
7. **Cite the standard.** `CWE-89`, `ASVS-5.3.4`, `SLSA-Build-L2`, `OWASP-LLM01:2026`.
8. **Severity = worst realistic outcome**, not typical. Dampening handles context; the rule should not.

## Testing your pack

```bash
usat rules --section S15        # did it load?
usat explain MOB-001            # did it parse as intended?
usat audit . --include stacks/mobile --depth deep
```

A pack with a YAML syntax error is skipped with a warning on stderr — the audit never
crashes because of a bad rule file.

## Starting from `usat bootstrap`

For a language with no shipped pack, `usat bootstrap <path> [--out <dir>]`
drafts a starter pack from the curated catalog (or generic judgement
prompts for unknown languages). The draft is a proposal, not a verdict —
see ADR-0012. The acceptance ritual before registering it in
`rules/index.yaml`:

1. Read every pattern; delete any that misfires on the target codebase.
2. Audit one project WITH the problem and one WITHOUT it; both runs must
   behave (`usat audit --rules-dir` accepts an unregistered pack dir, so
   the review never pollutes the shipped registry).
3. Add FP _and_ FN regression tests to `tests/rules.test.ts`.
4. Register the reviewed file in `rules/index.yaml` and watch the
   self-audit-adjacent gates (`check-docs` rule floor, e2e uniqueness)
   stay green.
