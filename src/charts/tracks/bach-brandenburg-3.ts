// Brandenburg Concerto No. 3 in G major, BWV 1048, first movement.
//
// The excerpt is the opening ritornello and the episode that answers it, score
// bars 1 to 26, ending on the tonic arrival. A one bar continuo introduction
// sets the pulse before the anacrusis, and a coda restates the head of the
// ritornello (bars 1 and 2) and its cadence (bars 7 and 8) so the track closes
// on a full stop rather than mid phrase.
//
// Form: opening ritornello, echo dialogue, arpeggio episode, return, coda.
// The two violin lines double at the octave through the ritornello, as the
// score has them, and separate into three part writing once the echoes start.

import { chart, join, lanes, melody, part, phrase, shiftEvents } from "../Authoring";
import type { BeatEvent, TrackDefinition } from "../ChartTypes";

// ---------------------------------------------------------------------------
// Arrangement
// ---------------------------------------------------------------------------

// Score bars 1 and 2: the turning figure over the tonic, then the answer that
// leans towards the dominant. The coda restates both bars at beat 108.
const violin1Head = (at: number) =>
  melody(
    at,
    "G5/0.5 D5/0.25 C5 D5/0.5 G5/0.25 F#5 G5/0.5 B4/0.25 A4 B4/0.5 G5/0.25 F#5 | " +
      "G5/0.5 G4/0.25 A4 B4/0.5 C#5 D5/0.25 C#5 D5 E5 D5 F#5 D5 G5",
  );
const violin2Head = (at: number) =>
  melody(
    at,
    "G4/0.5 D4/0.25 C4 D4/0.5 G4/0.25 F#4 G4/0.5 B3/0.25 A3 B3/0.5 G4/0.25 F#4 | " +
      "G4/0.5 G3/0.25 A3 B3/0.5 C#4 D4/0.25 C#4 D4 E4 D4 F#4 D4 G4",
  );
const continuoHead = (at: number) =>
  melody(
    at,
    "G2/0.5 G3 G3 G2 G2 G3 G3 G2 | " +
      "G2 G3/0.25 F#3 E3/0.5 A3 D3 D3/0.25 C#3 D3/0.5 D3",
  );
const harpsichordHead = (at: number) =>
  melody(
    at,
    "G3+B3+D4/2 G3+B3+D4 | " +
      "G3+B3+D4 F#3+A3+D4",
  );

// Score bar 7 and the first half of bar 8: the cadential descent that ends
// the ritornello. The coda reuses it at beat 116.
const violin1Close = (at: number) =>
  melody(
    at,
    "B5/0.5 A5/0.25 G5 D5/0.5 F#5 G5 F#5/0.25 E5 D5 C5 B4 A4 | " +
      "B4/0.5 A4/0.25 G4 D5/0.5 D5",
  );
const violin2Close = (at: number) =>
  melody(
    at,
    "B4/0.5 A4/0.25 G4 D4/0.5 F#4 G4 F#4/0.25 E4 D4 C4 B3 A3 | " +
      "B3/0.5 A3/0.25 G3 D4/0.5 D4",
  );
const continuoClose = (at: number) =>
  melody(
    at,
    "G3/0.5 C3 D3 D3 G3 F#3/0.25 E3 D3 C3 B2 A2 | " +
      "B2/0.5 A2/0.25 G2 D3/0.5 D2",
  );
const harpsichordClose = (at: number) =>
  melody(
    at,
    "G3+B3+D4/2 G3+B3+D4 | " +
      "G3+B3+D4",
  );

