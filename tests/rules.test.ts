import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { parse } from 'yaml';
import fs from 'node:fs';
import { makeProject, evaluateAt } from './engine-helpers.js';
import type { Check } from '../src/types.js';

const RULES = path.resolve(process.cwd(), 'rules');

/** Loads one rule straight out of its pack, so the test exercises the YAML. */
function ruleOf(packFile: string, id: string) {
  const doc = parse(fs.readFileSync(path.join(RULES, packFile), 'utf8')) as {
    rules: { id: string; check: Check }[];
  };
  const rule = doc.rules.find((r) => r.id === id);
  if (!rule) throw new Error(`${id} not found in ${packFile}`);
  return rule;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function fixture(files: Record<string, string>): string {
  const { root, cleanup } = makeProject(files);
  cleanups.push(cleanup);
  return root;
}

describe('core/security rules', () => {
  const sec002 = ruleOf('core/security.yaml', 'SEC-002');
  const sec003 = ruleOf('core/security.yaml', 'SEC-003');
  const sec005 = ruleOf('core/security.yaml', 'SEC-005');
  const sec013 = ruleOf('core/security.yaml', 'SEC-013');

  // SEC-003 once used `https?://` and failed every compliant https:// URL,
  // including this repo's own package.json. The `s?` must never come back.
  it('SEC-003 passes on https URLs, fails on plaintext http', () => {
    const ok = fixture({ 'src/api.ts': 'export const BASE = "https://api.example.com/v1";\n' });
    expect(evaluateAt(ok, sec003.check).status).toBe('PASS');
    const bad = fixture({ 'src/api.ts': 'export const BASE = "http://api.example.com/v1";\n' });
    const r = evaluateAt(bad, sec003.check);
    expect(r.status).toBe('FAIL');
    expect(r.locations[0]!.line).toBe(1);
  });

  it('SEC-003 still exempts localhost', () => {
    const root = fixture({ 'src/api.ts': 'export const BASE = "http://localhost:3000/v1";\n' });
    expect(evaluateAt(root, sec003.check).status).toBe('PASS');
  });

  // The `%s` alternative once matched the safe DB-API parameter style.
  it('SEC-005 passes parameterised queries, fails interpolation', () => {
    const ok = fixture({
      'src/db.py': 'cursor.execute("SELECT * FROM t WHERE id = %s", (user_id,))\n',
    });
    expect(evaluateAt(ok, sec005.check).status).toBe('PASS');
    const bad = fixture({ 'src/db.py': 'q = "SELECT * FROM t WHERE id = %s" % user_id\n' });
    expect(evaluateAt(bad, sec005.check).status).toBe('WRONG');
    const concat = fixture({ 'src/db.py': 'q = "SELECT * FROM t" + user_input\n' });
    expect(evaluateAt(concat, sec005.check).status).toBe('WRONG');
  });

  // The trailing `['"']?` was optional, so every correct two-argument
  // jwt.verify call failed. The quote is now mandatory (inline secrets only).
  it('SEC-013 passes correct verify calls, fails bypasses', () => {
    const mk = (line: string) => fixture({ 'src/auth.js': `${line}\n` });
    expect(
      evaluateAt(mk('jwt.verify(token, SECRET, { algorithms: ["RS256"] });'), sec013.check).status,
    ).toBe('PASS');
    expect(evaluateAt(mk('jwt.verify(token, SECRET);'), sec013.check).status).toBe('PASS');
    expect(
      evaluateAt(mk('const t = jwt.verify(token, "hardcoded-secret");'), sec013.check).status,
    ).toBe('FAIL');
    expect(
      evaluateAt(mk('jwt.verify(token, secret, { algorithms: ["none"] });'), sec013.check).status,
    ).toBe('FAIL');
  });

  // A log line that merely talks about secrets is not a log line that leaks
  // one. This rule used to fire on its own documentation.
  it('SEC-002 does not flag log messages that mention secrets', () => {
    const root = fixture({
      'src/scan.js': [
        "console.log('No unexpected secrets found.');",
        'console.error(`${n} unexpected secret(s) found:`);',
        'logger.info("scanning for passwords in the tree");',
        'console.log("loaded", config);',
      ].join('\n'),
    });
    expect(evaluateAt(root, sec002.check).status).toBe('PASS');
  });

  it('SEC-002 flags a secret actually being logged', () => {
    const root = fixture({
      'src/auth.js': 'console.log("password:", req.body.password);\n',
    });
    expect(evaluateAt(root, sec002.check).status).toBe('WRONG');
  });

  it('SEC-002 flags a token interpolated into a log line', () => {
    const root = fixture({ 'src/svc.ts': 'logger.info(`token: ${t}`);\n' });
    expect(evaluateAt(root, sec002.check).status).toBe('WRONG');
  });

  it('SEC-002 works for Python too (the print( alternation consumed the paren)', () => {
    const root = fixture({ 'app.py': 'print("api_key=" + key)\n' });
    expect(evaluateAt(root, sec002.check).status).toBe('WRONG');
  });

  // `regex.exec(body)` is not dynamic code execution, and a bare `body` also
  // matches document.body / res.body.
  it('SEC-006 does not flag regex.exec or DOM bodies', () => {
    const sec006 = ruleOf('core/security.yaml', 'SEC-006');
    const root = fixture({
      'src/parse.ts': [
        'const m = /```ya?ml\\n/.exec(body);',
        'document.body.querySelector("a");',
        'const r = evaluateRule(rule, ctx);',
        'execFileSync("sh", ["-c", cmd], {});',
      ].join('\n'),
    });
    expect(evaluateAt(root, sec006.check).status).toBe('PASS');
  });

  it('SEC-006 still flags eval and exec with user input', () => {
    const sec006 = ruleOf('core/security.yaml', 'SEC-006');
    const root = fixture({
      'src/run.js': 'eval(userExpr);\nexec("ls " + req.query.path);\n',
    });
    expect(evaluateAt(root, sec006.check).status).toBe('WRONG');
  });

  it('SEC-002 catches a hardcoded credential but not an env lookup', () => {
    const sec001 = ruleOf('core/security.yaml', 'SEC-001');
    const bad = fixture({ 'src/config.ts': 'const api_key = "abcdefghijklmnop";\n' });
    expect(evaluateAt(bad, sec001.check).status).toBe('FAIL');

    const good = fixture({ 'src/config.ts': 'const api_key = process.env.API_KEY;\n' });
    expect(evaluateAt(good, sec001.check).status).toBe('PASS');
  });
});

describe('stacks/cli rules', () => {
  // CLI-002 only recognised `process.exit(n)`; a CLI that returns a code from
  // its entry point (`process.exitCode = main(argv)`) scored as if it had none.
  it('CLI-002 recognises the process.exitCode entry-point style', () => {
    const cli002 = ruleOf('stacks/cli.yaml', 'CLI-002');
    const root = fixture({ 'src/cli.ts': 'process.exitCode = main(process.argv.slice(2));\n' });
    expect(evaluateAt(root, cli002.check).status).toBe('PASS');
  });

  it('CLI-002 still recognises inline process.exit', () => {
    const cli002 = ruleOf('stacks/cli.yaml', 'CLI-002');
    const root = fixture({ 'src/cli.ts': 'process.exit(1);\n' });
    expect(evaluateAt(root, cli002.check).status).toBe('PASS');
  });
});
