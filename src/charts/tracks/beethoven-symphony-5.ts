// Beethoven, Symphony No. 5 in C minor, Op. 67, first movement (Allegro con brio).
//
// The excerpt keeps the four note motif with both of its fermatas, the
// imitative string entries that grow out of it, the tutti restatement, the
// horn call that opens the E flat side of the exposition, and a hammered C
// minor cadence. The development and the recapitulation are cut and every
// sequence is shortened to two bars a step, so the whole excerpt runs about
// eighty eight seconds.
//
// Form: opening motif, string entries, tutti restatement, horn call and E flat
// episode, return of the motif, coda. 2/4 with the quarter as the beat at 208,
// and the tempo map drops to 70 and 60 for the two fermata bars, to 76 for the
// dominant fermata that closes the string entries, to 88 for the pause before
// the horn call and to 96 for the last cadence.

import { chart, join, lanes, melody, part, phrase, shiftEvents, shiftNotes, trill } from "../Authoring";
import type { ArrangementNote, BeatEvent, TrackDefinition } from "../ChartTypes";

// ---------------------------------------------------------------------------
// Arrangement helpers
// ---------------------------------------------------------------------------

/**
 * The motif: an eighth rest, three repeated eighths, then a longer note a
 * third below. Both pitch arguments take chords written with "+".
 */
function figure(
  startBeat: number,
  repeated: string,
  resolution: string,
  longBeats: number,
  velocity = 0.85,
): ArrangementNote[] {
  return melody(
    startBeat,
    `r/0.5 ${repeated}/0.5 ${repeated} ${repeated} ${resolution}/${longBeats}`,
    velocity,
  ).notes;
}

/** A row of notes or chords on a fixed grid, one token per slot. */
function row(startBeat: number, tokens: readonly string[], beatsEach: number, velocity: number): ArrangementNote[] {
  return melody(startBeat, tokens.map((t) => `${t}/${beatsEach}`).join(" "), velocity).notes;
}

/** The same token repeated on a fixed grid. */
function repeat(startBeat: number, token: string, count: number, beatsEach: number, velocity: number): ArrangementNote[] {
  return row(startBeat, new Array<string>(count).fill(token), beatsEach, velocity);
}

/** Three toms, the drum reading of the three repeated eighths. */
function drumFigure(startBeat: number, velocity = 0.45): ArrangementNote[] {
  return melody(startBeat, "r/0.5 t/0.5 t t", velocity).notes;
}

// ---------------------------------------------------------------------------
// Strings: the motif itself and every melodic line
// ---------------------------------------------------------------------------

// mm.1-5. The motif twice in octaves, each answered by a fermata note.
const openingHigh = join(figure(0, "G4", "Eb4", 2, 0.95), figure(4, "F4", "D4", 2, 0.95));
const openingLow = join(figure(0, "G3", "Eb3", 2, 0.9), figure(4, "F3", "D3", 2, 0.9));

// The figure carried up a step at a time, then traded between the upper and
// the lower strings a bar apart.
const entriesRising = join(
  figure(8, "G4", "Eb4", 2, 0.8),
  figure(12, "Ab4", "F4", 2, 0.82),
  figure(16, "Bb4", "G4", 2, 0.85),
  figure(20, "C5", "Ab4", 2, 0.88),
);
const entriesHigh = join(
  figure(24, "D5", "Bb4", 1, 0.9),
  figure(28, "Eb5", "C5", 1, 0.92),
  figure(32, "D5", "B4", 1, 0.94),
);
const entriesLow = join(
  figure(26, "Bb3", "G3", 1, 0.8),
  figure(30, "C4", "Ab3", 1, 0.82),
  figure(34, "B3", "G3", 1, 0.84),
);
// Four hammered eighths into the dominant fermata that closes the section.
const entriesClose = join(repeat(36, "G4", 4, 0.5, 0.95), row(38, ["G3+B3+D4+G4"], 2, 0.95));

// The tutti restatement, then the figure sequenced down a stepwise bass and
// back up again.
const tuttiTheme = join(figure(40, "G5", "Eb5", 2, 1), figure(44, "F5", "D5", 2, 1));
const descent = join(
  figure(48, "Eb5", "C5", 1, 0.95),
  figure(50, "D5", "Bb4", 1, 0.95),
  figure(52, "C5", "Ab4", 1, 0.95),
  figure(54, "Bb4", "G4", 1, 0.95),
  figure(56, "Ab4", "F4", 1, 0.9),
  figure(58, "G4", "Eb4", 1, 0.9),
  figure(60, "F4", "D4", 1, 0.9),
  figure(62, "Eb4", "C4", 1, 0.9),
);
const ascent = join(
  figure(64, "G4", "Eb4", 1, 0.85),
  figure(66, "Ab4", "F4", 1, 0.87),
  figure(68, "Bb4", "G4", 1, 0.89),
  figure(70, "C5", "Ab4", 1, 0.91),
  figure(72, "D5", "Bb4", 1, 0.93),
  figure(74, "Eb5", "C5", 1, 0.95),
  figure(76, "F5", "D5", 1, 0.97),
  figure(78, "G5", "Eb5", 1, 1),
);
const hammer = join(
  figure(80, "C5+Eb5", "G4+C5", 1, 1),
  figure(82, "B4+D5", "G4+B4", 1, 1),
  figure(84, "C5+Eb5", "G4+C5", 1, 1),
  figure(86, "B4+D5", "G4+B4", 1, 1),
);
// The dominant seventh of E flat, climbing into the pause before the horns.
const toEflat = join(
  figure(88, "D5", "Bb4", 1, 0.95),
  figure(90, "F5", "D5", 1, 0.97),
  figure(92, "Ab5", "F5", 1, 1),
  row(94, ["Bb3+D4+F4+Ab4"], 2, 0.9),
);