const violin1 = join(
  // Anacrusis into the first downbeat.
  melody(3.5, "G5/0.25 F#5"),
  violin1Head(4),
  // Score bars 3 to 6.
  melody(
    12,
    "D5/0.25 C#5 D5 E5 D5 A5 D5 B5 D5 C#5 D5 E5 D5 C6 D5 D6 | " +
      "B5/0.5 A5/0.25 G5 A5/0.5 G5/0.25 F#5 G5/0.5 F#5/0.25 E5 D5 G5 D5 G5 | " +
      "E5/0.5 D5/0.25 C5 B4 G5 B4 G5 C5/0.5 B4/0.25 A4 G4 G5 A4 G5 | " +
      "B4 G5 C#5 G5 D5 F#5 D5 G5 D5 A5 D5 B5 D5 C6 D5 D6",
  ),
  violin1Close(28),
  // Bar 8 resolves, then the upbeat that throws the figure an octave up.
  melody(34, "G4/1 r/0.5 G6/0.25 F#6"),
  // Score bars 9 to 16: the echoes, then the head restated in G.
  melody(
    36,
    "G6/0.5 D6/0.25 C6 D6/0.5 r/2.5 | " +
      "r/0.5 D5 G5/0.25 B5 A5 G5 F#5 A5 D5 E5 F#5 G5 A5 G5 | " +
      "F#5/0.5 D6 r C#6 D6 G5 D5 E5 | " +
      "F#5 E5/0.25 D5 E5/0.5 D5/0.25 C#5 D5/0.5 C#5/0.25 B4 A4 D5 A4 D5 | " +
      "B4/0.5 A4/0.25 G4 F#4 D5 F#4 D5 G4/0.5 F#4/0.25 E4 D4 D5 E4 D5 | " +
      "F#4 D5 G#4 D5 A4 C#5 A4 D5 A4 E5 A4 F#5 A4 G5 A4 A5 | " +
      "F#5/0.5 E5/0.25 D5 A4/0.5 C#5 D5/1 r/0.5 G5/0.25 F#5 | " +
      "G5/0.5 D5/0.25 C5 D5/0.5 r/2.5",
  ),
  // Score bars 17 to 21: the answering thirds and the broken chords.
  melody(
    68,
    "r/0.5 B4/0.25 C5 D5/0.5 F#5 A4 D6/0.25 C#6 D6/0.5 r | " +
      "r D6/0.25 C#6 D6/0.5 r/1 D6/0.25 C#6 D6/0.5 r | " +
      "r D5 F#5 A5 F#5 D5 F#5 A5 | " +
      "F#5 A4 D5/0.25 F#5 E5 D5 C#5/1 r/0.5 C#5 | " +
      "B4/1 r/0.5 E5 D5/0.25 F#5 B4 C#5 D5 E5 F#5 G5",
  ),
  // Score bars 22 to 25: the return, running down to the cadence.
  melody(
    88,
    "A5/0.5 A5 A5 G5/0.25 F#5 G5/0.5 G5 G5 F#5/0.25 E5 | " +
      "F#5/0.5 E5/0.25 D5 A4/0.5 C#5 D5/0.25 C#5 D5 E5 D5 F#5 D5 G5 | " +
      "D5 C#5 D5 E5 D5 A5 D5 B5 F#5 E5 F#5 G5 F#5 A4 G5 B4 | " +
      "F#5 E5 F#5 G5 F#5 C5 G5 B4 A4 G4 A4 B4 A4 G5 A4 F#5",
  ),
  // Bar 26 arrives on the tonic and hands the head back to the coda.
  melody(104, "G5/1 r/0.5 G4/0.25 F#4 G4/0.5 r/1 G5/0.25 F#5"),
  violin1Head(108),
  violin1Close(116),
  // Final tonic.
  melody(122, "G5/2"),
);

