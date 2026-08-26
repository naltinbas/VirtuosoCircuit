import { describe, expect, it } from "vitest";
import { AURA_CONFIG, HIGHWAY, PRACTICE_SPEEDS, SCORE_CONFIG } from "../src/app/Config";
import type { Lane } from "../src/charts/ChartTypes";
import type { NoteView } from "../src/gameplay/NoteScheduler";
import { PracticeSystem, snapPracticeRate } from "../src/gameplay/PracticeSystem";
import type { RhythmGame } from "../src/gameplay/RhythmGame";
import type { EventSpec } from "./gamefixtures";
import { buildTrack, collect, gameFor, makeGame } from "./gamefixtures";

const PHRASE: EventSpec[] = [
  { timeMs: 1000, lanes: [0], phraseId: "p1" },
  { timeMs: 1400, lanes: [1], phraseId: "p1" },
];

function viewOf(game: RhythmGame, noteId: string, displayMs: number): NoteView | undefined {
  const out: NoteView[] = [];
  const count = game.visibleNotes(displayMs, 2000, out);
  return out.slice(0, count).find((view) => view.note.id === noteId);
}

describe("PracticeSystem", () => {
  const track = buildTrack([{ timeMs: 1000, lanes: [0] }], {
    durationMs: 20000,
    sections: [
      { name: "Opening", startMs: 0, endMs: 6000 },
      { name: "Middle", startMs: 6000, endMs: 14000 },
      { name: "Close", startMs: 14000, endMs: 20000 },
    ],
  });

  it("starts at full speed with the loop off", () => {
    const practice = new PracticeSystem(track);
    expect(practice.rate).toBe(1);
    expect(practice.loopEnabled).toBe(false);
    expect(practice.loopStartMs).toBe(0);
    expect(practice.loopEndMs).toBe(20000);
    expect(practice.checkpointsMs).toEqual([0, 6000, 14000]);
    expect(practice.endMs).toBe(20000 + HIGHWAY.outroMs);
  });

  it("snaps any rate to a speed the menu offers", () => {
    expect(snapPracticeRate(0.73)).toBe(0.7);
    expect(snapPracticeRate(0.44)).toBe(0.5);
    expect(snapPracticeRate(3)).toBe(1);
    expect(PRACTICE_SPEEDS).toContain(snapPracticeRate(0.62));
    const practice = new PracticeSystem(track, { rate: 0.81 });
    expect(practice.rate).toBe(0.8);
    practice.setRate(0.5);
    expect(practice.rate).toBe(0.5);
  });

  it("orders and clamps the loop range", () => {
    const practice = new PracticeSystem(track);
    practice.setLoop(9000, 3000, true);
    expect(practice.loopStartMs).toBe(3000);
    expect(practice.loopEndMs).toBe(9000);
    practice.setLoop(-500, 99000, true);
    expect(practice.loopStartMs).toBe(0);
    expect(practice.loopEndMs).toBe(20000);
  });

  it("wraps only inside a real enabled range", () => {
    const practice = new PracticeSystem(track);
    practice.setLoop(3000, 9000, false);
    expect(practice.shouldWrap(12000)).toBe(false);
    practice.setLoopEnabled(true);
    expect(practice.looping).toBe(true);
    expect(practice.shouldWrap(8999)).toBe(false);
    expect(practice.shouldWrap(9000)).toBe(true);
    practice.setLoop(5000, 5000, true);
    expect(practice.looping).toBe(false);
    expect(practice.shouldWrap(5000)).toBe(false);
  });

  it("enters a loop with a run up and the whole track without one", () => {
    const practice = new PracticeSystem(track);
    expect(practice.entryMs(1500)).toBe(-1500);
    practice.setLoop(6000, 14000, true);
    expect(practice.entryMs(1500)).toBe(4500);
    expect(practice.entryMs()).toBe(6000 - HIGHWAY.practicePrerollMs);
  });

  it("starts the pass at the top once the loop toggle goes off", () => {
    const practice = new PracticeSystem(track);
    practice.setSection(track.sections[1]);
    expect(practice.passStartMs).toBe(6000);
    expect(practice.entryMs(1500)).toBe(4500);
    practice.setLoopEnabled(false);
    // The pass now plays the whole track, so the loop start is not where it begins.
    expect(practice.loopStartMs).toBe(6000);
    expect(practice.passStartMs).toBe(0);
    expect(practice.entryMs(1500)).toBe(-1500);
    // An enabled but empty range plays from the top too.
    practice.setLoop(5000, 5000, true);
    expect(practice.passStartMs).toBe(0);
  });

  it("keeps every note countable on a pass that starts at the top", () => {
    const specs: EventSpec[] = [];
    for (let i = 0; i < 8; i++) specs.push({ timeMs: 2000 + i * 2000, lanes: [(i % 5) as Lane] });
    const chart = buildTrack(specs, { durationMs: 20000 });
    const game = makeGame(chart, { mode: "practice" });
    const practice = new PracticeSystem(chart);
    practice.setLoop(10000, 18000, true);
    practice.setLoopEnabled(false);
    // What App does when it re-enters a practice pass.
    game.rearmFrom(practice.entryMs());
    game.skipBefore(practice.passStartMs);
    expect(game.snapshot().totalNotes).toBe(8);
    expect(game.press(0, 2000)?.judgment).toBe("radiant");
  });

  it("loops the section it is handed", () => {
    const practice = new PracticeSystem(track);
    practice.setSection(track.sections[1]);
    expect(practice.loopEnabled).toBe(true);
    expect(practice.loopStartMs).toBe(6000);
    expect(practice.loopEndMs).toBe(14000);
    practice.setSection(null);
    expect(practice.loopEnabled).toBe(false);
    expect(practice.loopStartMs).toBe(0);
  });

  it("finds sections and checkpoints around a time", () => {
    const practice = new PracticeSystem(track);
    expect(practice.sectionAt(7000)?.name).toBe("Middle");
    expect(practice.sectionAt(20000)).toBeNull();
    expect(practice.checkpointBefore(7000)).toBe(6000);
    expect(practice.checkpointBefore(0)).toBe(0);
    expect(practice.checkpointAfter(7000)).toBe(14000);
    expect(practice.checkpointAfter(19000)).toBe(14000);
    expect(practice.isPastEnd(20000 + HIGHWAY.outroMs)).toBe(true);
    expect(practice.isPastEnd(20000)).toBe(false);
  });

  it("falls back to a single checkpoint when the track has no sections", () => {
    const bare = new PracticeSystem(buildTrack([{ timeMs: 1000, lanes: [0] }]));
    expect(bare.checkpointsMs).toEqual([0]);
    expect(bare.checkpointBefore(5000)).toBe(0);
    expect(bare.checkpointAfter(5000)).toBe(0);
  });
});

