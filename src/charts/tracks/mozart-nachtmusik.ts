// Mozart, Eine kleine Nachtmusik, K. 525, first movement (Allegro), opening.
//
// The opening two bars follow the movement's own gesture: the quarter rest,
// the G major arpeggio running up in eighths to D5, and the dominant seventh
// falling back through C A C A F# A to D4. The number of G to D alternations
// inside each half is this arrangement's reading of the bar: six eighths and
// the quarter they land on fill one 4/4 bar exactly.
// Everything after them, the cadential answer with its dotted figure, the
// eight-bar continuation, the transition and the closing cadence, is written
// in the character of those pages and is not the score's material.
//
// 4/4 at 120 bpm, 40 bars, about 80 seconds. Form: opening fanfare (twice
// with its answer), continuation, transition on the dominant, the fanfare
// again, closing cadence. The tremolo accompaniment of the score is
// simplified to repeated eighth chords in the inner strings.

import { chart, join, melody, part, phrase, transposeNotes, trill } from "../Authoring";
import type { ArrangementNote, BeatEvent, TrackDefinition } from "../ChartTypes";

const BPM = 120;
const BAR = 4;

// Section starts, in beats.
const OPENING = 0;
const CONTINUATION = 32;
const TRANSITION = 64;
const RETURN = 96;
const CODA = 128;
const END = 160;

// Where each statement of the two fanfare bars begins. An answered statement
// runs four bars, the two fanfare bars and then the two answer bars, so the
// second statement of a pair starts four bars after the first, not two.
const FANFARES = [OPENING, OPENING + 4 * BAR, RETURN, RETURN + 4 * BAR, CODA] as const;

// ---------------------------------------------------------------------------
// Melody
// ---------------------------------------------------------------------------

// Bars 1 and 2 of the movement. The rest holds beat 1, the arpeggio runs in
// eighths and each half lands on a quarter: D5 on the downbeat of bar 2 and
// D4 on the downbeat of the bar after it (the first note of the answer).
const FANFARE = "r/1 G4/0.5 D4 G4 D4 G4 B4 D5/1 C5/0.5 A4 C5 A4 F#4 A4";

// The answer, two bars, opening on the D4 the fanfare falls to. The dotted
// eighth and sixteenth is the figure the movement leans on. Version A closes
// on the tonic, version B on the dominant.
const ANSWER_HEAD = "D4/1 D5/0.75 C5/0.25 B4/0.5 A4/0.5 G4/0.5 B4/0.5";
const ANSWER_A = `${ANSWER_HEAD} A4/0.75 G4/0.25 F#4/0.5 A4/0.5 G4/2`;
const ANSWER_B = `${ANSWER_HEAD} C5/0.75 B4/0.25 A4/0.5 G4/0.5 F#4/2`;

// Eight bars of continuation: the dotted figure sequenced up a step, a
// scale down to a half cadence, then the same pair of bars closing on G.
const CONTINUATION_TUNE = [
  "B4/0.75 A4/0.25 B4/0.5 C5/0.5 D5/1 D5/1",
  "C5/0.75 B4/0.25 C5/0.5 D5/0.5 E5/1 E5/1",
  "D5/0.75 C5/0.25 B4/0.5 A4/0.5 G4/0.5 B4/0.5 D5/0.5 B4/0.5",
  "A4/1 F#4/1 A4/2",
  "B4/0.75 A4/0.25 B4/0.5 C5/0.5 D5/1 D5/1",
  "C5/0.75 B4/0.25 C5/0.5 D5/0.5 E5/1 E5/1",
  "D5/0.75 C5/0.25 B4/0.5 A4/0.5 G4/0.5 F#4/0.5 E4/0.5 G4/0.5",
  "F#4/0.75 E4/0.25 D4/0.5 F#4/0.5 G4/2",
].join(" ");

