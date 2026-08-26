// Chord and phrase bookkeeping.
//
// A note "resolves" the moment it leaves the pending state, whether it was
// hit, missed, skipped by a practice loop or started as a hold. A chord pays
// once every note of its event resolved without a miss; a phrase pays once
// every note carrying its id resolved without a miss and without a skip. What
// happens to a hold after its head is irrelevant to both, so dropping a tail
// never costs a Perfect Passage.

import type { CompiledChart } from "../charts/ChartTypes";
import type { NoteRuntime, NoteState } from "./NoteScheduler";

const TRILL_PREFIX = "trill-";

export function isTrillPhrase(phraseId: string): boolean {
  return phraseId.startsWith(TRILL_PREFIX);
}

interface Tracker {
  total: number;
  resolved: number;
  blocked: boolean;
  paid: boolean;
}

export interface ChordHandlers {
  onChord(eventId: string): void;
  onPhrase(phraseId: string, trill: boolean): void;
}

function blocks(state: NoteState): boolean {
  return state === "missed" || state === "skipped";
}

function newTracker(): Tracker {
  return { total: 0, resolved: 0, blocked: false, paid: false };
}

export class ChordSystem {
  private readonly chords = new Map<string, Tracker>();
  private readonly phrases = new Map<string, Tracker>();
  private readonly trills = new Set<string>();

  constructor(
    chart: CompiledChart,
    private readonly handlers: ChordHandlers,
  ) {
    for (const event of chart.events) {
      // Single notes have nothing to synchronise, so only real chords are tracked.
      if (event.lanes.length > 1) this.chords.set(event.id, newTracker());
    }
    for (const note of chart.notes) {
      const chord = this.chords.get(note.eventId);
      if (chord) chord.total++;
      const phraseId = note.phraseId;
      if (phraseId === undefined) continue;
      let phrase = this.phrases.get(phraseId);
      if (!phrase) {
        phrase = newTracker();
        this.phrases.set(phraseId, phrase);
        if (isTrillPhrase(phraseId)) this.trills.add(phraseId);
      }
      phrase.total++;
    }
  }

  get chordCount(): number {
    return this.chords.size;
  }

  get phraseCount(): number {
    return this.phrases.size - this.trills.size;
  }

  get trillCount(): number {
    return this.trills.size;
  }

  /** Called once for every note that leaves the pending state. */
  resolve(note: NoteRuntime): void {
    const chord = this.chords.get(note.note.eventId);
    if (chord) {
      this.mark(chord, note.state);
      if (this.ready(chord)) {
        chord.paid = true;
        this.handlers.onChord(note.note.eventId);
      }
    }
    const phraseId = note.note.phraseId;
    if (phraseId === undefined) return;
    const phrase = this.phrases.get(phraseId);
    if (!phrase) return;
    this.mark(phrase, note.state);
    if (this.ready(phrase)) {
      phrase.paid = true;
      this.handlers.onPhrase(phraseId, this.trills.has(phraseId));
    }
  }

  /**
   * Recounts every tracker from the current note states, without paying
   * anything. A chord or phrase that lost a note to a practice loop can be
   * earned again; one that is still complete keeps its bonus.
   */
  rebuild(notes: readonly NoteRuntime[]): void {
    for (const tracker of this.chords.values()) this.clear(tracker);
    for (const tracker of this.phrases.values()) this.clear(tracker);
    for (const note of notes) {
      if (note.state === "pending") continue;
      const chord = this.chords.get(note.note.eventId);
      if (chord) this.mark(chord, note.state);
      const phraseId = note.note.phraseId;
      if (phraseId === undefined) continue;
      const phrase = this.phrases.get(phraseId);
      if (phrase) this.mark(phrase, note.state);
    }
    for (const tracker of this.chords.values()) this.settle(tracker);
    for (const tracker of this.phrases.values()) this.settle(tracker);
  }

  reset(): void {
    for (const tracker of this.chords.values()) {
      this.clear(tracker);
      tracker.paid = false;
    }
    for (const tracker of this.phrases.values()) {
      this.clear(tracker);
      tracker.paid = false;
    }
  }

  private mark(tracker: Tracker, state: NoteState): void {
    tracker.resolved++;
    if (blocks(state)) tracker.blocked = true;
  }

  private ready(tracker: Tracker): boolean {
    return !tracker.paid && !tracker.blocked && tracker.resolved >= tracker.total;
  }

  private clear(tracker: Tracker): void {
    tracker.resolved = 0;
    tracker.blocked = false;
  }

  private settle(tracker: Tracker): void {
    if (tracker.resolved < tracker.total) tracker.paid = false;
  }
}
