# API reference

Everything the CLI does is available as a library. Types are exported from the
package root.

```ts
import { runAudit, detect, Project, renderMarkdown, diffReports } from 'usa';
```

## `runAudit(options): AuditOutcome`

Runs a full audit. Only `target` is required — every other option falls back to
the same default the CLI uses.

```ts
import { runAudit } from 'usa';

const { report, profile, warnings } = runAudit({
  // synchronous — no await needed
  target: '/path/to/project',
  depth: 'standard', // 'quick' | 'standard' | 'deep'
  profile: 'auto', // 'auto' | 'prototype' | 'mvp' | 'beta' | 'production' | 'legacy'
  config: { version: 1, ignore: ['vendor/**'] }, // or omit to read .usa.yaml
  allowCommands: false, // let `command` checks execute
  includePacks: ['stacks/node-typescript'],
  excludePacks: ['stacks/solidity'],
});

console.log(report.score.overall); // 88.7
console.log(warnings); // malformed packs — never throws
```

| Option                          | Type                 | Default                               |
| ------------------------------- | -------------------- | ------------------------------------- |
| `target`                        | `string`             | — (required)                          |
| `rulesDir`                      | `string`             | `rules/` inside the installed package |
| `depth`                         | `Depth`              | `'standard'`                          |
| `profile`                       | `Maturity \| 'auto'` | `'auto'`                              |
| `config`                        | `UsaConfig`          | parsed from `<target>/.usa.yaml`      |
| `allowCommands`                 | `boolean`            | `false`                               |
| `usaVersion`                    | `string`             | version from `package.json`           |
| `includePacks` / `excludePacks` | `string[]`           | `undefined`                           |

Returns `{ report: AuditReport, profile: MaturityProfile, warnings: string[] }`.

## `detect(project, detectors, git, extraFacts?): DetectionResult`

Turns a tree into a fact set.

```ts
import { Project, detect, loadDetectorFile } from 'usa';

const project = new Project('/path/to/project', ['vendor/**']);
const detection = detect(
  project,
  loadDetectorFile('node_modules/usa/rules/detectors.yaml'),
  project.gitInfo(),
  ['monorepo'], // facts asserted by the caller
);

detection.facts.flags; // Set { 'lang:typescript', 'pm:npm', 'has:ci', … }
detection.maturity; // 'mvp'
detection.maturitySignals; // ['+1 tests present', '+0 release tags (absent)', …]
```

## `Project`

The tree index. Cached, read-only, built once.

```ts
const p = new Project(root, extraIgnores);

p.files; // string[] — every indexed path, relative, sorted
p.glob('**/*.ts'); // string[]
p.has('package.json'); // boolean
p.dirExists('src'); // boolean
p.anyFile(['**/*.tf', 'pulumi/**']); // boolean
p.count('**/*.test.ts'); // number
p.read('package.json'); // string | null
p.readJson('package.json'); // unknown | null (tolerates comments + trailing commas)
p.grep('TODO|FIXME', ['**/*.ts'], ['**/generated/**']); // GrepHit[]
p.gitInfo(); // { commits, contributors, tags, branches, daysSinceLastCommit, isRepo }
p.trackedFiles(); // string[] — paths git knows about (respects .gitignore semantics)
```

**`grep` never touches lockfiles, minified bundles, source maps, or generated
files**, so a 40 MB `package-lock.json` cannot dominate the runtime. Those files
are still _indexed_, so the presence of a lockfile is checkable.

## `loadRulePacks(rulesDir): { packs, warnings }`

Parses and validates every pack reachable from `rules/index.yaml`. A malformed
pack produces a warning and is skipped — the audit continues rather than
failing, because one broken pack should not cost you the other twenty-six.

```ts
import { loadRulePacks, applyRuleOverrides } from 'usa';

const { packs, warnings } = loadRulePacks('rules');
applyRuleOverrides(packs, { 'SEC-042': { severity: 'LOW' } });
```

## `evaluateRule(rule, ctx): Finding`

Evaluates a single rule. Useful for testing a pack without running an audit.

```ts
import { evaluateRule, ruleApplies, packApplies } from 'usa';

if (ruleApplies(rule, facts, depth)) {
  const finding = evaluateRule(rule, ctx);
  finding.status; // 'PASS' | 'FAIL' | 'MISSING' | 'UNKNOWN' | …
}
```

## `score(evaluated, sections, profile): ScoreCard`

```ts
import { score } from 'usa';

const card = score(evaluated, sections, profile);
card.overall; // 88.7 — 0 when nothing resolved (never null; see below)
card.automationCoverage; // 70.8 — share of applicable rules verified without a human
card.sections; // [{ id, title, score: number | null, confidence, … }]
card.counts; // per-status totals, suppressed findings excluded
card.severityCounts; // per-severity open findings, suppressed excluded
card.expectedBand; // e.g. [60, 85] for the detected maturity stage
```

A section whose rules all resolved to `UNKNOWN` scores **`null`**, not 10. It is
excluded from the numerator _and_ the denominator, and rendered as
`— not verified`. The **overall** score, however, is a number: `0` when
nothing resolved. A bare `0` cannot tell "everything failed" from "nothing
was verifiable" — read it together with `automationCoverage`, which is
exactly the confusion `docs/concepts.md` warns is the most misleading thing
an audit tool can produce.

## `renderMarkdown(report, profile): string`

Deterministic Markdown, including the machine-readable trailer. Rule IDs in
the trailer are YAML-quoted, so pack-author-controlled IDs cannot corrupt
the machine-parsed channel.

```ts
import { renderMarkdown, parseTrailer, trailer } from 'usa';

const md = renderMarkdown(report, profile);
const yaml = trailer(report); // the YAML string embedded in the trailer fences
const parsed = parseTrailer(md); // read a trailer back out (latest wins on concatenation)
```

## `diffReports(beforeRaw, afterRaw): string`

Takes two trailer YAML strings (or full reports — `parseTrailer` extracts),
returns Markdown. Reports fixed, regressed, changed-still-open, and newly
applicable rules with net point movement. Judgement-queue transitions are
first-class: `UNKNOWN → PASS` lists as fixed _(resolved by review)_ and
`PASS → UNKNOWN` as regressed _(needs review)_.

```ts
import { diffReports, parseTrailer } from 'usa';

const md = diffReports(parseTrailer(beforeMd)!, parseTrailer(afterMd)!);
console.log(md); // # 🔁 USA Audit Diff …
```

## `validatePredicate(p, where, warnings): void`

Validates an `applies_when` predicate the way the loader does: unknown keys
and operators, non-list `all`/`any`, and uncompilable `matches` regexes each
push a named warning. Use it when authoring packs programmatically —
evaluation fails closed (rule skipped) on anything this flags.

```ts
import { validatePredicate } from 'usa';

const warnings: string[] = [];
validatePredicate({ fact: 'has:ci', op: 'bogus' }, 'my-pack MY-001', warnings);
// warnings: ['my-pack MY-001: unknown predicate op "bogus" — rule will never apply']
```

## `loadConfig(target, explicitPath?): UsaConfig`

Reads `.usa.yaml`. A missing file is not an error — it returns an empty config.
A malformed one throws, loudly, because silent config loss produces an audit
that quietly disagrees with the user's intent.

## Types

`Severity` · `Status` · `RuleClass` · `Depth` · `Maturity` · `Location` ·
`Finding` · `Predicate` · `FactOp` · `Check` · `Rule` · `RulePack` ·
`AuditReport` · `UsaConfig` · `SectionDef` · `MaturityProfile` ·
`ScoredRule` · `EvalContext`
