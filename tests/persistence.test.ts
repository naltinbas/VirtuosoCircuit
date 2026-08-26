import { describe, expect, it } from "vitest";
import { KeyBindings } from "../src/input/KeyBindings";
import { HIGHWAY, KEYMAP_PRESETS } from "../src/app/Config";
import { SAVE_KEY, SaveManager, type RecordableSummary, type UnlockInfo } from "../src/persistence/SaveManager";
import { DEFAULT_SETTINGS, SETTINGS_KEY, SettingsStore, type Settings } from "../src/persistence/SettingsStore";
import { memoryStorage, type StorageLike } from "../src/persistence/Storage";

interface MapStore extends StorageLike {
  map: Map<string, string>;
}

function mapStorage(seed: Record<string, unknown> = {}): MapStore {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(seed)) map.set(key, JSON.stringify(value));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** Stands in for a browser that is out of quota or has storage switched off. */
function refusingStorage(): StorageLike {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
}

const NO_MOTION = { prefersReducedMotion: false };

function stored(storage: MapStore, key: string): Record<string, unknown> {
  const raw = storage.map.get(key);
  expect(raw).toBeDefined();
  return JSON.parse(raw ?? "{}") as Record<string, unknown>;
}

const TRACKS: UnlockInfo[] = [
  { id: "first-light", title: "First Light" },
  { id: "second-wing", title: "Second Wing", unlockAfter: "first-light" },
  { id: "third-hall", title: "Third Hall", unlockAfter: "second-wing" },
];

function summary(patch: Partial<RecordableSummary> = {}): RecordableSummary {
  return {
    score: 100_000,
    accuracy: 94.5,
    seal: "A",
    bestChain: 210,
    misses: 4,
    completed: true,
    failed: false,
    ...patch,
  };
}