describe("rearmFrom", () => {
  it("puts the notes back and takes their judgments off the books", () => {
    const game = gameFor(PHRASE, { mode: "practice" });
    game.press(0, 1000);
    game.press(1, 1400 + 20);
    const before = game.snapshot();
    expect(before.judgedCount).toBe(2);
    expect(before.phrasesCompleted).toBe(1);
    const score = before.score;
    const aura = before.aura;

    game.rearmFrom(1000);
    const after = game.snapshot();
    expect(after.judgedCount).toBe(0);
    expect(after.counts.radiant).toBe(0);
    expect(after.counts.precise).toBe(0);
    expect(after.accuracy).toBe(0);
    expect(after.totalNotes).toBe(2);
    expect(game.summary().timingDeltas).toEqual([]);
    // The run keeps what it earned; only the notes come back.
    expect(after.score).toBe(score);
    expect(after.aura).toBe(aura);
    expect(after.combo).toBe(2);
    expect(after.bestCombo).toBe(2);
    expect(viewOf(game, "e0L0", 1000)?.state).toBe("pending");
  });

  it("lets a loop earn the phrase again", () => {
    const game = gameFor(PHRASE, { mode: "practice" });
    const phrases = collect(game, "phraseComplete");
    game.press(0, 1000);
    game.press(1, 1400);
    game.rearmFrom(1000);
    game.press(0, 1000);
    game.press(1, 1400);
    expect(phrases).toHaveLength(2);
    expect(game.snapshot().phrasesCompleted).toBe(2);
    expect(game.snapshot().score).toBe(2 * (2 * SCORE_CONFIG.radiant + SCORE_CONFIG.phraseCompletionBonus));
  });

  it("lets a loop earn the chord again", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0, 2] }], { mode: "practice" });
    const chords = collect(game, "chordComplete");
    game.press(0, 1000);
    game.press(2, 1000);
    game.rearmFrom(500);
    game.press(0, 1000);
    game.press(2, 1000);
    expect(chords).toHaveLength(2);
    expect(game.snapshot().chordsCompleted).toBe(2);
  });

  it("leaves notes before the rearm point alone", () => {
    const game = gameFor(PHRASE, { mode: "practice" });
    game.press(0, 1000);
    game.press(1, 1400);
    game.rearmFrom(1200);
    expect(game.snapshot().judgedCount).toBe(1);
    expect(viewOf(game, "e0L0", 1000)?.state).toBe("hit");
    expect(viewOf(game, "e1L1", 1400)?.state).toBe("pending");
  });

  it("drops a hold in progress without a penalty", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0], durationMs: 500 }], { mode: "practice" });
    const ends = collect(game, "holdEnd");
    game.press(0, 1000);
    game.update(1200);
    game.rearmFrom(0);
    expect(ends).toEqual([{ noteId: "e0L0", completed: false, quiet: true }]);
    expect(game.summary().earlyReleases).toBe(0);
    expect(game.snapshot().holdingLanes[0]).toBe(false);
    expect(game.summary().holdTicks).toBe(2);
    expect(viewOf(game, "e0L0", 1000)?.state).toBe("pending");
  });

  it("starts the next update from the rearm point", () => {
    const game = gameFor([{ timeMs: 30000, lanes: [0] }], { mode: "practice", durationMs: 60000 });
    game.debugSetAura(AURA_CONFIG.max);
    game.update(0);
    game.activateFocusSurge(0);
    game.update(4000);
    const remaining = game.snapshot().surgeRemainingMs;
    game.rearmFrom(0);
    game.update(0);
    expect(game.snapshot().surgeRemainingMs).toBe(remaining);
  });
});

