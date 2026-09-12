import { canonicalJson } from '../snapshot/index.js';
import type { Store } from '../store/index.js';
import type { CapabilityGap } from './types.js';

/**
 * Persistent, content-addressed gap queue.
 *
 * Gaps arrive with every audit; the same gap reappears run after run. The queue
 * is the durable memory that answers "which gaps are currently open?" without
 * mutating anything: every state change is one append-only record in the Store,
 * and the latest state is a pure fold over those records.
 *
 * A record is one transition. Because records are content-addressed, recording
 * the *same* transition twice writes the same bytes and therefore the same
 * object — re-running a cycle is idempotent by construction.
 *
 * Deriving latest state from records (never from a mutable index) means the
 * queue cannot drift: replay the records and you get exactly the same answer.
 */

export interface QueueSummary {
  open: number;
  closed: number;
  total: number;
  byKind: Record<string, number>;
  byPriority: Record<string, number>;
}

export interface GapTransition {
  gapId: string;
  from: CapabilityGap['state'] | 'absent';
  to: CapabilityGap['state'];
  at: string;
  reason?: string;
}

interface GapRecord {
  kind: 'gap-record';
  namespace: string;
  gapId: string;
  seq: number;
  state: CapabilityGap['state'];
  gap: CapabilityGap;
  transition: GapTransition;
}

const DEFAULT_NAMESPACE = 'gaps';

const PRIORITY_RANK: Record<CapabilityGap['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export class GapQueue {
  private readonly store: Store;
  private readonly namespace: string;

  constructor(store: Store, namespace = DEFAULT_NAMESPACE) {
    this.store = store;
    this.namespace = namespace;
  }

  recordGaps(gaps: CapabilityGap[]): { opened: string[]; reopened: string[]; existing: string[] } {
    const opened: string[] = [];
    const reopened: string[] = [];
    const existing: string[] = [];
    for (const gap of gaps) {
      const bucket = this.recordOne(gap);
      if (bucket === 'opened') opened.push(gap.id);
      else if (bucket === 'reopened') reopened.push(gap.id);
      else existing.push(gap.id);
    }
    return { opened, reopened, existing };
  }

  closeGaps(gapIds: string[], reason?: string): string[] {
    return this.transitionGaps(gapIds, 'closed', reason);
  }

  acceptGaps(gapIds: string[], reason?: string): string[] {
    return this.transitionGaps(gapIds, 'accepted', reason);
  }

  openGaps(): CapabilityGap[] {
    return this.latest()
      .filter((g) => g.state === 'open')
      .sort(compareForQueue);
  }

  allGaps(): CapabilityGap[] {
    return this.latest().sort((a, b) => a.id.localeCompare(b.id));
  }

  history(gapId: string): GapTransition[] {
    return this.records()
      .filter((r) => r.gapId === gapId)
      .map((r) => r.transition);
  }

  summarize(): QueueSummary {
    const gaps = this.latest();
    const byKind: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let open = 0;
    let closed = 0;
    for (const gap of gaps) {
      if (gap.state === 'closed') closed += 1;
      else open += 1;
      byKind[gap.kind] = (byKind[gap.kind] ?? 0) + 1;
      byPriority[gap.priority] = (byPriority[gap.priority] ?? 0) + 1;
    }
    return { open, closed, total: gaps.length, byKind, byPriority };
  }

  /* ------------------------------------------------------------------- core -- */

  /**
   * Record one gap. Returns which bucket it landed in. Never mutates an existing
   * record: a new state (or changed evidence) appends a new transition.
   */
  private recordOne(gap: CapabilityGap): 'opened' | 'reopened' | 'existing' {
    const prior = this.latestFor(gap.id);
    if (!prior) {
      this.append(gap, 'absent', 'open');
      return 'opened';
    }
    if (prior.state === 'closed') {
      this.append(gap, 'closed', 'open');
      return 'reopened';
    }
    if (sameGap(prior.gap, gap)) return 'existing';
    this.append(gap, prior.state, prior.state);
    return 'existing';
  }

  private transitionGaps(gapIds: string[], to: CapabilityGap['state'], reason?: string): string[] {
    const changed: string[] = [];
    for (const gapId of gapIds) {
      const prior = this.latestFor(gapId);
      // Only a currently-open gap can transition: closed is terminal until a
      // re-observation reopens it (recordGaps), and an accepted gap is not
      // "open" either.
      if (!prior || prior.state !== 'open') continue;
      this.append(prior.gap, prior.state, to, reason);
      changed.push(gapId);
    }
    return changed;
  }

  /** Append a transition record; the gap's state field is set to `to`. */
  private append(
    gap: CapabilityGap,
    from: CapabilityGap['state'] | 'absent',
    to: CapabilityGap['state'],
    reason?: string,
  ): void {
    const seq = this.nextSeq(gap.id);
    const at = new Date().toISOString();
    const transition: GapTransition = { gapId: gap.id, from, to, at };
    if (reason !== undefined) transition.reason = reason;
    const record: GapRecord = {
      kind: 'gap-record',
      namespace: this.namespace,
      gapId: gap.id,
      seq,
      state: to,
      gap: { ...gap, state: to },
      transition,
    };
    this.store.put(record);
  }

  private nextSeq(gapId: string): number {
    const records = this.recordsFor(gapId);
    const last = records[records.length - 1];
    return last ? last.seq + 1 : 1;
  }

  /** Latest state for a gap, or null when unknown. Pure fold over records. */
  private latestFor(gapId: string): GapRecord | null {
    const records = this.recordsFor(gapId);
    return records.length > 0 ? records[records.length - 1]! : null;
  }

  /** Latest gap per known id, unsorted. */
  private latest(): CapabilityGap[] {
    const byId = new Map<string, GapRecord>();
    for (const record of this.records()) byId.set(record.gapId, record);
    return [...byId.values()].map((r) => r.gap);
  }

  /** All records in this namespace, ordered by (gapId, seq). */
  private records(): GapRecord[] {
    return this.store
      .ids()
      .map((id) => this.store.get<GapRecord>(id))
      .filter((r): r is GapRecord => isGapRecord(r, this.namespace))
      .sort(compareRecords);
  }

  private recordsFor(gapId: string): GapRecord[] {
    return this.records().filter((r) => r.gapId === gapId);
  }
}