const violin2 = join(
  // Anacrusis, an octave below the first violin.
  melody(3.5, "G4/0.25 F#4"),
  violin2Head(4),
  // Score bars 3 to 6.
  melody(
    12,
    "D4/0.25 C#4 D4 E4 D4 A4 D4 B4 D4 C#4 D4 E4 D4 C5 D4 D5 | " +
      "B4/0.5 A4/0.25 G4 A4/0.5 G4/0.25 F#4 G4/0.5 F#4/0.25 E4 D4 G4 D4 G4 | " +
      "E4/0.5 D4/0.25 C4 B3 G4 B3 G4 C4/0.5 B3/0.25 A3 G3 G4 A3 G4 | " +
      "B3 G4 C#4 G4 D4 F#4 D4 G4 D4 A4 D4 B4 D4 C5 D4 D5",
  ),
  violin2Close(28),
  // Bar 8, then the middle voice of the first echo chord.
  melody(34, "G3/1 r/0.5 B4/0.25 B4"),
  // Score bars 9 to 16.
  melody(
    36,
    "B4/0.5 G4/0.25 F#4 G4/0.5 r/2.5 | " +
      "r/0.5 D5 G5/0.25 B5 A5 G5 F#5/1 r/0.5 E5 | " +
      "F#5/0.25 A5 D5 E5 F#5 G5 A5 G5 F#5/0.5 D6 r C#6 | " +
      "D6 E5/0.25 D5 E5/0.5 D5/0.25 C#5 D5/0.5 C#5/0.25 B4 A4 D5 A4 D5 | " +
      "B4/0.5 A4/0.25 G4 F#4 D5 F#4 D5 G4/0.5 F#4/0.25 E4 D4 D5 E4 D5 | " +
      "F#4 D5 G#4 D5 A4 C#5 A4 D5 A4 E5 A4 F#5 A4 G5 A4 A5 | " +
      "F#5/0.5 E5/0.25 D5 A4/0.5 C#5 D5/1 r/0.5 D5/0.25 C5 | " +
      "D5/0.5 B4/0.25 A4 B4/0.5 r/2.5",
  ),
  // Score bars 17 to 21.
  melody(
    68,
    "r/0.5 B4/0.25 C5 D5/0.5 F#5 A4 A5/0.25 G5 A5/0.5 r | " +
      "r A5/0.25 G5 A5/0.5 r/1 A5/0.25 G5 A5/0.5 r | " +
      "r D5 F#5 A5 F#5 D5 F#5 A5 | " +
      "F#5 A4 D5/0.25 F#5 E5 D5 C#5 E5 A4 B4 C#5 D5 E5 F#5 | " +
      "G5/1 r/0.5 G5 F#5/1 r/0.5 F#5",
  ),
  // Score bars 22 to 26. The second violin keeps the sixteenths running
  // under the first violin's arrival on the tonic.
  melody(
    88,
    "F#5/0.5 F#5 F#5 E5/0.25 F#5 E5/0.5 E5 E5 D5/0.25 E5 | " +
      "D5/0.5 B4 A4 A4 A4/1 r/0.5 D5/0.25 C#5 | " +
      "D5/0.5 r/1 D5/0.25 C#5 D5/0.5 D5 D5 D5 | " +
      "D5 D5 D5 D5 D5 D5 D5 A4 | " +
      "G4/0.25 F#4 G4 A4 G4 B4 G4 C5 G4 F#4 G4 A4 G4 D5 G4 E5",
  ),
  violin2Head(108),
  violin2Close(116),
  // Final tonic.
  melody(122, "D5/2"),
);

const continuo = join(
  // One bar of continuo before the strings enter, on the tonic pedal.
  melody(0, "G2/0.5 G3 G3 G2 G2 G3 G3 G2"),
  continuoHead(4),
  // Score bars 3 to 6.
  melody(
    12,
    "D3/0.5 D3/0.25 C#3 D3/0.5 D3 D3 D3/0.25 C#3 D3/0.5 D3 | " +
      "G3 E3 C3 D3 E3 D3/0.25 C3 B2/0.5 A2/0.25 G2 | " +
      "C3/0.5 B2/0.25 A2 G2/0.5 G3/0.25 F#3 E3/0.5 D3/0.25 C3 B2/0.5 C#3 | " +
      "D3 D2 D2 D3/0.25 E3 F#3/0.5 G3 A3 F#3",
  ),
  continuoClose(28),
  // Bar 8 and the upbeat.
  melody(34, "G2/1 r/0.5 D3"),
  // Score bars 9 to 16.
  melody(
    36,
    "G2/1 r/2.5 D3/0.25 C3 | " +
      "r/0.5 G2/0.25 A2 B2/0.5 C#3 D3/1 r/0.5 A3 | " +
      "D3/1 r/0.5 A3 D3/1 r/0.5 A2 | " +
      "D2 B2 G2 A2 B2 A2/0.25 G2 F#2/0.5 E2/0.25 D2 | " +
      "G2/0.5 F#2/0.25 E2 D2/0.5 D3/0.25 C#3 B3/0.5 A3/0.25 G3 F#3/0.5 G#3 | " +
      "A3 A2 A2 A3/0.25 B3 C#3/0.5 D3 E3 C#3 | " +
      "D3 G3 A3 A2 D3 D3/0.25 C#3 B3 C#3 B3 A3 | " +
      "G3/1 r/3",
  ),
  // Score bars 17 to 21.
  melody(
    68,
    "r/0.5 G2/0.25 A2 B2/0.5 C#3 D3/1 r/0.5 A3 | " +
      "D3/1 r/0.5 A3 D3/1 r/0.5 A2 | " +
      "D2 D3 D3 D2 D2 D3 D3 D2 | " +
      "D2 D3/0.25 C#3 B2/0.5 E3 A2/1 r/0.5 A2 | " +
      "E3/1 r/0.5 E3 B2/1 r/0.5 B2",
  ),
  // Score bars 22 to 25.
  melody(
    88,
    "F#3/0.5 B3/0.25 A3 B3/0.5 E3/0.25 D3 E3/0.5 A3/0.25 G3 A3/0.5 D3/0.25 C#3 | " +
      "D3/0.5 G3 A3 A2 D3 D3/0.25 C#3 D3/0.5 r | " +
      "r D3/0.25 C#3 D3/0.5 r/1 D3/0.25 C#3 D3/0.5 r | " +
      "r D3/0.25 C#3 D3/0.5 r/1 D3/0.25 C#3 D3/0.5 D3",
  ),
  // Bar 26.
  melody(104, "G2/0.5 G3/0.25 F#3 G3/0.5 r/1 G3/0.25 F#3 G3/0.5 G2"),
  continuoHead(108),
  continuoClose(116),
  // Final tonic.
  melody(122, "G2/2"),
);

