import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { matchesAny, matchesGlob, isLiteralPath } from './glob.js';

/**
 * Files that ARE part of the project index but should never be grepped or read:
 * lockfiles, minified bundles, source maps. They must stay in the index (a rule
 * asking "is a lockfile committed?" has to see them) but scanning them produces
 * noise, false positives, and a lot of wasted I/O.
 */
export const GREP_SKIP = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
  'poetry.lock',
  'uv.lock',
  'pdm.lock',
  'Pipfile.lock',
  'Cargo.lock',
  'go.sum',
  'composer.lock',
  'Gemfile.lock',
  'flake.lock',
  '**/*.lock',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/*.bundle.js',
  '**/*.generated.*',
];

/** Directories and files never worth auditing. */
export const DEFAULT_IGNORES = [
  '.git/**',
  'node_modules/**',
  '**/node_modules/**',
  'dist/**',
  '**/dist/**',
  'build/**',
  '**/build/**',
  'out/**',
  'coverage/**',
  '.next/**',
  '.nuxt/**',
  '.svelte-kit/**',
  '.turbo/**',
  '.venv/**',
  'venv/**',
  '__pycache__/**',
  '**/__pycache__/**',
  '.mypy_cache/**',
  '.pytest_cache/**',
  '.ruff_cache/**',
  'target/**',
  'vendor/**',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.ico',
  '**/*.webp',
  '**/*.woff',
  '**/*.woff2',
  '**/*.ttf',
  '**/*.pdf',
  '**/*.zip',
  '**/*.gz',
  '**/*.wasm',
  '**/*.pyc',
  '**/*.class',
  '**/*.jar',
];

/** Files whose contents we are willing to read as text. */
const TEXT_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.swift',
  '.rb',
  '.php',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.hpp',
  '.cs',
  '.scala',
  '.clj',
  '.ex',
  '.exs',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.fish',
  '.json',
  '.jsonc',
  '.json5',
  '.sarif',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.env',
  '.properties',
  '.gradle',
  '.mk',
  '.make',
  '.md',
  '.mdx',
  '.txt',
  '.rst',
  '.adoc',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.vue',
  '.svelte',
  '.astro',
  '.sql',
  '.graphql',
  '.gql',
  '.proto',
  '.tf',
  '.hcl',
  '.sol',
  '.zig',
  '.lua',
  '.r',
  '.dockerfile',
  '.editorconfig',
  '.gitignore',
  '.gitattributes',
  // Manifests and templates that carry no language-extension hint.
  '.mod',
  '.sum',
  '.gemspec',
  '.podspec',
  '.sbt',
  '.groovy',
  '.gradle',
  '.cmake',
  '.erb',
  '.haml',
  '.twig',
  '.mustache',
  '.handlebars',
  '.hbs',
  '.pug',
  '.tfvars',
  '.nix',
  '.bazel',
  '.bzl',
  '.ninja',
  '.pl',
  '.pm',
  '.tcl',
  '.awk',
  '.vim',
  '.el',
  '.ml',
  '.fs',
  '.fsx',
  '.v',
  '.sv',
  '.vhd',
  '.asm',
  '.s',
  '.nim',
  '.cr',
  '.jl',
  '.ipynb',
  '.gemfile',
]);

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — skip anything bigger
export const MAX_FILES = 60_000; // hard safety valve for pathological trees

export interface GrepHit {
  file: string;
  line: number;
  excerpt: string;
}

/**
 * A snapshot of the audited tree. Built once, reused by every rule evaluation —
 * the whole audit is O(files) on disk and O(patterns × files) in memory.
 */
export interface ProjectLimits {
  maxFiles?: number;
  maxBytes?: number;
}

/** Reads cached under a bounded LRU: big trees must not grow memory with files. */
const CONTENT_CACHE_CAP = 1000;

export class Project {
  readonly root: string;
  readonly files: string[] = [];
  private readonly ignores: string[];
  private readonly contentCache = new Map<string, string | null>();
  private readonly dirCache = new Set<string>();
  private tracked: string[] | null = null;
  readonly maxFiles: number;
  readonly maxBytes: number;
  /**
   * True when indexing stopped at MAX_FILES — the tree is bigger than the
   * audit can see, so PASS verdicts may rest on unindexed files. Always
   * surfaced as a warning, never silently absorbed into the score.
   */
  truncated = false;
  /** Files skipped for exceeding MAX_FILE_BYTES (counted once each). */
  skippedLarge = 0;

