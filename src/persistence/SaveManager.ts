import { SEALS, STORAGE_PREFIX, type Seal } from "../app/Config";
import { DIFFICULTIES, type Difficulty } from "../charts/ChartTypes";
import { EventEmitter } from "../utils/EventEmitter";
import type { StorageLike } from "./Storage";

export interface TrackResult {
  score: number;
  seal: Seal;
  accuracy: number;
  bestChain: number;
  misses: number;
  dateIso: string;
}

export const SAVE_VERSION = 1;
export const SAVE_KEY = `${STORAGE_PREFIX}save`;

export interface SaveData {
  version: typeof SAVE_VERSION;
  /** Best run per track and difficulty, by score. */
  results: Record<string, Partial<Record<Difficulty, TrackResult>>>;
  /** Tracks finished at least once in performance mode. */
  completed: string[];
  calibrated: boolean;
}

/**
 * What a finished run has to offer for the save file. PerformanceSummary from
 * the gameplay layer satisfies this, which keeps persistence independent of it.
 */
export interface RecordableSummary {
  score: number;
  accuracy: number;
  seal: Seal;
  bestChain: number;
  misses: number;
  completed: boolean;
  failed: boolean;
}

/** What SaveManager needs to know about the catalog to answer unlock questions. */
export interface UnlockInfo {
  id: string;
  title: string;
  unlockAfter?: string;
}

/**
 * Locks every track that names a predecessor behind the one before it in
 * catalog order. A track file names its predecessor by id, so a build that
 * ships part of the catalog can carry a name no track in it can produce,
 * which would seal that track and everything after it for good. Resolving the
 * chain from the catalog itself keeps it contiguous for any subset.
 */
export function chainUnlocks(tracks: readonly UnlockInfo[]): UnlockInfo[] {
  return tracks.map((track, index) =>
    track.unlockAfter === undefined ? { ...track } : { ...track, unlockAfter: tracks[index - 1]?.id },
  );
}

export interface RecordOutcome {
  saved: boolean;
  isNewBest: boolean;
  result?: TrackResult;
  previousBest?: TrackResult;
  /** Set when finishing this track opened the next one. */
  unlockedTrackId?: string;
}

export type SaveEvents = {
  change: { data: SaveData };
};

