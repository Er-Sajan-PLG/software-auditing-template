import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store/index.js';
import { GapQueue } from '../src/evolution/queue.js';
import { hashText, canonicalJson } from '../src/snapshot/index.js';
import type { CapabilityGap } from '../src/evolution/types.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-queue-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function tempStore(): Store {
  return new Store(tempDir());
}

function gap(overrides: Partial<CapabilityGap> = {}): CapabilityGap {
  return {
    id: 'unsupported-technology:lua',
    kind: 'unsupported-technology',
    target: 'lua',
    problem: 'USA cannot analyze lua repositories.',
    evidence: ['lang:lua', 'auditRun:r1'],
    requiredCapability: 'stacks/lua',
    priority: 'high',
    auditRunId: 'r1',
    snapshotId: 's1',
    createdAt: '2026-01-01T00:00:00.000Z',
    state: 'open',
    ...overrides,
  };
}

describe('GapQueue', () => {
  it('opens new gaps and reports them', () => {
    const q = new GapQueue(tempStore());
    const out = q.recordGaps([gap()]);
    expect(out).toEqual({ opened: ['unsupported-technology:lua'], reopened: [], existing: [] });
    expect(q.openGaps()).toHaveLength(1);
    expect(q.openGaps()[0]!.state).toBe('open');
  });

  it('re-opens a closed gap append-only and preserves the old record', () => {
    const store = tempStore();
    const q = new GapQueue(store);
    q.recordGaps([gap()]);
    const closedAt = q.closeGaps(['unsupported-technology:lua'], 'fixed in release');
    expect(closedAt).toEqual(['unsupported-technology:lua']);

    const idsBefore = store.ids().length;
    const out = q.recordGaps([gap()]);
    expect(out.reopened).toEqual(['unsupported-technology:lua']);
    // Append-only: reopening adds records, never rewrites the closed one.
    expect(store.ids().length).toBeGreaterThan(idsBefore);

    const transitions = q.history('unsupported-technology:lua');
    expect(transitions.map((t) => `${t.from}->${t.to}`)).toEqual([
      'absent->open',
      'open->closed',
      'closed->open',
    ]);
    // The oldest transition is still present, byte-identical.
    expect(transitions[0]).toMatchObject({ gapId: 'unsupported-technology:lua', from: 'absent' });
  });

  it('re-recording an identical open gap adds no new transition', () => {
    const store = tempStore();
    const q = new GapQueue(store);
    q.recordGaps([gap()]);
    const idsAfterFirst = store.ids().length;

    const out = q.recordGaps([gap()]);
    expect(out).toEqual({ opened: [], reopened: [], existing: ['unsupported-technology:lua'] });
    expect(store.ids().length).toBe(idsAfterFirst);
    expect(q.history('unsupported-technology:lua')).toHaveLength(1);
  });

  it('re-recording with changed evidence appends an updated open record', () => {
    const store = tempStore();
    const q = new GapQueue(store);
    q.recordGaps([gap()]);
    const idsAfterFirst = store.ids().length;

    q.recordGaps([gap({ evidence: ['lang:lua', 'auditRun:r2'] })]);
    expect(store.ids().length).toBeGreaterThan(idsAfterFirst);
    expect(q.openGaps()).toHaveLength(1);
    expect(q.openGaps()[0]!.evidence).toContain('auditRun:r2');
  });

  it('close only closes currently open gaps', () => {
    const q = new GapQueue(tempStore());
    q.recordGaps([gap({ id: 'a', target: 'a' }), gap({ id: 'b', target: 'b' })]);

    const closed = q.closeGaps(['a', 'missing', 'b'], 'duplicate');
    expect(closed.sort()).toEqual(['a', 'b']);
    expect(q.openGaps()).toHaveLength(0);

    // Already-closed ids are a no-op the second time.
    expect(q.closeGaps(['a'])).toEqual([]);
  });

  it('accepts open gaps and leaves them non-open', () => {
    const q = new GapQueue(tempStore());
    q.recordGaps([gap({ id: 'a' }), gap({ id: 'b' })]);
    const accepted = q.acceptGaps(['a'], 'looks good');
    expect(accepted).toEqual(['a']);

    expect(q.openGaps().map((g) => g.id)).toEqual(['b']);
    expect(q.allGaps().find((g) => g.id === 'a')!.state).toBe('accepted');
    expect(q.history('a').at(-1)).toMatchObject({
      from: 'open',
      to: 'accepted',
      reason: 'looks good',
    });
  });

  it('does not accept a closed gap', () => {
    const q = new GapQueue(tempStore());
    q.recordGaps([gap({ id: 'a' })]);
    q.closeGaps(['a']);
    expect(q.acceptGaps(['a'])).toEqual([]);
    expect(q.allGaps()[0]!.state).toBe('closed');
  });

  it('does not close an accepted gap (only open gaps transition)', () => {
    const q = new GapQueue(tempStore());
    q.recordGaps([gap({ id: 'a' })]);
    q.acceptGaps(['a']);
    expect(q.closeGaps(['a'])).toEqual([]);
    expect(q.allGaps()[0]!.state).toBe('accepted');
  });

  it('orders openGaps by priority then id', () => {
    const q = new GapQueue(tempStore());
    q.recordGaps([
      gap({ id: 'low-1', target: 'z', priority: 'low' }),
      gap({ id: 'high-2', target: 'y', priority: 'high' }),
      gap({ id: 'medium-1', target: 'x', priority: 'medium' }),
      gap({ id: 'high-1', target: 'w', priority: 'high' }),
    ]);
    expect(q.openGaps().map((g) => g.id)).toEqual(['high-1', 'high-2', 'medium-1', 'low-1']);
  });

  it('summarizes counts by state, kind, and priority', () => {
    const q = new GapQueue(tempStore());
    q.recordGaps([
      gap({ id: 'h', kind: 'unsupported-technology', priority: 'high' }),
      gap({ id: 'm', kind: 'missing-detector', priority: 'medium' }),
      gap({ id: 'l', kind: 'missing-detector', priority: 'low' }),
    ]);
    q.closeGaps(['l']);

    expect(q.summarize()).toEqual({
      open: 2,
      closed: 1,
      total: 3,
      byKind: { 'unsupported-technology': 1, 'missing-detector': 2 },
      byPriority: { high: 1, medium: 1, low: 1 },
    });
  });

  it('reconstructs identical state from a new GapQueue on the same store root', () => {
    const dir = tempDir();
    const a = new GapQueue(new Store(dir));
    a.recordGaps([gap({ id: 'keep', priority: 'high' }), gap({ id: 'gone', priority: 'medium' })]);
    a.closeGaps(['gone'], 'resolved');
    a.acceptGaps(['keep'], 'in progress');

    const b = new GapQueue(new Store(dir));
    expect(b.allGaps()).toEqual(a.allGaps());
    expect(b.summarize()).toEqual(a.summarize());
    expect(b.history('gone')).toEqual(a.history('gone'));
    expect(b.history('keep')).toEqual(a.history('keep'));
  });

  it('isolates namespaces while sharing one store root', () => {
    const store = tempStore();
    const main = new GapQueue(store);
    const other = new GapQueue(store, 'other');

    main.recordGaps([gap({ id: 'a' })]);
    other.recordGaps([gap({ id: 'b', target: 'b' })]);
    expect(main.allGaps().map((g) => g.id)).toEqual(['a']);
    expect(other.allGaps().map((g) => g.id)).toEqual(['b']);
  });

  it('produces byte-identical records for identical transitions', () => {
    const gapFixture = gap();
    const expected = {
      kind: 'gap-record',
      namespace: 'gaps',
      gapId: gapFixture.id,
      seq: 1,
      state: 'open',
      gap: { ...gapFixture, state: 'open' },
      transition: {
        gapId: gapFixture.id,
        from: 'absent',
        to: 'open',
        at: expect.any(String),
      },
    };
    const store = tempStore();
    const q = new GapQueue(store);
    q.recordGaps([gapFixture]);
    const ids = store.ids();
    expect(ids).toHaveLength(1);
    // The stored record is exactly what we modeled (canonical, no surprises).
    expect(store.get(ids[0]!)).toEqual(expected);
  });

  it('uses canonical JSON hashing for record identity', () => {
    const record = {
      kind: 'gap-record',
      namespace: 'gaps',
      gapId: 'x',
      seq: 1,
      state: 'open',
      gap: gap({ id: 'x' }),
      transition: { gapId: 'x', from: 'absent', to: 'open', at: '2026-01-01T00:00:00.000Z' },
    };
    const store = tempStore();
    const id = store.put(record);
    expect(id).toBe(hashText(canonicalJson(record)));
  });
});
