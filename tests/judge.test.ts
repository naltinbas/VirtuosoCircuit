import { describe, expect, it } from "vitest";
import { HIGHWAY, JUDGMENT_WINDOWS_MS, type JudgmentWindows } from "../src/app/Config";
import { NoteJudge, isHit } from "../src/gameplay/NoteJudge";
import { collect, collectNames, gameFor } from "./gamefixtures";

const W = JUDGMENT_WINDOWS_MS;

describe("NoteJudge windows", () => {
  const judge = new NoteJudge();

  it("grades the exact edge of every window on both sides", () => {
    expect(judge.judge(0)).toBe("radiant");
    expect(judge.judge(W.radiant)).toBe("radiant");
    expect(judge.judge(-W.radiant)).toBe("radiant");
    expect(judge.judge(W.radiant + 0.001)).toBe("precise");
    expect(judge.judge(-W.radiant - 0.001)).toBe("precise");
    expect(judge.judge(W.precise)).toBe("precise");
    expect(judge.judge(-W.precise)).toBe("precise");
    expect(judge.judge(W.precise + 0.001)).toBe("good");
    expect(judge.judge(-W.precise - 0.001)).toBe("good");
    expect(judge.judge(W.good)).toBe("good");
    expect(judge.judge(-W.good)).toBe("good");
    expect(judge.judge(W.good + 0.001)).toBe("faint");
    expect(judge.judge(-W.good - 0.001)).toBe("faint");
    expect(judge.judge(W.faint)).toBe("faint");
    expect(judge.judge(-W.faint)).toBe("faint");
    expect(judge.judge(W.faint + 0.001)).toBe("miss");
    expect(judge.judge(-W.faint - 0.001)).toBe("miss");
    expect(judge.judge(W.miss)).toBe("miss");
    expect(judge.judge(-W.miss)).toBe("miss");
  });

  it("has no judgment at all beyond the miss window", () => {
    expect(judge.judge(W.miss + 0.001)).toBeNull();
    expect(judge.judge(-W.miss - 0.001)).toBeNull();
    expect(judge.judge(5000)).toBeNull();
  });

  it("reports an auto-miss just outside the miss window", () => {
    expect(judge.autoMissDeltaMs).toBe(W.miss + 1);
    expect(judge.judge(judge.autoMissDeltaMs)).toBeNull();
  });

  it("uses the window table it was given", () => {
    const tight = new NoteJudge({ radiant: 10, precise: 20, good: 30, faint: 40, miss: 50 });
    expect(tight.judge(10)).toBe("radiant");
    expect(tight.judge(11)).toBe("precise");
    expect(tight.judge(41)).toBe("miss");
    expect(tight.judge(51)).toBeNull();
    expect(tight.missWindowMs).toBe(50);
  });

  it("knows which judgments are hits", () => {
    expect(isHit("radiant")).toBe(true);
    expect(isHit("faint")).toBe(true);
    expect(isHit("miss")).toBe(false);
  });
});

describe("press judging", () => {
  it("grades a press against the note in its lane", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [2] }]);
    const result = game.press(2, 1000 + W.precise);
    expect(result).toEqual({ noteId: "e0L2", judgment: "precise", deltaMs: W.precise });
  });

  it("returns null when no note is in range", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }]);
    expect(game.press(0, 1000 - W.miss - 1)).toBeNull();
    expect(game.press(1, 1000)).toBeNull();
    expect(game.snapshot().judgedCount).toBe(0);
  });

  it("consumes a note as a miss when the press is past the last hit tier", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }]);
    const late = game.press(0, 1000 + W.faint + 1);
    expect(late?.judgment).toBe("miss");
    expect(game.snapshot().misses).toBe(1);
    expect(game.press(0, 1000 + W.faint + 2)).toBeNull();
  });

  it("consumes an early press outside the hit tiers too", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [4] }]);
    expect(game.press(4, 1000 - W.miss)?.judgment).toBe("miss");
  });

  it("consumes exactly one note per press", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }]);
    expect(game.press(0, 1000)?.judgment).toBe("radiant");
    expect(game.press(0, 1000)).toBeNull();
    expect(game.snapshot().judgedCount).toBe(1);
  });

  it("gives the earliest note in the lane to the press", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0] },
      { timeMs: 1100, lanes: [0] },
    ]);
    expect(game.press(0, 1050)).toEqual({ noteId: "e0L0", judgment: "precise", deltaMs: 50 });
    expect(game.press(0, 1050)).toEqual({ noteId: "e1L0", judgment: "precise", deltaMs: -50 });
  });

  it("judges each lane of a chord on its own", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0, 2] }]);
    expect(game.press(0, 1000)?.noteId).toBe("e0L0");
    expect(game.press(2, 1010)?.noteId).toBe("e0L2");
    expect(game.press(1, 1000)).toBeNull();
  });
});