// The E flat episode: a singing line over the figure in the low strings.
const ebMelody = join(
  melody(104, "Bb4/2 | Eb5/1 F5 | G5/2 | F5/1 Eb5 | D5/2 | Eb5/1 F5 | G5 F5 | Eb5/2", 0.8).notes,
  melody(120, "G5/2 | F5/1 Eb5 | D5/2 | C5/1 D5 | Eb5/2 | D5/1 C5 | Bb4 C5 | Bb4/2", 0.8).notes,
);
// Back to C minor through the dominant seventh.
const buildBack = join(
  figure(136, "D5", "B4", 1, 0.85),
  figure(138, "F5", "D5", 1, 0.88),
  figure(140, "Eb5", "C5", 1, 0.91),
  figure(142, "D5", "B4", 1, 0.94),
  figure(144, "G5", "Eb5", 1, 0.96),
  figure(146, "Ab5", "F5", 1, 0.98),
  figure(148, "G5", "Eb5", 1, 1),
  repeat(150, "D5", 4, 0.5, 1),
);

const returnTheme = join(figure(152, "G5", "Eb5", 2, 1), figure(156, "F5", "D5", 2, 1));
const returnClose = join(repeat(212, "D5", 4, 0.5, 1), row(214, ["G3+B3+D4+G4"], 2, 0.95));
const codaTheme = join(figure(232, "G5", "Eb5", 2, 1), figure(236, "F5", "D5", 2, 1));
const cadence = join(
  figure(272, "D5+F5", "B4+D5", 1, 1),
  figure(274, "Eb5+G5", "C5+Eb5", 1, 1),
  figure(276, "D5+F5", "B4+D5", 1, 1),
  repeat(278, "D5", 4, 0.5, 1),
  figure(280, "G4+G5", "C4+Eb4+G4+C5", 2, 1),
);

const stringNotes = join(
  openingHigh,
  openingLow,
  entriesRising,
  entriesHigh,
  entriesLow,
  entriesClose,
  tuttiTheme,
  descent,
  ascent,
  hammer,
  toEflat,
  ebMelody,
  buildBack,
  returnTheme,
  shiftNotes(entriesHigh, 136),
  shiftNotes(entriesLow, 136),
  shiftNotes(descent, 124),
  shiftNotes(ascent, 124),
  shiftNotes(hammer, 124),
  returnClose,
  shiftNotes(hammer, 136),
  shiftNotes(hammer, 144),
  codaTheme,
  shiftNotes(descent, 192),
  shiftNotes(ascent, 192),
  cadence,
);

// ---------------------------------------------------------------------------
// Organ: the brass side of the band, chords and the horn call
// ---------------------------------------------------------------------------

const padDescent = row(
  48,
  ["C3+Eb3+G3", "Bb2+D3+F3", "Ab2+C3+Eb3", "G2+Bb2+D3", "F2+Ab2+C3", "Eb2+G2+Bb2", "D2+F2+Ab2", "C2+Eb2+G2"],
  2,
  0.45,
);
const padAscent = row(
  64,
  ["C3+Eb3+G3", "D3+F3+Ab3", "Eb3+G3+Bb3", "F3+Ab3+C4", "G3+Bb3+D4", "Ab3+C4+Eb4", "Bb3+D4+F4", "C4+Eb4+G4"],
  2,
  0.5,
);
const padHammer = row(80, ["C3+Eb3+G3", "G2+B2+D3", "C3+Eb3+G3", "G2+B2+D3"], 2, 0.55);
// The horn call: the motif rhythm on B flat answered a fourth above, twice.
const hornCall = join(figure(96, "Bb3", "Eb4", 2, 1), figure(100, "Bb4", "Eb5", 2, 1));
const padEflat = row(
  104,
  [
    "Eb3+G3+Bb3",
    "Bb2+D3+F3",
    "Bb2+D3+F3",
    "Eb3+G3+Bb3",
    "Eb3+G3+Bb3",
    "Bb2+D3+F3",
    "Ab2+C3+Eb3",
    "Bb2+D3+F3",
  ],
  4,
  0.4,
);
const padBuild = row(
  136,
  ["G2+B2+D3", "G2+B2+D3", "Ab2+C3+Eb3", "G2+B2+D3", "C3+Eb3+G3", "D3+F3+Ab3", "C3+Eb3+G3", "G2+B2+D3"],
  2,
  0.5,
);