// Eight bars of transition: running eighths climbing twice, the arpeggio of
// the fanfare turned into a sequence, then the dominant with a trill on it.
const TRANSITION_TUNE = [
  "D5/0.5 C5 B4 A4 G4 A4 B4 C5",
  "D5/0.5 E5 F#5 G5 F#5/1 D5/1",
  "E5/0.5 D5 C5 B4 A4 B4 C5 D5",
  "E5/0.5 F#5 G5 A5 G5/1 E5/1",
  "D5/0.75 C5/0.25 B4/0.5 A4/0.5 G4/0.5 B4/0.5 D5/0.5 B4/0.5",
  "C5/0.5 A4 C5 A4 F#4 A4 D5/1",
  "D5/0.5 C5 B4 A4 G4 F#4 E4 D4",
  "A4/1 A4/1 A4/0.5 B4 A4 B4",
].join(" ");

// The last six bars: the tonic and dominant outlined in quarters, a scale to
// the top, the fall back through the dominant seventh, a cadential trill on
// A and the closing chord.
const CODA_TUNE = [
  "G4/1 B4/1 D5/1 B4/1",
  "C5/1 A4/1 F#4/1 A4/1",
  "G4/0.5 A4 B4 C5 D5 E5 F#5 G5",
  "F#5/1 D5/1 C5/1 A4/1",
  "B4/1 G4/1 A4/0.5 B4 A4 B4",
  "G4+B4+D5+G5/4",
].join(" ");

const tune: ArrangementNote[] = join(
  ...FANFARES.map((b) => melody(b, FANFARE, 0.9).notes),
  melody(OPENING + 2 * BAR, ANSWER_A, 0.8).notes,
  melody(OPENING + 6 * BAR, ANSWER_B, 0.8).notes,
  melody(CONTINUATION, CONTINUATION_TUNE, 0.8).notes,
  melody(TRANSITION, TRANSITION_TUNE, 0.85).notes,
  melody(RETURN + 2 * BAR, ANSWER_A, 0.85).notes,
  melody(RETURN + 6 * BAR, ANSWER_B, 0.85).notes,
  melody(CODA + 2 * BAR, CODA_TUNE, 0.9).notes,
);

// ---------------------------------------------------------------------------
// Harmony, two chords per bar
// ---------------------------------------------------------------------------

type Chord = "G" | "C" | "D" | "D7" | "Em" | "Am";

const INNER_VOICE: Record<Chord, string> = {
  G: "G3+B3+D4",
  C: "G3+C4+E4",
  D: "F#3+A3+D4",
  D7: "F#3+A3+C4",
  Em: "G3+B3+E4",
  Am: "A3+C4+E4",
};

const BASS_NOTE: Record<Chord, string> = { G: "G2", C: "C3", D: "D3", D7: "D3", Em: "E3", Am: "A2" };

// One entry per half bar, 40 bars.
const HARMONY: readonly Chord[] = [
  "G", "G", "D7", "D7", "G", "G", "D7", "G",
  "G", "G", "D7", "D7", "G", "G", "C", "D",
  "G", "G", "C", "C", "D7", "G", "D", "D",
  "G", "G", "C", "C", "D7", "Em", "D7", "G",
  "G", "G", "G", "D7", "Am", "D7", "G", "C",
  "D7", "G", "D7", "D7", "G", "D7", "D", "D",
  "G", "G", "D7", "D7", "G", "G", "D7", "G",
  "G", "G", "D7", "D7", "G", "G", "C", "D",
  "G", "G", "D7", "D7", "G", "G", "D7", "D7",
  "G", "G", "D7", "D7", "G", "D7", "G", "G",
];

function halfBars(startBar: number, endBar: number, render: (chord: Chord, beat: number) => string) {
  const out: ArrangementNote[] = [];
  for (let bar = startBar; bar < endBar; bar++) {
    for (let half = 0; half < 2; half++) {
      const beat = bar * BAR + half * 2;
      const chord = HARMONY[bar * 2 + half];
      out.push(...melody(beat, render(chord, beat)).notes);
    }
  }
  return out;
}

// The inner strings stand in for the tremolo: four detached eighths per half
// bar, a touch stronger on beats 1 and 3.
const innerNotes = join(
  halfBars(2, 39, (c) => {
    const v = INNER_VOICE[c];
    return `${v}@0.5/0.4 r/0.1 ${v}@0.34/0.4 r/0.1 ${v}@0.44/0.4 r/0.1 ${v}@0.34/0.4 r/0.1`;
  }),
  melody(CODA + 7 * BAR, `${INNER_VOICE.G}@0.55/4`),
);