describe("skipBefore", () => {
  it("takes skipped notes out of the totals and the accuracy", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0] },
      { timeMs: 1400, lanes: [1] },
      { timeMs: 1800, lanes: [2] },
    ]);
    expect(game.snapshot().totalNotes).toBe(3);
    game.skipBefore(1500);
    expect(game.snapshot().totalNotes).toBe(1);
    expect(game.snapshot().judgedCount).toBe(0);
    game.press(2, 1800);
    expect(game.snapshot().accuracy).toBe(100);
    expect(game.summary().totalNotes).toBe(1);
    expect(game.summary().judgedCount).toBe(1);
    expect(viewOf(game, "e0L0", 1000)?.state).toBe("skipped");
  });

  it("emits nothing for skipped notes", () => {
    const game = gameFor(PHRASE);
    const judgments = collect(game, "judgment");
    game.skipBefore(2000);
    expect(judgments).toEqual([]);
    expect(game.snapshot().misses).toBe(0);
    expect(game.snapshot().combo).toBe(0);
  });

  it("leaves judged notes as they were", () => {
    const game = gameFor(PHRASE);
    game.press(0, 1000);
    game.skipBefore(1200);
    expect(game.snapshot().totalNotes).toBe(2);
    expect(viewOf(game, "e0L0", 1000)?.state).toBe("hit");
  });

  it("brings a skipped note back on a rearm", () => {
    const game = gameFor(PHRASE, { mode: "practice" });
    game.skipBefore(2000);
    expect(game.snapshot().totalNotes).toBe(0);
    game.rearmFrom(0);
    expect(game.snapshot().totalNotes).toBe(2);
    expect(game.press(0, 1000)?.judgment).toBe("radiant");
  });
});

