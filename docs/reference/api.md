# API reference

Everything the CLI does is available as a library. Types are exported from the
package root.

```ts
import { runAudit, detect, Project, renderMarkdown, diffReports } from 'usat';
```

## `runAudit(options): AuditOutcome`

Runs a full audit. Only `target` is required — every other option falls back to
the same default the CLI uses.

```ts
import { runAudit } from 'usat';

const { report, profile, warnings } = await runAudit({
  target: '/path/to/project',
  depth: 'standard', // 'quick' | 'standard' | 'deep'
  profile: 'auto', // 'auto' | 'prototype' | 'mvp' | 'beta' | 'production' | 'legacy'
  config: { version: 1, ignore: ['vendor/**'] }, // or omit to read .usat.yaml
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
| `config`                        | `UsatConfig`         | parsed from `<target>/.usat.yaml`     |
| `allowCommands`                 | `boolean`            | `false`                               |
| `usatVersion`                   | `string`             | version from `package.json`           |
| `includePacks` / `excludePacks` | `string[]`           | `undefined`                           |

Returns `{ report: AuditReport, profile: MaturityProfile, warnings: string[] }`.

## `detect(project, detectors, git, extraFacts?): DetectionResult`

Turns a tree into a fact set.

```ts
import { Project, detect, loadDetectorFile } from 'usat';

const project = new Project('/path/to/project', ['vendor/**']);
const detection = detect(
  project,
  loadDetectorFile('node_modules/usat/rules/detectors.yaml'),
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
import { loadRulePacks, applyRuleOverrides } from 'usat';

const { packs, warnings } = loadRulePacks('rules');
applyRuleOverrides(packs, { 'SEC-042': { severity: 'LOW' } });
```

## `evaluateRule(rule, ctx): Finding`

Evaluates a single rule. Useful for testing a pack without running an audit.

```ts
import { evaluateRule, ruleApplies, packApplies } from 'usat';

if (ruleApplies(rule, facts, depth)) {
  const finding = evaluateRule(rule, ctx);
  finding.status; // 'PASS' | 'FAIL' | 'MISSING' | 'UNKNOWN' | …
}
```

## `score(packs, findings, sections): ScoreResult`

```ts
score.overall; // 88.7 — null only if nothing at all resolved
score.coverage; // 0.708 — share of applicable rules the engine could verify
score.sections; // [{ id, title, score: number | null, confidence, … }]
```

A section whose rules all resolved to `UNKNOWN` scores **`null`**, not 10. It is
excluded from the numerator _and_ the denominator, and rendered as
`— not verified`.

## `renderMarkdown(report): string`

Deterministic Markdown, including the machine-readable trailer.

```ts
import { renderMarkdown, parseTrailer, trailer } from 'usat';

const md = renderMarkdown(report);
const summary = trailer(report); // the plain object the trailer encodes
const parsed = parseTrailer(md); // round-trip: read a trailer back out
```

## `diffReports(a, b): Diff`

```ts
const d = diffReports(oldReport, newReport);
d.overall; // { from: 80.8, to: 88.7, delta: 7.9 }
d.regressions; // findings that got worse
d.improvements; // findings that got better
d.newFindings;
d.resolvedFindings;
```

## `loadConfig(target, explicitPath?): UsatConfig`

Reads `.usat.yaml`. A missing file is not an error — it returns an empty config.
A malformed one throws, loudly, because silent config loss produces an audit
that quietly disagrees with the user's intent.

## Types

`Severity` · `Status` · `RuleClass` · `Depth` · `Maturity` · `Location` ·
`Finding` · `Predicate` · `FactOp` · `Check` · `Rule` · `RulePack` ·
`AuditReport` · `UsatConfig` · `SectionDef` · `MaturityProfile` ·
`ScoredRule` · `EvalContext`