// Bars 1 and 2 have no accompaniment in the score, so the bass doubles the
// fanfare an octave down. After that it walks: half notes while the tune is
// singing, one note per beat under the transition and the closing bars.
const bassNotes = join(
  transposeNotes(melody(OPENING, FANFARE, 0.75).notes, -12),
  halfBars(2, 16, (c) => `${BASS_NOTE[c]}@0.8/2`),
  halfBars(16, 24, (c) => `${BASS_NOTE[c]}@0.85/1 ${BASS_NOTE[c]}@0.6/1`),
  halfBars(24, 32, (c) => `${BASS_NOTE[c]}@0.8/2`),
  halfBars(32, 39, (c) => `${BASS_NOTE[c]}@0.85/1 ${BASS_NOTE[c]}@0.6/1`),
  melody(CODA + 7 * BAR, `${BASS_NOTE.G}@0.9/4`),
);

// Kick on the strong beats, a quiet click on the weak ones, a cymbal where
// the fanfare comes back and on the last chord.
function drumBars(startBar: number, endBar: number): ArrangementNote[] {
  const out: ArrangementNote[] = [];
  for (let bar = startBar; bar < endBar; bar++) {
    out.push(...melody(bar * BAR, "k@0.5/1 cl@0.2/1 k@0.42/1 cl@0.2/1").notes);
  }
  return out;
}

const drumNotes = join(
  drumBars(2, 39),
  melody(RETURN, "cr@0.4/2"),
  melody(CODA + 7 * BAR, "k@0.6/1"),
  melody(CODA + 7 * BAR, "cr@0.5/4"),
);

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
//
// Lanes follow the contour of each phrase: the lowest note of a phrase sits
// on the lane nearest the left hand and the top note on the right. The
// fanfare climbs 2 0 2 0 2 3 4 to its D (1 3 4 on novice, which takes three
// of those notes), and the answer falls back down the hand. A phrase that
// comes round again gets its own id through the tag passed to place(), so
// the two statements never share a bonus.

interface Spec {
  id: string;
  /** Beats after the start of the passage. */
  at: number;
  text: string;
  /** Ornaments pay the trill bonus and must alternate lanes. */
  trill?: boolean;
}

function place(specs: readonly Spec[], base: number, tag: string): BeatEvent[] {
  return specs.flatMap((s) =>
    s.trill ? trill(`${s.id}${tag}`, base + s.at, s.text) : phrase(`${s.id}${tag}`, base + s.at, s.text),
  );
}

/** The four fanfare statements that carry an answer after them. */
const ANSWERED = [
  { at: OPENING, tag: "1", second: false },
  { at: OPENING + 4 * BAR, tag: "2", second: true },
  { at: RETURN, tag: "3", second: false },
  { at: RETURN + 4 * BAR, tag: "4", second: true },
] as const;

function statements(fanfareSpec: readonly Spec[], answerA: readonly Spec[], answerB: readonly Spec[]) {
  return ANSWERED.flatMap((s) => [
    ...place(fanfareSpec, s.at, s.tag),
    ...place(s.second ? answerB : answerA, s.at + 2 * BAR, s.tag),
  ]);
}

// ---------------------------------------------------------------------------
// Novice: the tune only, on the beat, holding what the melody holds
// ---------------------------------------------------------------------------

const N_FANFARE: Spec[] = [
  { id: "f1", at: 0, text: "r/1 1!/1 r/1.5 3/0.5 4h!/1" },
  { id: "f2", at: 5, text: "3/1 r/0.5 2/0.5 1/0.5" },
];
const N_ANSWER_A: Spec[] = [
  { id: "g1", at: 0, text: "0h/1 4/1 3/0.5 2/0.5 1/1" },
  { id: "g2", at: 4, text: "2/1 0/1 1h!/2" },
];
const N_ANSWER_B: Spec[] = [
  { id: "g1", at: 0, text: "0h/1 4/1 3/0.5 2/0.5 1/1" },
  { id: "g2", at: 4, text: "4/1 2/1 0h!/2" },
];

