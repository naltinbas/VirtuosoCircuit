import { describe, expect, it } from "vitest";
import { chart, lanes, melody, midiToPitch, phrase, pitchToMidi, repeatNotes, shiftEvents, trill } from "../src/charts/Authoring";

describe("pitch names", () => {
  it("maps C4 to 60 and handles accidentals", () => {
    expect(pitchToMidi("C4")).toBe(60);
    expect(pitchToMidi("A4")).toBe(69);
    expect(pitchToMidi("F#3")).toBe(54);
    expect(pitchToMidi("Bb5")).toBe(82);
    expect(pitchToMidi("C-1")).toBe(0);
    expect(midiToPitch(61)).toBe("C#4");
  });
  it("accepts drum names", () => {
    expect(pitchToMidi("k")).toBe(36);
    expect(pitchToMidi("oh")).toBe(46);
  });
  it("rejects nonsense", () => {
    expect(() => pitchToMidi("H4")).toThrow();
    expect(() => pitchToMidi("C")).toThrow();
  });
});

describe("melody notation", () => {
  it("advances beats and carries the previous duration", () => {
    const r = melody(4, "C4/1 D4 E4/2 r/1 F4/0.5");
    expect(r.notes.map((n) => [n.beat, n.durationBeats, n.midi])).toEqual([
      [4, 1, 60],
      [5, 1, 62],
      [6, 2, 64],
      [9, 0.5, 65],
    ]);
    expect(r.endBeat).toBe(9.5);
  });
  it("parses chords and sticky velocity", () => {
    const r = melody(0, "C4+E4+G4@0.5/2 D4");
    expect(r.notes).toHaveLength(4);
    expect(r.notes[0].velocity).toBe(0.5);
    expect(r.notes[3]).toEqual({ beat: 2, durationBeats: 2, midi: 62, velocity: 0.5 });
  });
  it("ignores barlines", () => {
    expect(melody(0, "C4 | D4 | | E4").notes).toHaveLength(3);
  });
  it("repeats passages", () => {
    const r = repeatNotes(melody(0, "C4 D4").notes, 3, 2);
    expect(r.map((n) => n.beat)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("lane notation", () => {
  it("parses singles, chords, holds, accents and rests", () => {
    const ev = lanes(8, "0/1 [1,3] 2h/2 r/1 4!/0.5 3");
    expect(ev).toEqual([
      { beat: 8, lanes: [0] },
      { beat: 9, lanes: [1, 3] },
      { beat: 10, lanes: [2], durationBeats: 2 },
      { beat: 13, lanes: [4], accent: true },
      { beat: 13.5, lanes: [3] },
    ]);
  });
  it("places & tokens on the same beat", () => {
    const ev = lanes(0, "0h/2 &4h/2 1");
    expect(ev.map((e) => e.beat)).toEqual([0, 0, 2]);
  });
  it("rejects held chords and bad lanes", () => {
    expect(() => lanes(0, "[0,1]h/2")).toThrow();
    expect(() => lanes(0, "5")).toThrow();
  });
  it("tags phrases and sorts merged charts", () => {
    const c = chart("novice", lanes(4, "1 2"), phrase("p", 0, "0 3"));
    expect(c.events.map((e) => e.beat)).toEqual([0, 1, 4, 5]);
    expect(c.events[0].phraseId).toBe("p");
    expect(c.events[2].phraseId).toBeUndefined();
  });
});

describe("strict parsing", () => {
  it("throws on malformed music tokens instead of dropping notes", () => {
    expect(() => melody(0, "C4@0.5+E4")).toThrow();
    expect(() => melody(0, "C4/2+E4")).toThrow();
    expect(() => melody(0, "C4/x")).toThrow();
    expect(() => melody(0, "@0.5")).toThrow();
  });
  it("throws on malformed lane tokens", () => {
    expect(() => lanes(0, "0,2")).toThrow();
    expect(() => lanes(0, "4x")).toThrow();
    expect(() => lanes(0, "0|1")).toThrow();
    expect(() => lanes(0, "[0, 2]")).toThrow();
    expect(() => lanes(0, "0/1!")).toThrow();
    expect(() => lanes(0, "0 &r/1")).toThrow();
  });
  it("keeps the sticky duration from & tokens, as documented", () => {
    expect(lanes(0, "0/1 &4h/2 1 2").map((e) => e.beat)).toEqual([0, 0, 1, 3]);
  });
  it("suffixes phrase ids when shifting and builds trills", () => {
    const p = phrase("a", 0, "0 1");
    const s = shiftEvents(p, 8, "-rep");
    expect(s.map((e) => [e.beat, e.phraseId])).toEqual([[8, "a-rep"], [9, "a-rep"]]);
    expect(trill("x", 0, "0/0.5 1 0 1")[0].phraseId).toBe("trill-x");
  });
});
