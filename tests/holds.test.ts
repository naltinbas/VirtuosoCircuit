import { describe, expect, it } from "vitest";
import { AURA_CONFIG, SCORE_CONFIG } from "../src/app/Config";
import { holdTickCount } from "../src/gameplay/HoldNoteSystem";
import type { NoteView } from "../src/gameplay/NoteScheduler";
import type { RhythmGame } from "../src/gameplay/RhythmGame";
import { collect, collectNames, gameFor } from "./gamefixtures";

const HOLD = { timeMs: 1000, lanes: [0] as [0], durationMs: 500 };
const TICKS = holdTickCount(HOLD.durationMs);
const TICK_SCORE = SCORE_CONFIG.holdTick;

function stateOf(game: RhythmGame, noteId: string, displayMs: number): NoteView | undefined {
  const out: NoteView[] = [];
  const count = game.visibleNotes(displayMs, 2000, out);
  return out.slice(0, count).find((view) => view.note.id === noteId);
}

describe("hold heads", () => {
  it("starts a hold and keeps the lane held", () => {
    const game = gameFor([HOLD]);
    const starts = collect(game, "holdStart");
    expect(game.press(0, 1000)?.judgment).toBe("radiant");
    expect(starts).toEqual([{ noteId: "e0L0" }]);
    expect(game.snapshot().holdingLanes).toEqual([true, false, false, false, false]);
    expect(game.snapshot().combo).toBe(1);
    expect(stateOf(game, "e0L0", 1000)?.state).toBe("holding");
  });

  it("leaves a missed head as a plain miss with no hold", () => {
    const game = gameFor([HOLD]);
    const names = collectNames(game);
    game.update(2000);
    expect(names).toEqual(["judgment:miss:e0L0"]);
    expect(game.snapshot().holdingLanes).toEqual([false, false, false, false, false]);
    game.release(0, 2100);
    expect(names).toEqual(["judgment:miss:e0L0"]);
  });

  it("ignores a release in a lane that holds nothing", () => {
    const game = gameFor([HOLD]);
    const ends = collect(game, "holdEnd");
    game.release(3, 1200);
    game.release(0, 1200);
    expect(ends).toEqual([]);
  });
});

describe("hold ticks", () => {
  it("accrues ticks as song time passes them", () => {
    const game = gameFor([HOLD]);
    game.press(0, 1000);
    expect(game.summary().holdTicks).toBe(0);
    game.update(1099);
    expect(game.summary().holdTicks).toBe(0);
    game.update(1100);
    expect(game.summary().holdTicks).toBe(1);
    game.update(1250);
    expect(game.summary().holdTicks).toBe(2);
    expect(game.snapshot().score).toBe(SCORE_CONFIG.radiant + 2 * TICK_SCORE);
  });

  it("pays exactly floor(duration / interval) ticks for a completed hold", () => {
    const game = gameFor([HOLD]);
    game.press(0, 1000);
    game.update(1250);
    game.release(0, 1450);
    expect(game.summary().holdTicks).toBe(TICKS);
    expect(TICKS).toBe(5);
    expect(game.snapshot().score).toBe(SCORE_CONFIG.radiant + TICKS * TICK_SCORE);
  });

  it("pays the same ticks when the song runs past the tail", () => {
    const game = gameFor([HOLD]);
    const ends = collect(game, "holdEnd");
    game.press(0, 1000);
    game.update(1499);
    expect(ends).toEqual([]);
    game.update(1500);
    expect(ends).toEqual([{ noteId: "e0L0", completed: true, quiet: false }]);
    expect(game.summary().holdTicks).toBe(TICKS);
    expect(stateOf(game, "e0L0", 1500)?.state).toBe("holdDone");
    expect(stateOf(game, "e0L0", 1500)?.holdProgress).toBe(1);
  });

  it("does not pay ticks twice when updates repeat", () => {
    const game = gameFor([HOLD]);
    game.press(0, 1000);
    for (let t = 1000; t <= 1600; t += 10) game.update(t);
    for (let t = 1000; t <= 1600; t += 10) game.update(t);
    expect(game.summary().holdTicks).toBe(TICKS);
  });
});