const harpsichord = join(
  // Two chords per bar, a plain realisation of the figured bass.
  melody(0, "G3+B3+D4/2 G3+B3+D4"),
  harpsichordHead(4),
  melody(
    12,
    "F#3+A3+D4/2 F#3+A3+D4 | " +
      "G3+B3+D4 E3+G3+B3 | " +
      "E3+G3+C4 E3+G3+B3 | " +
      "F#3+A3+D4 F#3+A3+D4",
  ),
  harpsichordClose(28),
  melody(34, "G3+B3+D4/2"),
  melody(
    36,
    "G3+B3+D4/2 G3+B3+D4 | " +
      "G3+B3+D4 F#3+A3+D4 | " +
      "F#3+A3+D4 F#3+A3+D4 | " +
      "F#3+A3+D4 F#3+B3+D4 | " +
      "G3+B3+D4 G3+B3+D4 | " +
      "E3+A3+C#4 E3+A3+C#4 | " +
      "F#3+A3+D4 F#3+A3+D4 | " +
      "G3+B3+D4 G3+B3+D4",
  ),
  melody(
    68,
    "G3+B3+D4/2 F#3+A3+D4 | " +
      "F#3+A3+D4 F#3+A3+D4 | " +
      "F#3+A3+D4 F#3+A3+D4 | " +
      "F#3+A3+D4 E3+A3+C#4 | " +
      "E3+G3+B3 F#3+B3+D4",
  ),
  melody(
    88,
    "F#3+B3+D4/2 E3+G3+B3 | " +
      "F#3+A3+D4 F#3+A3+D4 | " +
      "F#3+A3+D4 F#3+A3+D4 | " +
      "F#3+A3+C4 F#3+A3+C4 | " +
      "G3+B3+D4 G3+B3+D4",
  ),
  harpsichordHead(108),
  harpsichordClose(116),
  // Final chord.
  melody(122, "G3+B3+D4+G4/2"),
);

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

// Novice: one note a beat from the first violin, with the pedal bars
// answering off the pedal so the lane changes.
const noviceHead: BeatEvent[] = [
  ...phrase("a1", 4, "4/1 1 4 0"),
  ...phrase("a2", 8, "3/1 0 1/1.25 2/0.75"),
];
const noviceMid: BeatEvent[] = [
  ...phrase("b1", 12, "1/1.25 3/0.75 1/1.25 4/0.75"),
  ...phrase("b2", 16, "3/1 2 1 2"),
  ...phrase("b3", 20, "3/1 0 1 0"),
  ...phrase("b4", 24, "1/1 2/1.25 3/0.75 2/1"),
];
const noviceClose: BeatEvent[] = [
  ...phrase("c1", 28, "4/1 1 2 1"),
  ...phrase("c2", 32, "0/1 2"),
];
const noviceEpisode: BeatEvent[] = [
  ...phrase("d1", 34, "0/2 | 4/1 3 0/2"),
  ...phrase("d2", 40, "0/1 3 2/1.25 3/0.75"),
  ...phrase("d3", 44, "2/2 4/1 2 | 3 2"),
  ...phrase("d4", 50, "1/1 2 | 3 1 2 0"),
  ...phrase("d5", 56, "1/1 2/1.25 3/0.75 2/1"),
  ...phrase("d6", 60, "4/1 2 3/2 | 4/1 1 0/2"),
];
const noviceArpeggios: BeatEvent[] = [
  ...phrase("e1", 68, "0/1 2 1 4/2 | 4 4 | 3/1"),
  ...phrase("e2", 78, "3/1 3 | 3 2 1/2"),
  ...phrase("e3", 84, "0/2 2/1 2"),
];
const noviceReturn: BeatEvent[] = [
  ...phrase("f1", 88, "4/1 4 3 3"),
  ...phrase("f2", 92, "2/1 0 1/1.25 2/0.75"),
  ...phrase("f3", 96, "1/1.25 4/0.75 2/1.25 1/0.75"),
  ...phrase("f4", 100, "3/1.25 1/0.75 0/1 0"),
  ...phrase("f5", 104, "4/2 0/1.5"),
];
const noviceChart = chart(
  "novice",
  noviceHead,
  noviceMid,
  noviceClose,
  noviceEpisode,
  noviceArpeggios,
  noviceReturn,
  shiftEvents(noviceHead, 104, "-coda"),
  shiftEvents(noviceClose, 88, "-coda"),
  lanes(122, "2/2"),
);

