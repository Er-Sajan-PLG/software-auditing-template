# Detectors — the fact catalogue

Detection is entirely declarative: [`rules/detectors.yaml`](../rules/detectors.yaml)
maps file patterns to **facts**, and rule packs select themselves on those facts.
Add a signal and every pack that cares starts applying — no TypeScript required.

```bash
usa detect .            # what USA thinks your project is
```

## How a detector works

```yaml
- fact: 'fw:next'
  category: framework
  title: 'Next.js'
  match:
    any_of:
      - file_exists: ['next.config.js', 'next.config.mjs', 'next.config.ts']
      - manifest: { file: 'package.json', key: 'dependencies.next' }
```

| Primitive                          | Meaning                                          |
| ---------------------------------- | ------------------------------------------------ |
| `any_file: [glob]`                 | at least one file matches                        |
| `file_exists: [glob]`              | path present                                     |
| `dir_exists: [path]`               | directory present                                |
| `content: {include, pattern}`      | regex found in matching files                    |
| `manifest: {file, key, contains?}` | dotted key resolves (JSON, or TOML/YAML section) |
| `metric: {name, min\|max}`         | numeric fact comparison                          |
| `any_of` / `all_of`                | boolean composition                              |
| `implies: [fact]`                  | derived — all listed facts must hold             |

Several detectors may emit the same fact; the fact is set if **any** of them fires
(OR semantics). `implies` chains resolve to a fixed point (bounded by
detector count + 1 passes, early exit), so chains of any length resolve
regardless of declaration order.

Request-serving frameworks imply their platform: `fw:express` …
`fw:sveltekit` plus `fw:vapor` (25 frameworks) each derive
`platform:server`, so a bare framework app with no Dockerfile still gets
the platform-gated rules (SEC-003 et al.). Task queues, static builders,
and desktop/mobile packs deliberately imply nothing — see the comment
block in `rules/detectors.yaml`. SwiftPM executable targets additionally
derive the `swift:executable` type fact, which scopes app-only rules like
SW-003 (libraries must not commit `Package.resolved`).

Manifest queries are section-scoped where sections exist: a dotted key
(`tool.poetry.dependencies`) matches a full header segment
(case-insensitive; `[dev-dependencies]` is not `[dependencies]`), the leaf
matches on word boundaries, and `contains` is checked against the matched
block — never the whole file. Flat files with no headers keep whole-text
search. See ADR-0010.

## Prose, tests, and examples are excluded from `content` scans

A repo whose README mentions Postgres does not have a Postgres dependency. Every
`content:` scan automatically skips:

```
**/*.md  **/*.mdx  **/*.rst  README*  docs/**  doc/**  examples/**
example/**  templates/**  fixtures/**  __mocks__/**  test/**  tests/**
__tests__/**  spec/**  *.test.*  *.spec.*  *.stories.*  test_*
*_test.*  LICENSE*  CHANGELOG*
```

Deliberately **not** excluded: `**/*.txt` — `requirements.txt` is a
manifest, not prose. This list mirrors `CONTENT_EXCLUDES` in
`src/detect/index.ts`; if they drift, the code wins and this doc is a bug —
file it.

Everything else in the tree is fair game. If a project's own config comments are
still producing noise, add the file to `ignore:` in `.usa.yaml` — that is what
[`../.usa.yaml`](../.usa.yaml) does with `rules/`.

## Fact namespaces

### `lang:*` — language

`typescript` `javascript` `python` `go` `rust` `java` `kotlin` `swift` `ruby` `php`
`csharp` `cpp` `scala` `dart` `elixir` `lua` `zig` `solidity` `shell` `haskell`

### `pm:*` — package manager

`node` `npm` `pnpm` `yarn` `bun` `pip` `poetry` `uv` `pipenv` `cargo` `go-mod`
`maven` `gradle` `composer` `nuget` `swiftpm` `pub` `mix` `foundry` `hardhat`

### `fw:*` — framework

