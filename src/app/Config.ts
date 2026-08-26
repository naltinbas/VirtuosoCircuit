import type { Difficulty, Lane } from "../charts/ChartTypes";

// Timing windows in ms. A press is graded against the nearest unjudged note in
// its lane; |delta| within `faint` counts as a hit, within `miss` counts as a
// consumed miss (too early or too late), beyond that the press is ignored.
// A note with no press is auto-missed once song time passes timeMs + miss.
export const JUDGMENT_WINDOWS_MS = {
  radiant: 35,
  precise: 75,
  good: 120,
  faint: 165,
  miss: 200,
} as const;

export type Judgment = "radiant" | "precise" | "good" | "faint" | "miss";
export const JUDGMENTS: readonly Judgment[] = ["radiant", "precise", "good", "faint", "miss"];

export const JUDGMENT_LABELS: Record<Judgment, string> = {
  radiant: "Radiant",
  precise: "Precise",
  good: "Good",
  faint: "Faint",
  miss: "Miss",
};

export const SCORE_CONFIG = {
  radiant: 1000,
  precise: 750,
  good: 450,
  faint: 150,
  miss: 0,
  holdTick: 35,
  holdTickIntervalMs: 100,
  chordCompletionBonus: 250,
  /** Chord bonus only if every lane of the chord was hit within this many ms of each other. */
  chordSyncWindowMs: 80,
  phraseCompletionBonus: 750,
  maxMultiplier: 8,
  multiplierStepEvery: 10,
  focusSurgeMultiplier: 2,
  focusSurgeDurationMs: 8000,
} as const;

/** Weight of each judgment when computing the accuracy percentage. */
export const ACCURACY_WEIGHTS: Record<Judgment, number> = {
  radiant: 1,
  precise: 0.9,
  good: 0.65,
  faint: 0.3,
  miss: 0,
};

export type Seal = "S" | "A" | "B" | "C" | "D" | "unfinished";

export const SEAL_THRESHOLDS = {
  /** Accuracy floor for S, plus a miss cap. */
  S: { accuracy: 97, maxMisses: 3 },
  A: { accuracy: 92 },
  B: { accuracy: 85 },
  C: { accuracy: 75 },
} as const;

export const AURA_CONFIG = {
  start: 50,
  max: 100,
  radiant: 1.5,
  precise: 1.0,
  good: 0.5,
  faint: 0.1,
  miss: -5,
  earlyRelease: -2,
  phraseComplete: 4,
  chordComplete: 1,
  /** Bonus on the first hit after this many consecutive misses (the "Recenter"). */
  recenterAfterMisses: 3,
  recenterBonus: 3,
  warningBelow: 20,
  /** How much aura the Focus Surge burns over its duration. */
  focusSurgeCost: 50,
} as const;

export const CALIBRATION_RANGE_MS = {
  min: -250,
  max: 250,
  step: 1,
} as const;

export const GUIDED_CALIBRATION = {
  bpm: 100,
  minTaps: 12,
  maxTaps: 24,
  /** Taps further than this from the beat are ignored outright. */
  rejectBeyondMs: 180,
} as const;

export const KEYMAP_PRESETS = {
  default: ["KeyA", "KeyS", "KeyD", "KeyJ", "KeyK"],
  compactLeft: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG"],
  splitHands: ["KeyA", "KeyS", "KeyD", "KeyJ", "KeyK"],
  arrows: ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight", "Enter"],
} as const;

export type KeymapPresetName = keyof typeof KEYMAP_PRESETS;

/** Secondary bindings that are always active in addition to the player's primary map. */
export const ALTERNATE_LANE_KEYS: readonly (readonly string[])[] = [
  ["ArrowLeft"],
  ["ArrowDown"],
  ["ArrowUp"],
  ["ArrowRight"],
  ["Enter", "ShiftRight"],
];

/** Keys that must never be bound to a lane. */
export const RESERVED_KEYS: readonly string[] = [
  "Escape",
  "F1",
  "F3",
  "F5",
  "F11",
  "F12",
  "Tab",
  "KeyR",
  "KeyP",
  "Space",
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
];

export const GAME_KEYS = {
  pause: ["Escape", "KeyP"],
  restart: ["KeyR"],
  practiceMenu: ["Tab"],
  perfOverlay: ["F1"],
  debugOverlay: ["F3"],
  focusSurge: ["Space"],
} as const;

