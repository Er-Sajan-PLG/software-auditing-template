import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store/index.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tempStore(): Store {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-store-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new Store(dir);
}

describe('Store', () => {
  it('round-trips a record through a content address', () => {
    const store = tempStore();
    const id = store.put({ snapshotId: 'abc', findings: 3 });
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(store.get(id)).toEqual({ snapshotId: 'abc', findings: 3 });
  });

  it('is content-addressed: structurally equal records share one id', () => {
    const store = tempStore();
    const a = store.put({ name: 'x', tags: [1, 2] });
    const b = store.put({ tags: [1, 2], name: 'x' });
    expect(a).toBe(b);
  });

  it('is idempotent and append-only (no overwrite of the object on re-put)', () => {
    const store = tempStore();
    const id = store.put({ v: 1 });
    store.put({ v: 1 });
    // Same content → same address; the record is what we wrote, untouched.
    expect(store.get(id)).toEqual({ v: 1 });
    expect(store.has(id)).toBe(true);
  });

  it('mutating a record yields a different address, not a rewrite', () => {
    const store = tempStore();
    const id1 = store.put({ v: 1 });
    const id2 = store.put({ v: 2 });
    expect(id2).not.toBe(id1);
    expect(store.get(id1)).toEqual({ v: 1 }); // original preserved
    expect(store.get(id2)).toEqual({ v: 2 });
  });

  it('returns null for an unknown address', () => {
    const store = tempStore();
    expect(store.get('f'.repeat(64))).toBeNull();
    expect(store.has('f'.repeat(64))).toBe(false);
  });

  it('persists across two Store instances on the same directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-store-'));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const a = new Store(dir);
    const id = a.put({ persisted: true });
    const b = new Store(dir);
    expect(b.get(id)).toEqual({ persisted: true });
  });
});