const organNotes = join(
  row(38, ["G2+B2+D3"], 2, 0.6),
  figure(40, "G4", "Eb4", 2, 0.9),
  figure(44, "F4", "D4", 2, 0.9),
  padDescent,
  padAscent,
  padHammer,
  row(88, ["Bb2+D3+F3"], 6, 0.5),
  row(94, ["Bb2+D3+F3+Ab3"], 2, 0.6),
  hornCall,
  padEflat,
  padBuild,
  figure(152, "G4", "Eb4", 2, 0.95),
  figure(156, "F4", "D4", 2, 0.95),
  row(160, ["G2+B2+D3", "Ab2+C3+Eb3", "G2+B2+D3"], 4, 0.5),
  shiftNotes(padDescent, 124),
  shiftNotes(padAscent, 124),
  shiftNotes(padHammer, 124),
  row(214, ["G2+B2+D3"], 2, 0.7),
  shiftNotes(padHammer, 136),
  shiftNotes(padHammer, 144),
  figure(232, "G4", "Eb4", 2, 0.95),
  figure(236, "F4", "D4", 2, 0.95),
  shiftNotes(padDescent, 192),
  shiftNotes(padAscent, 192),
  row(272, ["G2+B2+D3", "C3+Eb3+G3", "G2+B2+D3", "G2+B2+D3"], 2, 0.7),
  row(282, ["C2+C3+Eb3+G3"], 2, 1),
);

// ---------------------------------------------------------------------------
// Bass: roots, and the figure in the low strings under the E flat episode
// ---------------------------------------------------------------------------

const bassOpening = join(figure(0, "G2", "Eb2", 2, 0.9), figure(4, "F2", "D2", 2, 0.9));
const bassEntries = join(
  repeat(8, "C2", 4, 1, 0.6),
  repeat(12, "D2", 4, 1, 0.6),
  repeat(16, "Eb2", 4, 1, 0.6),
  repeat(20, "F2", 4, 1, 0.6),
);
const bassTrade = join(repeat(24, "G2", 4, 1, 0.65), repeat(28, "Ab2", 4, 1, 0.65), repeat(32, "G2", 4, 1, 0.7));
const bassDescent = row(
  48,
  ["C3", "C3", "Bb2", "Bb2", "Ab2", "Ab2", "G2", "G2", "F2", "F2", "Eb2", "Eb2", "D2", "D2", "C2", "C2"],
  1,
  0.7,
);
const bassAscent = row(
  64,
  ["C2", "C2", "D2", "D2", "Eb2", "Eb2", "F2", "F2", "G2", "G2", "Ab2", "Ab2", "Bb2", "Bb2", "C3", "C3"],
  1,
  0.7,
);
const bassHammer = row(80, ["C2", "C2", "G2", "G2", "C2", "C2", "G2", "G2"], 1, 0.75);
const bassEflat = join(
  figure(104, "Eb2", "C2", 2, 0.7),
  figure(108, "Bb2", "G2", 2, 0.7),
  figure(112, "Bb2", "G2", 2, 0.7),
  figure(116, "Eb2", "C2", 2, 0.7),
  figure(120, "Eb2", "C2", 2, 0.72),
  figure(124, "Bb2", "G2", 2, 0.72),
  figure(128, "Ab2", "F2", 2, 0.72),
  figure(132, "Bb2", "G2", 2, 0.72),
);

const bassNotes = join(
  bassOpening,
  bassEntries,
  bassTrade,
  repeat(36, "G2", 4, 0.5, 0.75),
  row(38, ["G2"], 2, 0.8),
  figure(40, "G2", "Eb2", 2, 0.95),
  figure(44, "F2", "D2", 2, 0.95),
  bassDescent,
  bassAscent,
  bassHammer,
  repeat(88, "Bb2", 6, 1, 0.75),
  row(94, ["Bb2"], 2, 0.8),
  row(96, ["Eb2", "Bb2", "Eb2", "Bb2"], 2, 0.7),
  bassEflat,
  row(
    136,
    ["G2", "G2", "G2", "G2", "Ab2", "Ab2", "G2", "G2", "C2", "C2", "D2", "D2", "C2", "C2", "G2", "G2"],
    1,
    0.75,
  ),
  figure(152, "G2", "Eb2", 2, 0.95),
  figure(156, "F2", "D2", 2, 0.95),
  shiftNotes(bassTrade, 136),
  shiftNotes(bassDescent, 124),
  shiftNotes(bassAscent, 124),
  shiftNotes(bassHammer, 124),
  repeat(212, "G2", 4, 0.5, 0.8),
  row(214, ["G2"], 2, 0.85),
  shiftNotes(bassHammer, 136),
  shiftNotes(bassHammer, 144),
  figure(232, "G2", "Eb2", 2, 0.95),
  figure(236, "F2", "D2", 2, 0.95),
  shiftNotes(bassDescent, 192),
  shiftNotes(bassAscent, 192),
  row(272, ["G2", "G2", "C2", "C2", "G2", "G2"], 1, 0.8),
  repeat(278, "G2", 4, 0.5, 0.9),
  figure(280, "G2", "C2", 2, 1),
);

// ---------------------------------------------------------------------------
// Percussion: toms on the motif, kick on the beat, crash on the held chords
// ---------------------------------------------------------------------------

