// Toccata and Fugue in D minor, BWV 565: the opening of the Toccata.
//
// The excerpt keeps the material the piece is known for: the mordent flourish
// on A with its descending scale, the two lower octave echoes and their rests,
// a sequence spun from the same figure, the long plunge and the arpeggio
// sweeps, the diminished seventh rocket, the D minor chord that answers it, a
// prestissimo run and a closing cadence that quotes the flourish once more.
// Everything between the opening and the cadence is condensed: the score's
// repeated figuration is reduced to one statement of each idea.
//
// Form: opening flourish, descending sequence, diminished arpeggio and chord,
// prestissimo, closing cadence.
//
// The tempo map follows the free reading the music asks for: adagio at 63 for
// the opening, 104 for the sequence, 120 for the rocket, a broad 69 under the
// big chord, 116 for the prestissimo and 63 again for the last cadence.

import {
  chart,
  join,
  melody,
  part,
  phrase,
  shiftNotes,
  transposeNotes,
  trill,
} from "../Authoring";
import type { BeatEvent, TrackDefinition } from "../ChartTypes";

// ---------------------------------------------------------------------------
// Arrangement
// ---------------------------------------------------------------------------

// The opening gesture: mordent on A (A G A), the scale down G F E D C# and the
// resolution on D. Stated at A5, then an octave lower, then two octaves lower.
const flourishHigh = melody(0, "A5/0.25 G5 A5/0.5 G5/0.25 F5 E5 D5 C#5 D5/1.5");
const flourishMid = shiftNotes(transposeNotes(flourishHigh.notes, -12), 4);
const flourishLow = melody(8, "A3/0.25 G3 A3/0.5 G3/0.25 F3 E3 D3 C#3 D3/1.75");

// The same figure sequenced down the D harmonic minor scale, two beats apart.
const sequence = melody(
  12,
  "G5/0.25 F5 G5 F5 E5 D5 C#5 D5 | F5 E5 F5 E5 D5 C#5 Bb4 A4 |" +
    " E5 D5 E5 D5 C#5 Bb4 A4 G4 | D5 C#5 D5 C#5 Bb4 A4 G4 F4",
);

// Broken chord figuration over the descending harmony Dm, Gm, Bb, A.
const figuration = melody(
  20,
  "D5/0.25 F5 A5 F5 D5 F5 A5 F5 C#5 E5 A5 E5 C#5 E5 A5 E5 |" +
    " Bb4 D5 G5 D5 Bb4 D5 G5 D5 A4 C#5 G5 E5 A4 C#5 G5 E5 |" +
    " D5 F5 Bb5 F5 D5 F5 Bb5 F5 C#5 E5 A5 G5 C#5 E5 A5 G5",
);

// Two octaves of D harmonic minor straight down.
const plunge = melody(32, "D6/0.25 C#6 Bb5 A5 G5 F5 E5 D5 C#5 Bb4 A4 G4 F4 E4 D4 C#4");

// A D minor sweep answered by the diminished seventh that drives the build.
const sweeps = melody(
  36,
  "D4/0.25 F4 A4 D5 F5 A5 D6 A5 F5 D5 A4 F4 D4 A3 F3 D3 |" +
    " C#4 E4 G4 Bb4 C#5 E5 G5 Bb5 G5 E5 C#5 Bb4 G4 E4 C#4 Bb3",
);

// Block chords over a dominant pedal, tightening into the rocket.
const buildChords = melody(
  44,
  "D5+F5+A5/1 C#5+E5+A5 D5+F5+Bb5 A4+C#5+G5 |" +
    " D5+F5+A5/0.5 r C#5+E5+G5 r Bb4+D5+G5 r A4+C#5+E5/1",
);

// The diminished seventh arpeggio, three octaves up, over the top and back.
const rocketUp = melody(52, "C#3/0.25 E3 G3 Bb3 C#4 E4 G4 Bb4 C#5 E5 G5 Bb5");
const rocketDown = melody(55, "C#6/0.5 Bb5/0.25 G5 E5 C#5 Bb4 G4 E4 C#4 Bb3 G3");
const sprint = melody(58, "C#4/0.25 D4 E4 F4 G4 A4 Bb4 C#5");
const bigChord = melody(60, "D4+F4+A4+D5/4");
const bigLink = melody(64, "D4/0.5 E4 F4 G4");

