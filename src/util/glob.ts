/**
 * Minimal, dependency-free glob matching.
 * Supports: `**`, `*`, `?`, `{a,b}` alternation, and `[abc]` character classes.
 * Enough for rule packs; avoids pulling in a glob dependency.
 */

const GLOB_CACHE = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  const cached = GLOB_CACHE.get(glob);
  if (cached) return cached;

  let re = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**`
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      i += 1;
      continue;
    }
    if (c === '{') {
      const end = findClosing(glob, i, '{', '}');
      if (end === -1) {
        re += '\\{';
        i += 1;
        continue;
      }
      re += '(?:' + glob.slice(i + 1, end).replace(/,/g, '|') + ')';
      i = end + 1;
      continue;
    }
    if (c === '[') {
      const end = findClosing(glob, i, '[', ']');
      if (end === -1) {
        re += '\\[';
        i += 1;
        continue;
      }
      let body = glob.slice(i + 1, end);
      if (body.startsWith('!')) body = '^' + body.slice(1);
      re += '[' + body + ']';
      i = end + 1;
      continue;
    }
    re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  re += '$';

  const compiled = new RegExp(re);
  GLOB_CACHE.set(glob, compiled);
  return compiled;
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