describe("reset", () => {
  it("returns the run to a pristine state", () => {
    const game = gameFor(PHRASE, { durationMs: 4000 });
    game.press(0, 1000 + 20);
    game.update(2000);
    game.update(30000);
    expect(game.snapshot().finished).toBe(true);

    game.reset();
    const snap = game.snapshot();
    expect(snap.score).toBe(0);
    expect(snap.combo).toBe(0);
    expect(snap.bestCombo).toBe(0);
    expect(snap.multiplier).toBe(1);
    expect(snap.aura).toBe(AURA_CONFIG.start);
    expect(snap.judgedCount).toBe(0);
    expect(snap.totalNotes).toBe(2);
    expect(snap.counts).toEqual({ radiant: 0, precise: 0, good: 0, faint: 0, miss: 0 });
    expect(snap.missStreak).toBe(0);
    expect(snap.lastJudgment).toBeNull();
    expect(snap.lastJudgmentLane).toBe(-1);
    expect(snap.finished).toBe(false);
    expect(snap.failed).toBe(false);
    expect(snap.completed).toBe(false);
    expect(snap.songMs).toBe(0);
    expect(game.summary().timingDeltas).toEqual([]);
    expect(game.summary().seal).toBe("unfinished");

    const phrases = collect(game, "phraseComplete");
    expect(game.press(0, 1000)?.judgment).toBe("radiant");
    game.press(1, 1400);
    expect(phrases).toHaveLength(1);
  });
});

describe("the finished run", () => {
  it("ignores everything after the track completes", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0], durationMs: 400 }], { durationMs: 4000 });
    const completes = collect(game, "complete");
    game.update(30000);
    expect(completes).toHaveLength(1);
    const songMs = game.snapshot().songMs;

    expect(game.press(0, 1000)).toBeNull();
    game.release(0, 1000);
    expect(game.activateFocusSurge(1000)).toBe(false);
    game.update(60000);
    expect(game.snapshot().songMs).toBe(songMs);
    expect(completes).toHaveLength(1);
    expect(game.snapshot().judgedCount).toBe(1);
  });

  it("ignores everything after a failed run", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0] }], { durationMs: 40000 });
    const names: string[] = [];
    game.events.on("fail", () => names.push("fail"));
    game.events.on("complete", () => names.push("complete"));
    game.debugSetAura(0);
    game.update(0);
    expect(names).toEqual(["fail"]);
    expect(game.press(0, 1000)).toBeNull();
    game.update(99999);
    expect(names).toEqual(["fail"]);
    expect(game.snapshot().failed).toBe(true);
  });
});

describe("determinism", () => {
  const specs: EventSpec[] = [
    { timeMs: 1000, lanes: [0], phraseId: "p1" },
    { timeMs: 1300, lanes: [1, 3], phraseId: "p1" },
    { timeMs: 1700, lanes: [2], durationMs: 600, phraseId: "p1" },
    { timeMs: 2500, lanes: [4], phraseId: "trill-a" },
    { timeMs: 2650, lanes: [3], phraseId: "trill-a" },
    { timeMs: 3000, lanes: [0] },
    { timeMs: 3400, lanes: [1] },
  ];

  function playScript(game: RhythmGame): void {
    const offsets = [0, 18, -30, 5, 140, -70, 200];
    let step = 0;
    for (let t = 0; t <= 8000; t += 16) {
      game.update(t);
      for (const spec of specs) {
        const at = spec.timeMs + offsets[step % offsets.length];
        if (at > t - 16 && at <= t && spec.timeMs !== 3400) {
          game.press(spec.lanes[0] as Lane, at);
          if (spec.durationMs) game.release(spec.lanes[0] as Lane, at + 400);
          step++;
        }
      }
      if (t === 2000) game.activateFocusSurge(t);
    }
    game.update(30000);
  }

  it("gives two identical input sequences identical results", () => {
    const first = makeGame(buildTrack(specs, { durationMs: 6000 }));
    const second = makeGame(buildTrack(specs, { durationMs: 6000 }));
    playScript(first);
    playScript(second);
    expect(first.snapshot()).toEqual(second.snapshot());
    expect(first.summary()).toEqual(second.summary());
    expect(first.snapshot().judgedCount).toBeGreaterThan(0);
    expect(first.summary().completed).toBe(true);
  });

  it("gives the same results again after a reset", () => {
    const game = makeGame(buildTrack(specs, { durationMs: 6000 }));
    playScript(game);
    const first = { ...game.summary() };
    game.reset();
    playScript(game);
    expect(game.summary()).toEqual(first);
  });
});