describe("hold release", () => {
  it("completes a release inside the grace window", () => {
    const game = gameFor([HOLD]);
    const ends = collect(game, "holdEnd");
    game.press(0, 1000);
    game.release(0, 1500 - SCORE_CONFIG.holdReleaseGraceMs);
    expect(ends).toEqual([{ noteId: "e0L0", completed: true, quiet: false }]);
    expect(game.summary().earlyReleases).toBe(0);
    expect(game.summary().holdTicks).toBe(TICKS);
  });

  it("drops a release before the grace window", () => {
    const game = gameFor([HOLD]);
    const ends = collect(game, "holdEnd");
    game.press(0, 1000);
    game.release(0, 1350);
    expect(ends).toEqual([{ noteId: "e0L0", completed: false, quiet: false }]);
    expect(game.summary().earlyReleases).toBe(1);
    expect(game.summary().holdTicks).toBe(3);
    expect(game.snapshot().combo).toBe(1);
    expect(game.snapshot().aura).toBeCloseTo(
      AURA_CONFIG.start + AURA_CONFIG.radiant + AURA_CONFIG.earlyRelease,
      5,
    );
    expect(stateOf(game, "e0L0", 1350)?.state).toBe("holdDropped");
    expect(stateOf(game, "e0L0", 1350)?.holdProgress).toBeCloseTo(0.7, 5);
  });

  it("stops paying a dropped hold and never resumes it", () => {
    const game = gameFor([HOLD]);
    const ends = collect(game, "holdEnd");
    game.press(0, 1000);
    game.release(0, 1350);
    game.update(1600);
    expect(game.summary().holdTicks).toBe(3);
    expect(game.press(0, 1360)).toBeNull();
    expect(game.snapshot().holdingLanes[0]).toBe(false);
    expect(ends).toHaveLength(1);
  });

  it("carries two holds at once", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0], durationMs: 500 },
      { timeMs: 1000, lanes: [3], durationMs: 500 },
    ]);
    const ends = collect(game, "holdEnd");
    game.press(0, 1000);
    game.press(3, 1000);
    expect(game.snapshot().holdingLanes).toEqual([true, false, false, true, false]);
    game.update(1250);
    expect(game.summary().holdTicks).toBe(4);
    game.release(3, 1300);
    expect(game.snapshot().holdingLanes).toEqual([true, false, false, false, false]);
    game.update(1500);
    expect(ends).toEqual([
      { noteId: "e1L3", completed: false, quiet: false },
      { noteId: "e0L0", completed: true, quiet: false },
    ]);
    expect(game.summary().holdTicks).toBe(5 + 3);
    expect(game.summary().earlyReleases).toBe(1);
  });
});

describe("overlapping heads", () => {
  it("hands the lane to the newer hold and lets the older one go", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0], durationMs: 500 },
      { timeMs: 1200, lanes: [0], durationMs: 500 },
    ]);
    const ends = collect(game, "holdEnd");
    game.press(0, 1000);
    game.press(0, 1200);
    expect(ends).toEqual([{ noteId: "e0L0", completed: false, quiet: true }]);
    expect(game.summary().earlyReleases).toBe(0);
    expect(game.snapshot().holdingLanes[0]).toBe(true);
    game.update(1700);
    expect(ends).toEqual([
      { noteId: "e0L0", completed: false, quiet: true },
      { noteId: "e1L0", completed: true, quiet: false },
    ]);
  });
});

describe("cancelHolds", () => {
  it("drops holds quietly", () => {
    const game = gameFor([HOLD]);
    const ends = collect(game, "holdEnd");
    game.press(0, 1000);
    game.update(1200);
    const auraBefore = game.snapshot().aura;
    game.cancelHolds();
    expect(ends).toEqual([{ noteId: "e0L0", completed: false, quiet: true }]);
    expect(game.summary().earlyReleases).toBe(0);
    expect(game.snapshot().aura).toBe(auraBefore);
    expect(game.snapshot().holdingLanes[0]).toBe(false);
    expect(game.snapshot().combo).toBe(1);
    expect(game.summary().holdTicks).toBe(2);
  });

  it("is safe with nothing held", () => {
    const game = gameFor([HOLD]);
    const ends = collect(game, "holdEnd");
    expect(() => {
      game.cancelHolds();
      game.cancelHolds();
    }).not.toThrow();
    expect(ends).toEqual([]);
  });
});
