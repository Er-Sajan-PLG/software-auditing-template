/**
 * External-link checker (ADR-0020). **Network use is confined to this script**,
 * which runs only on a schedule — never in the audit path. USA's offline
 * invariant applies to `usa audit`, not to doc maintenance.
 *
 * Extracts every http(s) link from the docs, de-duplicates, and does a HEAD
 * (falling back to GET) with a browser-like User-Agent. Some hosts block bots
 * or rate-limit aggressively, so a curated ALLOWLIST of known-good URLs is
 * skipped, and transient failures (429/5xx) are warnings, not failures.
 *
 * Writes a markdown report of dead links to /tmp/dead-links.md and exits 1 if
 * any hard-dead link (404/410/DNS) remains.
 *
 * Usage: `node scripts/check-links.mjs`
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const REPORT = '/tmp/dead-links.md';
const TIMEOUT_MS = 20_000;
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0 Safari/537.36 USA-doc-link-check';

/**
 * Hosts that block automated requests (Cloudflare, bot filters) or are known
 * to rate-limit. We cannot distinguish "link is fine" from "bot was blocked",
 * so we do not fail on them. Add a host here only when it is confirmed
 * reachable by a human.
 */
const ALLOWHOSTS = new Set([
  'www.npmjs.com',
  'npmjs.com',
  'github.com',
  'raw.githubusercontent.com',
  'shields.io',
  'img.shields.io',
  'choosealicense.com',
  'owasp.org',
  'csrc.nist.gov',
  'slsa.dev',
  'openssf.org',
]);

// A few individual URLs that are confirmed live but bot-sensitive.
const ALLOWURLS = new Set([]);

function docFiles() {
  // Include untracked docs too, so a brand-new file is checked before its
  // first commit rather than only after.
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '*.md'],
    {
      encoding: 'utf8',
      cwd: ROOT,
    },
  )
    .trim()
    .split('\n');
  return listed.filter(
    (f) =>
      f &&
      !f.startsWith('experiments/') &&
      !f.startsWith('examples/demo-app/') &&
      !f.startsWith('node_modules/'),
  );
}

function extractLinks() {
  const seen = new Map(); // url -> [file]
  for (const rel of docFiles()) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
      const url = m[1].replace(/[.,)]+$/, '');
      const list = seen.get(url) ?? [];
      if (!list.includes(rel)) list.push(rel);
      seen.set(url, list);
    }
  }
  return seen;
}

async function probe(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': UA },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'user-agent': UA },
      });
    }
    return res.status;
  } catch (err) {
    return `ERR:${err.name === 'AbortError' ? 'timeout' : err.message}`;
  } finally {
    clearTimeout(timer);
  }
}

const links = extractLinks();
const dead = [];
const warn = [];

for (const [url, files] of links) {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    continue;
  }
  if (ALLOWHOSTS.has(host) || ALLOWURLS.has(url)) continue;
  const status = await probe(url);
  const where = files.join(', ');
  if (status === 404 || status === 410 || String(status).startsWith('ERR:')) {
    dead.push({ url, status, where });
    console.error(`DEAD  ${status}  ${url}  (${where})`);
  } else if (typeof status === 'number' && status >= 400) {
    warn.push({ url, status, where });
    console.warn(`WARN  ${status}  ${url}  (${where})`);
  } else {
    console.log(`ok    ${status}  ${url}`);
  }
}

if (dead.length > 0) {
  const md = [
    '| Status | Link | Referenced in |',
    '| --- | --- | --- |',
    ...dead.map((d) => `| \`${d.status}\` | ${d.url} | ${d.where} |`),
    '',
    warn.length ? `Transient/unclear (not failing the job): ${warn.length}` : '',
  ].join('\n');
  fs.writeFileSync(REPORT, md);
  console.error(`\n${dead.length} dead link(s) — see ${REPORT}`);
  process.exit(1);
}
if (fs.existsSync(REPORT)) fs.rmSync(REPORT);
console.log(`\nlink check: OK (${links.size} unique links, ${warn.length} warning(s))`);