describe("SettingsStore", () => {
  it("starts from the defaults when nothing is stored", () => {
    const store = new SettingsStore(mapStorage(), NO_MOTION);
    expect(store.current).toEqual(DEFAULT_SETTINGS);
    expect(store.persistent).toBe(true);
  });

  it("takes the reduced motion default from the environment", () => {
    const store = new SettingsStore(mapStorage(), { prefersReducedMotion: true });
    expect(store.current.reducedMotion).toBe(true);
  });

  it("merges stored values over the defaults", () => {
    const storage = mapStorage({
      [SETTINGS_KEY]: { musicVolume: 0.3, noFail: true, approachMs: 2400, keyBindings: KEYMAP_PRESETS.arrows },
    });
    const store = new SettingsStore(storage, NO_MOTION);
    expect(store.current.musicVolume).toBe(0.3);
    expect(store.current.noFail).toBe(true);
    expect(store.current.approachMs).toBe(2400);
    expect(store.current.keyBindings).toEqual([...KEYMAP_PRESETS.arrows]);
    expect(store.current.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
  });

  it("falls back to the default for values of the wrong type or out of range", () => {
    const storage = mapStorage({
      [SETTINGS_KEY]: {
        masterVolume: 4,
        musicVolume: "loud",
        muted: "yes",
        approachMs: 50,
        textScale: 9,
        practiceSpeed: 0.42,
        keyBindings: ["KeyA", "KeyS"],
        inputOffsetMs: 9000,
      },
    });
    const store = new SettingsStore(storage, NO_MOTION);
    expect(store.current.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    expect(store.current.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(store.current.muted).toBe(false);
    expect(store.current.approachMs).toBe(HIGHWAY.approachMsDefault);
    expect(store.current.textScale).toBe(1);
    expect(store.current.practiceSpeed).toBe(1);
    expect(store.current.keyBindings).toEqual([...KEYMAP_PRESETS.default]);
    expect(store.current.inputOffsetMs).toBe(0);
  });

  it("falls back when the stored bindings conflict with each other or the game", () => {
    const conflicting = ["Escape", "KeyA", "KeyA", "F5", "Tab"];
    expect(KeyBindings.conflicts(conflicting).length).toBeGreaterThan(0);
    const storage = mapStorage({ [SETTINGS_KEY]: { keyBindings: conflicting } });
    const store = new SettingsStore(storage, NO_MOTION);
    expect(store.current.keyBindings).toEqual([...KEYMAP_PRESETS.default]);
    store.save({ keyBindings: ["KeyA", "KeyS", "KeyD", "KeyJ", "ArrowUp"] });
    expect(store.current.keyBindings).toEqual([...KEYMAP_PRESETS.default]);
    store.save({ keyBindings: [...KEYMAP_PRESETS.arrows] });
    expect(store.current.keyBindings).toEqual([...KEYMAP_PRESETS.arrows]);
  });

  it("ignores stored data that is not an object", () => {
    const storage = mapStorage();
    storage.map.set(SETTINGS_KEY, "not json at all");
    expect(new SettingsStore(storage, NO_MOTION).current).toEqual(DEFAULT_SETTINGS);
    storage.map.set(SETTINGS_KEY, "[1,2,3]");
    expect(new SettingsStore(storage, NO_MOTION).current).toEqual(DEFAULT_SETTINGS);
  });

  it("writes a patch and reports which keys changed", () => {
    const storage = mapStorage();
    const store = new SettingsStore(storage, NO_MOTION);
    const changes: (keyof Settings)[][] = [];
    store.on("change", (payload) => changes.push([...payload.changed]));
    store.save({ muted: true, effectsVolume: 0.5 });
    expect(store.current.muted).toBe(true);
    expect(changes).toEqual([["effectsVolume", "muted"]]);
    expect(stored(storage, SETTINGS_KEY).muted).toBe(true);
  });

  it("emits nothing when a patch changes nothing", () => {
    const store = new SettingsStore(mapStorage(), NO_MOTION);
    let calls = 0;
    store.on("change", () => calls++);
    store.save({ muted: false });
    store.save({ keyBindings: [...KEYMAP_PRESETS.default] });
    expect(calls).toBe(0);
  });

  it("rounds offsets to whole milliseconds", () => {
    const store = new SettingsStore(mapStorage(), NO_MOTION);
    store.save({ inputOffsetMs: 23.6, audioOffsetMs: -12.2 });
    expect(store.current.inputOffsetMs).toBe(24);
    expect(store.current.audioOffsetMs).toBe(-12);
  });

  it("restores what it wrote", () => {
    const storage = mapStorage();
    const first = new SettingsStore(storage, NO_MOTION);
    first.save({ highContrast: true, approachMs: 1600, practiceSpeed: 0.7 });
    const second = new SettingsStore(storage, { prefersReducedMotion: true });
    expect(second.current.highContrast).toBe(true);
    expect(second.current.approachMs).toBe(1600);
    expect(second.current.practiceSpeed).toBe(0.7);
    // Stored settings win over the environment hint.
    expect(second.current.reducedMotion).toBe(false);
  });

  it("keeps working when the browser refuses to store", () => {
    const store = new SettingsStore(refusingStorage(), NO_MOTION);
    expect(store.persistent).toBe(true);
    expect(() => store.save({ muted: true })).not.toThrow();
    expect(store.current.muted).toBe(true);
    expect(store.persistent).toBe(false);
  });

  it("works with no storage at all", () => {
    const store = new SettingsStore(null, NO_MOTION);
    expect(store.persistent).toBe(false);
    store.save({ textScale: 1.25 });
    expect(store.current.textScale).toBe(1.25);
  });

  it("returns every setting to its default on reset", () => {
    const store = new SettingsStore(mapStorage(), { prefersReducedMotion: true });
    store.save({ muted: true, textScale: 1.5, reducedMotion: false });
    store.reset();
    expect(store.current).toEqual({ ...DEFAULT_SETTINGS, reducedMotion: true });
  });
});

describe("SaveManager", () => {
  it("starts empty", () => {
    const save = new SaveManager(mapStorage(), TRACKS);
    expect(save.data).toEqual({ version: 1, results: {}, completed: [], calibrated: false });
    expect(save.persistent).toBe(true);
  });

  it("records a finished run and stamps it with the date", () => {
    const storage = mapStorage();
    const save = new SaveManager(storage, TRACKS);
    const outcome = save.record(summary(), "first-light", "novice");
    expect(outcome.saved).toBe(true);
    expect(outcome.isNewBest).toBe(true);
    expect(outcome.previousBest).toBeUndefined();
    expect(outcome.unlockedTrackId).toBe("second-wing");
    const best = save.best("first-light", "novice");
    expect(best?.score).toBe(100_000);
    expect(best?.seal).toBe("A");
    expect(Date.parse(best?.dateIso ?? "")).not.toBeNaN();
    expect(save.isCompleted("first-light")).toBe(true);
    expect(stored(storage, SAVE_KEY).completed).toEqual(["first-light"]);
  });

  it("keeps the higher score per track and difficulty", () => {
    const save = new SaveManager(mapStorage(), TRACKS);
    save.record(summary({ score: 90_000, seal: "B" }), "first-light", "novice");
    const worse = save.record(summary({ score: 50_000, seal: "C" }), "first-light", "novice");
    expect(worse.isNewBest).toBe(false);
    expect(worse.previousBest?.score).toBe(90_000);
    expect(save.best("first-light", "novice")?.score).toBe(90_000);
    const better = save.record(summary({ score: 120_000, seal: "S" }), "first-light", "novice");
    expect(better.isNewBest).toBe(true);
    expect(save.best("first-light", "novice")?.seal).toBe("S");
    // Difficulties are kept apart.
    expect(save.best("first-light", "virtuoso")).toBeUndefined();
    save.record(summary({ score: 10 }), "first-light", "virtuoso");
    expect(save.best("first-light", "virtuoso")?.score).toBe(10);
    expect(save.best("first-light", "novice")?.score).toBe(120_000);
  });

  it("lists a completed track once and reports the unlock only the first time", () => {
    const save = new SaveManager(mapStorage(), TRACKS);
    expect(save.record(summary(), "first-light", "novice").unlockedTrackId).toBe("second-wing");
    expect(save.record(summary({ score: 1 }), "first-light", "apprentice").unlockedTrackId).toBeUndefined();
    expect(save.completed).toEqual(["first-light"]);
  });

  it("saves nothing for a failed or abandoned run", () => {
    const save = new SaveManager(mapStorage(), TRACKS);
    expect(save.record(summary({ failed: true, seal: "unfinished" }), "first-light", "novice").saved).toBe(false);
    expect(save.record(summary({ completed: false, seal: "unfinished" }), "first-light", "novice").saved).toBe(false);
    expect(save.best("first-light", "novice")).toBeUndefined();
    expect(save.completed).toEqual([]);
  });

  it("applies the unlock rule", () => {
    const save = new SaveManager(mapStorage(), TRACKS);
    expect(save.isUnlocked("first-light")).toBe(true);
    expect(save.isUnlocked("second-wing")).toBe(false);
    expect(save.isUnlocked("second-wing", true)).toBe(true);
    expect(save.unlockReason("second-wing")).toBe("Wing sealed. Complete First Light to open it.");
    expect(save.unlockReason("second-wing", true)).toBeNull();
    expect(save.unlockReason("first-light")).toBeNull();
    save.record(summary(), "first-light", "novice");
    expect(save.isUnlocked("second-wing")).toBe(true);
    expect(save.unlockReason("second-wing")).toBeNull();
    expect(save.isUnlocked("third-hall")).toBe(false);
  });

  it("treats an unknown track as unlocked", () => {
    const save = new SaveManager(mapStorage(), TRACKS);
    expect(save.isUnlocked("not-in-the-catalog")).toBe(true);
    expect(save.unlockReason("not-in-the-catalog")).toBeNull();
  });

  it("keeps the calibrated flag", () => {
    const storage = mapStorage();
    const save = new SaveManager(storage, TRACKS);
    expect(save.calibrated).toBe(false);
    save.setCalibrated(true);
    expect(save.calibrated).toBe(true);
    expect(new SaveManager(storage, TRACKS).calibrated).toBe(true);
  });

  it("discards a save written by another version", () => {
    const storage = mapStorage({
      [SAVE_KEY]: { version: 2, results: { "first-light": { novice: { score: 1 } } }, completed: ["first-light"], calibrated: true },
    });
    const save = new SaveManager(storage, TRACKS);
    expect(save.completed).toEqual([]);
    expect(save.calibrated).toBe(false);
    expect(save.best("first-light", "novice")).toBeUndefined();
  });

  it("drops malformed entries and keeps the rest", () => {
    const good = { score: 4200, seal: "B", accuracy: 88.25, bestChain: 90, misses: 6, dateIso: "2026-01-02T03:04:05.000Z" };
    const storage = mapStorage({
      [SAVE_KEY]: {
        version: 1,
        results: {
          "first-light": { novice: good, apprentice: { score: "lots" }, virtuoso: { ...good, seal: "Z" } },
          "second-wing": "nonsense",
        },
        completed: ["first-light", 7, null],
        calibrated: "sure",
      },
    });
    const save = new SaveManager(storage, TRACKS);
    expect(save.best("first-light", "novice")).toEqual(good);
    expect(save.best("first-light", "apprentice")).toBeUndefined();
    expect(save.best("first-light", "virtuoso")).toBeUndefined();
    expect(save.data.results["second-wing"]).toBeUndefined();
    expect(save.completed).toEqual(["first-light"]);
    expect(save.calibrated).toBe(false);
  });

  it("clears progress and the stored key", () => {
    const storage = mapStorage();
    const save = new SaveManager(storage, TRACKS);
    save.record(summary(), "first-light", "novice");
    save.setCalibrated(true);
    let events = 0;
    save.on("change", () => events++);
    save.resetProgress();
    expect(save.data).toEqual({ version: 1, results: {}, completed: [], calibrated: false });
    expect(storage.map.has(SAVE_KEY)).toBe(false);
    expect(events).toBe(1);
  });

  it("keeps working when the browser refuses to store", () => {
    const save = new SaveManager(refusingStorage(), TRACKS);
    expect(() => save.record(summary(), "first-light", "novice")).not.toThrow();
    expect(save.persistent).toBe(false);
    expect(save.best("first-light", "novice")?.score).toBe(100_000);
  });

  it("works with no storage at all", () => {
    const save = new SaveManager(null, TRACKS);
    expect(save.persistent).toBe(false);
    save.record(summary(), "first-light", "novice");
    expect(save.isCompleted("first-light")).toBe(true);
  });

  it("round trips through a session store", () => {
    const storage = memoryStorage();
    const first = new SaveManager(storage, TRACKS);
    first.record(summary({ score: 77_000, seal: "B" }), "first-light", "apprentice");
    const second = new SaveManager(storage, TRACKS);
    expect(second.best("first-light", "apprentice")?.score).toBe(77_000);
    expect(second.isUnlocked("second-wing")).toBe(true);
  });
});
