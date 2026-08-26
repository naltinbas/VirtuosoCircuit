import {
  CALIBRATION_RANGE_MS,
  HIGHWAY,
  KEYMAP_PRESETS,
  PRACTICE_SPEEDS,
  STORAGE_PREFIX,
  TEXT_SCALE_RANGE,
  AUDIO,
} from "../app/Config";
import { KeyBindings } from "../input/KeyBindings";
import { EventEmitter } from "../utils/EventEmitter";
import { clamp, roundTo } from "../utils/MathUtils";
import type { StorageLike } from "./Storage";

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
  muted: boolean;
  /** Five KeyboardEvent.code values, one per lane. */
  keyBindings: string[];
  audioOffsetMs: number;
  visualOffsetMs: number;
  inputOffsetMs: number;
  /** How long a note takes to travel from the spawn edge to the gate. */
  approachMs: number;
  reducedMotion: boolean;
  highContrast: boolean;
  noFail: boolean;
  showHints: boolean;
  flashEffects: boolean;
  textScale: number;
  focusSurgeEnabled: boolean;
  unlockAll: boolean;
  metronome: boolean;
  practiceSpeed: number;
  /** Beat grid during performance and free runs. */
  showBeatGrid: boolean;
  /** Beat grid in the practice studio, where it is on by default. */
  practiceBeatGrid: boolean;
  ghostGuide: boolean;
}

export const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: AUDIO.defaultVolume.master,
  musicVolume: AUDIO.defaultVolume.music,
  effectsVolume: AUDIO.defaultVolume.effects,
  muted: false,
  keyBindings: [...KEYMAP_PRESETS.default],
  audioOffsetMs: 0,
  visualOffsetMs: 0,
  inputOffsetMs: 0,
  approachMs: HIGHWAY.approachMsDefault,
  reducedMotion: false,
  highContrast: false,
  noFail: false,
  showHints: true,
  flashEffects: true,
  textScale: 1,
  focusSurgeEnabled: true,
  unlockAll: false,
  metronome: false,
  practiceSpeed: 1,
  showBeatGrid: false,
  practiceBeatGrid: true,
  ghostGuide: false,
};

export type SettingsEvents = {
  change: { settings: Settings; changed: readonly (keyof Settings)[] };
};

export interface SettingsEnv {
  prefersReducedMotion: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Wrong type or out of range means the stored value is not usable, so the default stands. */
function readNumber(value: unknown, fallback: number, min: number, max: number, step?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < min || value > max) return fallback;
  return step ? clamp(roundTo(value, step), min, max) : value;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * KeyBindings.conflicts is the authority on a usable map, and it already
 * rejects the wrong length, a non-string and an empty code. A stored map it
 * refuses cannot be saved from the Controls screen either, and loading one
 * would hand a lane key to the shortcut table or leave two lanes on one code,
 * so the fallback stands instead.
 */
function readBindings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const codes = value as string[];
  return KeyBindings.conflicts(codes).length === 0 ? [...codes] : [...fallback];
}

function readSpeed(value: unknown, fallback: number): number {
  return typeof value === "number" && PRACTICE_SPEEDS.includes(value) ? value : fallback;
}

/**
 * Settings live in localStorage and in memory. Writes never throw: a browser
 * that refuses storage still plays, it just forgets between sessions, and the
 * settings screen says so.
 */
export class SettingsStore extends EventEmitter<SettingsEvents> {
  private readonly defaults: Settings;
  private values: Settings;
  private persistentFlag: boolean;

  constructor(
    private readonly storage: StorageLike | null,
    env: SettingsEnv,
  ) {
    super();
    this.defaults = { ...DEFAULT_SETTINGS, reducedMotion: env.prefersReducedMotion };
    this.persistentFlag = storage !== null;
    this.values = this.load();
  }

  /** The live settings. Treat as read only; change them through save(). */
  get current(): Settings {
    return this.values;
  }

  /** False when this browser will not keep the settings between sessions. */
  get persistent(): boolean {
    return this.persistentFlag;
  }