// Apprentice: the first violin on the beat and the half beat, with the
// other parts filling the rests.
const apprenticeHead: BeatEvent[] = [
  ...phrase("a1", 3.5, "4/0.5 | 4 2 2 4"),
  ...phrase("a2", 6, "4/0.5 1 1 4"),
  ...phrase("a3", 8, "4/0.5 0 1 2 3/0.75 4/0.25 2/0.75 0/0.25"),
];
const apprenticeMid: BeatEvent[] = [
  ...phrase("b1", 12, "2/0.75 3/0.25 0/0.75 3/0.25 0/0.75 1/0.25 0/0.75 4/0.25"),
  ...phrase("b2", 16, "3/0.5 2 2 1 1 2 1 1"),
  ...phrase("b3", 20, "2/0.5 1 0 0 2 1 0 1"),
  ...phrase("b4", 24, "2/0.5 3 2/0.75 3/0.25 2/0.75 4/0.25 1/0.75 4/0.25"),
];
const apprenticeClose: BeatEvent[] = [
  ...phrase("c1", 28, "3/0.5 2 1 2 3 2 1 0"),
  ...phrase("c2", 32, "0/0.5 1 2 2"),
];
const apprenticeEpisode: BeatEvent[] = [
  ...phrase("d1", 34, "1/1.5 4/0.5 | 4 3 3/1"),
  ...phrase("d2", 38, "0/1.5 1/1 | 2/0.5 3 4"),
  ...phrase("d3", 42, "2/0.5 1 2 3"),
  ...phrase("d4", 44, "1/0.5 4/1 3/0.5 4 2 0 1"),
  ...phrase("d5", 48, "2/0.5 1 1 2 2 1 0 0"),
  ...phrase("d6", 52, "2/0.5 1 0 0 2 1 0 1"),
  ...phrase("d7", 56, "2/0.5 3 2/0.75 3/0.25 2/0.75 4/0.25 1/0.75 4/0.25"),
  ...phrase("d8", 60, "3/0.5 2 0 1 2/1.5 4/0.5"),
  ...phrase("d9", 64, "4/0.5 2 2/1 0/2"),
];
const apprenticeArpeggios: BeatEvent[] = [
  ...phrase("e1", 68, "0/0.5 1 2 3 1 4 4/1.5 | 4/0.5"),
  ...phrase("e2", 73, "4/1.5 4/0.5 4/1.5 | 0/0.5 1 3"),
  ...phrase("e3", 78, "2/0.5 1 3 4"),
  ...phrase("e4", 80, "3/0.5 0 2 3 1/1.5 1/0.5"),
  ...phrase("e5", 84, "0/1.5 3/0.5 2 0 1 3"),
];
const apprenticeReturn: BeatEvent[] = [
  ...phrase("f1", 88, "4/0.5 4 4 3 3 3 3 2"),
  ...phrase("f2", 92, "2/0.5 1 0 1 2/0.75 3/0.25 1/0.75 3/0.25"),
  ...phrase("f3", 96, "1/0.75 2/0.25 0/0.75 4/0.25 2/0.75 3/0.25 2/0.5 3"),
  ...phrase("f4", 100, "2/0.75 3/0.25 2/0.5 4 1/0.75 2/0.25 1/0.75 3/0.25"),
  ...phrase("f5", 104, "4/1.5 0/0.5 0/1.5"),
];
const apprenticeChart = chart(
  "apprentice",
  apprenticeHead,
  apprenticeMid,
  apprenticeClose,
  apprenticeEpisode,
  apprenticeArpeggios,
  apprenticeReturn,
  shiftEvents(apprenticeHead, 104, "-coda"),
  shiftEvents(apprenticeClose, 88, "-coda"),
  lanes(122, "2/2"),
);

