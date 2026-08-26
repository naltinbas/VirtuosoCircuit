// Mozart, Symphony No. 40 in G minor, K. 550, first movement: the opening
// theme.
//
// Written in 4/4 at 104 bpm rather than the score's alla breve, so one bar
// here is one bar of the movement and the sighing pairs come out as plain
// eighths. The famous opening is quoted: three falling Eb-D sighs over the
// pulsing accompaniment, then the leap up to Bb. Everything after the leap
// is this arrangement's own continuation written in the character of those
// pages, not a quotation, and the closing cadence is written for the game.
//
// Form: theme, answer a step lower, a rising sequence over the dominant,
// the theme once more with the full texture, then a cadence. 36 bars,
// about 83 seconds.

import { chart, join, melody, part, phrase, repeatNotes, shiftNotes, trill } from "../Authoring";
import type { ArrangementNote, BeatEvent, TrackDefinition } from "../ChartTypes";

const BPM = 104;
const BAR = 4;

const THEME = 0;
const ANSWER = 8 * BAR;
const SEQUENCE = 16 * BAR;
const RETURN = 24 * BAR;
const CADENCE = 32 * BAR;
const END = 36 * BAR;

// ---------------------------------------------------------------------------
// Melody
// ---------------------------------------------------------------------------

// The sigh: two eighths falling a step, then the lower note held a beat.
function sighs(pitchHigh: string, pitchLow: string, count: number): string {
  return Array.from({ length: count }, () => `${pitchHigh}/0.5 ${pitchLow}/0.5 ${pitchLow}/1`).join(" ");
}

// Bars 1 to 4: three sighs, the leap to Bb, then the line falls back.
const THEME_A = `${sighs("Eb5", "D5", 3)} Bb5/2 | Bb5/1 A5 G5/2 | F#5/1 G5 A5/2`;
// Bars 5 to 8: the sighs again, the leap higher, and a half cadence on D.
const THEME_B = `${sighs("Eb5", "D5", 3)} Bb5/2 | C6/1 Bb5 A5/2 | G5/1 F#5 D5/2`;

// The answer keeps the shape a third lower and closes on the tonic.
const ANSWER_A = `${sighs("C5", "Bb4", 3)} G5/2 | G5/1 F5 Eb5/2 | D5/1 Eb5 F5/2`;
const ANSWER_B = `${sighs("Eb5", "D5", 3)} Bb5/2 | A5/1 G5 F#5/2 | G5/2 r/2`;

// The sequence lifts the sigh a step at a time over the dominant.
const SEQUENCE_LINE = [
  `${sighs("D5", "C5", 2)} ${sighs("Eb5", "D5", 2)}`,
  `${sighs("F5", "Eb5", 2)} ${sighs("G5", "F5", 2)}`,
  "A5/0.5 Bb5 C6/1 Bb5 | A5/0.5 G5 F#5/1 A5",
  "D6/0.5 C6 Bb5/1 A5 | G5/2 F#5/2",
].join(" | ");

// The cadence: the sigh one last time, a rising scale and a held tonic.
const CADENCE_LINE = "Eb5/0.5 D5/0.5 D5/1 Eb5/0.5 D5/0.5 D5/1 | D5/0.5 Eb5 F5 G5 A5 Bb5 C6 D6 | Eb6/1 D6 C6 Bb5 | G5/4";

const melodyNotes = join(
  melody(THEME, `${THEME_A} | ${THEME_B}`, 0.85),
  melody(ANSWER, `${ANSWER_A} | ${ANSWER_B}`, 0.8),
  melody(SEQUENCE, SEQUENCE_LINE, 0.85),
  melody(RETURN, `${THEME_A} | ${THEME_B}`, 0.95),
  melody(CADENCE, CADENCE_LINE, 0.95),
);

// ---------------------------------------------------------------------------
// Accompaniment
// ---------------------------------------------------------------------------

type Chord = "gm" | "d7" | "cm" | "eb" | "bb" | "f7" | "d";

