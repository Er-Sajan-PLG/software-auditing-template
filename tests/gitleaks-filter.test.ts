import { describe, it, expect } from 'vitest';
import {
  partitionFindings,
  loadFindings,
  ALLOWED_PATHS,
  PLANTED_MARKER,
} from '../scripts/gitleaks-filter.mjs';

const leak = (File: string, Secret: string, extra: Record<string, unknown> = {}) => ({
  RuleID: 'generic-api-key',
  File,
  Secret,
  StartLine: 3,
  ...extra,
});

describe('gitleaks report filter', () => {
  it('ignores findings from the deliberately vulnerable demo app', () => {
    const { real, ignored } = partitionFindings([
      leak('examples/demo-app/src/config.js', 'example_key_not_real_12345'),
      leak('examples/demo-app/.env', 'example_stripe_key_not_real'),
    ]);
    expect(real).toHaveLength(0);
    expect(ignored).toHaveLength(2);
  });

  it('ignores the docs that quote the demo findings', () => {
    const { real } = partitionFindings([
      leak('examples/sample-report.md', 'example_key_not_real_12345'),
      leak('README.md', 'example_key_not_real_12345'),
    ]);
    expect(real).toHaveLength(0);
  });

  it('ignores anything carrying the planted marker, wherever it is quoted', () => {
    const { real } = partitionFindings([leak('docs/adr/0009-something.md', 'sk_not_real_xxx')]);
    expect(real).toHaveLength(0);
  });

  it('fails on a real secret in source', () => {
    const { real, ignored } = partitionFindings([leak('src/config.ts', 'AKIAIOSFODNN7EXAMPLE')]);
    expect(real).toHaveLength(1);
    expect(ignored).toHaveLength(0);
  });

  it('fails on a credential-shaped string in a doc that is not an approved quote', () => {
    const { real } = partitionFindings([leak('docs/getting-started.md', 'AKIAIOSFODNN7EXAMPLE')]);
    expect(real).toHaveLength(1);
  });

  it('does not treat a sibling directory as allowlisted', () => {
    const { real } = partitionFindings([leak('examples/other-app/key.js', 'example_key_not_real')]);
    expect(real).toHaveLength(0); // ignored via the marker, not the path
    const withoutMarker = partitionFindings([
      leak('examples/other-app/key.js', 'AKIAIOSFODNN7EXAMPLE'),
    ]);
    expect(withoutMarker.real).toHaveLength(1);
  });

  it('ignores credential-shaped fixtures in tests (a filter must be testable)', () => {
    const { real } = partitionFindings([
      leak('tests/gitleaks-filter.test.ts', 'AKIAIOSFODNN7EXAMPLE'),
      leak('tests/e2e.test.ts', 'apiKey = "abcdefgh12345678"'),
    ]);
    expect(real).toHaveLength(0);
  });

  it('handles an empty or absent report', () => {
    expect(partitionFindings([]).real).toHaveLength(0);
    expect(loadFindings('/tmp/definitely-not-here.json')).toEqual([]);
  });

  it('uses absolute-looking allowlist patterns, so a nested path cannot sneak past', () => {
    for (const re of ALLOWED_PATHS) {
      expect(re.source.startsWith('^')).toBe(true);
    }
    expect(PLANTED_MARKER.test('example_db_password_99')).toBe(false);
  });
});
