# Releasing USA — operations runbook

The release pipeline is fully automated. Normal operation requires nothing
beyond merging PRs. This file exists so future-you (or a successor) can
reconstruct _why_ every piece is shaped the way it is, and what to do when
something breaks. It is the durable memory of the sessions that built it.

## The chain (normal operation — nothing to do)

```
conventional commit on master
        │  feat → minor · fix → patch · BREAKING CHANGE → major
        │  (docs/chore/test ride along without bumping)
        ▼
release-please opens/updates ONE Release PR
  (version bump + CHANGELOG entries as a reviewable diff)
        │  human merges it  ← the only manual step, and it is code review
        ▼
tag vX.Y.Z cut automatically
        ▼
release.yml publishes: OIDC → npmjs (+ provenance + SBOM artifact),
then mirrors the same tarball to GitHub Packages (repo Packages tab)
```

What you do: write conventional titles, review PRs, merge the Release PR.
Everything else — bump arithmetic, CHANGELOG entries, tags, publishing,
provenance, SBOM — happens on its own.

## One-time setups (done — do not redo unless broken)

| #   | Setup                                                         | Where / state                                              |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Package exists on npmjs as `@xenos1996/usa` (scoped: the      | Created by a one-time manual publish of 2.0.1 (see below). |
|     | bare name `usa` is blocked by the typosquat filter)           | Never republish a version.                                 |
| 2   | OIDC trusted publisher (org `Er-Sajan-PLG`, repo              | Package page → Settings → Trusted Publisher.               |
|     | `universal-software-auditor`, workflow `release.yml`, no env) | Exact basename — full paths do not match.                  |
| 3   | Trusted publisher may **publish directly**                    | Same page (checkbox). Without it, PUTs 404.                |
| 4   | Publishing access: strictest (2FA required, no bypass tokens) | Same page. OIDC works with either option.                  |
| 5   | `RELEASE_PLEASE_TOKEN`: fine-grained PAT, this repo only —    | Repo Settings → Secrets → Actions. **Check its expiry**    |
|     | Contents + PRs + Issues read+write                            | (Settings → Developer settings → Tokens): when it lapses,  |
|     |                                                               | Release PRs silently stop appearing. Rotate yearly.        |

The bootstrap token used for the first manual publish is deleted. No
static credential that can publish exists anymore — only OIDC (CI) and
2FA (humans).

### Bootstrapping a brand-new package name (the chicken-and-egg)

OIDC trusted publishing **cannot create a package that does not exist
yet** — the very first PUT 404s (`404 Not Found - PUT …/@scope%2fname`),
while the tarball itself builds and signs provenance fine. npm only
accepts the OIDC flow once the package exists _and_ its Trusted
Publisher is configured. So the first publish of a new name is manual:

```bash
# from a clean checkout of the tag you intend to ship
git checkout v2.0.1 && npm ci && npm run build
npm login                              # owner account, 2FA
npm publish --access public            # creates the package (manual, once)
npm view @xenos1996/usa version        # → 2.0.1
```

Then, while logged in on npmjs.com: **Package → Settings → Trusted
Publisher → GitHub Actions**, org `Er-Sajan-PLG`, repo
`universal-software-auditor`, workflow `release.yml`, and tick _allow
publish directly_. From that point on, tags publish themselves; re-run
the failed Release run to confirm. This was done for the `usat → usa`
rename: `usat` got the same treatment at 1.0.0.

## Recurring (calendar, not automation)

- **PAT expiry** — the one thing that silently breaks releases. Check the
  date when the reminder fires; generate a replacement with identical
  scope, swap the secret, delete the old token.
- **First-run review of each Release PR** — read the CHANGELOG diff;
  release-please derives it from titles, so a sloppy title ships a sloppy
  note. Fix by amending the title before merge (it recalculates).
- **Scorecard / Security tab** — glance monthly; the workflow already runs.