const drumNotes = join(
  drumFigure(0, 0.5),
  row(2, ["cr"], 2, 0.55),
  row(2, ["k"], 1, 0.7),
  drumFigure(4, 0.5),
  row(6, ["cr"], 2, 0.55),
  row(6, ["k"], 1, 0.7),
  repeat(8, "k", 14, 2, 0.45),
  repeat(36, "t", 4, 0.5, 0.5),
  row(38, ["cr"], 2, 0.6),
  row(38, ["k"], 1, 0.7),
  drumFigure(40, 0.55),
  row(42, ["cr"], 2, 0.6),
  drumFigure(44, 0.55),
  row(46, ["cr"], 2, 0.6),
  repeat(48, "k", 16, 2, 0.5),
  repeat(80, "k", 7, 2, 0.55),
  row(94, ["cr"], 2, 0.6),
  repeat(96, "k", 4, 2, 0.4),
  repeat(104, "k", 16, 2, 0.3),
  repeat(136, "k", 7, 2, 0.5),
  repeat(150, "t", 4, 0.5, 0.55),
  drumFigure(152, 0.6),
  row(154, ["cr"], 2, 0.6),
  drumFigure(156, 0.6),
  row(158, ["cr"], 2, 0.6),
  repeat(160, "k", 26, 2, 0.5),
  repeat(212, "t", 4, 0.5, 0.6),
  row(214, ["cr"], 2, 0.6),
  repeat(216, "k", 8, 2, 0.55),
  drumFigure(232, 0.6),
  row(234, ["cr"], 2, 0.6),
  drumFigure(236, 0.6),
  row(238, ["cr"], 2, 0.6),
  repeat(240, "k", 16, 2, 0.55),
  repeat(272, "k", 6, 1, 0.6),
  repeat(278, "t", 4, 0.5, 0.6),
  drumFigure(280, 0.7),
  row(282, ["cr"], 2, 0.7),
  row(282, ["k"], 1, 0.85),
);

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------

/**
 * One event every `stepBeats`, taken from a list of single chart tokens. Each
 * token is parsed on its own, so a hold length never leaks into the next slot.
 * "r" skips a slot.
 */
function pace(id: string, startBeat: number, stepBeats: number, tokens: readonly string[]): BeatEvent[] {
  const out: BeatEvent[] = [];
  tokens.forEach((token, i) => {
    if (token !== "r") out.push(...lanes(startBeat + i * stepBeats, token, id));
  });
  return out;
}

// Lane plan. Lanes 0 to 2 are the left hand, 3 and 4 the right. The motif
// keeps its three repeated notes in one lane wherever the difficulty allows
// and steps down a lane for the long note, so the falling third is visible.
// Sequences that climb move up the lanes and the imitation between the upper
// and lower strings alternates hands.

// ---------------------------------------------------------------------------
// Novice: the pickup eighth and the long note of every figure
// ---------------------------------------------------------------------------

const nTrade = pace("n-b3", 26, 2, ["3", "0", "4", "1", "3", "0"]);
const nDescent = [
  ...pace("n-c2", 50, 2, ["4", "4", "3", "3"]),
  ...pace("n-c3", 58, 2, ["2", "2", "1", "1"]),
];
const nAscent = [
  ...pace("n-c4", 66, 2, ["1", "1", "2", "2"]),
  ...pace("n-c5", 74, 2, ["3", "3", "4", "4"]),
];
const nHammer = pace("n-c6", 82, 2, ["[2,4]!", "3", "[2,4]!", "3"]);

const noviceChart = chart(
  "novice",
  pace("n-a1", 0.5, 1.5, ["3", "2h/1.5"]),
  pace("n-a1", 4.5, 1.5, ["2", "1h/1.5"]),
  pace("n-b1", 8.5, 1.5, ["1", "0h/1.5"]),
  pace("n-b1", 12.5, 1.5, ["2", "1h/1.5"]),
  pace("n-b2", 16.5, 1.5, ["3", "2h/1.5"]),
  pace("n-b2", 20.5, 1.5, ["4", "3h/1.5"]),
  nTrade,
  lanes(38, "[1,3]!"),
  pace("n-c1", 40.5, 1.5, ["4", "3h/1.5"]),
  pace("n-c1", 44.5, 1.5, ["3", "2h/1.5"]),
  nDescent,
  nAscent,
  nHammer,
  pace("n-c7", 90, 2, ["3", "4", "4h!/1.5"]),
  pace("n-d1", 96.5, 1.5, ["1", "2h/1.5"]),
  pace("n-d1", 100.5, 1.5, ["3", "4h/1.5"]),
  pace("n-d2", 104, 2, ["1", "3", "4h/1.5", "3", "2h/1.5"]),
  pace("n-d3", 114, 2, ["3", "4", "3h/1.5"]),
  pace("n-d4", 120, 2, ["4h/1.5", "3", "2h/1.5", "1"]),
  pace("n-d5", 128, 2, ["3h/1.5", "2", "1", "1h/1.5"]),
  pace("n-d6", 138, 2, ["2", "3", "2", "2"]),
  pace("n-d7", 146, 2, ["3", "4", "3"]),
  pace("n-e1", 152.5, 1.5, ["4", "3h/1.5"]),
  pace("n-e1", 156.5, 1.5, ["3", "2h/1.5"]),
  shiftEvents(nTrade, 136, "-r"),
  shiftEvents(nDescent, 124, "-r"),
  shiftEvents(nAscent, 124, "-r"),
  shiftEvents(nHammer, 124, "-r"),
  lanes(214, "[1,3]!"),
  pace("n-f1", 218, 2, ["[2,4]!", "3", "[2,4]!", "3", "[2,4]!", "3", "[2,4]!"]),
  pace("n-f2", 232.5, 1.5, ["4", "3h/1.5"]),
  pace("n-f2", 236.5, 1.5, ["3", "2h/1.5"]),
  shiftEvents(nDescent, 192, "-c"),
  shiftEvents(nAscent, 192, "-c"),
  pace("n-f3", 274, 2, ["[2,4]!", "3", "[2,4]!"]),
  pace("n-f3", 280.5, 1.5, ["3", "2h!/1.5"]),
);

