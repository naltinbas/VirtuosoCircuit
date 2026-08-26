import { describe, expect, it } from "vitest";
import { ACCURACY_WEIGHTS, AURA_CONFIG, JUDGMENT_WINDOWS_MS, SCORE_CONFIG } from "../src/app/Config";
import type { Judgment, Seal } from "../src/app/Config";
import { ScoreSystem, timingHistogram } from "../src/gameplay/ScoreSystem";
import type { EventSpec } from "./gamefixtures";
import { collect, collectNames, gameFor } from "./gamefixtures";

function laneRun(count: number, startMs = 1000, stepMs = 300): EventSpec[] {
  const specs: EventSpec[] = [];
  for (let i = 0; i < count; i++) specs.push({ timeMs: startMs + i * stepMs, lanes: [(i % 5) as 0 | 1 | 2 | 3 | 4] });
  return specs;
}

function sealFor(radiant: number, miss: number, completed = true): { seal: Seal; accuracy: number } {
  const score = new ScoreSystem();
  for (let i = 0; i < radiant; i++) score.recordJudgment("radiant", 0);
  for (let i = 0; i < miss; i++) score.recordJudgment("miss", JUDGMENT_WINDOWS_MS.miss + 1);
  return { seal: score.seal(completed), accuracy: score.accuracy };
}

describe("Resonance Chain", () => {
  it("counts every hit and remembers the best chain", () => {
    const specs = laneRun(12);
    const game = gameFor(specs);
    specs.forEach((spec, i) => {
      game.press(spec.lanes[0], spec.timeMs);
      expect(game.snapshot().combo).toBe(i + 1);
    });
    expect(game.snapshot().bestCombo).toBe(12);
  });

  it("raises the Harmony Factor on the tenth hit", () => {
    const specs = laneRun(11);
    const game = gameFor(specs);
    for (let i = 0; i < 9; i++) game.press(specs[i].lanes[0], specs[i].timeMs);
    expect(game.snapshot().combo).toBe(9);
    expect(game.snapshot().multiplier).toBe(1);
    game.press(specs[9].lanes[0], specs[9].timeMs);
    expect(game.snapshot().combo).toBe(10);
    expect(game.snapshot().multiplier).toBe(2);
  });

  it("caps the Harmony Factor", () => {
    const specs = laneRun(80);
    const game = gameFor(specs);
    for (let i = 0; i < 70; i++) game.press(specs[i].lanes[0], specs[i].timeMs);
    expect(game.snapshot().multiplier).toBe(SCORE_CONFIG.maxMultiplier);
    for (let i = 70; i < 80; i++) game.press(specs[i].lanes[0], specs[i].timeMs);
    expect(game.snapshot().combo).toBe(80);
    expect(game.snapshot().multiplier).toBe(SCORE_CONFIG.maxMultiplier);
  });

  it("breaks the chain on a miss but keeps the best", () => {
    const specs = laneRun(15);
    const game = gameFor(specs);
    for (let i = 0; i < 12; i++) game.press(specs[i].lanes[0], specs[i].timeMs);
    expect(game.snapshot().multiplier).toBe(2);
    game.update(specs[12].timeMs + 500);
    expect(game.snapshot().combo).toBe(0);
    expect(game.snapshot().multiplier).toBe(1);
    expect(game.snapshot().bestCombo).toBe(12);
    expect(game.snapshot().missStreak).toBe(1);
  });

  it("recenters on the first hit after three misses", () => {
    const specs = laneRun(5);
    const game = gameFor(specs);
    const names = collectNames(game, ["judgment", "recenter"]);
    game.update(specs[2].timeMs + 500);
    expect(game.snapshot().missStreak).toBe(3);
    const before = game.snapshot().aura;
    game.press(specs[3].lanes[0], specs[3].timeMs);
    expect(names[names.length - 1]).toBe("recenter");
    expect(game.snapshot().missStreak).toBe(0);
    expect(game.snapshot().aura).toBeCloseTo(before + AURA_CONFIG.radiant + AURA_CONFIG.recenterBonus, 5);
    game.press(specs[4].lanes[0], specs[4].timeMs);
    expect(names.filter((n) => n === "recenter")).toHaveLength(1);
  });

  it("does not recenter after fewer misses", () => {
    const specs = laneRun(4);
    const game = gameFor(specs);
    const recenters = collect(game, "recenter");
    game.update(specs[1].timeMs + 500);
    expect(game.snapshot().missStreak).toBe(2);
    game.press(specs[2].lanes[0], specs[2].timeMs);
    expect(recenters).toEqual([]);
  });
});

