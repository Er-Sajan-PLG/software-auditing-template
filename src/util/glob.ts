/**
 * Minimal, dependency-free glob matching.
 * Supports: `**`, `*`, `?`, `{a,b}` alternation, and `[abc]` character classes.
 * Enough for rule packs; avoids pulling in a glob dependency.
 */

const GLOB_CACHE = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  const cached = GLOB_CACHE.get(glob);
  if (cached) return cached;

  const compiled = new RegExp(`^${translateGlob(glob)}$`);
  GLOB_CACHE.set(glob, compiled);
  return compiled;
}

interface GlobStep {
  text: string;
  next: number;
}

function translateGlob(glob: string): string {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const step =
      matchStar(glob, i) ?? matchQuestion(glob, i) ?? matchBrace(glob, i) ?? matchBracket(glob, i);
    if (step) {
      re += step.text;
      i = step.next;
      continue;
    }
    re += glob[i]!.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  return re;
}

function matchStar(glob: string, i: number): GlobStep | null {
  if (glob[i] !== '*') return null;
  if (glob[i + 1] === '*') {
    // `**`
    if (glob[i + 2] === '/') return { text: '(?:.*/)?', next: i + 3 };
    return { text: '.*', next: i + 2 };
  }
  return { text: '[^/]*', next: i + 1 };
}

function matchQuestion(glob: string, i: number): GlobStep | null {
  return glob[i] === '?' ? { text: '[^/]', next: i + 1 } : null;
}

function matchBrace(glob: string, i: number): GlobStep | null {
  if (glob[i] !== '{') return null;
  const end = findClosing(glob, i, '{', '}');
  if (end === -1) return { text: '\\{', next: i + 1 };
  return { text: `(?:${glob.slice(i + 1, end).replace(/,/g, '|')})`, next: end + 1 };
}

function matchBracket(glob: string, i: number): GlobStep | null {
  if (glob[i] !== '[') return null;
  const end = findClosing(glob, i, '[', ']');
  if (end === -1) return { text: '\\[', next: i + 1 };
  let body = glob.slice(i + 1, end);
  if (body.startsWith('!')) body = '^' + body.slice(1);
  return { text: `[${body}]`, next: end + 1 };
}

function findClosing(s: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path);
}

export function matchesAny(path: string, globs: string[]): boolean {
  return globs.some((g) => matchesGlob(path, g));
}

/** A glob that looks like it targets a literal path (no magic chars). */
export function isLiteralPath(glob: string): boolean {
  return !/[*?[\]{}]/.test(glob);
}