## Troubleshooting (every failure hit so far, in order)

| Symptom                                                | Cause                                                                                 | Fix                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `403 … too similar to existing packages` on publish    | npm typosquat filter on the bare name                                                 | Scoped name (`@xenos1996/usa`). Decided, shipped.                                                          |
| `bin[usa]` "invalid and removed" warning on publish    | npm v12 rejects `./`-prefixed bin targets; tarball ships with **no executable**       | `bin` value is `dist/cli.js` (no prefix). Never re-add `./`.                                               |
| `npm sbom -o` → `EUNKNOWNCONFIG`                       | No `-o` flag exists; SBOM goes to stdout                                              | Redirect: `npm sbom … > sbom.cdx.json`, after a clean `npm ci` (partial trees fail with `ESBOMPROBLEMS`).  |
| PUT 404 with provenance signed fine                    | Runner npm too old for the registry OIDC exchange (needs npm ≥ 11.5.1 / Node ≥ 22.14) | `release.yml` pins Node 24 + `npm@^11.15.0` floor. Do not downgrade.                                       |
| PUT 404 on a **brand-new** package, provenance fine    | Trusted publishing cannot create a package that does not exist yet                    | One-time manual `npm publish` first, then configure Trusted Publisher. See bootstrap section above.        |
| Tag cut, GitHub Release created, **nothing published** | Tags pushed by `GITHUB_TOKEN` never fire downstream workflows (loop prevention)       | release-please uses the PAT, never the default token.                                                      |
| Release PR lint red on `CHANGELOG.md`                  | release-please writes double blank lines; prettier wants single                       | `CHANGELOG.md` is prettier-ignored (machine-written).                                                      |
| `Unable to resolve action ossf/scorecard-action@v2`    | Upstream publishes no `v2` major tag                                                  | Pinned exact `v2.4.4`. Check for newer semver occasionally.                                                |
| Installed bin exits 0 and prints **nothing**           | Entry guard compared `import.meta.url` to `file://${argv[1]}`; under npm's bin        | Resolve `argv[1]` with `fs.realpathSync` before comparing. Regression-tested in `tests/cli.test.ts`.       |
|                                                        | symlink those never match, so `main()` never ran                                      |                                                                                                            |
| `npx @xenos1996/usa …` → `usa: command not found`      | Run from **inside the USA repo**: npx sees cwd's `package.json` is the same package,  | Run `npx` from any other directory, or `npm install -g @xenos1996/usa`, or use `npm run usa -- …` in-repo. |
|                                                        | skips the registry install, and there is no local `.bin/usa`                          |                                                                                                            |
| `usat --help` audited the repo                         | Arg parser files `--flags`, never positionals; the switch cases were dead code        | Fixed in `cli.ts` with regression tests. Do not reintroduce flag handling without a test.                  |
| `SEC-003` failing on `https://` URLs (pre-1.0 history) | Pattern used `https?://` for a plaintext-HTTP rule                                    | Fixed to `http://`; rule carries a `NOTE:` comment. See `tests/rules.test.ts`.                             |

## Manual fallback

If automation ever wedges: Actions → **Release** → Run workflow (on
`master`) publishes whatever `package.json` holds. Safe to re-run — a
duplicate version fails closed at the registry with nothing mutated.
Never push `v*` tags by hand; the tag is the release act and belongs to
release-please (bootstrap tag `v1.0.0` excepted).

## Decisions with permanent consequences

- **No moving `v1` tag.** It would retrigger `release.yml` (`v*` matches)
  and fail on the duplicate version. Docs pin exact versions instead.
- **No semantic-release.** Rule-pack content keeps its human gate; fully
  automatic publishing is the wrong risk profile here (see ROADMAP.md).
- **npmjs is the source of truth; GitHub Packages is a mirror.** Old
  versions were never backfilled to GPR — two sources of truth for dead
  versions is worse than a thin Packages tab for one cycle.