// Prestissimo: broken thirds down and up, an oscillation, a two octave scale
// each way, a figure over the dominant, falling thirds in chords, a last rocket.
const p1 = melody(66, "D5/0.25 Bb4 C#5 A4 Bb4 G4 A4 F4 G4 E4 F4 D4 E4 C#4 D4 A3");
const p2 = melody(70, "D4/0.25 F4 E4 G4 F4 A4 G4 Bb4 A4 C#5 Bb4 D5 C#5 E5 D5 F5");
const p3 = melody(74, "F5/0.25 D5 E5 C#5 D5 Bb4 C#5 A4 Bb4 G4 A4 F4 G4 E4 F4 D4");
const p4 = melody(78, "A3/0.25 C#4 Bb3 D4 C#4 E4 D4 F4 E4 G4 F4 A4 G4 Bb4 A4 C#5");
const p5 = melody(82, "D5/0.25 A4 D5 A4 D5 A4 D5 A4 Bb4 D5 Bb4 D5 A4 C#5 A4 C#5");
const p6 = melody(86, "D4/0.25 E4 F4 G4 A4 Bb4 C#5 D5 E5 F5 G5 A5 Bb5 C#6 D6 C#6");
const p7 = melody(90, "D6/0.25 C#6 Bb5 A5 G5 F5 E5 D5 C#5 Bb4 A4 G4 F4 E4 D4 C#4");
const p8 = melody(94, "A4/0.25 C#5 E5 C#5 A4 C#5 E5 C#5 G4 Bb4 E5 Bb4 G4 Bb4 E5 Bb4");
const p9 = melody(98, "D5+F5/0.5 C#5+E5 D5+F5 Bb4+D5 A4+C#5 G4+Bb4 F4+A4 E4+G4");
const p10 = melody(102, "D4/0.25 F4 A4 D5 F5 A5 D6 C#6 Bb5 A5 G5 F5 E5 D5 C#5 E5");

// The flourish once more, then Dm, Gm, A7 and the final D minor chord.
const finalFlourish = melody(106, "A5/0.25 G5 A5 G5 F5 E5 D5 C#5");
const cadence = melody(108, "D5+F5+A5/2 Bb4+D5+G5 A4+C#5+G5 | D4+F4+A4+D5/6");

const manualNotes = join(
  flourishHigh,
  flourishMid,
  flourishLow,
  sequence,
  figuration,
  plunge,
  sweeps,
  buildChords,
  rocketUp,
  rocketDown,
  sprint,
  bigChord,
  bigLink,
  p1,
  p2,
  p3,
  p4,
  p5,
  p6,
  p7,
  p8,
  p9,
  p10,
  finalFlourish,
  cadence,
);

// Second manual: the octave doubling the opening asks for, then held harmony.
const harmonyNotes = join(
  transposeNotes(flourishHigh.notes, -12),
  transposeNotes(flourishMid, -12),
  // The third statement is the heaviest one, so it keeps its octave below the
  // manual up to the resolution, where the pedal takes over.
  melody(8, "A2/0.25 G2 A2/0.5 G2/0.25 F2 E2 D2 C#2"),
  melody(10.25, "A3+D4/1.75"),
  melody(12, "D3+A3/4 D3+A3/4"),
  melody(20, "D3+F3+A3/2 A2+C#3+G3 G2+Bb2+D3 A2+C#3+G3 Bb2+D3+F3 A2+C#3+G3"),
  melody(32, "A2+C#3+G3/2 D3+F3+A3/2"),
  melody(36, "D3+A3/4 C#3+G3/4"),
  melody(44, "D4+F4+A4/1 C#4+E4+A4 D4+F4+Bb4 A3+C#4+G4"),
  melody(48, "D4+F4/0.5 r C#4+G4 r Bb3+G4 r A3+C#4/1"),
  melody(60, "D3+A3/4"),
  melody(66, "D3+A3/4 D3+F3/4 D3+F3/4 A2+C#3/4 D3+A3/4 D3+F3/4 A2+E3/4 A2+C#3/4"),
  melody(102, "D3+A3/2 A2+C#3/2"),
  melody(106, "E3+A3/2"),
  melody(108, "D4+F4+A4/2 G3+Bb3+D4 A3+C#4+E4 | D3+A3/6"),
);

