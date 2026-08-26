import { chart, lanes, melody, part, shiftEvents } from "../src/charts/Authoring";
import type { BeatEvent } from "../src/charts/ChartTypes";
import type { TrackDefinition } from "../src/charts/ChartTypes";

function times8(events: BeatEvent[]): BeatEvent[][] {
  const out: BeatEvent[][] = [];
  for (let i = 0; i < 8; i++) {
    out.push(shiftEvents(events, i * 20).map((e) => (e.phraseId ? { ...e, phraseId: `${e.phraseId}-${i}` } : e)));
  }
  return out;
}

/** A tiny but complete track used by the unit tests. About 80 seconds at 120 bpm. */
export function fixtureTrack(): TrackDefinition {
  const tune = melody(0, "C4/1 D4 E4 F4 | G4 G4 A4 A4 | G4/2 r/2 | E4/1 E4 F4 D4 | C4/4");
  const bar = 4;
  const melodyNotes = [];
  for (let i = 0; i < 8; i++) melodyNotes.push(...tune.notes.map((n) => ({ ...n, beat: n.beat + i * 5 * bar })));
  const bassNotes = [];
  for (let b = 0; b < 160; b += 2) bassNotes.push({ beat: b, durationBeats: 2, midi: 36, velocity: 0.6 });
  return {
    metadata: {
      id: "fixture-test",
      order: 99,
      title: "Fixture",
      composer: "Test Composer",
      composerShort: "T. Composer",
      movementOrExcerpt: "Whole",
      bpm: 120,
      timeSignature: [4, 4],
      difficulty: "novice",
      arrangementStyle: "Test tone",
      arrangementCredit: "Tests",
      scoreSourceCredit: "Tests",
      licenseNotes: "Test data",
    },
    tempoMap: [{ beat: 0, bpm: 120 }],
    sections: [
      { name: "A", startBeat: 0, endBeat: 80 },
      { name: "B", startBeat: 80, endBeat: 160 },
    ],
    arrangement: {
      parts: [part("melody", "piano", melodyNotes), part("bass", "bass", bassNotes)],
    },
    charts: {
      novice: chart("novice", ...times8(lanes(0, "0/1 1 2 3 | 4 4 3 3 | 2h/2 r/2 | 2/1 2 3 1 | 0h/3 r/1", "p1"))),
      apprentice: chart("apprentice", ...times8(lanes(0, "0/1 1 2 3 | [0,4] 4 [1,3] 3 | 2h/2 r/2 | 2/1 2 3 1 | 0h/3 r/1"))),
      virtuoso: chart("virtuoso", ...times8(lanes(0, "0/1 1 2 3 | [0,2,4] 4 [1,3] 3 | 2h/2 r/2 | 2/1 2 3 1 | 0h/3 r/1"))),
    },
  };
}