// One chord per bar for the whole piece, in order.
const HARMONY: Chord[] = [
  // Theme, bars 1 to 8
  "gm", "gm", "cm", "d7", "gm", "gm", "cm", "d7",
  // Answer, bars 9 to 16
  "eb", "eb", "bb", "f7", "gm", "d7", "gm", "gm",
  // Sequence, bars 17 to 24
  "gm", "cm", "d7", "gm", "eb", "cm", "d7", "d7",
  // Return, bars 25 to 32
  "gm", "gm", "cm", "d7", "gm", "gm", "cm", "d7",
  // Cadence, bars 33 to 36
  "gm", "cm", "d7", "gm",
];

// The pulsing inner voices, close together under the tune.
const PULSE_VOICE: Record<Chord, string> = {
  gm: "D4+G4+Bb4",
  d7: "C4+F#4+A4",
  cm: "C4+Eb4+G4",
  eb: "Bb3+Eb4+G4",
  bb: "Bb3+D4+F4",
  f7: "A3+C4+Eb4",
  d: "D4+F#4+A4",
};

const BASS_ROOT: Record<Chord, string> = {
  gm: "G2", d7: "D2", cm: "C3", eb: "Eb2", bb: "Bb2", f7: "F2", d: "D2",
};

/** Repeated eighth chords, the alla breve pulse the violas carry. */
function pulseBar(startBeat: number, chord: Chord, velocity: number): ArrangementNote[] {
  const token = `${PULSE_VOICE[chord]}@${velocity}/0.5`;
  return melody(startBeat, Array.from({ length: 8 }, () => token).join(" ")).notes;
}

const pulseNotes: ArrangementNote[] = [];
const bassNotes: ArrangementNote[] = [];
for (let bar = 0; bar < HARMONY.length; bar++) {
  const at = bar * BAR;
  const chord = HARMONY[bar];
  // The opening bar is the accompaniment alone, as in the score, and the
  // texture thickens again for the return.
  const soft = at < ANSWER || (at >= SEQUENCE && at < RETURN);
  pulseNotes.push(...pulseBar(at, chord, soft ? 0.4 : 0.5));
  const root = BASS_ROOT[chord];
  bassNotes.push(...melody(at, `${root}@0.6/2 ${root}@0.5/2`).notes);
}

// Light percussion, from the answer onward so the opening stays bare.
const drumBar = melody(0, "k@0.45/1 h@0.25 k@0.4 h@0.25").notes;
const drumNotes = join(
  shiftNotes(repeatNotes(drumBar, 8, BAR), ANSWER),
  shiftNotes(repeatNotes(drumBar, 12, BAR), RETURN),
);

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
//
// The theme lives in a narrow band, so lanes follow the shape of the figure
// rather than absolute pitch: the sigh always falls from lane 2 to lane 1,
// the leap to Bb jumps to lane 4, and the falling line after it walks back
// down 4, 3, 2. Rising sequences climb into the right hand.

interface Spec {
  id: string;
  at: number;
  text: string;
}

function block(prefix: string, startBeat: number, specs: readonly Spec[]): BeatEvent[] {
  const out: BeatEvent[] = [];
  for (const s of specs) out.push(...phrase(`${prefix}-${s.id}`, startBeat + s.at, s.text));
  return out;
}

// Novice: the resting note of each sigh, the leap, and the falling line.
const NOVICE_THEME: Spec[] = [
  { id: "a1", at: 1, text: "1/2 1 1" },
  { id: "a2", at: 6, text: "4h/1.5 r/0.5 | 4/1 3 2h/1.5 r/0.5" },
  { id: "a3", at: 12, text: "1/1 2 3h/1.5 r/0.5" },
  { id: "b1", at: 17, text: "1/2 1 1" },
  { id: "b2", at: 22, text: "4h/1.5 r/0.5 | 4/1 4 3h/1.5 r/0.5" },
  { id: "b3", at: 28, text: "2/1 1 0h!/1.5 r/0.5" },
];