export interface LaneIdentity {
  index: Lane;
  name: string;
  symbol: "triangle" | "diamond" | "circle" | "square" | "star";
  color: string;
  highContrastColor: string;
  glyph: string;
}

// Deep navy background, lanes in violet / teal / amber / ivory / coral.
// Shape is the primary identity; color is secondary.
export const LANE_IDENTITIES: readonly LaneIdentity[] = [
  { index: 0, name: "Spire", symbol: "triangle", color: "#9b7bff", highContrastColor: "#c9b8ff", glyph: "▲" },
  { index: 1, name: "Prism", symbol: "diamond", color: "#3fd8c7", highContrastColor: "#7ffff0", glyph: "◆" },
  { index: 2, name: "Halo", symbol: "circle", color: "#ffb84d", highContrastColor: "#ffd98a", glyph: "●" },
  { index: 3, name: "Tile", symbol: "square", color: "#f3f0ff", highContrastColor: "#ffffff", glyph: "■" },
  { index: 4, name: "Nova", symbol: "star", color: "#ff7a6b", highContrastColor: "#ffa89e", glyph: "★" },
];

export const THEME_COLORS = {
  navy: "#070b1f",
  navyLight: "#111a3d",
  violet: "#7b5cff",
  teal: "#2fc9b9",
  amber: "#ffb547",
  white: "#f5f3ff",
  textMuted: "#9aa3c7",
} as const;

export const HIGHWAY = {
  /** Time a note spends travelling from spawn to the gate, in ms. */
  approachMsDefault: 2000,
  approachMsMin: 1200,
  approachMsMax: 3200,
  approachMsStep: 100,
  /** Countdown before song time reaches 0 when a performance starts. */
  countdownMs: 3000,
  /** Silence appended after the final note before the track counts as complete. */
  outroMs: 2500,
  /** Song time at which the practice loop re-enters relative to the loop start. */
  practicePrerollMs: 1500,
} as const;

export const PRACTICE_SPEEDS: readonly number[] = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

/** Chart density and ergonomics limits, checked by ChartValidator. */
export interface DensityLimits {
  /** Highest notes per second across any 1s window. */
  maxNotesPerSecond: number;
  /** Minimum ms between consecutive notes in the same lane (measured from hold end where applicable). */
  minSameLaneGapMs: number;
  /** Minimum ms between consecutive events in any lanes (chords count as one event). */
  minEventGapMs: number;
  /** Largest chord. */
  maxChordSize: number;
  /** Most keys that may need to be down at once (held notes plus a new chord). */
  maxSimultaneousKeys: number;
  /** Shortest hold in ms. */
  minHoldMs: number;
}

export const DENSITY_LIMITS: Record<Difficulty, DensityLimits> = {
  novice: {
    maxNotesPerSecond: 3.5,
    minSameLaneGapMs: 240,
    minEventGapMs: 200,
    maxChordSize: 2,
    maxSimultaneousKeys: 2,
    minHoldMs: 400,
  },
  apprentice: {
    maxNotesPerSecond: 5,
    minSameLaneGapMs: 170,
    minEventGapMs: 140,
    maxChordSize: 2,
    maxSimultaneousKeys: 3,
    minHoldMs: 350,
  },
  virtuoso: {
    maxNotesPerSecond: 7,
    minSameLaneGapMs: 120,
    minEventGapMs: 95,
    maxChordSize: 3,
    maxSimultaneousKeys: 3,
    minHoldMs: 300,
  },
  maestro: {
    maxNotesPerSecond: 9,
    minSameLaneGapMs: 95,
    minEventGapMs: 80,
    maxChordSize: 3,
    maxSimultaneousKeys: 3,
    minHoldMs: 250,
  },
};

/** A chart event must land within this many ms of some arrangement note onset. */
export const CHART_ALIGNMENT_TOLERANCE_MS = 25;

/** Playable arrangements should be roughly this long. */
export const TRACK_LENGTH_MS = { min: 55_000, max: 125_000 } as const;

export const AUDIO = {
  /** How far ahead the transport schedules music, in ms of song time. */
  lookaheadMs: 200,
  /** Scheduler tick interval in ms. */
  schedulerIntervalMs: 25,
  /** Cap on frame delta used by visual effects after a tab switch. */
  maxFrameDeltaMs: 100,
} as const;

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  novice: "Novice",
  apprentice: "Apprentice",
  virtuoso: "Virtuoso",
  maestro: "Maestro",
};

export const STORAGE_PREFIX = "virtuoso-circuit:";