// Virtuoso: three notes a beat, keeping the moving sixteenth of every
// pedal alternation.
const virtuosoHead: BeatEvent[] = [
  ...phrase("a1", 3.5, "4/0.25 3 | 4/0.5 2/0.25 1 2/0.5 4/0.25 3"),
  ...phrase("a2", 6, "4/0.5 1/0.25 0 1/0.5 4/0.25 3"),
  ...phrase("a3", 8, "4/0.75 0/0.25 1/0.5 2 3/0.25 1/0.5 3/0.25 2"),
  ...phrase("a4", 11.25, "3/0.5 4/0.25"),
];
const virtuosoMid: BeatEvent[] = [
  ...phrase("b1", 12, "1/0.25 0/0.5 1/0.25 0 3/0.5 4/0.25"),
  ...phrase("b2", 14, "1/0.25 0/0.5 1/0.25 0 4/0.5 3/0.25"),
  ...phrase("b3", 16, "2/0.75 1/0.25 2/0.5 1/0.25 0"),
  ...phrase("b4", 18, "2/0.5 1/0.25 2 1/0.5 1/0.25 4"),
  ...phrase("b5", 20, "2/0.5 1/0.25 2 1/0.5 1/0.25 4"),
  ...phrase("b6", 22, "2/0.5 1/0.25 0 1/0.5 2/0.25 4"),
  ...phrase("b7", 24, "1/0.5 2/0.25 3 2 3/0.5 2/0.25"),
  ...phrase("b8", 26, "1/0.25 2/0.5 3/0.25 0 3/0.5 4/0.25"),
];
const virtuosoClose: BeatEvent[] = [
  ...phrase("c1", 28, "3/0.5 2/0.25 1 0/0.5 2"),
  ...phrase("c2", 30, "3/0.5 2/0.25 1 2/0.5 1/0.25 0"),
  ...phrase("c3", 32, "1/0.5 0/0.25 1 2/0.5 2"),
];
const virtuosoEpisode: BeatEvent[] = [
  ...phrase("d1", 34, "0/1.5 4/0.25 3 | 4/0.5 3/0.25 2 3/1"),
  ...phrase("d2", 38, "1/1.5 0/0.25 1/0.75 | 2/0.5 3 4/0.25 3"),
  ...phrase("d3", 42, "2/0.5 1/0.25 2 1/0.5 3/0.25 2"),
  ...phrase("d4", 44, "1/0.5 4/1 3/0.5 4 2 1 2"),
  ...phrase("d5", 48, "3/0.75 1/0.25 2/0.5 1/0.25 2"),
  ...phrase("d6", 50, "3/0.5 2/0.25 1 0/0.5 0/0.25 4"),
  ...phrase("d7", 52, "2/0.5 1/0.25 2 1/0.5 1/0.25 4"),
  ...phrase("d8", 54, "2/0.5 1/0.25 0 1/0.5 2/0.25 4"),
  ...phrase("d9", 56, "1/0.5 2/0.25 3 2 3/0.5 2/0.25"),
  ...phrase("d10", 58, "1/0.25 2/0.5 3/0.25 0 3/0.5 4/0.25"),
  ...phrase("d11", 60, "3/0.5 2/0.25 1 0/0.5 2"),
  ...phrase("d12", 62, "3/0.5 0/0.25 1 2/0.5 4/0.25 3"),
  ...phrase("d13", 64, "4/0.5 3/0.25 2 3/1 0/2"),
];
const virtuosoArpeggios: BeatEvent[] = [
  ...phrase("e1", 68, "0/0.5 1/0.25 2 3/0.5 4"),
  ...phrase("e2", 70, "1/0.5 4/0.25 3 4/0.5 1"),
  ...phrase("e3", 72, "0/0.75 3/0.25 4/0.5 2 1 4/0.25 3 4/0.5"),
  ...phrase("e4", 75.5, "0/0.5 | 1 2 3 4"),
  ...phrase("e5", 78, "3/0.5 2 3 4"),
  ...phrase("e6", 80, "3/1 2/0.5 3/0.25 2 1/0.5 0/0.25 1 2/0.5"),
  ...phrase("e7", 83.5, "2/0.5 | 1/1.5 3/0.5 2 0/0.25 1 2/0.5 3/0.25 4"),
];
const virtuosoReturn: BeatEvent[] = [
  ...phrase("f1", 88, "3/0.5 3 3 2/0.25 1"),
  ...phrase("f2", 90, "3/0.5 3 3 2/0.25 1"),
  ...phrase("f3", 92, "3/0.5 2/0.25 1 0/0.5 1"),
  ...phrase("f4", 94, "2/0.25 1/0.5 2/0.25 1 3/0.5 4/0.25"),
  ...phrase("f5", 96, "1/0.25 0/0.5 1/0.25 0 3/0.5 4/0.25"),
  ...phrase("f6", 98, "2/0.25 1/0.5 3/0.25 2/0.5 3/0.25 0"),
  ...phrase("f7", 100, "3/0.25 2/0.5 4/0.25 3/0.5 4/0.25 2"),
  ...phrase("f8", 102, "1/0.25 0/0.5 2/0.25 1 4/0.5 3/0.25"),
  ...phrase("f9", 104, "4/0.5 1/0.25 2 1/0.5 1/0.25 0"),
  ...phrase("f10", 106, "1/0.5 1/0.25 4 2/0.5"),
];
const virtuosoChart = chart(
  "virtuoso",
  virtuosoHead,
  virtuosoMid,
  virtuosoClose,
  virtuosoEpisode,
  virtuosoArpeggios,
  virtuosoReturn,
  shiftEvents(virtuosoHead, 104, "-coda"),
  shiftEvents(virtuosoClose, 88, "-coda"),
  lanes(122, "2/2"),
);