// ---------------------------------------------------------------------------
// Apprentice: the full figure where it has room, one tap and the long note
// where the figures overlap, plus the cadence chords
// ---------------------------------------------------------------------------

const aTrade = [
  ...pace("a-b5", 24.5, 1.5, ["4", "3"]),
  ...pace("a-b5", 26.5, 1.5, ["1", "0"]),
  ...pace("a-b6", 28.5, 1.5, ["4", "3"]),
  ...pace("a-b6", 30.5, 1.5, ["1", "0"]),
  ...pace("a-b7", 32.5, 1.5, ["4", "3"]),
  ...pace("a-b7", 34.5, 1.5, ["1", "0"]),
];
const aDescent = [
  ...pace("a-c3", 48.5, 1.5, ["4", "3"]),
  ...pace("a-c3", 50.5, 1.5, ["4", "2"]),
  ...pace("a-c4", 52.5, 1.5, ["3", "2"]),
  ...pace("a-c4", 54.5, 1.5, ["3", "1"]),
  ...pace("a-c5", 56.5, 1.5, ["2", "1"]),
  ...pace("a-c5", 58.5, 1.5, ["2", "0"]),
  ...pace("a-c6", 60.5, 1.5, ["1", "0"]),
  ...pace("a-c6", 62.5, 1.5, ["1", "1"]),
];
const aAscent = [
  ...pace("a-c7", 64.5, 1.5, ["0", "1"]),
  ...pace("a-c7", 66.5, 1.5, ["0", "2"]),
  ...pace("a-c8", 68.5, 1.5, ["1", "2"]),
  ...pace("a-c8", 70.5, 1.5, ["1", "3"]),
  ...pace("a-c9", 72.5, 1.5, ["2", "3"]),
  ...pace("a-c9", 74.5, 1.5, ["2", "4"]),
  ...pace("a-c10", 76.5, 1.5, ["3", "4"]),
  ...pace("a-c10", 78.5, 1.5, ["3", "4"]),
];
const aHammer = [
  ...pace("a-c11", 80.5, 1.5, ["3", "[2,4]!"]),
  ...pace("a-c11", 84, 2, ["3", "[2,4]!", "3"]),
];

const apprenticeChart = chart(
  "apprentice",
  phrase("a-a1", 0.5, "3/0.5 4 3 2h/1.25"),
  phrase("a-a2", 4.5, "2/0.5 1 2 1h/1.25"),
  phrase("a-b1", 8.5, "1/0.5 2 1 0h/1.25"),
  phrase("a-b2", 12.5, "2/0.5 3 2 1h/1.25"),
  phrase("a-b3", 16.5, "3/0.5 4 3 2h/1.25"),
  phrase("a-b4", 20.5, "4/0.5 3 4 3h/1.25"),
  aTrade,
  pace("a-b7", 37, 1, ["3", "[1,3]!"]),
  phrase("a-c1", 40.5, "4/0.5 3 4 3h/1.25"),
  phrase("a-c2", 44.5, "3/0.5 2 3 2h/1.25"),
  aDescent,
  aAscent,
  aHammer,
  pace("a-c12", 88.5, 1.5, ["4", "3"]),
  pace("a-c12", 90.5, 1.5, ["4", "3"]),
  pace("a-c12", 92.5, 1.5, ["4", "4h!/1.25"]),
  phrase("a-d1", 96.5, "1/0.5 2 1 2h/1.25"),
  phrase("a-d2", 100.5, "3/0.5 4 3 4h/1.25"),
  pace("a-d3", 104, 2, ["1h/1.25", "3"]),
  pace("a-d3", 107, 1, ["4", "4h/1.25"]),
  pace("a-d3", 110, 1, ["4", "3"]),
  pace("a-d4", 112, 2, ["2h/1.25", "3"]),
  pace("a-d4", 115, 1, ["4", "4", "4", "3h/1.25"]),
  pace("a-d5", 120, 2, ["4h/1.25", "4"]),
  pace("a-d5", 123, 1, ["3", "2h/1.25"]),
  pace("a-d5", 126, 1, ["2", "2"]),
  pace("a-d6", 128, 2, ["3h/1.25", "2"]),
  pace("a-d6", 131, 1, ["2", "1", "2", "1h/1.25"]),
  pace("a-d7", 136.5, 1.5, ["3", "2"]),
  pace("a-d7", 138.5, 1.5, ["4", "3"]),
  pace("a-d7", 140.5, 1.5, ["4", "2"]),
  pace("a-d8", 142.5, 1.5, ["3", "2"]),
  pace("a-d8", 144.5, 1.5, ["4", "3"]),
  pace("a-d8", 146.5, 1.5, ["4", "3"]),
  pace("a-d9", 148.5, 1.5, ["4", "3"]),
  phrase("a-e1", 152.5, "4/0.5 3 4 3h/1.25"),
  phrase("a-e2", 156.5, "3/0.5 2 3 2h/1.25"),
  shiftEvents(aTrade, 136, "-r"),
  shiftEvents(aDescent, 124, "-r"),
  shiftEvents(aAscent, 124, "-r"),
  shiftEvents(aHammer, 124, "-r"),
  pace("a-e3", 213, 1, ["4", "[1,3]!"]),
  pace("a-f1", 216.5, 1.5, ["3", "[2,4]!"]),
  pace("a-f1", 220, 2, ["3", "[2,4]!", "3"]),
  pace("a-f2", 226, 2, ["[2,4]!", "3", "[2,4]!"]),
  phrase("a-f3", 232.5, "4/0.5 3 4 3h/1.25"),
  phrase("a-f4", 236.5, "3/0.5 2 3 2h/1.25"),
  shiftEvents(aDescent, 192, "-c"),
  shiftEvents(aAscent, 192, "-c"),
  pace("a-f5", 272.5, 1.5, ["3", "[2,4]!"]),
  pace("a-f5", 276, 2, ["[1,3]!", "3!"]),
  pace("a-f5", 279, 1, ["4"]),
  phrase("a-f6", 280.5, "3/0.5 4 3 2h!/1.25"),
);