  save(patch: Partial<Settings>): void {
    const next = this.validate({ ...this.values, ...patch }, this.values);
    const changed: (keyof Settings)[] = [];
    for (const key of Object.keys(next) as (keyof Settings)[]) {
      if (key === "keyBindings") {
        if (next.keyBindings.join(" ") !== this.values.keyBindings.join(" ")) changed.push(key);
      } else if (next[key] !== this.values[key]) {
        changed.push(key);
      }
    }
    if (changed.length === 0) return;
    this.values = next;
    this.write();
    this.emit("change", { settings: this.values, changed });
  }

  reset(): void {
    this.save(this.defaults);
  }

  private load(): Settings {
    const raw = this.storage?.getItem(SETTINGS_KEY) ?? null;
    if (raw === null) return { ...this.defaults };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ...this.defaults };
    }
    if (!isRecord(parsed)) return { ...this.defaults };
    return this.validate(parsed, this.defaults);
  }

  /** Anything missing or out of range falls back to `base`. */
  private validate(source: Record<string, unknown> | Settings, base: Settings): Settings {
    const raw = source as Record<string, unknown>;
    return {
      masterVolume: readNumber(raw.masterVolume, base.masterVolume, 0, 1),
      musicVolume: readNumber(raw.musicVolume, base.musicVolume, 0, 1),
      effectsVolume: readNumber(raw.effectsVolume, base.effectsVolume, 0, 1),
      muted: readBoolean(raw.muted, base.muted),
      keyBindings: readBindings(raw.keyBindings, base.keyBindings),
      audioOffsetMs: readNumber(
        raw.audioOffsetMs,
        base.audioOffsetMs,
        CALIBRATION_RANGE_MS.min,
        CALIBRATION_RANGE_MS.max,
        CALIBRATION_RANGE_MS.step,
      ),
      visualOffsetMs: readNumber(
        raw.visualOffsetMs,
        base.visualOffsetMs,
        CALIBRATION_RANGE_MS.min,
        CALIBRATION_RANGE_MS.max,
        CALIBRATION_RANGE_MS.step,
      ),
      inputOffsetMs: readNumber(
        raw.inputOffsetMs,
        base.inputOffsetMs,
        CALIBRATION_RANGE_MS.min,
        CALIBRATION_RANGE_MS.max,
        CALIBRATION_RANGE_MS.step,
      ),
      approachMs: readNumber(
        raw.approachMs,
        base.approachMs,
        HIGHWAY.approachMsMin,
        HIGHWAY.approachMsMax,
        HIGHWAY.approachMsStep,
      ),
      reducedMotion: readBoolean(raw.reducedMotion, base.reducedMotion),
      highContrast: readBoolean(raw.highContrast, base.highContrast),
      noFail: readBoolean(raw.noFail, base.noFail),
      showHints: readBoolean(raw.showHints, base.showHints),
      flashEffects: readBoolean(raw.flashEffects, base.flashEffects),
      textScale: readNumber(raw.textScale, base.textScale, TEXT_SCALE_RANGE.min, TEXT_SCALE_RANGE.max, TEXT_SCALE_RANGE.step),
      focusSurgeEnabled: readBoolean(raw.focusSurgeEnabled, base.focusSurgeEnabled),
      unlockAll: readBoolean(raw.unlockAll, base.unlockAll),
      metronome: readBoolean(raw.metronome, base.metronome),
      practiceSpeed: readSpeed(raw.practiceSpeed, base.practiceSpeed),
      showBeatGrid: readBoolean(raw.showBeatGrid, base.showBeatGrid),
      practiceBeatGrid: readBoolean(raw.practiceBeatGrid, base.practiceBeatGrid),
      ghostGuide: readBoolean(raw.ghostGuide, base.ghostGuide),
    };
  }

  private write(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.values));
    } catch {
      // Out of quota or storage disabled mid session: keep playing from memory.
      this.persistentFlag = false;
    }
  }
}