// Pedal line. Silent until the third statement, absent under the rocket so the
// D minor chord lands with the pedal returning.
const pedalNotes = join(
  melody(10.25, "D2/1.75"),
  melody(12, "D2/4 D2/4"),
  melody(20, "D2/4 G2/4 Bb2/2 A2/2"),
  melody(32, "A2/4 D2/4"),
  melody(44, "D2/0.5 D2 A2 A2 Bb2 Bb2 A2 A2"),
  melody(48, "A2/0.5 A2 A2 A2 A2 A2 A2 A2"),
  melody(60, "D2/6"),
  melody(66, "D2/4 D2/4 F2/4 A2/4 D2/4 D2/4 A2/4 A2/4"),
  melody(98, "D3/0.5 C#3 D3 Bb2 A2 G2 F2 E2"),
  melody(102, "D2/2 A2/2"),
  melody(106, "A2/2 D2/2 G2/2 A2/2 D2/6"),
);

const impactNotes = join(melody(44, "t/1"), melody(60, "cr/4"), melody(102, "t/1"), melody(114, "cr/6"));

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

// Prestissimo lane patterns, two beats each. The broken thirds zigzag as they
// travel, so the lanes zigzag with them: the virtuoso reading takes three of
// every four sixteenths, the maestro reading takes them all.
const DESC_A = "4/0.25 3 4 r 3 2 3 r";
const DESC_B = "2/0.25 1 2 r 1 0 1 r";
const ASC_A = "0/0.25 1 0 r 1 2 1 r";
const ASC_B = "2/0.25 3 2 r 3 4 3 r";
const DESC_A16 = "4/0.25 3 4 3 3 2 3 2";
const DESC_B16 = "2/0.25 1 2 1 1 0 1 0";
const ASC_A16 = "0/0.25 1 0 1 1 2 1 2";
const ASC_B16 = "2/0.25 3 2 3 3 4 3 4";

/** One four-beat prestissimo unit, written as two phrases of two beats. */
function unit(id: string, startBeat: number, first: string, second: string): BeatEvent[] {
  return [...phrase(`${id}a`, startBeat, first), ...phrase(`${id}b`, startBeat + 2, second)];
}

const noviceChart = chart(
  "novice",
  phrase("a1", 0, "4!/1.25 3/0.5 2/0.5 2h/1.25 r/0.5"),
  phrase("a2", 4, "3!/1.25 2/0.5 1/0.5 1h/1.25 r/0.5"),
  phrase("a3", 8, "2!/1.25 1/0.5 0/0.5 0h/1.5 r/0.25"),
  phrase("b1", 12, "4/1 3/0.5 2/0.5 3/1 2/0.5 1/0.5"),
  phrase("b2", 16, "3/1 2/0.5 1/0.5 2/1 1/1"),
  phrase("b3", 20, "3/0.5 4/0.5 3/1 2/0.5 4/0.5 2/1"),
  phrase("b4", 24, "2/0.5 4/0.5 2/1 1/0.5 4/0.5 1/1"),
  phrase("b5", 28, "3/0.5 4/0.5 3/1 2/0.5 4/0.5 2/1"),
  phrase("b6", 32, "4/1 3/1 2/1 1/1"),
  phrase("b7", 36, "0/1 3/0.5 4/0.5 3/1 0/1"),
  phrase("b8", 40, "0/1 2/0.75 4/0.75 2/0.75"),
  phrase("b9", 44, "[3,4]!/1 2/1 [3,4]/1 1/1"),
  phrase("b10", 48, "[2,3]/1 2/1 [1,2]/1 1!/1"),
  phrase("c1", 52, "0/1 1/1 3/1 4!/1"),
  phrase("c2", 56, "3/1 1/1 0/1 2/1 [2,4]!/4"),
  phrase("d1", 64, "1/1 2/1 4/1 3/1 2/1 1/1"),
  phrase("d2", 70, "0/1 1/0.5 2/0.5 2/1 3/0.5 4/0.5"),
  phrase("d3", 74, "4/1 3/1 2/1 1/1"),
  phrase("d4", 78, "0/1 1/0.5 2/0.5 2/1 3/0.5 4/0.5"),
  phrase("d5", 82, "4/1 4/1 3/1 2/1"),
  phrase("d6", 86, "0/1 1/0.5 2/0.5 3/1 4/1"),
  phrase("d7", 90, "4/1 3/1 2/1 1/1"),
  phrase("d8", 94, "2/1 2/0.5 4/0.5 1/1 1/1"),
  phrase("d9", 98, "[3,4]/1 2/1 [1,2]/1 0/1"),
  phrase("d10", 102, "0/1 3/0.5 4/0.5 3/1 2/0.5 1/0.5"),
  phrase("e1", 106, "4/1 3/1 [3,4]!/2 [2,3]/2 [2,4]/2 [1,4]!/4"),
);

