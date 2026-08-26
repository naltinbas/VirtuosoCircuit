import { describe, expect, it } from "vitest";
import { BeatMapper } from "../src/charts/BeatMapper";

describe("BeatMapper", () => {
  it("converts beats at a constant tempo", () => {
    const m = new BeatMapper([{ beat: 0, bpm: 120 }], [4, 4]);
    expect(m.beatToMs(0)).toBe(0);
    expect(m.beatToMs(2)).toBe(1000);
    expect(m.msToBeat(1500)).toBe(3);
    expect(m.measureOf(0)).toBe(1);
    expect(m.measureOf(3.99)).toBe(1);
    expect(m.measureOf(4)).toBe(2);
  });
  it("applies tempo changes on their beat", () => {
    const m = new BeatMapper([{ beat: 0, bpm: 120 }, { beat: 4, bpm: 60 }], [4, 4]);
    expect(m.beatToMs(4)).toBe(2000);
    expect(m.beatToMs(5)).toBe(3000);
    expect(m.msToBeat(3000)).toBe(5);
    expect(m.bpmAtMs(2500)).toBe(60);
    expect(m.bpmAtBeat(3.9)).toBe(120);
  });
  it("builds a beat grid with downbeats", () => {
    const m = new BeatMapper([{ beat: 0, bpm: 90 }], [3, 4]);
    const grid = m.beatGrid(6.2);
    expect(grid).toHaveLength(8);
    expect(grid.filter((g) => g.isDownbeat).map((g) => g.beat)).toEqual([0, 3, 6]);
    expect(grid[4].measure).toBe(2);
  });
  it("rejects bad tempo maps", () => {
    expect(() => new BeatMapper([], [4, 4])).toThrow();
    expect(() => new BeatMapper([{ beat: 1, bpm: 100 }], [4, 4])).toThrow();
    expect(() => new BeatMapper([{ beat: 0, bpm: 0 }], [4, 4])).toThrow();
  });
});