const N_CONTINUATION: Spec[] = [
  { id: "c1", at: 0, text: "2/1.5 3/0.5 4h/1" },
  { id: "c1", at: 4, text: "2/1.5 3/0.5 4h/1" },
  { id: "c2", at: 8, text: "4/1 2/0.5 1/0.5 0/1 4/1" },
  { id: "c2", at: 12, text: "[1,2]/1 0/1 2h!/1.5" },
  { id: "c3", at: 16, text: "2/1.5 3/0.5 4h/1" },
  { id: "c3", at: 20, text: "2/1.5 3/0.5 4h/1" },
  { id: "c4", at: 24, text: "4/1 3/1 1/1 0/1" },
  { id: "c4", at: 28, text: "1/1 0/1 2h!/2" },
];

const N_TRANSITION: Spec[] = [
  { id: "d1", at: 0, text: "4/1 3/1 1/1 3/1" },
  { id: "d1", at: 4, text: "2/1.5 4/1.5 2/1" },
  { id: "d2", at: 8, text: "4/1 3/1 1/1 3/1" },
  { id: "d2", at: 12, text: "2/1 3/0.5 4/0.5 3/1 2/1" },
  { id: "d3", at: 16, text: "4/1 3/1 1/1 4/1" },
  { id: "d3", at: 20, text: "3/2 1/1 4/1" },
  { id: "d4", at: 24, text: "4/1 3/1 1/1 0/1" },
  { id: "d4", at: 28, text: "1!/1 1/1" },
  { id: "t1", at: 30, text: "1/0.5 2 1", trill: true },
];

const N_CODA: Spec[] = [
  { id: "e1", at: 8, text: "1/1 2/1 3/1 2/1" },
  { id: "e1", at: 12, text: "[1,3]/1 2/1 0/1 2/1" },
  { id: "e2", at: 16, text: "0/1 1/1 3/1 4/1" },
  { id: "e2", at: 20, text: "[2,4]!/1 3/1 2/1 1/1" },
  { id: "e3", at: 24, text: "2/1 0/1" },
  { id: "e4", at: 26, text: "1/0.5 2/0.5" },
  { id: "e5", at: 28, text: "0h!/3 &4!" },
];

const novice = chart(
  "novice",
  statements(N_FANFARE, N_ANSWER_A, N_ANSWER_B),
  place(N_CONTINUATION, CONTINUATION, ""),
  place(N_TRANSITION, TRANSITION, ""),
  place(N_FANFARE, CODA, "5"),
  place(N_CODA, CODA, ""),
);


// ---------------------------------------------------------------------------
// Apprentice: the melody rhythm, minus the sixteenth of each dotted figure,
// with the bass joining the tune as a second lane on strong beats
// ---------------------------------------------------------------------------

const A_FANFARE: Spec[] = [
  { id: "f1", at: 0, text: "r/1 2!/0.5 0 2 0 2 3 4h!/1" },
  { id: "f2", at: 5, text: "3/0.5 2 3 2 1" },
];
const A_ANSWER_HEAD: Spec = { id: "g1", at: 0, text: "0h/1 4/0.75 r/0.25 [1,3]/0.5 2 1" };
const A_ANSWER_A: Spec[] = [A_ANSWER_HEAD, { id: "g2", at: 4, text: "2/0.75 r/0.25 0/0.5 2 1h!/2" }];
const A_ANSWER_B: Spec[] = [A_ANSWER_HEAD, { id: "g2", at: 4, text: "4/0.75 r/0.25 2/0.5 1 0h!/2" }];

const A_RISE = "2/0.75 r/0.25 2/0.5 3/0.5 [1,4]/1 4/1";
const A_TURN = "4/0.75 r/0.25 3/0.5 2 1 3 4";

const A_CONTINUATION: Spec[] = [
  { id: "c1", at: 0, text: A_RISE },
  { id: "c1", at: 4, text: A_RISE },
  { id: "c2", at: 8, text: A_TURN },
  { id: "c2", at: 12, text: "[2,4]!/1 0/1 2h!/1.5" },
  { id: "c3", at: 16, text: A_RISE },
  { id: "c3", at: 20, text: A_RISE },
  { id: "c4", at: 24, text: "4/0.75 r/0.25 3/0.5 2 1 0" },
  { id: "c4", at: 28, text: "1/0.75 r/0.25 0/0.5 1 2h!/2" },
];

