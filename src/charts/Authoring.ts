// Compact text notation for arrangements and charts.
//
// Music:   melody(0, "E4/1 E4 F4 G4 | G4 F4 E4 D4 | C4+E4/2 r/1 G3@0.5/1")
//   token = pitch[+pitch...][@velocity][/durationBeats]
//   pitch = letter A-G, optional # or b, octave number (C4 = middle C, 60)
//   "r" is a rest, "|" is ignored, a missing duration repeats the previous one
//   (initially 1). Percussion parts use drum names: k s h oh t cr rd cl.
//
// Chart:   lanes(0, "0/1 1 2 [0,2]/1 1h/2 &3h/2 r/1 4!/0.5", "phrase-a")
//   token = laneSpec[h][!][/durationBeats]   laneSpec = digit or [d,d,...]
//   "h" makes a hold whose length is the token duration, "!" marks an accent,
//   "&" in front of a token places it on the same beat as the previous token,
//   "r" is a rest. The beat advances by the token's duration.

import {
  DRUM,
  type ArrangementNote,
  type ArrangementPart,
  type BeatChart,
  type BeatEvent,
  type Difficulty,
  type InstrumentId,
  type Lane,
  isLane,
} from "./ChartTypes";

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const DRUM_NAMES: Record<string, number> = {
  k: DRUM.kick,
  s: DRUM.snare,
  h: DRUM.hat,
  oh: DRUM.openHat,
  t: DRUM.tom,
  cr: DRUM.crash,
  rd: DRUM.ride,
  cl: DRUM.click,
};