function emptySave(): SaveData {
  return { version: SAVE_VERSION, results: {}, completed: [], calibrated: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readResult(value: unknown): TrackResult | null {
  if (!isRecord(value)) return null;
  const { score, seal, accuracy, bestChain, misses, dateIso } = value;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (typeof seal !== "string" || !SEALS.includes(seal as Seal)) return null;
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) return null;
  if (typeof bestChain !== "number" || !Number.isFinite(bestChain)) return null;
  if (typeof misses !== "number" || !Number.isFinite(misses)) return null;
  if (typeof dateIso !== "string") return null;
  return {
    score: Math.round(score),
    seal: seal as Seal,
    accuracy,
    bestChain: Math.round(bestChain),
    misses: Math.round(misses),
    dateIso,
  };
}

/**
 * Progress, best scores and the calibration flag. Like the settings it keeps an
 * in-memory copy and never throws on a failed write.
 */
export class SaveManager extends EventEmitter<SaveEvents> {
  private state: SaveData;
  private persistentFlag: boolean;
  private tracks = new Map<string, UnlockInfo>();

  constructor(
    private readonly storage: StorageLike | null,
    tracks: readonly UnlockInfo[] = [],
  ) {
    super();
    this.persistentFlag = storage !== null;
    this.state = this.load();
    this.setTracks(tracks);
  }

  /** The live save data. Treat as read only. */
  get data(): SaveData {
    return this.state;
  }

  get persistent(): boolean {
    return this.persistentFlag;
  }

  get calibrated(): boolean {
    return this.state.calibrated;
  }

  get completed(): readonly string[] {
    return this.state.completed;
  }

  /** The catalog can be handed over after construction; nothing else changes. */
  setTracks(tracks: readonly UnlockInfo[]): void {
    this.tracks = new Map(tracks.map((t) => [t.id, t]));
  }

  best(trackId: string, difficulty: Difficulty): TrackResult | undefined {
    return this.state.results[trackId]?.[difficulty];
  }

  isCompleted(trackId: string): boolean {
    return this.state.completed.includes(trackId);
  }

  /**
   * Keeps the run when it finished without failing. Callers decide whether the
   * mode allows saving at all: practice, free and assisted runs never call this.
   */
  record(summary: RecordableSummary, trackId: string, difficulty: Difficulty): RecordOutcome {
    if (!summary.completed || summary.failed) return { saved: false, isNewBest: false };
    const previousBest = this.best(trackId, difficulty);
    const result: TrackResult = {
      score: Math.round(summary.score),
      seal: summary.seal,
      accuracy: summary.accuracy,
      bestChain: Math.round(summary.bestChain),
      misses: Math.round(summary.misses),
      dateIso: new Date().toISOString(),
    };
    const isNewBest = previousBest === undefined || result.score > previousBest.score;
    if (isNewBest) {
      const forTrack = this.state.results[trackId] ?? {};
      forTrack[difficulty] = result;
      this.state.results[trackId] = forTrack;
    }
    const unlockedTrackId = this.markCompleted(trackId);
    this.write();
    this.emit("change", { data: this.state });
    return { saved: true, isNewBest, result, previousBest, unlockedTrackId };
  }

  setCalibrated(value: boolean): void {
    if (this.state.calibrated === value) return;
    this.state.calibrated = value;
    this.write();
    this.emit("change", { data: this.state });
  }

  /** A track opens when it needs nothing, when its predecessor is done, or with unlockAll. */
  isUnlocked(trackId: string, unlockAll = false): boolean {
    const info = this.tracks.get(trackId);
    if (!info || info.unlockAfter === undefined) return true;
    if (unlockAll) return true;
    return this.isCompleted(info.unlockAfter);
  }

  /** Player facing reason a track is locked, or null when it is open. */
  unlockReason(trackId: string, unlockAll = false): string | null {
    if (this.isUnlocked(trackId, unlockAll)) return null;
    const info = this.tracks.get(trackId);
    const previous = info?.unlockAfter !== undefined ? this.tracks.get(info.unlockAfter) : undefined;
    return `Wing sealed. Complete ${previous?.title ?? "the previous performance"} to open it.`;
  }

  /** Clears progress only. Settings, bindings and calibration are elsewhere. */
  resetProgress(): void {
    this.state = emptySave();
    if (this.storage) {
      try {
        this.storage.removeItem(SAVE_KEY);
      } catch {
        this.persistentFlag = false;
      }
    }
    this.emit("change", { data: this.state });
  }

  private markCompleted(trackId: string): string | undefined {
    if (this.isCompleted(trackId)) return undefined;
    this.state.completed.push(trackId);
    for (const info of this.tracks.values()) {
      if (info.unlockAfter === trackId) return info.id;
    }
    return undefined;
  }

  private load(): SaveData {
    const raw = this.storage?.getItem(SAVE_KEY) ?? null;
    if (raw === null) return emptySave();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return emptySave();
    }
    if (!isRecord(parsed) || parsed.version !== SAVE_VERSION) return emptySave();
    const save = emptySave();
    if (isRecord(parsed.results)) {
      for (const [trackId, byDifficulty] of Object.entries(parsed.results)) {
        if (!isRecord(byDifficulty)) continue;
        const kept: Partial<Record<Difficulty, TrackResult>> = {};
        for (const difficulty of DIFFICULTIES) {
          const result = readResult(byDifficulty[difficulty]);
          if (result) kept[difficulty] = result;
        }
        if (Object.keys(kept).length > 0) save.results[trackId] = kept;
      }
    }
    if (Array.isArray(parsed.completed)) {
      save.completed = parsed.completed.filter((id): id is string => typeof id === "string");
    }
    save.calibrated = parsed.calibrated === true;
    return save;
  }

  private write(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch {
      // Out of quota or storage disabled mid session: the run still counts for
      // this session, it just will not be there next time.
      this.persistentFlag = false;
    }
  }
}