/* -------------------------------------------------------------------- utils -- */

const GAP_STATES: ReadonlySet<unknown> = new Set<CapabilityGap['state']>([
  'open',
  'accepted',
  'closed',
]);

function isGapRecord(value: unknown, namespace: string): value is GapRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<GapRecord>;
  return (
    r.kind === 'gap-record' &&
    r.namespace === namespace &&
    typeof r.gapId === 'string' &&
    typeof r.seq === 'number' &&
    GAP_STATES.has(r.state) &&
    !!r.gap &&
    !!r.transition
  );
}

function compareRecords(a: GapRecord, b: GapRecord): number {
  return a.gapId.localeCompare(b.gapId) || a.seq - b.seq;
}

function compareForQueue(a: CapabilityGap, b: CapabilityGap): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.id.localeCompare(b.id);
}

/**
 * Whether two observations describe the same gap *logically*. Provenance that
 * changes on every run (audit run id, snapshot, timestamp) is excluded so
 * re-observing an unchanged gap is idempotent; the evidence trail IS compared,
 * because new facts on a known gap are a genuine update worth recording.
 */
function sameGap(a: CapabilityGap, b: CapabilityGap): boolean {
  return canonicalJson(stableIdentity(a)) === canonicalJson(stableIdentity(b));
}

/** The parts of a gap that decide whether it is "the same, unchanged" gap. */
function stableIdentity(gap: CapabilityGap): Record<string, unknown> {
  return {
    id: gap.id,
    kind: gap.kind,
    target: gap.target,
    problem: gap.problem,
    requiredCapability: gap.requiredCapability,
    priority: gap.priority,
    state: gap.state,
    evidence: gap.evidence,
  };
}
