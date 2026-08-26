// Held notes: which lane holds what, when the next tick is due and how a hold
// ends.
//
// Ticks are anchored to the chart rather than to the press, so tick k of a
// hold is always due at timeMs + k * interval. A completed hold therefore pays
// exactly floor(durationMs / interval) ticks whether the player released it on
// the last millisecond or let the song run past the tail.

import { SCORE_CONFIG } from "../app/Config";
import { LANES, type Lane } from "../charts/ChartTypes";
import type { NoteRuntime } from "./NoteScheduler";

export interface HoldHandlers {
  onTick(note: NoteRuntime): void;
  onEnd(note: NoteRuntime, completed: boolean, quiet: boolean): void;
}

export function holdTickCount(durationMs: number): number {
  return Math.floor(durationMs / SCORE_CONFIG.holdTickIntervalMs);
}

export class HoldNoteSystem {
  private readonly holding: (NoteRuntime | null)[] = LANES.map(() => null);
  /** Mutated in place for the snapshot. */
  readonly holdingLanes: boolean[] = LANES.map(() => false);

  constructor(private readonly handlers: HoldHandlers) {}

  get activeCount(): number {
    let count = 0;
    for (const entry of this.holding) if (entry !== null) count++;
    return count;
  }

  noteInLane(lane: Lane): NoteRuntime | null {
    return this.holding[lane];
  }

  start(note: NoteRuntime, t: number): void {
    note.state = "holding";
    note.holdTicksPaid = 0;
    note.holdProgress = 0;
    this.holding[note.note.lane] = note;
    this.holdingLanes[note.note.lane] = true;
    this.payDue(note, t);
  }

  /** Pays the ticks that have come due and closes holds the song has passed. */
  update(t: number): void {
    for (const lane of LANES) {
      const note = this.holding[lane];
      if (note === null) continue;
      this.payDue(note, t);
      if (t >= this.endOf(note)) this.complete(note);
    }
  }

  /** Ends the hold in this lane, if there is one. Returns true when one ended. */
  release(lane: Lane, t: number): boolean {
    const note = this.holding[lane];
    if (note === null) return false;
    this.payDue(note, t);
    if (t >= this.endOf(note) - SCORE_CONFIG.holdReleaseGraceMs) this.complete(note);
    else this.drop(note);
    return true;
  }

  /** Drops every hold without a penalty, for pauses, seeks and leaving a track. */
  cancelAll(): void {
    for (const lane of LANES) {
      const note = this.holding[lane];
      if (note === null) continue;
      note.state = "holdDropped";
      this.clear(note);
      this.handlers.onEnd(note, false, true);
    }
  }

  reset(): void {
    for (const lane of LANES) {
      this.holding[lane] = null;
      this.holdingLanes[lane] = false;
    }
  }

  private endOf(note: NoteRuntime): number {
    return note.note.timeMs + note.note.durationMs;
  }

  private payDue(note: NoteRuntime, t: number): void {
    const end = this.endOf(note);
    const limit = t < end ? t : end;
    const total = holdTickCount(note.note.durationMs);
    while (note.holdTicksPaid < total) {
      const due = note.note.timeMs + (note.holdTicksPaid + 1) * SCORE_CONFIG.holdTickIntervalMs;
      if (due > limit) break;
      note.holdTicksPaid++;
      this.handlers.onTick(note);
    }
    const progress = (t - note.note.timeMs) / note.note.durationMs;
    note.holdProgress = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  }

  private complete(note: NoteRuntime): void {
    const total = holdTickCount(note.note.durationMs);
    while (note.holdTicksPaid < total) {
      note.holdTicksPaid++;
      this.handlers.onTick(note);
    }
    note.state = "holdDone";
    note.holdProgress = 1;
    this.clear(note);
    this.handlers.onEnd(note, true, false);
  }

  /** Early release. payDue has already left holdProgress where the tail stops. */
  private drop(note: NoteRuntime): void {
    note.state = "holdDropped";
    this.clear(note);
    this.handlers.onEnd(note, false, false);
  }

  private clear(note: NoteRuntime): void {
    this.holding[note.note.lane] = null;
    this.holdingLanes[note.note.lane] = false;
  }
}
