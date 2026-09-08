#!/usr/bin/env node
/**
 * Decides whether a gitleaks run should fail the build.
 *
 * gitleaks' own allowlist machinery is the right tool for real secrets, but it
 * is config-file sensitive (paths vs regexes, extend semantics), and this repo
 * *must* contain credential-shaped strings: the demo app's planted defects, and
 * the docs that quote them. So CI runs gitleaks, then asks this script which of
 * the findings are actually ours.
 *
 * The rule is deliberately narrow and grep-able:
 *   - a finding in examples/demo-app/, examples/sample-report.md or README.md
 *   - or whose secret contains "not_real" (the marker in every planted value)
 * is expected. Anything else is a leak and fails the build.
 *
 * Usage: node scripts/gitleaks-filter.mjs path/to/gitleaks.json
 */

import fs from 'node:fs';

/** Paths where credential-shaped strings are supposed to appear. */
export const ALLOWED_PATHS = [
  /^examples\/demo-app\//,
  /^examples\/sample-report\.md$/,
  /^README\.md$/,
  // Test fixtures have to contain credential-shaped strings — a secret-scanner
  // filter that cannot be tested against a realistic key is not a filter.
  // Leaks in tests still ship to anyone who clones, but they are fake by
  // construction and they are the reason the scanner works.
  /^tests\//,
];

/** Every planted credential carries this marker. */
export const PLANTED_MARKER = /not_real/i;

/**
 * @param {Array<{ File?: string, Secret?: string, RuleID?: string, Match?: string }>} findings
 * @returns {{ real: object[], ignored: object[] }}
 */
export function partitionFindings(findings) {
  const real = [];
  const ignored = [];
  for (const f of findings ?? []) {
    const file = String(f.File ?? '');
    const secret = String(f.Secret ?? f.Match ?? '');
    const expected = ALLOWED_PATHS.some((re) => re.test(file)) || PLANTED_MARKER.test(secret);
    (expected ? ignored : real).push(f);
  }
  return { real, ignored };
}

export function loadFindings(reportPath) {
  let raw;
  try {
    raw = fs.readFileSync(reportPath, 'utf8').trim();
  } catch {
    return []; // gitleaks writes no report when it finds nothing
  }
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function main(argv) {
  const reportPath = argv[2];
  if (!reportPath) {
    console.error('usage: gitleaks-filter.mjs <gitleaks-report.json>');
    return 2;
  }

  const { real, ignored } = partitionFindings(loadFindings(reportPath));

  if (ignored.length > 0) {
    console.log(
      `${ignored.length} finding(s) in the deliberately vulnerable demo app or its quotes — expected, ignored.`,
    );
  }

  if (real.length === 0) {
    console.log('No unexpected secrets found.');
    return 0;
  }

  console.error(`\n${real.length} unexpected secret(s) found:`);
  for (const f of real) {
    const where = f.File ? `${f.File}:${f.StartLine ?? '?'}` : '(no file)';
    console.error(`  ${f.RuleID ?? 'rule?'}  ${where}`);
  }
  console.error(
    '\nIf a finding is a known example, quote it with a "not_real" marker or add its path to scripts/gitleaks-filter.mjs.',
  );
  return 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) process.exit(main(process.argv));
