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

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — skip anything bigger
const MAX_FILES = 60_000; // hard safety valve for pathological trees

export interface GrepHit {
  file: string;
  line: number;
  excerpt: string;
}

/**
 * A snapshot of the audited tree. Built once, reused by every rule evaluation —
 * the whole audit is O(files) on disk and O(patterns × files) in memory.
 */
export class Project {
  readonly root: string;
  readonly files: string[] = [];
  private readonly ignores: string[];
  private readonly contentCache = new Map<string, string | null>();
  private readonly dirCache = new Set<string>();
  private tracked: string[] | null = null;

  constructor(root: string, extraIgnores: string[] = []) {
    this.root = path.resolve(root);
    this.ignores = [...DEFAULT_IGNORES, ...extraIgnores.map(normalizeIgnore)];
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
      if (this.files.length >= MAX_FILES) return;
      const absDir = path.join(root, relDir);
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
        const isDirectory = entry.isDirectory();
        const relWithSlash = isDirectory ? `${rel}/` : rel;
        if (rel === '.git') continue;
        if (matchesAny(relWithSlash, this.ignores) || matchesAny(rel, this.ignores)) continue;
        if (gitignore.some((g) => matchGitignore(g, rel, isDirectory))) continue;

        if (isDirectory) {
          this.dirCache.add(rel);
          stack.push(rel);
        } else if (entry.isFile()) {
          this.dirCache.add(relDir);
          this.files.push(rel);
        }
      }
    }
    this.files.sort();
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
    const d = dir.replace(/\/+$/, '');
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
    if (this.contentCache.has(rel)) return this.contentCache.get(rel) ?? null;
    let text: string | null = null;
    try {
      const abs = path.join(this.root, rel);
      const st = fs.statSync(abs);
      if (st.isFile() && st.size <= MAX_FILE_BYTES && looksLikeText(rel)) {
        const buf = fs.readFileSync(abs);
        // Cheap binary sniff: NUL byte in the first 8 KB.
        const head = buf.subarray(0, Math.min(buf.length, 8192));
        if (!head.includes(0)) text = buf.toString('utf8');
      }
    } catch {
      text = null;
    }
    this.contentCache.set(rel, text);
    return text;
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
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags.includes('i') ? 'i' : '');
    } catch {
      return []; // invalid pattern in a rule pack — degrade, never crash
    }
    const targets = include.length > 0 ? this.glob(include) : this.files;
    const hits: GrepHit[] = [];
    for (const file of targets) {
      if (exclude.length > 0 && matchesAny(file, exclude)) continue;
      if (matchesAny(file, GREP_SKIP)) continue;
      const text = this.read(file);
      if (text === null) continue;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (re.test(line)) {
          hits.push({ file, line: i + 1, excerpt: truncate(line.trim(), 220) });
          if (hits.length >= 500) return hits; // bounded output
        }
        if (!flags.includes('m')) re.lastIndex = 0;
      }
    }
    return hits;
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
    const run = (args: string[]): string | null => {
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
    };

    const commit = run(['rev-parse', 'HEAD'])?.slice(0, 40) || undefined;
    const ref = run(['rev-parse', '--abbrev-ref', 'HEAD']) || undefined;
    const repoUrl = run(['remote', 'get-url', 'origin']) || undefined;
    const commits = toInt(run(['rev-list', '--count', 'HEAD']));
    const contributors = run(['shortlog', '-sn', '--all', 'HEAD'])
      ?.split('\n')
      .filter(Boolean).length;
    const tags = run(['tag', '--list'])?.split('\n').filter(Boolean).length ?? 0;
    const branches = run(['branch', '--list'])?.split('\n').filter(Boolean).length ?? 0;
    const lastTs = run(['log', '-1', '--format=%ct']);
    const daysSinceLastCommit =
      lastTs && /^\d+$/.test(lastTs)
        ? Math.floor((Date.now() / 1000 - Number(lastTs)) / 86400)
        : undefined;

    return {
      commit,
      ref,
      repoUrl,
      commits,
      contributors: contributors ?? 0,
      tags,
      branches,
      daysSinceLastCommit,
      isRepo: true,
    };
  }
}

/* ---------------------------------------------------------------- helpers -- */

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
  let p = pattern.trim();
  if (!p || p.startsWith('#')) return false;
  let negated = false;
  if (p.startsWith('!')) {
    negated = true;
    p = p.slice(1);
  }
  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);
  if (dirOnly && !isDirectory) return false;

  const anchored = p.includes('/');
  let glob = p;
  if (glob.startsWith('/')) glob = glob.slice(1);
  if (!anchored) glob = `**/${glob}`;

  const hit =
    matchesGlob(rel, glob) || matchesGlob(`${rel}/**`, glob) || matchesGlob(rel, `${glob}/**`);
  return negated ? false : hit;
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

/** package.json / tsconfig.json style comments + trailing commas. */
export function stripJsonComments(text: string): string {
  let out = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const n = text[i + 1];
    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
        out += c;
      }
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && n === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i++;
      } else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === '/' && n === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}