const NOVICE_ANSWER: Spec[] = [
  { id: "c1", at: 1, text: "0/2 0 0" },
  { id: "c2", at: 6, text: "3h/1.5 r/0.5 | 3/1 2 1h/1.5 r/0.5" },
  { id: "c3", at: 12, text: "0/1 1 2h/1.5 r/0.5" },
  { id: "d1", at: 17, text: "1/2 1 1" },
  { id: "d2", at: 22, text: "4h/1.5 r/0.5 | 4/1 3 2h/1.5 r/0.5" },
  { id: "d2", at: 28, text: "2h!/2 r/2" },
];

const NOVICE_SEQUENCE: Spec[] = [
  { id: "e1", at: 1, text: "0/2 1 1/1 r | 2/2" },
  { id: "e2", at: 9, text: "2/2 3 | 3/2 3" },
  { id: "e3", at: 16, text: "1/1 2 3h/1.5 r/0.5 | 2/1 1 3h/1.5 r/0.5" },
  { id: "e4", at: 24, text: "4/1 3 2h/1.5 r/0.5 | 1h/2 r/2" },
];

const NOVICE_CADENCE: Spec[] = [
  { id: "f1", at: 1, text: "1/2 1" },
  { id: "f2", at: 4, text: "0/1 2 4 | 4/1 3 2 1" },
  { id: "f2", at: 12, text: "0h!/4" },
];

// Apprentice adds both eighths of every sigh and the bass on the bar lines.
const APPRENTICE_THEME: Spec[] = [
  { id: "a1", at: 0, text: "2/0.5 1/0.5 1/1 2/0.5 1/0.5 1/1" },
  { id: "a2", at: 4, text: "2/0.5 1/0.5 1/1 4h/1.5 r/0.5" },
  { id: "a3", at: 8, text: "4/1 3 2h/1.5 r/0.5" },
  { id: "a4", at: 12, text: "1/1 2 3h/1.5 r/0.5" },
  { id: "b1", at: 16, text: "2/0.5 1/0.5 1/1 2/0.5 1/0.5 1/1" },
  { id: "b2", at: 20, text: "2/0.5 1/0.5 1/1 4h/1.5 r/0.5" },
  { id: "b3", at: 24, text: "4/1 4 3h/1.5 r/0.5" },
  { id: "b4", at: 28, text: "2/1 1 0h!/1.5 r/0.5" },
];

const APPRENTICE_ANSWER: Spec[] = [
  { id: "c1", at: 0, text: "1/0.5 0/0.5 0/1 1/0.5 0/0.5 0/1" },
  { id: "c2", at: 4, text: "1/0.5 0/0.5 0/1 3h/1.5 r/0.5" },
  { id: "c3", at: 8, text: "3/1 2 1h/1.5 r/0.5" },
  { id: "c4", at: 12, text: "0/1 1 2h/1.5 r/0.5" },
  { id: "d1", at: 16, text: "2/0.5 1/0.5 1/1 2/0.5 1/0.5 1/1" },
  { id: "d2", at: 20, text: "2/0.5 1/0.5 1/1 4h/1.5 r/0.5" },
  { id: "d3", at: 24, text: "4/1 3 2h/1.5 r/0.5" },
  { id: "d3", at: 28, text: "[1,3]!/2 r/2" },
];

const APPRENTICE_SEQUENCE: Spec[] = [
  { id: "e1", at: 0, text: "1/0.5 0/0.5 0/1 1/0.5 0/0.5 0/1" },
  { id: "e2", at: 4, text: "2/0.5 1/0.5 1/1 2/0.5 1/0.5 1/1" },
  { id: "e3", at: 8, text: "3/0.5 2/0.5 2/1 3/0.5 2/0.5 2/1" },
  { id: "e4", at: 12, text: "4/0.5 3/0.5 3/1 4/0.5 3/0.5 3/1" },
  { id: "e5", at: 16, text: "1/0.5 2 3/1 2 | 1/0.5 0 4/1 3" },
  { id: "e6", at: 24, text: "4/0.5 3 2/1 1 | 0h/2 r/2" },
];

