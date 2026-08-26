import { describe, expect, it } from "vitest";
import { chart, lanes, shiftEvents, trill } from "../src/charts/Authoring";
import { compileChart, compileTrack, mapperFor } from "../src/charts/ChartLoader";
import { validateChart, validateTrack } from "../src/charts/ChartValidator";
import { fixtureTrack } from "./fixtures";

function codes(issues: { code: string; level: string }[], level = "error"): string[] {
  return issues.filter((i) => i.level === level).map((i) => i.code);
}

describe("compileTrack", () => {
  it("compiles the fixture cleanly", () => {
    const def = fixtureTrack();
    const track = compileTrack(def);
    expect(track.metadata.durationMs).toBeGreaterThan(60_000);
    expect(track.charts.novice?.events[0].id).toBe("n0");
    expect(track.charts.novice?.notes[0].id).toBe("n0L0");
    expect(track.charts.apprentice?.stats.chordCount).toBe(16);
    expect(track.charts.novice?.stats.holdCount).toBe(16);
    expect(validateTrack(def, track).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("compileTrack chart keys", () => {
  it("refuses a chart whose label disagrees with the key it sits under", () => {
    const def = fixtureTrack();
    def.charts.maestro = chart("virtuoso", lanes(0, "0 1 2 3"));
    expect(() => compileTrack(def)).toThrow(/maestro/);
  });
  it("refuses a difficulty that is not one of the four", () => {
    const def = fixtureTrack();
    (def.charts as Record<string, unknown>).expert = { difficulty: "expert", events: [{ beat: 0, lanes: [0] }] };
    expect(() => compileTrack(def)).toThrow(/expert/);
  });
});

describe("validateChart", () => {
  const def = fixtureTrack();
  const track = compileTrack(def);
  const mapper = mapperFor(track);
  const check = (text: string, difficulty: "novice" | "apprentice" | "virtuoso" | "maestro" = "virtuoso") =>
    validateChart(compileChart(chart(difficulty, lanes(0, text)), mapper), track);

  it("flags notes that do not line up with the music", () => {
    expect(codes(check("0/1 1/1 2/0.75 3/0.25"))).toContain("unaligned");
  });
  it("flags same-lane overlap and tight spacing", () => {
    expect(codes(check("0h/2 &0/1", "novice"))).toContain("lane-overlap");
    const tight = compileChart(chart("novice", lanes(0, "0/1 0/1")), mapper);
    expect(codes(validateChart(tight, track, { minSameLaneGapMs: 600 }))).toContain("lane-gap");
    expect(codes(validateChart(tight, track))).not.toContain("lane-gap");
  });
  it("flags duplicate lanes and oversized chords", () => {
    const c = compileChart({ difficulty: "novice", events: [{ beat: 0, lanes: [0, 0] }] }, mapper);
    expect(codes(validateChart(c, track))).toContain("duplicate-lane");
    expect(codes(check("[0,1,2]/1", "novice"))).toContain("chord-size");
  });
  it("flags too many simultaneous keys", () => {
    const c = compileChart(chart("virtuoso", lanes(0, "0h/4 &1h/4"), lanes(2, "[2,3]/1")), mapper);
    expect(codes(validateChart(c, track))).toContain("too-many-keys");
    const ok = compileChart(chart("virtuoso", lanes(0, "0h/4 &1h/4"), lanes(2, "2/1")), mapper);
    expect(codes(validateChart(ok, track))).not.toContain("too-many-keys");
  });
  it("flags density", () => {
    expect(codes(check("0/0.5 1 2 3 4 0 1 2 3 4", "novice"))).toContain("density");
  });
  it("flags events before the start and past the end", () => {
    const early = compileChart({ difficulty: "novice", events: [{ beat: -1, lanes: [0] }] }, mapper);
    expect(codes(validateChart(early, track))).toContain("before-start");
    const late = compileChart({ difficulty: "novice", events: [{ beat: 100000, lanes: [0] }] }, mapper);
    expect(codes(validateChart(late, track))).toContain("past-end");
  });
  it("flags unsorted input", () => {
    const c = compileChart({ difficulty: "novice", events: [{ beat: 4, lanes: [0] }, { beat: 0, lanes: [1] }] }, mapper);
    expect(codes(validateChart(c, track))).toContain("unsorted");
  });
  it("flags a chord and a single that carry a duration", () => {
    const held = compileChart({ difficulty: "novice", events: [{ beat: 0, lanes: [0, 2], durationBeats: 2 }] }, mapper);
    expect(held.events[0].type).toBe("chord");
    expect(held.events[0].durationMs).toBeGreaterThan(0);
    expect(codes(validateChart(held, track))).toContain("chord-hold");
    const single = compileChart(
      { difficulty: "novice", events: [{ beat: 0, lanes: [1], type: "single", durationBeats: 2 }] },
      mapper,
    );
    expect(codes(validateChart(single, track))).toContain("single-duration");
  });
  it("flags a negative duration on a chord and on a single", () => {
    const chord = compileChart({ difficulty: "novice", events: [{ beat: 4, lanes: [0, 2], durationBeats: -2 }] }, mapper);
    expect(codes(validateChart(chord, track))).toContain("chord-hold");
    const single = compileChart(
      { difficulty: "novice", events: [{ beat: 4, lanes: [1], type: "single", durationBeats: -2 }] },
      mapper,
    );
    expect(codes(validateChart(single, track))).toContain("single-duration");
  });
  it("warns on split chords and tiny phrases", () => {
    const c = compileChart({ difficulty: "novice", events: [{ beat: 0, lanes: [0], phraseId: "x" }, { beat: 0, lanes: [3] }] }, mapper);
    const issues = validateChart(c, track);
    expect(codes(issues, "warning")).toContain("split-chord");
    expect(codes(issues, "warning")).toContain("tiny-phrase");
  });
});

describe("validateTrack", () => {
  it("catches missing charts and bad tempo maps", () => {
    const def = fixtureTrack();
    delete def.charts.virtuoso;
    def.tempoMap = [{ beat: 2, bpm: 100 }];
    expect(() => compileTrack(def)).toThrow();
    def.tempoMap = [{ beat: 0, bpm: 100 }];
    const issues = validateTrack(def, compileTrack(def));
    expect(codes(issues)).toContain("charts");
  });
});

describe("phrase and trill rules", () => {
  const def = fixtureTrack();
  const track = compileTrack(def);
  const mapper = mapperFor(track);
  it("warns when a phrase id spans a repeated section", () => {
    const p = lanes(0, "0 1 2 3", "same");
    const c = compileChart(chart("virtuoso", p, shiftEvents(p, 40)), mapper);
    expect(codes(validateChart(c, track), "warning")).toContain("phrase-split");
    const ok = compileChart(chart("virtuoso", p, shiftEvents(p, 40, "-2")), mapper);
    expect(codes(validateChart(ok, track), "warning")).not.toContain("phrase-split");
  });
  it("measures the gap in authored beats, not in the opening tempo", () => {
    const fast = fixtureTrack();
    fast.tempoMap = [{ beat: 0, bpm: 120 }, { beat: 20, bpm: 240 }];
    const fastTrack = compileTrack(fast);
    const split = compileChart(
      {
        difficulty: "virtuoso",
        events: [
          { beat: 24, lanes: [0], phraseId: "x" },
          { beat: 33, lanes: [1], phraseId: "x" },
        ],
      },
      mapperFor(fastTrack),
    );
    expect(codes(validateChart(split, fastTrack), "warning")).toContain("phrase-split");

    const slow = fixtureTrack();
    slow.tempoMap = [{ beat: 0, bpm: 120 }, { beat: 20, bpm: 30 }];
    const slowTrack = compileTrack(slow);
    const held = compileChart(
      {
        difficulty: "virtuoso",
        events: [
          { beat: 24, lanes: [0], phraseId: "x" },
          { beat: 28, lanes: [1], phraseId: "x" },
        ],
      },
      mapperFor(slowTrack),
    );
    expect(codes(validateChart(held, slowTrack), "warning")).not.toContain("phrase-split");
  });
  it("requires trills to alternate lanes with single notes", () => {
    const bad = compileChart(chart("virtuoso", trill("t", 0, "0 0 1 0")), mapper);
    expect(codes(validateChart(bad, track))).toContain("trill-lanes");
    const held = compileChart(chart("virtuoso", trill("t", 0, "0 1h/1 0 1")), mapper);
    expect(codes(validateChart(held, track))).toContain("trill-lanes");
    const good = compileChart(chart("virtuoso", trill("t", 0, "0 1 0 1")), mapper);
    expect(codes(validateChart(good, track))).not.toContain("trill-lanes");
  });
  it("reports too many keys once per moment", () => {
    const c = compileChart(chart("virtuoso", lanes(0, "0h/4 &1h/4"), lanes(2, "[2,3]/1 &4/1")), mapper);
    expect(validateChart(c, track).filter((i) => i.code === "too-many-keys")).toHaveLength(1);
  });
});
