import { describe, it, expect } from 'vitest';
import { globToRegExp, matchesGlob, matchesAny, isLiteralPath } from '../src/util/glob.js';

describe('glob', () => {
  it('matches a literal path', () => {
    expect(matchesGlob('package.json', 'package.json')).toBe(true);
    expect(matchesGlob('src/package.json', 'package.json')).toBe(false);
  });

  it('single star does not cross directories', () => {
    expect(matchesGlob('src/a.ts', 'src/*.ts')).toBe(true);
    expect(matchesGlob('src/deep/a.ts', 'src/*.ts')).toBe(false);
  });

  it('double star crosses directories', () => {
    expect(globToRegExp('**/*.ts').test('src/deep/nested/a.ts')).toBe(true);
    expect(globToRegExp('src/**/*.ts').test('src/a.ts')).toBe(true);
    expect(globToRegExp('src/**/*.ts').test('lib/a.ts')).toBe(false);
  });

  it('supports brace alternation', () => {
    expect(matchesGlob('a.test.ts', '**/*.{test,spec}.ts')).toBe(true);
    expect(matchesGlob('a.spec.ts', '**/*.{test,spec}.ts')).toBe(true);
    expect(matchesGlob('a.ts', '**/*.{test,spec}.ts')).toBe(false);
  });

  it('supports character classes and ?', () => {
    expect(matchesGlob('a.ts', '?.ts')).toBe(true);
    expect(matchesGlob('ab.ts', '?.ts')).toBe(false);
    expect(matchesGlob('a.ts', '[ab].ts')).toBe(true);
    expect(matchesGlob('c.ts', '[ab].ts')).toBe(false);
  });

  it('escapes regex metacharacters in literals', () => {
    expect(matchesGlob('a+b.ts', 'a+b.ts')).toBe(true);
    expect(matchesGlob('axb.ts', 'a+b.ts')).toBe(false);
    expect(matchesGlob('a.b.ts', 'a.b.ts')).toBe(true);
    expect(matchesGlob('axb.ts', 'a.b.ts')).toBe(false);
  });

  it('matchesAny is an OR over globs', () => {
    expect(matchesAny('docs/readme.md', ['**/*.md', 'LICENSE*'])).toBe(true);
    expect(matchesAny('LICENSE', ['**/*.md', 'LICENSE*'])).toBe(true);
    expect(matchesAny('src/a.ts', ['**/*.md', 'LICENSE*'])).toBe(false);
  });

  it('detects literal paths', () => {
    expect(isLiteralPath('package.json')).toBe(true);
    expect(isLiteralPath('**/*.ts')).toBe(false);
    expect(isLiteralPath('src/{a,b}.ts')).toBe(false);
  });

  it('is anchored', () => {
    expect(matchesGlob('xsuffix', 'suffix')).toBe(false);
  });
});