describe("accuracy and the Performance Seal", () => {
  it("is zero before anything is judged", () => {
    const game = gameFor(laneRun(3));
    expect(game.snapshot().accuracy).toBe(0);
    expect(game.summary().accuracy).toBe(0);
  });

  it("weights each judgment", () => {
    const score = new ScoreSystem();
    const judgments: Judgment[] = ["radiant", "precise", "good", "faint", "miss"];
    for (const judgment of judgments) score.recordJudgment(judgment, 0);
    const expected =
      (100 * (ACCURACY_WEIGHTS.radiant + ACCURACY_WEIGHTS.precise + ACCURACY_WEIGHTS.good + ACCURACY_WEIGHTS.faint)) / 5;
    expect(score.accuracy).toBeCloseTo(expected, 10);
    expect(score.judgedCount).toBe(5);
    expect(score.misses).toBe(1);
  });

  it("awards each seal at its threshold", () => {
    expect(sealFor(100, 0)).toEqual({ seal: "S", accuracy: 100 });
    expect(sealFor(97, 3)).toEqual({ seal: "S", accuracy: 97 });
    expect(sealFor(96, 4)).toEqual({ seal: "A", accuracy: 96 });
    expect(sealFor(92, 8)).toEqual({ seal: "A", accuracy: 92 });
    expect(sealFor(91, 9)).toEqual({ seal: "B", accuracy: 91 });
    expect(sealFor(85, 15)).toEqual({ seal: "B", accuracy: 85 });
    expect(sealFor(84, 16)).toEqual({ seal: "C", accuracy: 84 });
    expect(sealFor(75, 25)).toEqual({ seal: "C", accuracy: 75 });
    expect(sealFor(74, 26)).toEqual({ seal: "D", accuracy: 74 });
    expect(sealFor(0, 10)).toEqual({ seal: "D", accuracy: 0 });
  });

  it("keeps the S seal behind the miss cap", () => {
    expect(sealFor(196, 4)).toEqual({ seal: "A", accuracy: 98 });
    expect(sealFor(197, 3)).toEqual({ seal: "S", accuracy: 98.5 });
  });

  it("reports unfinished until the run completes", () => {
    expect(sealFor(100, 0, false).seal).toBe("unfinished");
    const game = gameFor(laneRun(2), { durationMs: 4000 });
    game.press(0, 1000);
    game.press(1, 1300);
    expect(game.summary().seal).toBe("unfinished");
    game.update(20000);
    expect(game.summary().seal).toBe("S");
    expect(game.summary().completed).toBe(true);
  });
});

describe("score keeping", () => {
  it("scores every judgment by its base value and the Harmony Factor", () => {
    const specs = laneRun(11);
    const game = gameFor(specs);
    game.press(specs[0].lanes[0], specs[0].timeMs + JUDGMENT_WINDOWS_MS.precise);
    expect(game.snapshot().score).toBe(SCORE_CONFIG.precise);
    game.press(specs[1].lanes[0], specs[1].timeMs + JUDGMENT_WINDOWS_MS.good);
    expect(game.snapshot().score).toBe(SCORE_CONFIG.precise + SCORE_CONFIG.good);
    game.press(specs[2].lanes[0], specs[2].timeMs - JUDGMENT_WINDOWS_MS.faint);
    expect(game.snapshot().score).toBe(SCORE_CONFIG.precise + SCORE_CONFIG.good + SCORE_CONFIG.faint);
  });

  it("keeps the score an integer", () => {
    const specs = laneRun(24);
    const game = gameFor(specs);
    specs.forEach((spec, i) => game.press(spec.lanes[0], spec.timeMs + (i % 7) * 11));
    expect(Number.isInteger(game.snapshot().score)).toBe(true);
  });

  it("collects timing deltas for hits only", () => {
    const specs = laneRun(3);
    const game = gameFor(specs);
    game.press(specs[0].lanes[0], specs[0].timeMs + 20);
    game.update(specs[1].timeMs + 500);
    game.press(specs[2].lanes[0], specs[2].timeMs - 40);
    expect(game.summary().timingDeltas).toEqual([20, -40]);
    expect(game.summary().misses).toBe(1);
  });

  it("returns the same snapshot object every call", () => {
    const game = gameFor(laneRun(1));
    expect(game.snapshot()).toBe(game.snapshot());
  });
});

