// Chart, arrangement and track types.
//
// Tracks are authored in beats (see Authoring.ts for the compact notation) and
// compiled to milliseconds by BeatMapper/ChartLoader. Everything the game
// plays from at runtime is a TrackChart, which has ms timestamps only.

export type Lane = 0 | 1 | 2 | 3 | 4;
export const LANES: readonly Lane[] = [0, 1, 2, 3, 4];

export type Difficulty = "novice" | "apprentice" | "virtuoso" | "maestro";
export const DIFFICULTIES: readonly Difficulty[] = ["novice", "apprentice", "virtuoso", "maestro"];

export type EventType = "single" | "chord" | "hold";

export type InstrumentId =
  | "piano"
  | "harpsichord"
  | "strings"
  | "organ"
  | "bass"
  | "pluck"
  | "bell"
  | "percussion";

export const INSTRUMENT_IDS: readonly InstrumentId[] = [
  "piano",
  "harpsichord",
  "strings",
  "organ",
  "bass",
  "pluck",
  "bell",
  "percussion",
];

// Percussion "pitches". The synth maps these to noise/envelope voices.
export const DRUM = {
  kick: 36,
  snare: 38,
  hat: 42,
  openHat: 46,
  tom: 45,
  crash: 49,
  ride: 51,
  click: 37,
} as const;

export interface TempoChange {
  /** Beat at which the new tempo takes effect. The first entry must be at beat 0. */
  beat: number;
  bpm: number;
}

/**
 * Metadata for one catalog entry. `durationMs` is filled in by the compiler
 * from the arrangement, so authors provide `TrackMetadataSource` instead.
 */
export interface TrackMetadata {
  id: string;
  /** 1-based position in the catalog. */
  order: number;
  title: string;
  composer: string;
  composerShort: string;
  catalogNumber?: string;
  /** Attribution caveats, e.g. a piece long credited to one composer but written by another. */
  attributionNote?: string;
  movementOrExcerpt: string;
  /** Initial tempo (beats per minute, where a beat is the denominator of the time signature). */
  bpm: number;
  timeSignature: [number, number];
  durationMs: number;
  /** Headline difficulty shown in the library. */
  difficulty: Difficulty;
  /** Short description of the synth arrangement, e.g. "Bright harpsichord and chamber synth". */
  arrangementStyle: string;
  arrangementCredit: string;
  scoreSourceCredit: string;
  licenseNotes: string;
  /** Track id that must be completed before this one unlocks. Absent means unlocked from the start. */
  unlockAfter?: string;
}

export type TrackMetadataSource = Omit<TrackMetadata, "durationMs">;

export interface ArrangementNote {
  beat: number;
  durationBeats: number;
  /** MIDI note number 0..127. For percussion parts use the DRUM constants. */
  midi: number;
  /** 0..1, defaults to 0.8. */
  velocity?: number;
}

export interface ArrangementPart {
  id: string;
  instrument: InstrumentId;
  notes: ArrangementNote[];
  /** Linear gain multiplier for the part, default 1. */
  gain?: number;
  /** Stereo pan -1..1, default 0. */
  pan?: number;
}

export interface Arrangement {
  parts: ArrangementPart[];
}

/** One chart event authored in beats. */
export interface BeatEvent {
  beat: number;
  lanes: Lane[];
  /** Inferred when absent: two or more lanes is a chord, a duration is a hold, otherwise single. */
  type?: EventType;
  durationBeats?: number;
  /** Events sharing a phraseId form a phrase; completing every event in it awards a bonus. */
  phraseId?: string;
  accent?: boolean;
}

export interface BeatChart {
  difficulty: Difficulty;
  events: BeatEvent[];
}

export interface SectionSource {
  name: string;
  startBeat: number;
  endBeat: number;
}

/** What a track module exports. Everything in beats. */
export interface TrackDefinition {
  metadata: TrackMetadataSource;
  tempoMap: TempoChange[];
  sections: SectionSource[];
  arrangement: Arrangement;
  charts: Partial<Record<Difficulty, BeatChart>>;
}

// ---------------------------------------------------------------------------
// Compiled (millisecond) forms
// ---------------------------------------------------------------------------

export interface ChartEvent {
  id: string;
  timeMs: number;
  type: EventType;
  lanes: Lane[];
  /** 0 for singles and chords; anything else on one of those is a validation error. */
  durationMs: number;
  phraseId?: string;
  accent?: boolean;
  beat: number;
  /** 1-based measure number. */
  measure: number;
}

/**
 * One judgeable note. Chords expand to one NoteInstance per lane, all sharing
 * the same eventId; the chord bonus is decided at the event level.
 */
export interface NoteInstance {
  id: string;
  eventId: string;
  index: number;
  timeMs: number;
  lane: Lane;
  durationMs: number;
  isHold: boolean;
  chordSize: number;
  phraseId?: string;
  accent: boolean;
}

export interface ChartStats {
  eventCount: number;
  noteCount: number;
  singleCount: number;
  chordCount: number;
  holdCount: number;
  phraseCount: number;
  /** Highest number of notes inside any one-second window. */
  peakNotesPerSecond: number;
  firstNoteMs: number;
  lastNoteMs: number;
}

export interface CompiledChart {
  difficulty: Difficulty;
  events: ChartEvent[];
  notes: NoteInstance[];
  stats: ChartStats;
}

export interface Section {
  name: string;
  startMs: number;
  endMs: number;
  startBeat: number;
  endBeat: number;
}

export interface BeatMark {
  beat: number;
  timeMs: number;
  measure: number;
  beatInMeasure: number;
  isDownbeat: boolean;
}

export interface ScheduledNote {
  timeMs: number;
  durationMs: number;
  midi: number;
  velocity: number;
  instrument: InstrumentId;
  partId: string;
  gain: number;
  pan: number;
}

/** A fully compiled track: what the transport, judge and renderer consume. */
export interface TrackChart {
  metadata: TrackMetadata;
  tempoMap: TempoChange[];
  sections: Section[];
  beatGrid: BeatMark[];
  music: ScheduledNote[];
  charts: Partial<Record<Difficulty, CompiledChart>>;
}

export function inferEventType(ev: BeatEvent): EventType {
  if (ev.type) return ev.type;
  if (ev.lanes.length > 1) return "chord";
  if ((ev.durationBeats ?? 0) > 0) return "hold";
  return "single";
}

export function isLane(n: number): n is Lane {
  return Number.isInteger(n) && n >= 0 && n <= 4;
}
