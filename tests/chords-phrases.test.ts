import { describe, expect, it } from "vitest";
import { AURA_CONFIG, SCORE_CONFIG } from "../src/app/Config";
import { chart, phrase, trill } from "../src/charts/Authoring";
import { authoredTrack, collect, collectNames, gameFor, makeGame } from "./gamefixtures";

describe("chords", () => {
  it("pays the chord bonus when every lane lands", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0, 2] }]);
    const chords = collect(game, "chordComplete");
    const names = collectNames(game, ["judgment", "chordComplete"]);
    game.press(0, 1000);
    expect(chords).toEqual([]);
    game.press(2, 1000);
    expect(chords).toEqual([{ eventId: "e0" }]);
    expect(names).toEqual(["judgment:radiant:e0L0", "judgment:radiant:e0L2", "chordComplete"]);
    expect(game.snapshot().chordsCompleted).toBe(1);
    expect(game.snapshot().score).toBe(2 * SCORE_CONFIG.radiant + SCORE_CONFIG.chordCompletionBonus);
    expect(game.snapshot().aura).toBeCloseTo(
      AURA_CONFIG.start + 2 * AURA_CONFIG.radiant + AURA_CONFIG.chordComplete,
      5,
    );
  });

  it("pays a three lane chord once and only once", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0, 2, 4] }]);
    const chords = collect(game, "chordComplete");
    game.press(0, 1000);
    game.press(2, 1000);
    game.press(4, 1000);
    game.update(2000);
    game.press(0, 2000);
    expect(chords).toHaveLength(1);
    expect(game.summary().chordsCompleted).toBe(1);
  });

  it("withholds the bonus when one lane is missed", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0, 2] }]);
    const chords = collect(game, "chordComplete");
    game.press(0, 1000);
    game.update(1300);
    expect(chords).toEqual([]);
    expect(game.snapshot().chordsCompleted).toBe(0);
    expect(game.snapshot().score).toBe(SCORE_CONFIG.radiant);
  });

  it("withholds the bonus when one lane was skipped", () => {
    const game = gameFor([{ timeMs: 1000, lanes: [0, 2] }]);
    const chords = collect(game, "chordComplete");
    game.skipBefore(1001);
    game.press(0, 1000);
    expect(chords).toEqual([]);
  });

  it("uses the Harmony Factor in force when the bonus is paid", () => {
    const notes = [];
    for (let i = 0; i < 9; i++) notes.push({ timeMs: 1000 + i * 300, lanes: [1] as [1] });
    const game = gameFor([...notes, { timeMs: 5000, lanes: [0, 2] }]);
    for (let i = 0; i < 9; i++) game.press(1, 1000 + i * 300);
    game.press(0, 5000);
    game.press(2, 5000);
    expect(game.snapshot().multiplier).toBe(2);
    expect(game.summary().chordsCompleted).toBe(1);
    // Nine hits at x1, then the tenth and eleventh at x2, then the bonus at x2.
    expect(game.snapshot().score).toBe(
      9 * SCORE_CONFIG.radiant + 2 * (2 * SCORE_CONFIG.radiant) + 2 * SCORE_CONFIG.chordCompletionBonus,
    );
  });

  it("counts every lane of a dropped chord as its own miss", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0, 1, 2] },
      { timeMs: 2000, lanes: [4] },
    ]);
    const names = collectNames(game, ["judgment", "recenter"]);
    game.update(1300);
    expect(game.snapshot().missStreak).toBe(3);
    expect(game.snapshot().misses).toBe(3);
    game.press(4, 2000);
    expect(names[names.length - 1]).toBe("recenter");
  });
});