const apprenticeChart = chart(
  "apprentice",
  phrase("a1", 0, "4!/0.5 4/0.5 3/0.25 2/0.5 1/0.25 0/0.25 1h/1.25 r/0.5"),
  phrase("a2", 4, "3!/0.5 3/0.5 2/0.25 1/0.5 0/0.5 1h/1.25 r/0.5"),
  phrase("a3", 8, "2!/0.5 2/0.5 1/0.5 0/0.5 0/0.25 1h/1.5 r/0.25"),
  phrase("b1", 12, "4/0.5 4 3 2 4 3 2 1"),
  phrase("b2", 16, "3/0.5 3 2 1 3 2 1 0"),
  phrase("b3", 20, "3/0.5 4 3 4 2 4 2 4"),
  phrase("b4", 24, "1/0.5 3 1 3 0 3 0 3"),
  phrase("b5", 28, "3/0.5 4 3 4 2 4 2 4"),
  phrase("b6", 32, "4/0.5 4 3 3 2 2 1 0"),
  phrase("b7", 36, "0/0.5 2 3 4 3 2 1 0"),
  phrase("b8", 40, "0/0.5 1 3 4 4 3 1/1"),
  phrase("b9", 44, "[3,4]!/1 [2,4] [3,4] [1,3]"),
  phrase("b10", 48, "[3,4]/1 [2,3] [1,2] [0,2]!"),
  phrase("c1", 52, "0/0.5 1 2 3 4/1 4!/1"),
  phrase("c2", 55.5, "3/0.5 2 1 0 r 1/1 2/0.5 3/0.5"),
  phrase("c3", 60, "[2,4]!/4 0/0.5 1 2 3"),
  phrase("d1", 66, "4/0.5 4 3 3 2 2 1 0"),
  phrase("d2", 70, "0/0.5 1 1 2 2 3 3 4"),
  phrase("d3", 74, "4/0.5 4 3 3 2 2 1 0"),
  phrase("d4", 78, "0/0.5 0 1 1 2 2 3 4"),
  phrase("d5", 82, "4/0.5 3 4 3 2 1 2 1"),
  phrase("d6", 86, "0/0.5 1 1 2 3 3 4 4"),
  phrase("d7", 90, "4/0.5 4 3 3 2 2 1 0"),
  phrase("d8", 94, "2/0.5 4 2 4 1 4 1/1"),
  phrase("d9", 98, "[3,4]/1 [2,3] [1,2] [0,1]"),
  phrase("d10", 102, "0/0.5 1 3 4 4 3 2 1"),
  phrase("e1", 106, "4!/0.5 4 3 2 [3,4]!/2 [2,3] [2,4] [1,4]!/4"),
);