  constructor(root: string, extraIgnores: string[] = [], limits: ProjectLimits = {}) {
    this.root = path.resolve(root);
    this.ignores = [...DEFAULT_IGNORES, ...extraIgnores.map(normalizeIgnore)];
    this.maxFiles = normalizeLimit(limits.maxFiles, MAX_FILES);
    this.maxBytes = normalizeLimit(limits.maxBytes, MAX_FILE_BYTES);
    this.walk();
  }

  /* ------------------------------------------------------------- indexing -- */

  private walk(): void {
    const root = this.root;
    if (!isDir(root)) return;

    const gitignore = readGitignore(path.join(root, '.gitignore'));
    const stack: string[] = [''];

    while (stack.length > 0) {
      const relDir = stack.pop()!;
      if (this.files.length >= this.maxFiles) {
        this.truncated = true;
        return;
      }
      const absDir = path.join(root, relDir);
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        // Per-file bound (the per-directory check above only saves a
        // readdir): with huge flat directories the cap must bite exactly,
        // or a "max 3 files" audit silently audits 5.
        if (this.files.length >= this.maxFiles) {
          this.truncated = true;
          return;
        }
        this.visitEntry(entry, relDir, gitignore, stack);
      }
    }
    this.files.sort();
  }

  private visitEntry(entry: fs.Dirent, relDir: string, gitignore: string[], stack: string[]): void {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    const isDirectory = entry.isDirectory();
    const relWithSlash = isDirectory ? `${rel}/` : rel;
    if (rel === '.git') return;
    if (matchesAny(relWithSlash, this.ignores) || matchesAny(rel, this.ignores)) return;
    if (gitignore.some((g) => matchGitignore(g, rel, isDirectory))) return;

    if (isDirectory) {
      this.dirCache.add(rel);
      stack.push(rel);
    } else if (entry.isFile()) {
      this.dirCache.add(relDir);
      this.files.push(rel);
    }
  }

  /* -------------------------------------------------------------- queries -- */

  /** All files matching at least one of `globs`. */
  glob(globs: string[]): string[] {
    const literal = globs.filter(isLiteralPath);
    const patterns = globs.filter((g) => !isLiteralPath(g));
    return this.files.filter((f) => {
      if (literal.includes(f)) return true;
      return patterns.some((p) => matchesGlob(f, p));
    });
  }

  has(glob: string): boolean {
    return this.glob([glob]).length > 0;
  }

  dirExists(dir: string): boolean {
    // Trailing slashes are trimmed by index rather than /\/+$/: a run of
    // slashes makes that pattern backtrack quadratically.
    let end = dir.length;
    while (end > 0 && dir[end - 1] === '/') end--;
    const d = dir.slice(0, end);
    return d === '' || this.dirCache.has(d) || isDir(path.join(this.root, d));
  }

  /** Directories present directly under root, one level deep. */
  topLevelDirs(): string[] {
    return [...this.dirCache].filter((d) => d && !d.includes('/')).sort();
  }

  /** True when at least one file matches `patterns`. */
  anyFile(patterns: string[]): boolean {
    return this.glob(patterns).length > 0;
  }

  /** Number of distinct files matching `patterns`. */
  count(patterns: string[]): number {
    return this.glob(patterns).length;
  }

  /** File contents, or null when unreadable / binary / too large. */
  read(rel: string): string | null {
    const cached = this.cacheFetch(rel);
    if (cached.hit) return cached.value;
    let text: string | null = null;
    try {
      const abs = path.join(this.root, rel);
      const st = fs.statSync(abs);
      if (st.isFile() && st.size > this.maxBytes) {
        // Counted once per file (cache guard above): oversized files are
        // invisible to every content check, so the audit must say so.
        this.skippedLarge++;
      } else if (st.isFile() && looksLikeText(rel)) {
        const buf = fs.readFileSync(abs);
        // Cheap binary sniff: NUL byte in the first 8 KB.
        const head = buf.subarray(0, Math.min(buf.length, 8192));
        if (!head.includes(0)) text = buf.toString('utf8');
      }
    } catch {
      text = null;
    }
    this.cacheStore(rel, text);
    return text;
  }

  private cacheFetch(rel: string): { hit: boolean; value: string | null } {
    if (!this.contentCache.has(rel)) return { hit: false, value: null };
    const value = this.contentCache.get(rel) ?? null;
    // Refresh recency: re-insertion moves the entry to the young end.
    this.contentCache.delete(rel);
    this.contentCache.set(rel, value);
    return { hit: true, value };
  }

  private cacheStore(rel: string, text: string | null): void {
    this.contentCache.set(rel, text);
    if (this.contentCache.size > CONTENT_CACHE_CAP) {
      const oldest = this.contentCache.keys().next();
      if (!oldest.done) this.contentCache.delete(oldest.value);
    }
  }

  readJson(rel: string): unknown | null {
    const raw = this.read(rel);
    if (raw === null) return null;
    try {
      return JSON.parse(stripJsonComments(raw));
    } catch {
      return null;
    }
  }

  /**
   * Grep across the project. `include`/`exclude` are globs; when `include` is
   * empty every indexed file is scanned.
   */
  grep(pattern: string, include: string[], exclude: string[] = [], flags = ''): GrepHit[] {
    const re = compileGrepPattern(pattern, flags);
    if (!re) return [];
    const targets = include.length > 0 ? this.glob(include) : this.files;
    const hits: GrepHit[] = [];
    for (const file of targets) {
      this.grepFile(re, file, exclude, flags, hits);
      if (hits.length >= 500) return hits; // bounded output
    }
    return hits;
  }

  private grepFile(
    re: RegExp,
    file: string,
    exclude: string[],
    flags: string,
    hits: GrepHit[],
  ): void {
    if (exclude.length > 0 && matchesAny(file, exclude)) return;
    if (matchesAny(file, GREP_SKIP)) return;
    const text = this.read(file);
    if (text === null) return;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (re.test(line)) {
        hits.push({ file, line: i + 1, excerpt: truncate(line.trim(), 220) });
        if (hits.length >= 500) return;
      }
      if (!flags.includes('m')) re.lastIndex = 0;
    }
  }

  /* ------------------------------------------------------------------ git -- */

  /**
   * Files tracked by git. The tree index skips build output and vendored code
   * for speed and signal quality, but some checks ("is `.env` committed?",
   * "are build artifacts in the repo?") can only be answered from git.
   */
  trackedFiles(): string[] {
    if (this.tracked !== null) return this.tracked;
    const out: string[] = [];
    try {
      const raw = execFileSync('git', ['ls-files', '-z'], {
        cwd: this.root,
        encoding: 'utf8',
        timeout: 20_000,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const entry of raw.split('\0')) {
        if (entry) out.push(entry);
        if (out.length >= 200_000) break;
      }
    } catch {
      out.length = 0;
    }
    this.tracked = out;
    return out;
  }

  trackedGlob(globs: string[]): string[] {
    return this.trackedFiles().filter((f) => matchesAny(f, globs));
  }

  gitInfo(): {
    commit?: string;
    ref?: string;
    repoUrl?: string;
    commits: number;
    contributors: number;
    tags: number;
    daysSinceLastCommit?: number;
    branches: number;
    isRepo: boolean;
  } {
    const isRepo = isDir(path.join(this.root, '.git'));
    if (!isRepo) {
      return { commits: 0, contributors: 0, tags: 0, branches: 0, isRepo: false };
    }
    return { ...this.gitIdentity(), ...this.gitStats(), isRepo: true };
  }

  private gitRun(args: string[]): string | null {
    try {
      return execFileSync('git', args, {
        cwd: this.root,
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  }

  private gitIdentity(): { commit?: string; ref?: string; repoUrl?: string } {
    const commit = this.gitRun(['rev-parse', 'HEAD'])?.slice(0, 40) || undefined;
    const ref = this.gitRun(['rev-parse', '--abbrev-ref', 'HEAD']) || undefined;
    const repoUrl = this.gitRun(['remote', 'get-url', 'origin']) || undefined;
    return { commit, ref, repoUrl };
  }

  private gitStats(): {
    commits: number;
    contributors: number;
    tags: number;
    branches: number;
    daysSinceLastCommit?: number;
  } {
    const contributors = this.gitRun(['shortlog', '-sn', '--all', 'HEAD'])
      ?.split('\n')
      .filter(Boolean).length;
    const tags = this.gitRun(['tag', '--list'])?.split('\n').filter(Boolean).length ?? 0;
    const branches = this.gitRun(['branch', '--list'])?.split('\n').filter(Boolean).length ?? 0;
    const lastTs = this.gitRun(['log', '-1', '--format=%ct']);
    const daysSinceLastCommit =
      lastTs && /^\d+$/.test(lastTs)
        ? Math.floor((Date.now() / 1000 - Number(lastTs)) / 86400)
        : undefined;
    return {
      commits: toInt(this.gitRun(['rev-list', '--count', 'HEAD'])),
      contributors: contributors ?? 0,
      tags,
      branches,
      daysSinceLastCommit,
    };
  }
}

function compileGrepPattern(pattern: string, flags: string): RegExp | null {
  try {
    return new RegExp(pattern, flags.includes('i') ? 'i' : '');
  } catch {
    return null; // invalid pattern in a rule pack — degrade, never crash
  }
}

/* ---------------------------------------------------------------- helpers -- */

/**
 * Caps are operator intent, not attacker input — but garbage still must not
 * produce a zero-file index or an unbounded one. Non-positive garbage falls
 * back to the default (the caller warns; see audit.ts resolveLimits).
 */
function normalizeLimit(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function normalizeIgnore(g: string): string {
  return g.endsWith('/') ? `${g}**` : g;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function toInt(s: string | null): number {
  if (!s) return 0;
  const n = Number.parseInt(s.trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Translates a single .gitignore line into our matcher. Handles the common
 * cases (negation, directory-only, anchored, wildcard); exotic gitignore
 * semantics are intentionally out of scope for an audit index.
 */
function matchGitignore(pattern: string, rel: string, isDirectory: boolean): boolean {
  const n = normalizeGitignorePattern(pattern);
  if (!n) return false;
  if (n.dirOnly && !isDirectory) return false;

  const hit =
    matchesGlob(rel, n.glob) ||
    matchesGlob(`${rel}/**`, n.glob) ||
    matchesGlob(rel, `${n.glob}/**`);
  return n.negated ? false : hit;
}

function normalizeGitignorePattern(
  pattern: string,
): { glob: string; negated: boolean; dirOnly: boolean } | null {
  let p = pattern.trim();
  if (!p || p.startsWith('#')) return null;
  let negated = false;
  if (p.startsWith('!')) {
    negated = true;
    p = p.slice(1);
  }
  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);

  const anchored = p.includes('/');
  let glob = p;
  if (glob.startsWith('/')) glob = glob.slice(1);
  if (!anchored) glob = `**/${glob}`;
  return { glob, negated, dirOnly };
}

function readGitignore(file: string): string[] {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#'));
  } catch {
    return [];
  }
}

/** Extension allow-list for content reads; extensionless files are allowed. */
function looksLikeText(rel: string): boolean {
  const base = rel.split('/').pop() ?? rel;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return true; // Dockerfile, LICENSE, Makefile, .gitignore
  return TEXT_EXT.has(base.slice(dot).toLowerCase());
}

interface JsonStripState {
  out: string;
  inString: boolean;
  inLineComment: boolean;
  inBlockComment: boolean;
}

/** package.json / tsconfig.json style comments + trailing commas. */
export function stripJsonComments(text: string): string {
  const st: JsonStripState = {
    out: '',
    inString: false,
    inLineComment: false,
    inBlockComment: false,
  };
  for (let i = 0; i < text.length; i++) {
    i = stripJsonChar(text, i, st);
  }
  return st.out.replace(/,(\s*[}\]])/g, '$1');
}

function stripJsonChar(text: string, i: number, st: JsonStripState): number {
  const c = text[i]!;
  const n = text[i + 1];
  if (st.inLineComment) return endLineComment(c, i, st);
  if (st.inBlockComment) return endBlockComment(c, n, i, st);
  if (st.inString) return copyStringChar(c, n, i, st);
  return startJsonToken(c, n, i, st);
}

function endLineComment(c: string, i: number, st: JsonStripState): number {
  if (c === '\n') {
    st.inLineComment = false;
    st.out += c;
  }
  return i;
}

function endBlockComment(
  c: string | undefined,
  n: string | undefined,
  i: number,
  st: JsonStripState,
): number {
  if (c === '*' && n === '/') {
    st.inBlockComment = false;
    return i + 1;
  }
  return i;
}

function copyStringChar(c: string, n: string | undefined, i: number, st: JsonStripState): number {
  st.out += c;
  if (c === '\\') {
    st.out += n ?? '';
    return i + 1;
  }
  if (c === '"') st.inString = false;
  return i;
}

function startJsonToken(c: string, n: string | undefined, i: number, st: JsonStripState): number {
  if (c === '"') {
    st.inString = true;
    st.out += c;
    return i;
  }
  if (c === '/' && n === '/') {
    st.inLineComment = true;
    return i + 1;
  }
  if (c === '/' && n === '*') {
    st.inBlockComment = true;
    return i + 1;
  }
  st.out += c;
  return i;
}