const A_RUN_DOWN = "4/0.5 3 2 1 0 1 2 3";
const A_RUN_UP = "1/0.5 2 3 4 3/1 1/1";

const A_TRANSITION: Spec[] = [
  { id: "d1", at: 0, text: A_RUN_DOWN },
  { id: "d2", at: 4, text: A_RUN_UP },
  { id: "d3", at: 8, text: A_RUN_DOWN },
  { id: "d4", at: 12, text: A_RUN_UP },
  { id: "d5", at: 16, text: A_TURN },
  { id: "d6", at: 20, text: "2/0.5 1 2 1 0 1 4!/1" },
  { id: "d7", at: 24, text: "4/0.5 3 2 1" },
  { id: "d8", at: 26, text: "3/0.5 2 1 0" },
  { id: "d9", at: 28, text: "1!/1 1/1" },
  { id: "t1", at: 30, text: "1/0.5 2 1 2", trill: true },
];

const A_CODA: Spec[] = [
  { id: "e1", at: 8, text: "[0,1]!/1 2/1 4/1 2/1" },
  { id: "e1", at: 12, text: "[1,3]/1 2/1 0/1 2/1" },
  { id: "e2", at: 16, text: "0/0.5 1 2 3" },
  { id: "e3", at: 18, text: "1/0.5 2 3 4" },
  { id: "e4", at: 20, text: "3/1 2/1 1/1 0/1" },
  { id: "e5", at: 24, text: "2/1 0/1" },
  { id: "t2", at: 26, text: "1/0.5 2 1", trill: true },
  { id: "e6", at: 28, text: "0h!/3 &4!" },
];

const apprentice = chart(
  "apprentice",
  statements(A_FANFARE, A_ANSWER_A, A_ANSWER_B),
  place(A_CONTINUATION, CONTINUATION, ""),
  place(A_TRANSITION, TRANSITION, ""),
  place(A_FANFARE, CODA, "5"),
  place(A_CODA, CODA, ""),
);

// ---------------------------------------------------------------------------
// Virtuoso: every melody note including the sixteenth of each dotted figure,
// chords on the harmonic accents, and the inner strings picked up as offbeat
// figures wherever the tune is holding or moving in quarters
// ---------------------------------------------------------------------------

const V_FANFARE: Spec[] = [
  { id: "f1", at: 0, text: "r/1 2!/0.5 0 2 0 2 3 [0,1,4]!/1" },
  { id: "f2", at: 5, text: "3/0.5 2 3 2 [0,1]! 2" },
];
const V_ANSWER_HEAD: Spec = { id: "g1", at: 0, text: "0h/1 4/0.75 3/0.25 [2,4]/0.5 1 0 2" };
const V_ANSWER_A: Spec[] = [
  V_ANSWER_HEAD,
  { id: "g2", at: 4, text: "3/0.75 2/0.25 1/0.5 3 2h!/2" },
  { id: "g2", at: 6.5, text: "3/0.5 4 3" },
];
const V_ANSWER_B: Spec[] = [
  V_ANSWER_HEAD,
  { id: "g2", at: 4, text: "4/0.75 3/0.25 2/0.5 1 0h!/2" },
  { id: "g2", at: 6.5, text: "3/0.5 4 3" },
];

const V_RISE = "2/0.75 1/0.25 2/0.5 3/0.5 [1,4]!/1 4/1";
const V_TURN = "4/0.75 3/0.25 2/0.5 1 0 2 4 2";

const V_CONTINUATION: Spec[] = [
  { id: "c1", at: 0, text: V_RISE },
  { id: "c1", at: 4, text: V_RISE },
  { id: "c2", at: 8, text: V_TURN },
  { id: "c2", at: 12, text: "[1,3,4]!/0.5 2 0/0.5 2 1h!/1.5" },
  { id: "c2", at: 14.5, text: "3/0.5 2 3" },
  { id: "c3", at: 16, text: V_RISE },
  { id: "c3", at: 20, text: V_RISE },
  { id: "c4", at: 24, text: "4/0.75 3/0.25 2/0.5 1" },
  { id: "c5", at: 26, text: "3/0.5 2 1 3" },
  { id: "c6", at: 28, text: "2/0.75 1/0.25 0/0.5 2 3h!/2" },
  { id: "c6", at: 30.5, text: "0/0.5 1 0" },
];