const virtuosoChart = chart(
  "virtuoso",
  phrase("a1", 0, "4!/0.25 3 4/0.5 4/0.25 3 2 1 0 1h/1.25 r/0.5"),
  phrase("a2", 4, "3!/0.25 2 3/0.5 3/0.25 2 r 1 0 1h/1.25 r/0.5"),
  phrase("a3", 8, "2!/0.25 1 2/0.5 2/0.25 1 0 r 0 1h/1.5 r/0.25"),
  unit("b1", 12, "4/0.25 3 4 r 3 2 1 r", "3/0.25 2 3 r 2 1 0 r"),
  unit("b2", 16, "4/0.25 3 4 r 3 2 1 r", "3/0.25 2 3 r 2 1 0 r"),
  unit("b3", 20, "2/0.25 3 4 r 2 3 4 r", "1/0.25 2 4 r 1 2 4 r"),
  unit("b4", 24, "1/0.25 2 3 r 1 2 3 r", "0/0.25 1 3 r 0 1 3 r"),
  unit("b5", 28, "2/0.25 3 4 r 2 3 4 r", "1/0.25 2 4 r 1 2 4 r"),
  unit("b6", 32, "4/0.25 4 3 r 3 3 2 r", "2/0.25 2 1 r 1 0 0 r"),
  unit("b7", 36, "0/0.25 1 2 r 3 4 4 r", "3/0.25 2 2 r 1 0 0 r"),
  unit("b8", 40, "0/0.25 1 2 r 2 3 4 r", "4/0.25 3 2 r 2 1 r r"),
  phrase("b9", 44, "[2,3,4]!/1 [1,2,4] [2,3,4] [1,2,4]"),
  phrase("b10", 48, "[3,4]/0.5 0 [2,3] 0 [1,2] 0 [0,1]!"),
  phrase("c1", 52, "0/0.25 1 2 r 1 2 3 r"),
  phrase("c1b", 54, "2/0.25 3 4 r 4!/1"),
  phrase("c2", 55.5, "4/0.25 3 2 r 3 2 1 r 1 0"),
  phrase("c3", 58, "1/0.5 2 3 4 [0,2,4]!/2"),
  phrase("c4", 64, "0/0.5 1 2 3"),
  unit("d1", 66, DESC_A, DESC_B),
  unit("d2", 70, ASC_A, ASC_B),
  unit("d3", 74, DESC_A, DESC_B),
  unit("d4", 78, ASC_A, ASC_B),
  trill("t1", 82, "4/0.5 2 4 2"),
  trill("t2", 84, "3/0.5 1 3 1"),
  unit("d5", 86, ASC_A, ASC_B),
  unit("d6", 90, DESC_A, DESC_B),
  unit("d7", 94, "1/0.25 3 4 r 1 3 4 r", "0/0.25 2 4 r 0 2 r r"),
  phrase("d8", 98, "[3,4]/0.5 2 [3,4] 2 [1,2] 0 [1,2] 0"),
  unit("d9", 102, "0/0.25 1 2 r 4 3 4 r", "4/0.25 3 4 r 2 1 0 r"),
  phrase("e1", 106, "4!/0.25 3 4 4 3 2 1 r"),
  phrase("e2", 108, "[2,3,4]!/2 [1,2,3] [1,2,4] [0,2,4]!/6"),
);

