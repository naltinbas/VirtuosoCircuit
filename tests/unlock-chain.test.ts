import { describe, expect, it } from "vitest";
import { TRACK_DEFINITIONS } from "../src/charts/TrackCatalog";
import {
  SaveManager,
  chainUnlocks,
  type RecordableSummary,
  type UnlockInfo,
} from "../src/persistence/SaveManager";

const catalog: UnlockInfo[] = TRACK_DEFINITIONS.map((d) => ({
  id: d.metadata.id,
  title: d.metadata.title,
  unlockAfter: d.metadata.unlockAfter,
}));

const cleanRun: RecordableSummary = {
  score: 1000,
  accuracy: 100,
  seal: "S",
  bestChain: 10,
  misses: 0,
  completed: true,
  failed: false,
};

describe("chainUnlocks", () => {
  it("locks a track behind the entry before it, whatever its file names", () => {
    const chained = chainUnlocks([
      { id: "a", title: "A" },
      { id: "b", title: "B", unlockAfter: "not-in-this-build" },
      { id: "c", title: "C", unlockAfter: "b" },
    ]);
    expect(chained.map((t) => t.unlockAfter)).toEqual([undefined, "a", "b"]);
  });

  it("opens the first entry even when its file names a predecessor", () => {
    const chained = chainUnlocks([{ id: "only", title: "Only", unlockAfter: "gone" }]);
    expect(chained[0].unlockAfter).toBeUndefined();
  });
});

describe("the shipped catalog", () => {
  const chained = chainUnlocks(catalog);

  it("names a predecessor that is in the catalog", () => {
    const ids = new Set(chained.map((t) => t.id));
    for (const track of chained) {
      if (track.unlockAfter === undefined) continue;
      expect(ids.has(track.unlockAfter)).toBe(true);
    }
  });

  it("keeps the chain contiguous in catalog order", () => {
    for (let i = 0; i < chained.length; i++) {
      const after = chained[i].unlockAfter;
      if (after === undefined) continue;
      expect(after).toBe(chained[i - 1]?.id);
    }
  });

  it("opens every track for a player who keeps finishing what is open", () => {
    const save = new SaveManager(null, chained);
    for (let pass = 0; pass < chained.length; pass++) {
      const next = chained.find((t) => save.isUnlocked(t.id) && !save.isCompleted(t.id));
      if (!next) break;
      save.record(cleanRun, next.id, "novice");
    }
    const locked = chained.filter((t) => !save.isUnlocked(t.id)).map((t) => t.id);
    expect(locked).toEqual([]);
  });
});
