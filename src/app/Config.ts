import type { Difficulty, Lane } from "../charts/ChartTypes";

// Timing windows in ms. A press is graded against the earliest unjudged note
// in its lane that is within the miss window; |delta| within `faint` counts as
// a hit, within `miss` counts as a consumed miss (too early or too late),
// beyond that the press is ignored. A note with no press is auto-missed once
// song time passes timeMs + miss. All windows are symmetric.
export const JUDGMENT_WINDOWS_MS = {
  radiant: 35,
  precise: 75,
  good: 120,
  faint: 165,
  miss: 200,
} as const;

export type JudgmentWindows = { [K in keyof typeof JUDGMENT_WINDOWS_MS]: number };

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
  /** Releasing this close to the end of a hold still counts as completing it. */
  holdReleaseGraceMs: 100,
  chordCompletionBonus: 250,
  phraseCompletionBonus: 750,
  /** Paid instead of the phrase bonus for phrases whose id starts with "trill-". */
  trillCompletionBonus: 300,
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
export const SEALS: readonly Seal[] = ["S", "A", "B", "C", "D", "unfinished"];

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

/** UI text scale, applied as the --text-scale CSS variable and to canvas text. */
export const TEXT_SCALE_RANGE = {
  min: 0.85,
  max: 1.5,
  step: 0.05,
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
  /** Remaining taps further than this many median absolute deviations from the median are outliers. */
  madFactor: 2.5,
} as const;

export const KEYMAP_PRESETS = {
  default: ["KeyA", "KeyS", "KeyD", "KeyJ", "KeyK"],
  compactLeft: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG"],
  splitHands: ["KeyS", "KeyD", "KeyF", "KeyJ", "KeyK"],
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
  /** Dwell on the "performance complete" / "interrupted" banner before the results. */
  resultsDelayMs: 1800,
  /** How far before a freeze point the debug freezeAt starts stepping so judgments are on screen. */
  freezeWarmupMs: 1500,
  /** How early the practice ghost guide shows the upcoming key. */
  ghostLeadMs: 300,
} as const;

/** Highway geometry as fractions of the canvas (px values are CSS pixels). */
export const LAYOUT = {
  gateY: 0.82,
  spawnY: 0.06,
  bottomWidth: 0.62,
  topWidthRatio: 0.38,
  receptorSize: 0.62,
  noteScaleAtSpawn: 0.38,
  /** How far past the gate a note stays on the highway, as a fraction of the approach time. */
  pastGateFraction: 0.15,
  popupRisePx: 48,
  popupLifeMs: 700,
  /** Ramp at the start of a judgment popup, so a burst of hits does not blink. */
  popupFadeInMs: 60,
  burstLifeMs: 450,
  keyLabelOffsetPx: 28,
  /** Lane column flash after a hit. Every flash stays above 250 ms so nothing strobes. */
  laneFlashMs: 320,
  /** Receptor light decay after a lane key press. */
  receptorFlashMs: 280,
  /** Screen edge pulse on a Perfect Passage. */
  edgePulseMs: 520,
  /** One sweep of the Focus Surge band from the gate to the spawn edge. */
  surgeSweepMs: 900,
  /** Ramp of the low aura vignette when the warning starts. */
  vignetteFadeMs: 300,
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
  /** How far ahead the transport schedules, in ms of audio (wall) time. The song-time horizon is lookaheadMs * rate. */
  lookaheadMs: 200,
  /** Scheduler tick interval in ms. */
  schedulerIntervalMs: 25,
  /** A note whose scheduled audio time is already this far in the past is dropped instead of started late. */
  lateNoteDropMs: 50,
  /** Cap on frame delta used by visual effects after a tab switch. */
  maxFrameDeltaMs: 100,
  /** How long unlock() waits for the AudioContext to run before falling back to silent mode. */
  unlockTimeoutMs: 500,
  /** Polyphony cap; the oldest voice is stolen beyond it. */
  maxVoices: 48,
  /** Fade used when voices are stopped for a pause, a seek, a restart or an exit. */
  voiceFadeMs: 40,
  /** Offset samples kept by AudioEngine, one per frame. The offset in use is the maximum of them. */
  clockSampleCount: 64,
  /** An offset sample this far from the one in use replaces the whole buffer (resync after a suspend). */
  clockResyncMs: 100,
  /** A clock sample older than this is refreshed before nowMs() or perfToAudioMs() answers. */
  clockSampleMaxAgeMs: 50,
  /** A note already sounding at a resume point is retriggered only if at least this much of it is left. */
  retriggerMinRemainingMs: 150,
  /** How far back the transport looks for notes that are still sounding at a resume point. */
  retriggerScanMs: 12_000,
  /** Clock rate guards. Practice runs at 0.5 and debug slow motion halves that again. */
  rateMin: 0.125,
  rateMax: 2,
  /** Starting mixer levels. DEFAULT_SETTINGS and AudioEngine both read these. */
  defaultVolume: { master: 0.8, music: 0.8, effects: 0.7 },
} as const;

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  novice: "Novice",
  apprentice: "Apprentice",
  virtuoso: "Virtuoso",
  maestro: "Maestro",
};

export const STORAGE_PREFIX = "virtuoso-circuit:";

/** Debug tooling (F3 overlay, chart editor, window.vc) is on in dev builds or with ?debug=true. */
export const DEBUG_ENABLED: boolean =
  (typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV)) ||
  (typeof location !== "undefined" && new URLSearchParams(location.search).get("debug") === "true");