const APPRENTICE_CADENCE: Spec[] = [
  { id: "f1", at: 0, text: "2/0.5 1/0.5 1/1 2/0.5 1/0.5 1/1" },
  { id: "f2", at: 4, text: "0/0.5 1 2 3 4 4 3 2" },
  { id: "f3", at: 8, text: "4/1 3 2 1" },
  { id: "f4", at: 12, text: "0h!/4 &2h/4" },
];

// Virtuoso keeps the melody and picks up the accompaniment pulse underneath
// each held melody note, so the hand playing the tune stays the busier one.
// A fill runs on the three eighths after the hold begins, and the lane the
// hold occupies is left alone.

/** Where a fill goes and which lane is busy holding there. */
type Fill = readonly [at: number, heldLane: number];

const THEME_FILLS: Fill[] = [[6.5, 4], [10.5, 2], [14.5, 3], [22.5, 4], [26.5, 3]];
const ANSWER_FILLS: Fill[] = [[6.5, 3], [10.5, 1], [14.5, 2], [22.5, 4]];

/** Lanes the free hand can use, lowest first. */
function freeLanes(held: number): number[] {
  return [0, 1, 2, 3, 4].filter((l) => l !== held);
}

function fillText(held: number, wide: boolean): string {
  const free = freeLanes(held);
  const pattern = wide ? [free[0], free[3], free[1]] : [free[0], free[1], free[0]];
  return pattern.map((l) => `${l}/0.5`).join(" ");
}

function withFills(specs: readonly Spec[], fills: readonly Fill[], wide = false): Spec[] {
  return [
    ...specs,
    ...fills.map(([at, held], i) => ({ id: `p${i}`, at, text: fillText(held, wide) })),
  ];
}

// The bars that walk in quarters leave their offbeats free, so the pulse is
// charted there too. Lane 0 is clear in all of them.
const THEME_OFFBEATS: Spec[] = [
  { id: "o0", at: 8.5, text: "0/1 0/1" },
  { id: "o1", at: 12.5, text: "0/1 0/1" },
  { id: "o2", at: 24.5, text: "0/1 0/1" },
  { id: "o3", at: 28.5, text: "1/1 1/1" },
];
const ANSWER_OFFBEATS: Spec[] = [
  { id: "o0", at: 8.5, text: "0/1 0/1" },
  { id: "o1", at: 12.5, text: "0/1 0/1" },
  { id: "o2", at: 24.5, text: "0/1 0/1" },
];

const VIRTUOSO_THEME: Spec[] = [...withFills(APPRENTICE_THEME, THEME_FILLS), ...THEME_OFFBEATS];
const VIRTUOSO_ANSWER: Spec[] = [...withFills(APPRENTICE_ANSWER, ANSWER_FILLS), ...ANSWER_OFFBEATS];
// The sequence already moves in eighths, so it takes the melody alone and
// gains its extra weight from the chords at the top of each step instead.
const VIRTUOSO_SEQUENCE: Spec[] = [
  ...APPRENTICE_SEQUENCE.filter((s) => s.id !== "e5"),
  { id: "e5", at: 16, text: "1/0.5 2 [3,4]!/1 2 | 1/0.5 0 [3,4]!/1 3" },
];
const VIRTUOSO_CADENCE: Spec[] = APPRENTICE_CADENCE;

// Maestro spreads the same fills across both hands and adds the low pulse in
// the second half of the quieter bars.
function toMaestro(base: readonly Spec[], fills: readonly Fill[], offbeats: readonly Spec[]): Spec[] {
  return [...withFills(base, fills, true), ...offbeats];
}

// Maestro fills under the closing holds as well and widens every fill.
const MAESTRO_THEME_FILLS: Fill[] = [...THEME_FILLS, [30.5, 0]];
const MAESTRO_ANSWER_FILLS: Fill[] = [...ANSWER_FILLS, [28.5, 2]];