describe("phrases", () => {
  const PHRASE = [
    { timeMs: 1000, lanes: [0] as [0], phraseId: "p1" },
    { timeMs: 1400, lanes: [1] as [1], phraseId: "p1" },
  ];

  it("pays the Perfect Passage when the last note lands", () => {
    const game = gameFor(PHRASE);
    const phrases = collect(game, "phraseComplete");
    const names = collectNames(game, ["judgment", "phraseComplete"]);
    game.press(0, 1000);
    expect(phrases).toEqual([]);
    game.press(1, 1400);
    expect(phrases).toEqual([{ phraseId: "p1", trill: false }]);
    expect(names).toEqual(["judgment:radiant:e0L0", "judgment:radiant:e1L1", "phraseComplete"]);
    expect(game.snapshot().phrasesCompleted).toBe(1);
    expect(game.snapshot().score).toBe(2 * SCORE_CONFIG.radiant + SCORE_CONFIG.phraseCompletionBonus);
    expect(game.snapshot().aura).toBeCloseTo(
      AURA_CONFIG.start + 2 * AURA_CONFIG.radiant + AURA_CONFIG.phraseComplete,
      5,
    );
  });

  it("withholds the bonus when a note in the phrase is missed", () => {
    const game = gameFor(PHRASE);
    const phrases = collect(game, "phraseComplete");
    game.update(1300);
    game.press(1, 1400);
    expect(phrases).toEqual([]);
    expect(game.snapshot().phrasesCompleted).toBe(0);
  });

  it("withholds the bonus when a note in the phrase was skipped", () => {
    const game = gameFor(PHRASE);
    const phrases = collect(game, "phraseComplete");
    game.skipBefore(1200);
    game.press(1, 1400);
    expect(phrases).toEqual([]);
    expect(game.snapshot().judgedCount).toBe(1);
  });

  it("still completes when a hold in the phrase was dropped", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0], durationMs: 500, phraseId: "p1" },
      { timeMs: 1800, lanes: [1], phraseId: "p1" },
    ]);
    const phrases = collect(game, "phraseComplete");
    game.press(0, 1000);
    game.release(0, 1200);
    expect(game.summary().earlyReleases).toBe(1);
    game.press(1, 1800);
    expect(phrases).toEqual([{ phraseId: "p1", trill: false }]);
  });

  it("pays a phrase once until the notes come back", () => {
    const game = gameFor(PHRASE);
    const phrases = collect(game, "phraseComplete");
    game.press(0, 1000);
    game.press(1, 1400);
    game.update(3000);
    expect(phrases).toHaveLength(1);
  });
});

describe("trills", () => {
  it("pays the trill bonus and counts trills separately", () => {
    const game = gameFor([
      { timeMs: 1000, lanes: [0], phraseId: "trill-a" },
      { timeMs: 1150, lanes: [1], phraseId: "trill-a" },
    ]);
    const phrases = collect(game, "phraseComplete");
    game.press(0, 1000);
    game.press(1, 1150);
    expect(phrases).toEqual([{ phraseId: "trill-a", trill: true }]);
    expect(game.snapshot().trillsCompleted).toBe(1);
    expect(game.snapshot().phrasesCompleted).toBe(0);
    expect(game.snapshot().score).toBe(2 * SCORE_CONFIG.radiant + SCORE_CONFIG.trillCompletionBonus);
  });

  it("reports how many chords, phrases and trills the chart holds", () => {
    const game = gameFor([
      { timeMs: 500, lanes: [0, 1] },
      { timeMs: 1000, lanes: [2], phraseId: "p1" },
      { timeMs: 1400, lanes: [3], phraseId: "p1" },
      { timeMs: 2000, lanes: [0], phraseId: "trill-a" },
      { timeMs: 2150, lanes: [1], phraseId: "trill-a" },
    ]);
    const summary = game.summary();
    expect(summary.chordCount).toBe(1);
    expect(summary.phraseCount).toBe(1);
    expect(summary.trillCount).toBe(1);
    expect(summary.totalNotes).toBe(6);
  });
});

describe("charts compiled from the beat notation", () => {
  it("pays the phrase and the trill written with the authoring helpers", () => {
    const beats = chart("virtuoso", phrase("a", 0, "0 1 2 3"), trill("t", 4, "0 1 0 1"));
    const game = makeGame(authoredTrack(beats.events, "virtuoso", 120));
    const phrases = collect(game, "phraseComplete");
    const lanes: number[] = [0, 1, 2, 3, 0, 1, 0, 1];
    lanes.forEach((lane, i) => {
      const result = game.press(lane as 0 | 1 | 2 | 3, i * 500);
      expect(result?.judgment).toBe("radiant");
    });
    expect(phrases).toEqual([
      { phraseId: "a", trill: false },
      { phraseId: "trill-t", trill: true },
    ]);
    expect(game.summary().phrasesCompleted).toBe(1);
    expect(game.summary().trillsCompleted).toBe(1);
    expect(game.summary().judgedCount).toBe(8);
  });
});