const maestroChart = chart(
  "maestro",
  phrase("a1", 0, "[3,4]!/0.25 3 4/0.5 4/0.25 3 2 1 0 1h/1.25 r/0.5"),
  phrase("a2", 4, "[2,3]!/0.25 2 3/0.5 3/0.25 2 r 1 0 1h/1.25 r/0.5"),
  phrase("a3", 8, "[1,2]!/0.25 1 2/0.5 2/0.25 1 0 r 0 1h/1.5 r/0.25"),
  unit("b1", 12, "4/0.25 3 4 3 3 2 1 2", "3/0.25 2 3 2 2 1 0 1"),
  unit("b2", 16, "4/0.25 3 4 3 3 2 1 2", "3/0.25 2 3 2 2 1 0 1"),
  unit("b3", 20, "2/0.25 3 4 3 2 3 4 3", "1/0.25 2 4 2 1 2 4 2"),
  unit("b4", 24, "1/0.25 2 3 2 1 2 3 2", "0/0.25 1 3 1 0 1 3 1"),
  unit("b5", 28, "2/0.25 3 4 3 2 3 4 3", "1/0.25 2 4 2 1 2 4 2"),
  unit("b6", 32, DESC_A16, DESC_B16),
  unit("b7", 36, "0/0.25 1 2 3 3 4 4 3", "3/0.25 3 2 2 1 1 0 0"),
  unit("b8", 40, "0/0.25 1 1 2 2 3 3 4", "4/0.25 3 3 2 2 1 r r"),
  phrase("b9", 44, "[2,3,4]!/0.5 0 [1,2,4] 0 [2,3,4] 0 [1,2,4] 0"),
  phrase("b10", 48, "[2,3,4]/0.5 0 [1,2,3] 0 [0,1,2] 0 [0,1,2]!"),
  phrase("c1", 52, "0/0.25 1 2 3 1 2 3 4"),
  phrase("c1b", 54, "1/0.25 2 3 4 4!/1"),
  phrase("c2", 55.5, "4/0.25 4 3 3 2 2"),
  phrase("c2b", 57, "1/0.25 1 0 0"),
  phrase("c3", 58, "0/0.25 1 2 r 2 3 4 r [0,2,4]!/2"),
  phrase("c4", 64, "0/0.5 1 2 3"),
  unit("d1", 66, DESC_A16, DESC_B16),
  unit("d2", 70, ASC_A, ASC_B),
  unit("d3", 74, DESC_A16, DESC_B16),
  unit("d4", 78, ASC_A, ASC_B),
  trill("t1", 82, "4/0.25 2 4 2 4 2 4 2"),
  trill("t2", 84, "3/0.25 1 3 1 3 1 3 1"),
  unit("d5", 86, ASC_A16, ASC_B16),
  unit("d6", 90, DESC_A16, DESC_B16),
  unit("d7", 94, "1/0.25 3 4 r 1 3 4 r", "0/0.25 2 4 r 0 2 r r"),
  phrase("d8", 98, "[2,3,4]!/0.5 1 [2,3,4] 0 [1,2,3] 0 [0,1,2] 3"),
  unit("d9", 102, "0/0.25 1 2 3 4 3 4 3", "4/0.25 3 4 3 2 1 0 r"),
  phrase("e1", 106, "[3,4]!/0.25 3 4 4 3 2 1 0"),
  phrase("e2", 108, "[2,3,4]!/2 [1,2,3] [1,2,4] [0,2,4]!/6"),
);

const def: TrackDefinition = {
  metadata: {
    id: "bach-toccata-d-minor",
    order: 7,
    title: "Toccata and Fugue in D minor",
    composer: "Johann Sebastian Bach",
    composerShort: "J. S. Bach",
    catalogNumber: "BWV 565",
    attributionNote:
      "The work is published as Bach's and catalogued as BWV 565, though some scholars question the attribution.",
    movementOrExcerpt: "Toccata, opening",
    bpm: 63,
    timeSignature: [4, 4],
    difficulty: "virtuoso",
    arrangementStyle: "Organ synth with a doubled pedal bass and a crash on the big chords",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Written from the author's own knowledge of the published organ score. No external MIDI file, edition or recording was used.",
    licenseNotes:
      "The composition is in the public domain. The note data here is an original arrangement written for this game and is covered by the project licence.",
    unlockAfter: "beethoven-fur-elise",
  },
  tempoMap: [
    { beat: 0, bpm: 63 },
    { beat: 12, bpm: 104 },
    { beat: 52, bpm: 120 },
    { beat: 60, bpm: 69 },
    { beat: 66, bpm: 116 },
    { beat: 106, bpm: 63 },
  ],
  sections: [
    { name: "Opening flourish", startBeat: 0, endBeat: 12 },
    { name: "Descending sequence", startBeat: 12, endBeat: 52 },
    { name: "Diminished arpeggio", startBeat: 52, endBeat: 66 },
    { name: "Prestissimo", startBeat: 66, endBeat: 106 },
    { name: "Closing cadence", startBeat: 106, endBeat: 120 },
  ],
  arrangement: {
    parts: [
      part("manual", "organ", manualNotes, { gain: 0.95, pan: 0 }),
      part("second-manual", "organ", harmonyNotes, { gain: 0.5, pan: -0.25 }),
      part("pedal", "organ", pedalNotes, { gain: 0.6, pan: 0.2 }),
      part("pedal-bass", "bass", pedalNotes, { gain: 0.55, pan: 0 }),
      part("impact", "percussion", impactNotes, { gain: 0.4, pan: 0 }),
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