const MAESTRO_THEME: Spec[] = toMaestro(APPRENTICE_THEME, MAESTRO_THEME_FILLS, THEME_OFFBEATS);
const MAESTRO_ANSWER: Spec[] = toMaestro(APPRENTICE_ANSWER, MAESTRO_ANSWER_FILLS, ANSWER_OFFBEATS);
const MAESTRO_SEQUENCE: Spec[] = [
  ...VIRTUOSO_SEQUENCE.filter((s) => s.id !== "e6"),
  { id: "e6", at: 24, text: "4/0.5 3 2/1 1 | 0h!/2 &2h/2" },
];
const MAESTRO_CADENCE: Spec[] = VIRTUOSO_CADENCE;

function buildChart(
  themeSpecs: readonly Spec[],
  answerSpecs: readonly Spec[],
  sequenceSpecs: readonly Spec[],
  cadenceSpecs: readonly Spec[],
  extra: readonly BeatEvent[] = [],
): BeatEvent[] {
  return [
    ...block("t", THEME, themeSpecs),
    ...block("a", ANSWER, answerSpecs),
    ...block("s", SEQUENCE, sequenceSpecs),
    ...block("r", RETURN, themeSpecs),
    ...block("c", CADENCE, cadenceSpecs),
    ...extra,
  ];
}

const def: TrackDefinition = {
  metadata: {
    id: "mozart-symphony-40",
    order: 8,
    title: "Symphony No. 40 in G minor",
    composer: "Wolfgang Amadeus Mozart",
    composerShort: "W. A. Mozart",
    catalogNumber: "K. 550",
    movementOrExcerpt: "I. Molto allegro, first theme",
    bpm: BPM,
    timeSignature: [4, 4],
    difficulty: "virtuoso",
    arrangementStyle: "Tense strings and pulse percussion",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Written from the arranger's own knowledge of the published score; no MIDI file, edition, engraving or recording was consulted. The three falling Eb-D sighs and the leap to Bb that open the movement are quoted. The continuation, the answering phrase, the rising sequence and the closing cadence are written in the character of those pages rather than quoted, and the accompaniment reduces the viola pulse to repeated eighth chords.",
    licenseNotes:
      "Composition: public domain. This is an original arrangement written for the game and synthesized at runtime; no recording or third-party edition is used.",
    unlockAfter: "bach-toccata-d-minor",
  },
  tempoMap: [{ beat: 0, bpm: BPM }],
  sections: [
    { name: "Theme", startBeat: THEME, endBeat: ANSWER },
    { name: "Answer", startBeat: ANSWER, endBeat: SEQUENCE },
    { name: "Sequence", startBeat: SEQUENCE, endBeat: RETURN },
    { name: "Return", startBeat: RETURN, endBeat: CADENCE },
    { name: "Cadence", startBeat: CADENCE, endBeat: END },
  ],
  arrangement: {
    parts: [
      part("melody", "strings", melodyNotes, { gain: 1, pan: -0.1 }),
      part("pulse", "strings", pulseNotes, { gain: 0.45, pan: 0.25 }),
      part("bass", "bass", bassNotes, { gain: 0.6, pan: 0 }),
      part("drums", "percussion", drumNotes, { gain: 0.35, pan: 0 }),
    ],
  },
  charts: {
    novice: chart("novice", buildChart(NOVICE_THEME, NOVICE_ANSWER, NOVICE_SEQUENCE, NOVICE_CADENCE)),
    apprentice: chart(
      "apprentice",
      buildChart(APPRENTICE_THEME, APPRENTICE_ANSWER, APPRENTICE_SEQUENCE, APPRENTICE_CADENCE),
    ),
    virtuoso: chart(
      "virtuoso",
      buildChart(VIRTUOSO_THEME, VIRTUOSO_ANSWER, VIRTUOSO_SEQUENCE, VIRTUOSO_CADENCE),
    ),
    maestro: chart(
      "maestro",
      buildChart(MAESTRO_THEME, MAESTRO_ANSWER, MAESTRO_SEQUENCE, MAESTRO_CADENCE, [
        ...trill("m1", SEQUENCE + 30, "3/0.5 4 3 4"),
      ]),
    ),
  },
};

export default def;
