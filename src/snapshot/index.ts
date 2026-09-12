import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Project } from '../util/project.js';

/**
 * Immutable, content-addressed snapshot of an audit target.
 *
 * The snapshot identity answers one question deterministically: "exactly which
 * bytes did this audit see?" Two trees with identical (path → bytes) contents
 * produce the same id; any change to path, byte content, or file set produces a
 * different id. Once recorded, a snapshot can never be mutated to mean something
 * else without also changing its id.
 *
 * This lives in the *core* layer: pure, offline, deterministic. It never stores
 * anything itself — persistence is the platform's job (see src/store).
 */

export interface SnapshotFile {
  /** Repository-relative path, forward slashes. */
  path: string;
  /** SHA-256 of the raw file bytes as read from disk. */
  sha256: string;
  bytes: number;
}

export interface SnapshotGit {
  commit?: string;
  ref?: string;
  repoUrl?: string;
}

export interface Snapshot {
  /** Content-addressed identity: sha256 over the sorted (path, sha, bytes) rows. */
  id: string;
  /** Absolute path of the tree at snapshot time (informational only). */
  root: string;
  files: SnapshotFile[];
  git: SnapshotGit | null;
  createdAt: string;
}

export function hashBytes(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function hashText(text: string): string {
  return hashBytes(Buffer.from(text, 'utf8'));
}

/* ----------------------------------------------------------- canonical JSON -- */

/**
 * Deterministic JSON serialization (sorted object keys) so that two structurally
 * identical objects always produce the same content address. Do not pass Sets,
 * Maps, or functions — records stored/compared content-addressably must be plain
 * JSON-serializable data.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortValue((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/* ---------------------------------------------------------------- snapshot -- */

/** SHA-256 identity over a sorted list of file records. */
export function identityFromFiles(files: SnapshotFile[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const rows = sorted.map((f) => `${f.path}\t${f.sha256}\t${f.bytes}`).join('\n');
  return hashText(rows);
}

/**
 * Build a snapshot from an already-indexed `Project`. Uses the project's file
 * list (already honouring `.gitignore`, default ignores, and index caps), so the
 * snapshot is precisely "the tree the audit will analyze", not the mutable
 * working directory around it.
 */
export function snapshotOfProject(
  project: Project,
  git: SnapshotGit | null,
  createdAt = new Date().toISOString(),
): Snapshot {
  const files: SnapshotFile[] = [];
  for (const rel of project.files) {
    const abs = path.join(project.root, rel);
    let buf: Buffer;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      continue;
    }
    files.push({ path: rel, sha256: hashBytes(buf), bytes: buf.length });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const id = identityFromFiles(files);
  return { id, root: project.root, files, git, createdAt };
}

/** Convenience: build a snapshot from a directory path without extra ignores. */
export function snapshotOfDir(root: string): Snapshot {
  const project = new Project(root);
  const gitInfo = project.gitInfo();
  const git: SnapshotGit | null = gitInfo.isRepo
    ? {
        commit: gitInfo.commit,
        ref: gitInfo.ref,
        repoUrl: gitInfo.repoUrl,
      }
    : null;
  return snapshotOfProject(project, git);
}
