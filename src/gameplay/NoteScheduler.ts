// Note runtime state, the per-lane press cursors, the auto-miss sweep and the
// slice of the chart the renderer draws.
//
// The cursors are hints only: they walk past notes that have left the pending
// state and never assume notes are consumed in order, so a seek, a practice
// loop or a key event that arrives out of order cannot desynchronise them.

import { LAYOUT, type Judgment } from "../app/Config";
import { LANES, type CompiledChart, type Lane, type NoteInstance } from "../charts/ChartTypes";

export type NoteState = "pending" | "skipped" | "hit" | "missed" | "holding" | "holdDone" | "holdDropped";

export interface NoteRuntime {
  readonly note: NoteInstance;
  state: NoteState;
  judgment: Judgment | null;
  /** Signed timing delta of the press that resolved the note, positive = late. */
  deltaMs: number;
  /** Corrected song time at which the note resolved. */
  hitSongMs: number;
  holdTicksPaid: number;
  /** 0..1 along the hold tail, frozen where a dropped hold was released. */
  holdProgress: number;
}

/** What the renderer reads. Instances are reused between frames. */
export interface NoteView {
  note: NoteInstance;
  state: NoteState;
  judgment?: Judgment;
  hitSongMs?: number;
  holdProgress: number;
}

export type MissHandler = (note: NoteRuntime, atSongMs: number) => void;

function makeRuntime(note: NoteInstance): NoteRuntime {
  return { note, state: "pending", judgment: null, deltaMs: 0, hitSongMs: 0, holdTicksPaid: 0, holdProgress: 0 };
}

export class NoteScheduler {
  /** Every note of the chart, sorted by time then lane. */
  readonly notes: NoteRuntime[];

  private readonly laneNotes: NoteRuntime[][];
  private readonly laneCursor: number[];
  private missCursor = 0;
  private skipped = 0;
  /** Longest hold tail in the chart, so the visible window can start its scan early enough. */
  private readonly maxTailMs: number;

  constructor(chart: CompiledChart) {
    this.notes = chart.notes.map(makeRuntime).sort((a, b) => a.note.timeMs - b.note.timeMs || a.note.lane - b.note.lane);
    this.laneNotes = LANES.map((lane) => this.notes.filter((n) => n.note.lane === lane));
    this.laneCursor = LANES.map(() => 0);
    let tail = 0;
    for (const n of this.notes) tail = Math.max(tail, n.note.durationMs);
    this.maxTailMs = tail;
  }

  get skippedCount(): number {
    return this.skipped;
  }

  /**
   * Earliest pending note in the lane whose distance from `t` is inside the
   * miss window, or null when the press belongs to no note.
   */
  candidate(lane: Lane, t: number, missWindowMs: number): NoteRuntime | null {
    const list = this.laneNotes[lane];
    let cursor = this.laneCursor[lane];
    while (cursor < list.length && list[cursor].state !== "pending") cursor++;
    this.laneCursor[lane] = cursor;
    for (let i = cursor; i < list.length; i++) {
      const entry = list[i];
      if (entry.note.timeMs > t + missWindowMs) return null;
      if (entry.state !== "pending") continue;
      if (entry.note.timeMs >= t - missWindowMs) return entry;
    }
    return null;
  }

  /**
   * Auto-misses every pending note that `t` has left behind, oldest first. A
   * `t` earlier than the last sweep is a no-op because the cursor never walks
   * backwards on its own.
   */
  sweep(t: number, missWindowMs: number, onMiss: MissHandler): void {
    while (this.missCursor < this.notes.length) {
      const entry = this.notes[this.missCursor];
      if (entry.note.timeMs + missWindowMs >= t) break;
      this.missCursor++;
      if (entry.state === "pending") onMiss(entry, t);
    }
  }

  /** Pending notes before `songMs` stop counting; a practice loop skips over them. */
  skipBefore(songMs: number, onSkip: (note: NoteRuntime) => void): number {
    let count = 0;
    for (let i = 0; i < this.notes.length; i++) {
      const entry = this.notes[i];
      if (entry.note.timeMs >= songMs) break;
      if (entry.state !== "pending") continue;
      entry.state = "skipped";
      this.skipped++;
      count++;
      onSkip(entry);
    }
    return count;
  }

  /** Everything from `songMs` on goes back on the highway. */
  rearmFrom(songMs: number, onRearm: (note: NoteRuntime) => void): number {
    let count = 0;
    for (let i = this.firstIndexAtOrAfter(songMs); i < this.notes.length; i++) {
      const entry = this.notes[i];
      if (entry.state === "pending") continue;
      if (entry.state === "skipped") this.skipped--;
      else onRearm(entry);
      this.clearRuntime(entry);
      count++;
    }
    this.rebuildCursors();
    return count;
  }

  reset(): void {
    for (const entry of this.notes) this.clearRuntime(entry);
    this.skipped = 0;
    this.rebuildCursors();
  }

  rebuildCursors(): void {
    this.missCursor = 0;
    for (const lane of LANES) this.laneCursor[lane] = 0;
  }

  /**
   * Fills `out` with the notes on screen at `displayMs` and returns how many.
   * Far notes come first so the caller can paint near ones over them. Nothing
   * is allocated once `out` has grown to its working size.
   */
  visibleNotes(displayMs: number, approachMs: number, out: NoteView[]): number {
    const back = displayMs - LAYOUT.pastGateFraction * approachMs;
    const front = displayMs + approachMs;
    const first = this.firstIndexAtOrAfter(back - this.maxTailMs);
    const last = this.firstIndexAfter(front);
    let count = 0;
    for (let i = last - 1; i >= first; i--) {
      const entry = this.notes[i];
      if (entry.note.timeMs + entry.note.durationMs < back) continue;
      let view = out[count];
      if (view === undefined) {
        view = { note: entry.note, state: entry.state, holdProgress: 0 };
        out[count] = view;
      }
      view.note = entry.note;
      view.state = entry.state;
      view.holdProgress = entry.holdProgress;
      view.judgment = entry.judgment ?? undefined;
      view.hitSongMs = entry.judgment === null ? undefined : entry.hitSongMs;
      count++;
    }
    return count;
  }

  private clearRuntime(entry: NoteRuntime): void {
    entry.state = "pending";
    entry.judgment = null;
    entry.deltaMs = 0;
    entry.hitSongMs = 0;
    entry.holdTicksPaid = 0;
    entry.holdProgress = 0;
  }

  /** First index whose note starts at or after `t`. */
  private firstIndexAtOrAfter(t: number): number {
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid].note.timeMs < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** First index whose note starts strictly after `t`. */
  private firstIndexAfter(t: number): number {
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid].note.timeMs <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