// ---------------------------------------------------------------------------
// Virtuoso: the whole figure with its repeated notes in one lane, the answering
// voice on the long notes, chords on the cadences and trills on the hammered
// eighths
// ---------------------------------------------------------------------------

const vTrade = [
  ...phrase("v-b5", 24.5, "4/0.5 4 4 3"),
  ...pace("v-b5", 28, 1, ["0"]),
  ...phrase("v-b6", 28.5, "4/0.5 4 4 3"),
  ...pace("v-b6", 32, 1, ["1"]),
  ...phrase("v-b7", 32.5, "4/0.5 4 4 3"),
];
const vDescent = [
  ...phrase("v-c3", 48.5, "4/0.5 4 4 3"),
  ...pace("v-c3", 52, 1, ["3"]),
  ...phrase("v-c4", 52.5, "3/0.5 3 3 2"),
  ...pace("v-c4", 56, 1, ["2"]),
  ...phrase("v-c5", 56.5, "2/0.5 2 2 1"),
  ...pace("v-c5", 60, 1, ["1"]),
  ...phrase("v-c6", 60.5, "1/0.5 1 1 0"),
  ...pace("v-c6", 64, 1, ["0"]),
];
const vAscent = [
  ...phrase("v-c7", 64.5, "0/0.5 0 0 1"),
  ...pace("v-c7", 68, 1, ["1"]),
  ...phrase("v-c8", 68.5, "1/0.5 1 1 2"),
  ...pace("v-c8", 72, 1, ["2"]),
  ...phrase("v-c9", 72.5, "2/0.5 2 2 3"),
  ...pace("v-c9", 76, 1, ["3"]),
  ...phrase("v-c10", 76.5, "3/0.5 3 3 4"),
  ...pace("v-c10", 80, 1, ["4"]),
];
const vHammer = [
  ...phrase("v-c11", 80.5, "4/0.5 4 4 [2,4]!"),
  ...pace("v-c11", 84, 1, ["3!"]),
  ...phrase("v-c12", 84.5, "4/0.5 4 4 [2,4]!"),
];

const virtuosoChart = chart(
  "virtuoso",
  phrase("v-a1", 0.5, "3/0.5 3 3 2h/1.5"),
  phrase("v-a2", 4.5, "2/0.5 2 2 1h/1.5"),
  phrase("v-b1", 8.5, "1/0.5 1 1 0h/1.5"),
  pace("v-b2", 12, 1, ["0!"]),
  phrase("v-b2", 12.5, "2/0.5 2 2 1h/1.5"),
  pace("v-b3", 16, 1, ["0!"]),
  phrase("v-b3", 16.5, "3/0.5 3 3 2h/1.5"),
  pace("v-b4", 20, 1, ["0!"]),
  phrase("v-b4", 20.5, "4/0.5 4 4 3h/1.5"),
  vTrade,
  pace("v-b7", 38, 1, ["[0,2,4]!"]),
  trill("v-b8", 36, "3/0.5 4 3"),
  phrase("v-c1", 40.5, "4/0.5 4 4 3h/1.5"),
  phrase("v-c2", 44.5, "3/0.5 3 3 2h/1.5"),
  vDescent,
  vAscent,
  vHammer,
  pace("v-c12", 88, 1, ["3!"]),
  phrase("v-c13", 88.5, "4/0.5 4 4 3"),
  pace("v-c13", 92, 1, ["3"]),
  phrase("v-c14", 92.5, "4/0.5 4 4 [0,4]!"),
  phrase("v-d1", 96.5, "1/0.5 1 1 2h/1.5"),
  phrase("v-d2", 100.5, "3/0.5 3 3 4h/1.5"),
  pace("v-d3", 104, 0.5, ["1h/1.5", "0", "0", "0"]),
  pace("v-d3", 106, 1, ["3", "4"]),
  pace("v-d4", 108, 2, ["4h/1.5", "4"]),
  pace("v-d4", 111, 1, ["3", "2h/1.5"]),
  pace("v-d5", 114, 1, ["3", "4", "4", "4", "3h/1.5"]),
  pace("v-d6", 120, 0.5, ["4h/1.5", "0", "0", "0"]),
  pace("v-d6", 122, 1, ["4", "3", "2h/1.5"]),
  pace("v-d7", 126, 1, ["2", "2"]),
  pace("v-d7", 128, 2, ["3h/1.5", "2"]),
  pace("v-d8", 131, 1, ["2", "1", "2", "1h/1.5"]),
  phrase("v-d9", 136.5, "3/0.5 3 3 2"),
  pace("v-d9", 140, 1, ["3"]),
  phrase("v-d10", 140.5, "3/0.5 3 3 2"),
  pace("v-d10", 144, 1, ["2"]),
  phrase("v-d11", 144.5, "4/0.5 4 4 3"),
  pace("v-d11", 148, 1, ["4"]),
  trill("v-d12", 150, "3/0.5 4 3 4"),
  phrase("v-e1", 152.5, "4/0.5 4 4 3h/1.5"),
  phrase("v-e2", 156.5, "3/0.5 3 3 2h/1.5"),
  shiftEvents(vTrade, 136, "-r"),
  shiftEvents(vDescent, 124, "-r"),
  shiftEvents(vAscent, 124, "-r"),
  shiftEvents(vHammer, 124, "-r"),
  trill("v-e3", 212, "3/0.5 4 3"),
  lanes(214, "[0,2,4]!"),
  shiftEvents(vHammer, 136, "-c1"),
  lanes(224, "3!"),
  shiftEvents(vHammer, 144, "-c2"),
  lanes(232, "3!"),
  phrase("v-f1", 232.5, "4/0.5 4 4 3h/1.5"),
  phrase("v-f2", 236.5, "3/0.5 3 3 2h/1.5"),
  shiftEvents(vDescent, 192, "-c"),
  shiftEvents(vAscent, 192, "-c"),
  phrase("v-f3", 272.5, "4/0.5 4 4 [1,3]!"),
  pace("v-f3", 276, 1, ["[2,4]!"]),
  trill("v-f4", 278, "3/0.5 4 3 4"),
  phrase("v-f6", 280.5, "4/0.5 4 4 [0,2,4]!"),
);