const V_RUN_DOWN = "4/0.5 3 2 1 0 1 2 3";
const V_RUN_UP = "1/0.5 2 3 4 [1,3]/1 [0,1]/1";

const V_TRANSITION: Spec[] = [
  { id: "d1", at: 0, text: "[1,4]!/0.5 3 2 1 0 1 2 3" },
  { id: "d2", at: 4, text: V_RUN_UP },
  { id: "d3", at: 8, text: V_RUN_DOWN },
  { id: "d4", at: 12, text: V_RUN_UP },
  { id: "d5", at: 16, text: V_TURN },
  { id: "d6", at: 20, text: "3/0.5 2 3 2 1 2 [1,4]!/1" },
  { id: "d7", at: 24, text: "4/0.5 3 2 1" },
  { id: "d8", at: 26, text: "3/0.5 2 1 0" },
  { id: "d9", at: 28, text: "[1,4]!/0.5 3 1/0.5 3" },
  { id: "t1", at: 30, text: "1/0.5 2 1 2", trill: true },
];

const V_CODA: Spec[] = [
  { id: "e1", at: 8, text: "[0,1]!/0.5 3 2/0.5 3 [1,4]/0.5 3 2/1" },
  { id: "e1", at: 12, text: "[1,3]/0.5 4 2/0.5 4 0/0.5 4 2/0.5 4" },
  { id: "e2", at: 16, text: "0/0.5 1 2 3" },
  { id: "e3", at: 18, text: "1/0.5 2 3 4" },
  { id: "e4", at: 20, text: "[0,3]!/0.5 4 2/0.5 4 1/0.5 4 0/0.5 4" },
  { id: "e5", at: 24, text: "2/1 0/1" },
  { id: "t2", at: 26, text: "1/0.5 2 1 2", trill: true },
  { id: "e6", at: 28, text: "0h!/3 &[3,4]!" },
];

const virtuoso = chart(
  "virtuoso",
  statements(V_FANFARE, V_ANSWER_A, V_ANSWER_B),
  place(V_CONTINUATION, CONTINUATION, ""),
  place(V_TRANSITION, TRANSITION, ""),
  place(V_FANFARE, CODA, "5"),
  place(V_CODA, CODA, ""),
);

const def: TrackDefinition = {
  metadata: {
    id: "mozart-nachtmusik",
    order: 5,
    title: "Eine kleine Nachtmusik",
    composer: "Wolfgang Amadeus Mozart",
    composerShort: "W. A. Mozart",
    catalogNumber: "K. 525",
    movementOrExcerpt: "I. Allegro, on the opening theme",
    bpm: BPM,
    timeSignature: [4, 4],
    difficulty: "apprentice",
    arrangementStyle: "String ensemble with a walking bass and light percussion on the strong beats",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Written out from knowledge of the public-domain score: the opening two bars follow the movement's own gesture, and the answer, the continuation, the transition and the closing bars were written for this arrangement in the character of those pages. No external MIDI, edition or recording was used.",
    licenseNotes:
      "Mozart's Serenade K. 525 (1787) is in the public domain. What the game plays is an original arrangement written for it and synthesized in the browser, with no third-party edition or recording involved.",
    unlockAfter: "bach-cello-prelude",
  },
  tempoMap: [{ beat: 0, bpm: BPM }],
  sections: [
    { name: "Opening fanfare", startBeat: OPENING, endBeat: CONTINUATION },
    { name: "Continuation", startBeat: CONTINUATION, endBeat: TRANSITION },
    { name: "Transition", startBeat: TRANSITION, endBeat: RETURN },
    { name: "Fanfare returns", startBeat: RETURN, endBeat: CODA },
    { name: "Closing cadence", startBeat: CODA, endBeat: END },
  ],
  arrangement: {
    parts: [
      part("melody", "strings", tune, { gain: 1, pan: 0.1 }),
      part("inner", "strings", innerNotes, { gain: 0.34, pan: -0.35 }),
      part("bass", "bass", bassNotes, { gain: 0.7, pan: -0.05 }),
      part("drums", "percussion", drumNotes, { gain: 0.4, pan: 0.2 }),
    ],
  },
  charts: { novice, apprentice, virtuoso },
};

export default def;