// Maestro: every sixteenth of the running bars, with the second violin,
// continuo and harpsichord covering the rests in the top line.
const maestroHead: BeatEvent[] = [
  ...phrase("a1", 3.5, "4/0.25 3 | 4/0.5 2/0.25 1 2/0.5 4/0.25 3"),
  ...phrase("a2", 6, "4/0.5 1/0.25 0 1/0.5 4/0.25 3"),
  ...phrase("a3", 8, "4/0.75 0/0.25 1/0.5 2 0/0.25 3 0 3"),
  ...phrase("a4", 11, "0/0.25 3 0 3"),
];
const maestroMid: BeatEvent[] = [
  ...phrase("b1", 12, "0/0.25 3 0 3 0 4 0 4"),
  ...phrase("b2", 14, "0/0.25 3 0 3 0 4 0 4"),
  ...phrase("b3", 16, "2/0.75 1/0.25 2/0.5 1/0.25 0"),
  ...phrase("b4", 18, "2/0.5 1/0.25 3 0 4 0 4"),
  ...phrase("b5", 20, "1/0.5 2/0.25 3 0 4 0 4"),
  ...phrase("b6", 22, "1/0.5 1/0.25 3 0 3 0 3"),
  ...phrase("b7", 24, "1/0.25 3 1 3 2 3 2 3"),
  ...phrase("b8", 26, "2/0.25 3 2 4 2 4 2 4"),
];
const maestroClose: BeatEvent[] = [
  ...phrase("c1", 28, "2/0.5 1/0.25 2 0/0.5 2"),
  ...phrase("c2", 30, "3/0.5 2/0.25 4 1 3 0 3"),
  ...phrase("c3", 32, "0/0.5 1/0.25 0 2/0.5 2"),
];
const maestroEpisode: BeatEvent[] = [
  ...phrase("d1", 34, "0/1.5 4/0.25 3 | 4/0.5 3/0.25 2 3/1"),
  ...phrase("d2", 38, "1/1.5 0/0.25 1/0.75 | 2/0.5 1/0.25 4 2 3"),
  ...phrase("d3", 42, "1/0.25 4 0 3 1 3 2 3"),
  ...phrase("d4", 44, "1/0.5 4 1/0.25 2 3/0.5"),
  ...phrase("d5", 46, "4/0.5 2 1 2"),
  ...phrase("d6", 48, "3/0.75 1/0.25 2/0.5 1/0.25 2"),
  ...phrase("d7", 50, "3/0.5 2/0.25 3 0 4 0 4"),
  ...phrase("d8", 52, "1/0.5 2/0.25 3 0 4 0 4"),
  ...phrase("d9", 54, "1/0.5 1/0.25 3 0 3 0 3"),
  ...phrase("d10", 56, "1/0.25 3 1 3 2 3 2 3"),
  ...phrase("d11", 58, "2/0.25 3 2 4 2 4 2 4"),
  ...phrase("d12", 60, "2/0.5 1/0.25 2 1/0.5 2"),
  ...phrase("d13", 62, "3/0.5 0/0.25 3 1 3 2 4"),
  ...phrase("d14", 64, "2/0.5 3/0.25 2 3/1 0/2"),
];
const maestroArpeggios: BeatEvent[] = [
  ...phrase("e1", 68, "0/0.5 1/0.25 2 3/0.5 4"),
  ...phrase("e2", 70, "1/0.5 4/0.25 3 4/0.5 1"),
  ...phrase("e3", 72, "0/0.75 3/0.25 4/0.5 2 1 4/0.25 3 4/0.5"),
  ...phrase("e4", 75.5, "0/0.5 | 1 2 3 4"),
  ...phrase("e5", 78, "2/0.5 1 3 4"),
  ...phrase("e6", 80, "3/1 2/0.25 3 2 1"),
  ...phrase("e7", 82, "0/0.5 1/0.25 2 3 2 1/0.5"),
  ...phrase("e8", 84, "0/1.5 3/0.5 1/0.25 4 0 3 1 3"),
  ...phrase("e9", 87.5, "1/0.25 4"),
];
const maestroReturn: BeatEvent[] = [
  ...phrase("f1", 88, "2/0.5 2 2 3/0.25 1"),
  ...phrase("f2", 90, "3/0.5 3 3 2/0.25 1"),
  ...phrase("f3", 92, "3/0.5 2/0.25 1 0/0.5 1"),
  ...phrase("f4", 94, "2/0.25 3 1 4 1 4 1 4"),
  ...phrase("f5", 96, "1/0.25 3 1 4 1 4 1 4"),
  ...phrase("f6", 98, "1/0.25 4 1 4 1 3 2 3"),
  ...phrase("f7", 100, "1/0.25 4 1 4 1 3 2 3"),
  ...phrase("f8", 102, "0/0.25 3 0 3 0 4 0 4"),
  ...phrase("f9", 104, "2/0.5 1/0.25 3 1 4 1 3"),
  ...phrase("f10", 106, "1/0.5 1/0.25 2 1 4"),
];
const maestroChart = chart(
  "maestro",
  maestroHead,
  maestroMid,
  maestroClose,
  maestroEpisode,
  maestroArpeggios,
  maestroReturn,
  shiftEvents(maestroHead, 104, "-coda"),
  shiftEvents(maestroClose, 88, "-coda"),
  lanes(122, "2/2"),
);

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

