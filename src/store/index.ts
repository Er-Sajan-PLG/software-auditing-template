import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson, hashText } from '../snapshot/index.js';

/**
 * Content-addressed, append-only object store on the local filesystem.
 *
 * Every record is serialized to canonical JSON and written under its own
 * content hash. Records are therefore immutable by construction: mutating a
 * stored record produces a *different* hash (a new record), never a rewrite of
 * the old one. This is the minimal persistence the first implementation needs —
 * no database, no server, no dependency — and it exposes one narrow interface so
 * a PostgreSQL/object-store backend can drop in later without touching the core.
 *
 * This lives on the *platform* side (it persists state) but is deliberately the
 * only stateful building block in the first milestone.
 */

export class Store {
  readonly root: string;
  private readonly objectsDir: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.objectsDir = path.join(this.root, 'objects');
    fs.mkdirSync(this.objectsDir, { recursive: true });
  }

  /** Persist a record; returns its content address (id). Idempotent. */
  put(record: unknown): string {
    const json = canonicalJson(record);
    const id = hashText(json);
    const file = this.pathFor(id);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, json, 'utf8');
    }
    return id;
  }

  /** Read a record by content address, or null when absent. */
  get<T>(id: string): T | null {
    const file = this.pathFor(id);
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  has(id: string): boolean {
    return fs.existsSync(this.pathFor(id));
  }

  private pathFor(id: string): string {
    return path.join(this.objectsDir, `${id}.json`);
  }
}
