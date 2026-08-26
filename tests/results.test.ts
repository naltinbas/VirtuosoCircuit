import { describe, expect, it } from "vitest";
import { JUDGMENT_WINDOWS_MS } from "../src/app/Config";
import { timingHistogram } from "../src/gameplay/ScoreSystem";
import { histogramColumns } from "../src/ui/ResultsScreen";

const RANGE = JUDGMENT_WINDOWS_MS.faint;

describe("results timing chart", () => {
  it("labels every column with the window it actually counts", () => {
    const columns = histogramColumns([]);
    expect(columns).toHaveLength(timingHistogram([], 20, RANGE).length);
    expect(columns[0].fromMs).toBe(-RANGE);
    for (let i = 1; i < columns.length; i++) {
      expect(columns[i].fromMs).toBe(columns[i - 1].toMs);
    }
    // The range is not a whole number of buckets, so the last column is short
    // rather than claiming a window no hit can reach.
    expect(columns[columns.length - 1].toMs).toBe(RANGE);
  });

  it("marks the one column a press on the beat lands in", () => {
    const columns = histogramColumns([0]);
    const centered = columns.filter((column) => column.center);
    expect(centered).toHaveLength(1);
    expect(centered[0].count).toBe(1);
    expect(centered[0].fromMs).toBeLessThanOrEqual(0);
    expect(centered[0].toMs).toBeGreaterThan(0);
    expect(columns.indexOf(centered[0])).toBe(timingHistogram([0], 20, RANGE).indexOf(1));
  });

  it("counts each delta in the column whose window holds it", () => {
    const deltas = [-RANGE, -30, 0, 40, RANGE];
    const columns = histogramColumns(deltas);
    let total = 0;
    for (const column of columns) total += column.count;
    expect(total).toBe(deltas.length);
    for (const delta of deltas) {
      // The last column owns its upper edge, since nothing scores beyond it.
      const holder = columns.find((c) => delta >= c.fromMs && (delta < c.toMs || c.toMs === RANGE));
      expect(holder?.count).toBe(1);
    }
  });
});