const def: TrackDefinition = {
  metadata: {
    id: "bach-brandenburg-3",
    order: 10,
    title: "Brandenburg Concerto No. 3 in G major",
    composer: "Johann Sebastian Bach",
    composerShort: "J. S. Bach",
    catalogNumber: "BWV 1048",
    movementOrExcerpt: "I. Allegro, opening ritornello",
    bpm: 92,
    timeSignature: [4, 4],
    difficulty: "maestro",
    arrangementStyle: "Fast ensemble strings over harpsichord and bass continuo",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Bars 1 to 26 of the first movement, condensed and re-scored for four synth parts. " +
      "The two violin lines and the continuo bass follow the public-domain score; they were " +
      "transcribed with the help of a public-domain MIDI rendering of that score, then quantised, " +
      "thinned and cut down here. No commercial edition, engraving file or recording was used.",
    licenseNotes:
      "Bach died in 1750 and the composition is in the public domain. The note data in this file " +
      "is an original arrangement written for this game and carries no third-party rights.",
    unlockAfter: "beethoven-symphony-5",
  },
  tempoMap: [{ beat: 0, bpm: 92 }],
  sections: [
    { name: "Opening ritornello", startBeat: 0, endBeat: 36 },
    { name: "Echo dialogue", startBeat: 36, endBeat: 68 },
    { name: "Arpeggio episode", startBeat: 68, endBeat: 88 },
    { name: "Return", startBeat: 88, endBeat: 108 },
    { name: "Coda", startBeat: 108, endBeat: 124 },
  ],
  arrangement: {
    parts: [
      part("violin-1", "strings", violin1, { gain: 0.95, pan: -0.22 }),
      part("violin-2", "strings", violin2, { gain: 0.62, pan: 0.22 }),
      part("continuo", "bass", continuo, { gain: 0.7, pan: -0.05 }),
      part("harpsichord", "harpsichord", harpsichord, { gain: 0.45, pan: 0.15 }),
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