describe("auto miss", () => {
  it("keeps the note pending right up to the threshold", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }]);
    game.update(1000 + W.miss);
    expect(game.snapshot().judgedCount).toBe(0);
    expect(game.press(0, 1000 + W.miss)?.judgment).toBe("miss");
  });

  it("misses the note once song time passes it", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }]);
    const judgments = collect(game, "judgment");
    game.update(1000 + W.miss);
    expect(judgments).toHaveLength(0);
    game.update(1000 + W.miss + 1);
    expect(judgments).toEqual([
      { noteId: "e0L0", lane: 0, judgment: "miss", deltaMs: W.miss + 1, songMs: 1000 + W.miss + 1 },
    ]);
    game.update(5000);
    expect(judgments).toHaveLength(1);
  });

  it("sweeps in chart order however far time jumps", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0] },
      { timeMs: 1100, lanes: [3] },
      { timeMs: 1200, lanes: [1] },
    ]);
    const names = collectNames(game, ["judgment"]);
    game.update(4000);
    expect(names).toEqual(["judgment:miss:e0L0", "judgment:miss:e1L3", "judgment:miss:e2L1"]);
  });

  it("runs the sweep before judging a press, so an older miss lands first", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0] },
      { timeMs: 1300, lanes: [1] },
    ]);
    const names = collectNames(game, ["judgment"]);
    expect(game.press(1, 1300)?.judgment).toBe("radiant");
    expect(names).toEqual(["judgment:miss:e0L0", "judgment:radiant:e1L1"]);
    expect(game.snapshot().combo).toBe(1);
  });

  it("sweeps on release and on a surge attempt too", () => {
    const released = gameFor([{ timeMs: 1000, lanes: [0] }]);
    const releaseNames = collectNames(released, ["judgment"]);
    released.release(0, 2000);
    expect(releaseNames).toEqual(["judgment:miss:e0L0"]);

    const surged = gameFor([{ timeMs: 1000, lanes: [0] }]);
    const surgeNames = collectNames(surged, ["judgment"]);
    surged.activateFocusSurge(2000);
    expect(surgeNames).toEqual(["judgment:miss:e0L0"]);
  });

  it("ignores times that run backwards", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0] },
      { timeMs: 3000, lanes: [1] },
    ]);
    game.update(2000);
    expect(game.snapshot().misses).toBe(1);
    expect(() => game.update(0)).not.toThrow();
    expect(game.snapshot().misses).toBe(1);
    expect(game.press(1, 3000)?.judgment).toBe("radiant");
  });
});

describe("judgment offset", () => {
  it("shifts presses by the offset", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }], { judgmentOffsetMs: 40 });
    expect(game.press(0, 1040)).toEqual({ noteId: "e0L0", judgment: "radiant", deltaMs: 0 });
  });

  it("shifts the auto-miss threshold by the offset", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }], { judgmentOffsetMs: 40 });
    game.update(1000 + W.miss + 40);
    expect(game.snapshot().judgedCount).toBe(0);
    game.update(1000 + W.miss + 41);
    expect(game.snapshot().misses).toBe(1);
  });

  it("shifts hold release and hold ticks by the offset", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0], durationMs: 500 }], { judgmentOffsetMs: 40 });
    game.press(0, 1040);
    game.update(1290);
    expect(game.summary().holdTicks).toBe(2);
    game.release(0, 1540);
    expect(game.summary().holdTicks).toBe(5);
    const ends = game.summary();
    expect(ends.earlyReleases).toBe(0);
  });

  it("stops counting the notes a smaller offset walks past", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0] },
      { timeMs: 1200, lanes: [1] },
      { timeMs: 1400, lanes: [2] },
    ], { judgmentOffsetMs: 250 });
    const names = collectNames(game);
    game.update(1100);
    expect(names).toEqual([]);
    // The calibration sliders move while the clock is frozen at a pause, so
    // the judgment frame jumps forward with no song time behind it.
    game.setJudgmentOffsetMs(-250);
    game.update(1100);
    expect(names).toEqual([]);
    expect(game.snapshot().misses).toBe(0);
    expect(game.snapshot().judgedCount).toBe(0);
    // The note at 1000 has no gate under the new offset, so it stops counting.
    expect(game.snapshot().totalNotes).toBe(2);
    expect(game.press(1, 1100)?.judgment).toBe("faint");
  });

  it("leaves the notes alone when the offset grows", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }], { judgmentOffsetMs: 0 });
    game.update(900);
    game.setJudgmentOffsetMs(400);
    expect(game.snapshot().totalNotes).toBe(1);
    expect(game.press(0, 1400)?.judgment).toBe("radiant");
  });

  it("leaves a finished run untouched", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0] },
      { timeMs: 30000, lanes: [1] },
    ], { durationMs: 2000 });
    game.press(0, 1000);
    game.update(2000 + HIGHWAY.outroMs);
    const before = game.summary();
    game.setJudgmentOffsetMs(-1000);
    expect(game.summary()).toEqual(before);
  });

  it("takes a new offset mid run", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0] },
      { timeMs: 2000, lanes: [0] },
    ]);
    expect(game.press(0, 1000)?.deltaMs).toBe(0);
    game.setJudgmentOffsetMs(100);
    expect(game.judgmentOffsetMs).toBe(100);
    expect(game.press(0, 2100)?.deltaMs).toBe(0);
  });
});

describe("custom windows", () => {
  const windows: JudgmentWindows = { radiant: 10, precise: 20, good: 30, faint: 40, miss: 50 };

  it("uses the windows the run was built with", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }], { windows });
    expect(game.windows).toEqual(windows);
    expect(game.press(0, 1010)?.judgment).toBe("radiant");
  });

  it("consumes and auto-misses on the custom miss window", () => {
    const consumed = gameFor([{ timeMs: 1000, lanes: [0] }], { windows });
    expect(consumed.press(0, 1045)?.judgment).toBe("miss");

    const ignored = gameFor([{ timeMs: 1000, lanes: [0] }], { windows });
    expect(ignored.press(0, 1051)).toBeNull();

    const swept = gameFor([{ timeMs: 1000, lanes: [0] }], { windows });
    const judgments = collect(swept, "judgment");
    swept.update(1050);
    expect(judgments).toHaveLength(0);
    swept.update(1051);
    expect(judgments[0].deltaMs).toBe(51);
  });
});