describe("timing histogram", () => {
  it("buckets deltas around the centre", () => {
    const buckets = timingHistogram([0, -JUDGMENT_WINDOWS_MS.faint, JUDGMENT_WINDOWS_MS.faint]);
    expect(buckets).toHaveLength(17);
    expect(buckets[8]).toBe(1);
    expect(buckets[0]).toBe(1);
    expect(buckets[16]).toBe(1);
  });

  it("clamps deltas outside the range into the end buckets", () => {
    const buckets = timingHistogram([-5000, 5000], 20, 100);
    expect(buckets).toHaveLength(10);
    expect(buckets[0]).toBe(1);
    expect(buckets[9]).toBe(1);
  });

  it("takes a custom bucket size", () => {
    const buckets = timingHistogram([-30, -10, 10, 30], 20, 40);
    expect(buckets).toEqual([1, 1, 1, 1]);
  });

  it("is empty for an empty run", () => {
    expect(timingHistogram([]).every((n) => n === 0)).toBe(true);
  });
});

describe("Aura Meter", () => {
  it("starts at the configured value and clamps at both ends", () => {
    const game = gameFor(laneRun(4));
    expect(game.snapshot().aura).toBe(AURA_CONFIG.start);
    expect(game.snapshot().auraMax).toBe(AURA_CONFIG.max);
    game.debugSetAura(AURA_CONFIG.max);
    game.press(0, 1000);
    expect(game.snapshot().aura).toBe(AURA_CONFIG.max);
    game.debugSetAura(1);
    game.update(1400 + JUDGMENT_WINDOWS_MS.miss + 1);
    expect(game.snapshot().aura).toBe(0);
  });

  it("warns once below the threshold and recovers above it", () => {
    const game = gameFor(laneRun(6), { noFail: true });
    const names = collectNames(game, ["auraWarning", "auraRecovered"]);
    game.debugSetAura(AURA_CONFIG.warningBelow);
    expect(game.snapshot().auraWarning).toBe(false);
    game.update(1000 + JUDGMENT_WINDOWS_MS.miss + 1);
    expect(game.snapshot().auraWarning).toBe(true);
    expect(names).toEqual(["auraWarning"]);
    game.update(1300 + JUDGMENT_WINDOWS_MS.miss + 1);
    game.update(1600 + JUDGMENT_WINDOWS_MS.miss + 1);
    expect(names).toEqual(["auraWarning"]);
    // One radiant short of the threshold, so the next hit crosses it.
    game.debugSetAura(AURA_CONFIG.warningBelow - AURA_CONFIG.radiant);
    expect(game.press(3, 1900)?.judgment).toBe("radiant");
    // The hit also ends a three miss streak, so the Recenter bonus lands with it.
    expect(game.snapshot().aura).toBe(AURA_CONFIG.warningBelow + AURA_CONFIG.recenterBonus);
    expect(names).toEqual(["auraWarning", "auraRecovered"]);
    expect(game.snapshot().auraWarning).toBe(false);
  });

  it("ends a performance run at zero aura", () => {
    const game = gameFor(laneRun(4));
    const names = collectNames(game, ["fail", "complete"]);
    game.debugSetAura(-AURA_CONFIG.miss);
    game.update(1000 + JUDGMENT_WINDOWS_MS.miss + 1);
    expect(names).toEqual(["fail"]);
    expect(game.snapshot().failed).toBe(true);
    expect(game.snapshot().finished).toBe(true);
    expect(game.snapshot().completed).toBe(false);
    expect(game.summary().seal).toBe("unfinished");
    game.update(99999);
    expect(names).toEqual(["fail"]);
  });

  it("keeps going at zero aura with no fail", () => {
    const game = gameFor(laneRun(4), { noFail: true });
    const names = collectNames(game, ["fail", "complete"]);
    game.debugSetAura(0);
    game.update(1000 + JUDGMENT_WINDOWS_MS.miss + 1);
    expect(names).toEqual([]);
    expect(game.snapshot().finished).toBe(false);
    expect(game.press(1, 1300)?.judgment).toBe("radiant");
  });

  it("never fails or completes in practice", () => {
    const game = gameFor(laneRun(2), { mode: "practice", durationMs: 4000 });
    const names = collectNames(game, ["fail", "complete"]);
    game.debugSetAura(0);
    game.update(30000);
    expect(names).toEqual([]);
    expect(game.snapshot().finished).toBe(false);
  });

  it("completes but never fails in free mode", () => {
    const game = gameFor(laneRun(2), { mode: "free", durationMs: 4000 });
    const names = collectNames(game, ["fail", "complete"]);
    game.debugSetAura(0);
    game.update(2000);
    expect(names).toEqual([]);
    game.update(30000);
    expect(names).toEqual(["complete"]);
    expect(game.snapshot().completed).toBe(true);
  });
});