/** "C4" -> 60, "F#3" -> 54, "Bb5" -> 82. */
export function pitchToMidi(name: string): number {
  const m = /^([A-Ga-g])(#{1,2}|b{1,2})?(-?\d)$/.exec(name.trim());
  if (!m) {
    const drum = DRUM_NAMES[name.trim()];
    if (drum !== undefined) return drum;
    throw new Error(`Bad pitch "${name}"`);
  }
  const letter = m[1].toUpperCase();
  const acc = m[2] ?? "";
  const octave = parseInt(m[3], 10);
  let semis = PITCH_CLASS[letter];
  for (const ch of acc) semis += ch === "#" ? 1 : -1;
  const midi = (octave + 1) * 12 + semis;
  if (midi < 0 || midi > 127) throw new Error(`Pitch "${name}" is out of MIDI range`);
  return midi;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToPitch(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${octave}`;
}

export interface MelodyResult {
  notes: ArrangementNote[];
  /** Beat after the last token, including trailing rests. */
  endBeat: number;
}

/**
 * Parse music notation starting at `startBeat`. Chords are written with "+".
 * Velocity is 0..1 and sticks until changed (default 0.8).
 */
export function melody(startBeat: number, text: string, defaultVelocity = 0.8): MelodyResult {
  const notes: ArrangementNote[] = [];
  let beat = startBeat;
  let duration = 1;
  let velocity = defaultVelocity;
  const tokens = text.split(/\s+/).filter((t) => t.length > 0 && t !== "|");
  for (const token of tokens) {
    let body = token;
    let dur = duration;
    const slash = body.lastIndexOf("/");
    if (slash >= 0) {
      dur = parseFloat(body.slice(slash + 1));
      if (!(dur > 0)) throw new Error(`Bad duration in "${token}"`);
      body = body.slice(0, slash);
    }
    const at = body.indexOf("@");
    let vel = velocity;
    if (at >= 0) {
      vel = parseFloat(body.slice(at + 1));
      if (!(vel >= 0 && vel <= 1)) throw new Error(`Bad velocity in "${token}"`);
      body = body.slice(0, at);
      velocity = vel;
    }
    duration = dur;
    if (body === "r") {
      beat += dur;
      continue;
    }
    for (const p of body.split("+")) {
      notes.push({ beat, durationBeats: dur, midi: pitchToMidi(p), velocity: vel });
    }
    beat += dur;
  }
  return { notes, endBeat: beat };
}

/** Concatenate the note lists of several melody() results (or plain arrays). */
export function join(...parts: Array<MelodyResult | ArrangementNote[]>): ArrangementNote[] {
  const out: ArrangementNote[] = [];
  for (const p of parts) out.push(...(Array.isArray(p) ? p : p.notes));
  return out.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

export function shiftNotes(notes: readonly ArrangementNote[], beats: number): ArrangementNote[] {
  return notes.map((n) => ({ ...n, beat: n.beat + beats }));
}

export function transposeNotes(notes: readonly ArrangementNote[], semitones: number): ArrangementNote[] {
  return notes.map((n) => ({ ...n, midi: n.midi + semitones }));
}

/** Repeat a passage `times` times, each copy `lengthBeats` later than the last. */
export function repeatNotes(
  notes: readonly ArrangementNote[],
  times: number,
  lengthBeats: number,
): ArrangementNote[] {
  const out: ArrangementNote[] = [];
  for (let i = 0; i < times; i++) out.push(...shiftNotes(notes, i * lengthBeats));
  return out;
}

export function part(
  id: string,
  instrument: InstrumentId,
  notes: readonly ArrangementNote[] | MelodyResult,
  opts: { gain?: number; pan?: number } = {},
): ArrangementPart {
  const list = "notes" in notes ? notes.notes : notes;
  return {
    id,
    instrument,
    notes: [...list].sort((a, b) => a.beat - b.beat || a.midi - b.midi),
    gain: opts.gain,
    pan: opts.pan,
  };
}

export function lastBeat(notes: readonly ArrangementNote[]): number {
  let end = 0;
  for (const n of notes) end = Math.max(end, n.beat + n.durationBeats);
  return end;
}

// ---------------------------------------------------------------------------
// Chart notation
// ---------------------------------------------------------------------------

function parseLaneSpec(spec: string, token: string): Lane[] {
  const raw = spec.startsWith("[") ? spec.slice(1, -1).split(",") : [spec];
  const lanes = raw.map((s) => {
    const n = parseInt(s.trim(), 10);
    if (!isLane(n)) throw new Error(`Bad lane in "${token}"`);
    return n;
  });
  return lanes;
}

/**
 * Parse chart notation starting at `startBeat`. Returns the events in order.
 * Every event gets `phraseId` when one is given.
 */
export function lanes(startBeat: number, text: string, phraseId?: string): BeatEvent[] {
  const events: BeatEvent[] = [];
  let beat = startBeat;
  let duration = 1;
  let prevBeat = startBeat;
  const tokens = text.split(/\s+/).filter((t) => t.length > 0 && t !== "|");
  for (const token of tokens) {
    let body = token;
    let sameBeat = false;
    if (body.startsWith("&")) {
      sameBeat = true;
      body = body.slice(1);
    }
    let dur = duration;
    const slash = body.lastIndexOf("/");
    if (slash >= 0) {
      dur = parseFloat(body.slice(slash + 1));
      if (!(dur > 0)) throw new Error(`Bad duration in "${token}"`);
      body = body.slice(0, slash);
    }
    duration = dur;
    if (body === "r") {
      beat += dur;
      continue;
    }
    let accent = false;
    let hold = false;
    while (body.endsWith("!") || body.endsWith("h")) {
      if (body.endsWith("!")) accent = true;
      else hold = true;
      body = body.slice(0, -1);
    }
    const laneList = parseLaneSpec(body, token);
    if (hold && laneList.length > 1) {
      throw new Error(`Chords cannot be held in "${token}"; write separate "&" hold tokens`);
    }
    const at = sameBeat ? prevBeat : beat;
    const ev: BeatEvent = { beat: at, lanes: laneList };
    if (hold) ev.durationBeats = dur;
    if (accent) ev.accent = true;
    if (phraseId) ev.phraseId = phraseId;
    events.push(ev);
    prevBeat = at;
    if (!sameBeat) beat += dur;
  }
  return events;
}

/** Shorthand for lanes() with a phrase id. */
export function phrase(id: string, startBeat: number, text: string): BeatEvent[] {
  return lanes(startBeat, text, id);
}

export function shiftEvents(events: readonly BeatEvent[], beats: number): BeatEvent[] {
  return events.map((e) => ({ ...e, beat: e.beat + beats }));
}

/** Merge event lists into one chart, sorted by beat then lane. */
export function chart(difficulty: Difficulty, ...groups: Array<readonly BeatEvent[]>): BeatChart {
  const events: BeatEvent[] = [];
  for (const g of groups) events.push(...g);
  events.sort((a, b) => a.beat - b.beat || a.lanes[0] - b.lanes[0]);
  return { difficulty, events };
}