// ---------------------------------------------------------------------------
// Maestro: both voices of the imitation, the bass note folded into the middle
// of each tutti figure, and every sequence played whole
// ---------------------------------------------------------------------------

const mTrade = [
  ...phrase("m-b5", 24.5, "4/0.5 4 4 3"),
  ...phrase("m-b5", 26.5, "1/0.5 1 1 0"),
  ...phrase("m-b6", 28.5, "4/0.5 4 4 3"),
  ...phrase("m-b6", 30.5, "1/0.5 1 1 0"),
  ...phrase("m-b7", 32.5, "4/0.5 4 4 3"),
  ...phrase("m-b7", 34.5, "1/0.5 1 1"),
];
const mDescent = [
  ...phrase("m-c3", 48.5, "4/0.5 4 4 3"),
  ...phrase("m-c3", 50.5, "4/0.5 4 4 3"),
  ...phrase("m-c4", 52.5, "3/0.5 3 3 2"),
  ...phrase("m-c4", 54.5, "3/0.5 3 3 2"),
  ...phrase("m-c5", 56.5, "2/0.5 2 2 1"),
  ...phrase("m-c5", 58.5, "2/0.5 2 2 1"),
  ...phrase("m-c6", 60.5, "1/0.5 1 1 0"),
  ...phrase("m-c6", 62.5, "1/0.5 1 1 0"),
];
const mAscent = [
  ...phrase("m-c7", 64.5, "0/0.5 0 0 1"),
  ...phrase("m-c7", 66.5, "0/0.5 0 0 1"),
  ...phrase("m-c8", 68.5, "1/0.5 1 1 2"),
  ...phrase("m-c8", 70.5, "1/0.5 1 1 2"),
  ...phrase("m-c9", 72.5, "2/0.5 2 2 3"),
  ...phrase("m-c9", 74.5, "2/0.5 2 2 3"),
  ...phrase("m-c10", 76.5, "3/0.5 3 3 4"),
  ...phrase("m-c10", 78.5, "3/0.5 3 3 4"),
];
const mHammer = [
  ...phrase("m-c11", 80.5, "4/0.5 4 4 [2,4]!"),
  ...pace("m-c11", 84, 1, ["3!"]),
  ...phrase("m-c12", 84.5, "4/0.5 4 4 [2,4]!"),
];