describe("Focus Surge", () => {
  const FAR = [{ timeMs: 40000, lanes: [0] as [0] }];

  it("needs a full meter and cannot stack", () => {
    const game = gameFor(FAR, { durationMs: 90000 });
    expect(game.snapshot().surgeReady).toBe(false);
    expect(game.activateFocusSurge(0)).toBe(false);
    game.debugSetAura(AURA_CONFIG.max - 0.1);
    expect(game.activateFocusSurge(0)).toBe(false);
    game.debugSetAura(AURA_CONFIG.max);
    expect(game.snapshot().surgeReady).toBe(true);
    expect(game.activateFocusSurge(0)).toBe(true);
    expect(game.activateFocusSurge(0)).toBe(false);
    expect(game.snapshot().surgeReady).toBe(false);
  });

  it("is unavailable when the setting is off", () => {
    const game = gameFor(FAR, { durationMs: 90000, focusSurgeEnabled: false });
    game.debugSetAura(AURA_CONFIG.max);
    expect(game.snapshot().surgeReady).toBe(false);
    expect(game.activateFocusSurge(0)).toBe(false);
    expect(game.snapshot().surgeActive).toBe(false);
  });

  it("drains the meter over its duration and ends itself", () => {
    const game = gameFor(FAR, { durationMs: 90000 });
    const names = collectNames(game, ["surgeStart", "surgeEnd"]);
    game.debugSetAura(AURA_CONFIG.max);
    game.update(0);
    game.activateFocusSurge(0);
    expect(names).toEqual(["surgeStart"]);
    expect(game.snapshot().surgeRemainingMs).toBe(SCORE_CONFIG.focusSurgeDurationMs);
    game.update(SCORE_CONFIG.focusSurgeDurationMs / 2);
    expect(game.snapshot().aura).toBe(AURA_CONFIG.max - AURA_CONFIG.focusSurgeCost / 2);
    expect(game.snapshot().surgeRemainingMs).toBe(SCORE_CONFIG.focusSurgeDurationMs / 2);
    game.update(SCORE_CONFIG.focusSurgeDurationMs);
    expect(names).toEqual(["surgeStart", "surgeEnd"]);
    expect(game.snapshot().surgeActive).toBe(false);
    expect(game.snapshot().aura).toBe(AURA_CONFIG.max - AURA_CONFIG.focusSurgeCost);
    game.update(SCORE_CONFIG.focusSurgeDurationMs + 5000);
    expect(names).toEqual(["surgeStart", "surgeEnd"]);
  });

  it("doubles what a note is worth while it runs", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }], { durationMs: 40000 });
    game.debugSetAura(AURA_CONFIG.max);
    game.update(0);
    game.activateFocusSurge(0);
    game.press(0, 1000);
    expect(game.snapshot().score).toBe(SCORE_CONFIG.radiant * SCORE_CONFIG.focusSurgeMultiplier);
  });

  it("doubles hold ticks and bonuses too", () => {
    const game = gameFor(
      [
        { timeMs: 1000, lanes: [0], durationMs: 300, phraseId: "p1" },
        { timeMs: 1500, lanes: [1], phraseId: "p1" },
      ],
      { durationMs: 40000 },
    );
    game.debugSetAura(AURA_CONFIG.max);
    game.update(0);
    game.activateFocusSurge(0);
    game.press(0, 1000);
    game.update(1300);
    game.press(1, 1500);
    const expected =
      2 * (SCORE_CONFIG.radiant + 3 * SCORE_CONFIG.holdTick + SCORE_CONFIG.radiant + SCORE_CONFIG.phraseCompletionBonus);
    expect(game.snapshot().score).toBe(expected);
    expect(game.summary().holdTicks).toBe(3);
  });
});

