# Demo app — deliberately vulnerable. Do not fix.

This is a tiny Express service whose only job is to be bad. It exists so that
[`examples/sample-report.md`](../sample-report.md) can show what a real USA
report looks like when a project has problems, instead of the self-congratulatory
100/100 you get from auditing a well-maintained repo.

**Please do not "clean it up".** Every defect here is planted on purpose:

| File | Planted defect | Rule it trips |
|---|---|---|
| `src/config.js` | Hardcoded `api_key` and `dbPassword` | `SEC-001` (CRITICAL) |
| `src/db.js` | SQL built by string concatenation | `SEC-005` (CRITICAL) |
| `src/express.js` | `eval()` on client input; a 40-line function | `SEC-002`, `CQ-*` |
| `src/legacy.js` | `new Buffer()` (removed in Node 22), `url.parse` | `CQ-*` deprecated |
| `.env` | Secret file committed | `REPO-002` (CRITICAL) |
| `package.json` | `"express": "*"` — unpinned dependency | `DEP-001` |
| — | No README, LICENSE, tests, CI, or lockfile | `REPO-004/005`, `TEST-*`, `CICD-*` |

The credential values are fake by construction — the string `not_real` is part
of every one of them — but they are shaped like real ones, because a scanner
that cannot see a fake key cannot see a real one. `.gitleaks.toml` at the repo
root allowlists this directory so CI's secret scan does not fail on it.

## Reproduce the sample report

```bash
# from the repository root
npm run build
node dist/cli.js audit examples/demo-app --out examples/sample-report.md
```

Expected: `usa 45.7/100 (prototype)` — 2 CRITICAL, 6 MEDIUM, 8 LOW, 10 FUTURE,
and 20 checks routed to the human judgement queue.

## Use it as a test target

It is also a convenient fixture when authoring rule packs. A new rule should
fire on this project; if it does not, the rule is probably not looking where you
think it is.