const maestroChart = chart(
  "maestro",
  phrase("m-a1", 0.5, "3/0.5 3 3 2h/1.5"),
  phrase("m-a2", 4.5, "2/0.5 2 2 1h/1.5"),
  phrase("m-b1", 8.5, "1/0.5 [0,1]! 1 0h/1.5"),
  phrase("m-b2", 12.5, "2/0.5 [0,2]! 2 1h/1.5"),
  phrase("m-b3", 16.5, "3/0.5 [0,3]! 3 2h/1.5"),
  phrase("m-b4", 20.5, "4/0.5 [0,4]! 4 3h/1.5"),
  mTrade,
  trill("m-b8", 36, "3/0.5 4 3"),
  lanes(38, "[0,2,4]!"),
  phrase("m-c1", 40.5, "4/0.5 [0,4]! 4 3h/1.5"),
  phrase("m-c2", 44.5, "3/0.5 [0,3]! 3 2h/1.5"),
  mDescent,
  mAscent,
  mHammer,
  pace("m-c12", 88, 1, ["3!"]),
  phrase("m-c13", 88.5, "4/0.5 4 4 3"),
  phrase("m-c13", 90.5, "4/0.5 4 4 3"),
  phrase("m-c14", 92.5, "4/0.5 4 4 [0,4]!"),
  phrase("m-d1", 96.5, "1/0.5 [0,1]! 1 2h/1.5"),
  phrase("m-d2", 100.5, "3/0.5 [0,3]! 3 4h/1.5"),
  pace("m-d3", 104, 0.5, ["1h/1.5", "0", "0", "0"]),
  pace("m-d3", 106, 1, ["3", "4"]),
  pace("m-d4", 108, 2, ["4h/1.5", "4"]),
  pace("m-d4", 111, 1, ["3"]),
  pace("m-d5", 112, 0.5, ["2h/1.5", "0", "0", "0"]),
  pace("m-d6", 114, 1, ["3", "4", "4", "4", "3h/1.5"]),
  pace("m-d7", 120, 0.5, ["4h/1.5", "0", "0", "0"]),
  pace("m-d7", 122, 1, ["4", "3", "2h/1.5"]),
  pace("m-d8", 126, 1, ["2", "2"]),
  pace("m-d8", 128, 0.5, ["3h/1.5", "0", "0", "0"]),
  pace("m-d9", 130, 1, ["2", "2", "1", "2", "1h/1.5"]),
  phrase("m-d10", 136.5, "3/0.5 3 3 2"),
  phrase("m-d10", 138.5, "4/0.5 4 4 3"),
  phrase("m-d11", 140.5, "3/0.5 3 3 2"),
  phrase("m-d11", 142.5, "3/0.5 3 3 2"),
  phrase("m-d12", 144.5, "4/0.5 4 4 3"),
  phrase("m-d12", 146.5, "4/0.5 4 4 3"),
  phrase("m-d13", 148.5, "4/0.5 4 4"),
  trill("m-d14", 150, "3/0.5 4 3"),
  phrase("m-e1", 152.5, "4/0.5 [0,4]! 4 3h/1.5"),
  phrase("m-e2", 156.5, "3/0.5 [0,3]! 3 2h/1.5"),
  shiftEvents(mTrade, 136, "-r"),
  shiftEvents(mDescent, 124, "-r"),
  shiftEvents(mAscent, 124, "-r"),
  shiftEvents(mHammer, 124, "-r"),
  trill("m-e3", 212, "3/0.5 4 3"),
  lanes(214, "[0,2,4]!"),
  shiftEvents(mHammer, 136, "-c1"),
  lanes(224, "3!"),
  shiftEvents(mHammer, 144, "-c2"),
  lanes(232, "3!"),
  phrase("m-f1", 232.5, "4/0.5 [0,4]! 4 3h/1.5"),
  phrase("m-f2", 236.5, "3/0.5 [0,3]! 3 2h/1.5"),
  shiftEvents(mDescent, 192, "-c"),
  shiftEvents(mAscent, 192, "-c"),
  phrase("m-f3", 272.5, "4/0.5 4 4 [1,3]!"),
  pace("m-f3", 276, 1, ["[2,4]!"]),
  phrase("m-f4", 276.5, "4/0.5 4 4"),
  trill("m-f5", 278, "3/0.5 4 3 4"),
  phrase("m-f6", 280.5, "4/0.5 4 4 [0,2,4]!"),
);

const def: TrackDefinition = {
  metadata: {
    id: "beethoven-symphony-5",
    order: 9,
    title: "Symphony No. 5 in C minor",
    composer: "Ludwig van Beethoven",
    composerShort: "L. van Beethoven",
    catalogNumber: "Op. 67",
    movementOrExcerpt: "I. Allegro con brio, opening",
    bpm: 208,
    timeSignature: [2, 4],
    difficulty: "virtuoso",
    arrangementStyle: "Percussive orchestra: string motif, organ brass, bass and drums",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Condensed from the first movement as the arranger knows the published score; the note data was written by hand for this project and no external MIDI file, printed edition or recording was used",
    licenseNotes:
      "The composition is in the public domain. The arrangement and the charts are an original arrangement written for this game.",
    unlockAfter: "mozart-symphony-40",
  },
  tempoMap: [
    { beat: 0, bpm: 208 },
    { beat: 2, bpm: 70 },
    { beat: 4, bpm: 208 },
    { beat: 6, bpm: 60 },
    { beat: 8, bpm: 208 },
    { beat: 38, bpm: 76 },
    { beat: 40, bpm: 208 },
    { beat: 94, bpm: 88 },
    { beat: 96, bpm: 208 },
    { beat: 280, bpm: 96 },
  ],
  sections: [
    { name: "Opening motif", startBeat: 0, endBeat: 8 },
    { name: "String entries", startBeat: 8, endBeat: 40 },
    { name: "Tutti restatement", startBeat: 40, endBeat: 96 },
    { name: "Horn call", startBeat: 96, endBeat: 152 },
    { name: "Return of the motif", startBeat: 152, endBeat: 216 },
    { name: "Coda", startBeat: 216, endBeat: 284 },
  ],
  arrangement: {
    parts: [
      part("strings", "strings", stringNotes, { gain: 0.9, pan: -0.15 }),
      part("brass", "organ", organNotes, { gain: 0.5, pan: 0.18 }),
      part("bass", "bass", bassNotes, { gain: 0.75, pan: 0 }),
      part("drums", "percussion", drumNotes, { gain: 0.4, pan: 0.22 }),
    ],
  },
  charts: {
    novice: noviceChart,
    apprentice: apprenticeChart,
    virtuoso: virtuosoChart,
    maestro: maestroChart,
  },
};

export default def;