describe("the end of a run", () => {
  /** Six notes 20 ms apart, so one update leaves all of them overdue at once. */
  const CLUSTER: EventSpec[] = laneRun(6, 1000, 20);

  it("stops the auto-miss sweep at the note that emptied the meter", () => {
    const game = gameFor(CLUSTER, { durationMs: 40000 });
    const names = collectNames(game);
    // One miss from empty, so the first note of the cluster ends the run.
    game.debugSetAura(-AURA_CONFIG.miss);
    game.update(1400);
    expect(names).toEqual(["judgment:miss:e0L0", "auraWarning", "fail"]);
    expect(game.snapshot().misses).toBe(1);
    expect(game.snapshot().judgedCount).toBe(1);
    // Nothing else resolves afterwards either.
    game.update(9000);
    expect(names).toEqual(["judgment:miss:e0L0", "auraWarning", "fail"]);
  });

  it("reports the same summary inside the fail handler and after the update", () => {
    const game = gameFor(CLUSTER, { durationMs: 40000 });
    game.debugSetAura(-AURA_CONFIG.miss);
    let inside: string | null = null;
    game.events.on("fail", () => {
      inside = JSON.stringify(game.summary());
    });
    game.update(1400);
    expect(inside).toBe(JSON.stringify(game.summary()));
  });

  it("ignores a press whose own sweep just failed the run", () => {
    const game = gameFor(
      [
        { timeMs: 1000, lanes: [0] },
        { timeMs: 1180, lanes: [1] },
      ],
      { durationMs: 40000 },
    );
    game.debugSetAura(-AURA_CONFIG.miss);
    game.update(1100);
    const names = collectNames(game);
    // The note at 1000 is overdue at 1205, and missing it empties the meter.
    expect(game.press(1, 1205)).toBeNull();
    expect(names).toEqual(["judgment:miss:e0L0", "fail"]);
    const snap = game.snapshot();
    expect(snap.score).toBe(0);
    expect(snap.combo).toBe(0);
    expect(snap.judgedCount).toBe(1);
    expect(snap.aura).toBe(0);
  });

  it("ignores a release whose own sweep just failed the run", () => {
    const game = gameFor(
      [
        { timeMs: 1000, lanes: [1], durationMs: 600 },
        { timeMs: 1400, lanes: [0] },
      ],
      { durationMs: 40000 },
    );
    game.press(1, 1000);
    game.debugSetAura(-AURA_CONFIG.miss);
    const names = collectNames(game);
    // The sweep the release runs first misses the note at 1400 and fails the
    // run, which drops the hold quietly, so the release itself has no work.
    game.release(1, 1650);
    expect(names).toEqual(["judgment:miss:e1L0", "auraWarning", "holdEnd", "fail"]);
    expect(game.summary().earlyReleases).toBe(0);
    expect(game.snapshot().holdingLanes[1]).toBe(false);
  });
});