Web: `react` `vue` `angular` `svelte` `solid` `next` `nuxt` `remix` `sveltekit`
`astro` `vite` `tailwind`
Node backend: `express` `fastify` `nest` `hono` `koa`
Python: `django` `flask` `fastapi` `celery` `airflow` `streamlit`
Go: `gin` `echo` `fiber` `chi` · Rust: `axum` `actix` `rocket`
JVM: `spring` `quarkus` · Ruby: `rails` · PHP: `laravel` `symfony` · .NET: `dotnet`
Swift: `vapor`
Mobile/desktop: `react-native` `expo` `flutter` `electron` `tauri`

### `project:*` — archetype

`library` `cli` `monorepo` `api` `ml` `blockchain` `iac` `data-pipeline` `game` `docs`

### `platform:*` — runtime

`web` `server` `desktop` `mobile` `ios` `android` `evm` `embedded`

### `db:*` — datastore

`postgres` `mysql` `sqlite` `mongodb` `redis` `clickhouse` `elasticsearch` `vector`
`dynamodb` · plus `has:database`

### `orm:*`

`prisma` `drizzle` `typeorm` `sequelize` `mongoose` `sqlalchemy` `gorm` `sqlx`
`diesel` `hibernate` `activerecord`

### `auth:*`

`jwt` `oauth` `session` `apikey` `passport` `nextauth` `supabase` `firebase` `auth0`

### `api:*` · `obs:*`

`api:graphql` `api:grpc` `api:trpc` `api:websocket`
`obs:sentry` `obs:otel` `obs:prometheus` `obs:datadog` `obs:grafana` · `has:monitoring`

### `test:*`

`vitest` `jest` `mocha` `pytest` `gotest` `cargotest` `junit` `rspec` `phpunit`
`playwright` `cypress` · plus `has:tests` `has:e2e` `has:perf-tests`

### `ci:*` · `infra:*`

`ci:github-actions` `ci:gitlab` `ci:jenkins` `ci:circleci` `ci:buildkite` `ci:azure`
· `has:ci`

### `ai:*`

`ai:llm-sdk` `ai:prompts` `ai:agents` `ai:mcp` `ai:rag` `ai:evals`

### `doc:*`

`readme` `license` `contributing` `code-of-conduct` `security-policy` `changelog`
`architecture` `adr` `api-reference` `runbook` `onboarding` `env-example`
`gitignore` `codeowners` `pr-template` `issue-templates` `agents`

### `has:*` — cross-cutting capabilities

`has:lint` `has:format` `has:typecheck` `has:precommit` `has:dependabot`
`has:renovate` `has:changesets` `has:release-automation` `has:editorconfig`
`has:containers` `has:kubernetes` `has:terraform` `has:serverless` `has:sbom`
`has:secrets-scan` `has:sast` `has:dep-scan` `has:codecov` `has:monitoring`
`has:crypto` `has:file-upload` `has:payments` `has:pii` `has:csp` `has:rate-limit`
`has:database` `has:tests` `has:e2e` `has:perf-tests` `has:ci`

### `practice:*`

`conventional-commits` `codeowners` `signed-commits` `branch-protection-doc`
`pinned-versions` `i18n` `feature-flags` `queue` `cache`
`monorepo-tool-turborepo` `monorepo-tool-nx`

### `maturity:*` and metrics

`maturity:prototype` `maturity:mvp` `maturity:beta` `maturity:production` `maturity:legacy`

Metrics, referenced as `metric:<name>` in predicates:

| Metric                | Source                      |
| --------------------- | --------------------------- |
| `commits`             | `git rev-list --count HEAD` |
| `contributors`        | `git shortlog -sn --all`    |
| `tags`                | `git tag --list`            |
| `branches`            | `git branch --list`         |
| `files`               | indexed file count          |
| `daysSinceLastCommit` | `git log -1 --format=%ct`   |

## Adding a detector

1. Add an entry to `rules/detectors.yaml` with a clear `fact:` name.
2. Use `manifest:` where possible — it is far more reliable than a content regex
   (`dependencies.hono` beats grepping for `hono` in source).
3. Verify against a project that uses the technology and one that does not:

```bash
usa detect ~/code/uses-hono
usa detect ~/code/does-not
```

4. If detection is right but a project still eludes it, users can assert facts in
   `.usa.yaml` — but if you find yourself doing that often, the detector is wrong.
