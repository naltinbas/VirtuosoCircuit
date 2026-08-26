// Minuet in G major, BWV Anh. 114, from the 1725 Notebook for Anna Magdalena
// Bach. The piece was catalogued under Bach for two centuries and is now
// credited to Christian Petzold.
//
// The A strain is quoted: the eight bars everyone knows, from the D that
// opens it to the half cadence on A, then the same eight bars turned to
// close on G. The B strain here is written in the character of the second
// half rather than quoted, since it is the part of the minuet fewest people
// carry in their head accurately. The credit says which is which.
//
// Form: A, A again with a fuller harpsichord texture, B, B again, then the
// final G cadence. 3/4 at 112 bpm, 68 bars, about 109 seconds.

import { chart, join, melody, part, phrase } from "../Authoring";
import type { ArrangementNote, BeatEvent, TrackDefinition } from "../ChartTypes";

const BPM = 112;
const BAR = 3;
const STRAIN = 16 * BAR;

const A1 = 0;
const A2 = STRAIN;
const B1 = 2 * STRAIN;
const B2 = 3 * STRAIN;
const CODA = 4 * STRAIN;
const END = CODA + 4 * BAR;

// ---------------------------------------------------------------------------
// Melody
// ---------------------------------------------------------------------------

// Bars 1 to 8, ending on the half cadence.
const A_FIRST =
  "D5/1 G4/0.5 A4 B4 C5 | D5/1 G4 G4 | E5/1 C5/0.5 D5 E5 F#5 | G5/1 G4 G4 " +
  "| C5/1 D5/0.5 C5 B4 A4 | B4/1 C5/0.5 B4 A4 G4 | F#4/1 G4/0.5 A4 B4 G4 | A4/3";
// Bars 9 to 16: the same opening, then a descent that lands on G.
const A_SECOND =
  "D5/1 G4/0.5 A4 B4 C5 | D5/1 G4 G4 | E5/1 C5/0.5 D5 E5 F#5 | G5/1 G4 G4 " +
  "| C5/1 D5/0.5 C5 B4 A4 | B4/1 C5/0.5 B4 A4 G4 | A4/1 B4/0.5 A4 G4 F#4 | G4/3";

// The second strain, written in the character of the original: it opens high,
// works down through a sequence and closes with the same cadence shape.
const B_FIRST =
  "B5/1 G5/0.5 A5 B5 G5 | A5/1 D5 D5 | G5/1 E5/0.5 F#5 G5 D5 | E5/1 C5 C5 " +
  "| D5/1 E5/0.5 D5 C5 B4 | C5/1 D5/0.5 C5 B4 A4 | B4/1 C5/0.5 D5 E5 F#5 | G5/3";
const B_SECOND =
  "D5/1 G4/0.5 A4 B4 C5 | D5/1 E5 F#5 | G5/1 F#5/0.5 E5 D5 C5 | B4/1 A4 G4 " +
  "| A4/1 B4/0.5 C5 D5 E5 | F#4/1 G4/0.5 A4 B4 C5 | D5/1 C5/0.5 B4 A4 F#4 | G4/3";

const CODA_TUNE = "D5/1 C5/0.5 B4 A4 G4 | F#4/1 A4 D5 | G4/1 B4 D5 | G5/3";

const melodyNotes = join(
  melody(A1, `${A_FIRST} | ${A_SECOND}`, 0.85),
  melody(A2, `${A_FIRST} | ${A_SECOND}`, 0.9),
  melody(B1, `${B_FIRST} | ${B_SECOND}`, 0.85),
  melody(B2, `${B_FIRST} | ${B_SECOND}`, 0.9),
  melody(CODA, CODA_TUNE, 0.95),
);

// ---------------------------------------------------------------------------
// Left hand and harmony
// ---------------------------------------------------------------------------

type Chord = "G" | "C" | "D" | "D7" | "Em" | "Am" | "Bm";

// One chord per bar, in order, for the two strains and the coda.
const A_HARMONY: Chord[] = [
  "G", "G", "C", "G", "Am", "G", "D7", "D",
  "G", "G", "C", "G", "Am", "G", "D7", "G",
];
const B_HARMONY: Chord[] = [
  "G", "D", "G", "Am", "G", "Am", "D7", "G",
  "G", "Em", "G", "D", "Bm", "D7", "D7", "G",
];
const CODA_HARMONY: Chord[] = ["G", "D7", "G", "G"];

const BASS_LINE: Record<Chord, string> = {
  G: "G2/1 B2 D3",
  C: "C3/1 E3 G3",
  D: "D3/1 F#3 A3",
  D7: "D3/1 A2 C3",
  Em: "E3/1 G3 B3",
  Am: "A2/1 C3 E3",
  Bm: "B2/1 D3 F#3",
};

const PAD_VOICE: Record<Chord, string> = {
  G: "G3+B3+D4",
  C: "C4+E4+G4",
  D: "F#3+A3+D4",
  D7: "F#3+A3+C4",
  Em: "G3+B3+E4",
  Am: "A3+C4+E4",
  Bm: "B3+D4+F#4",
};

/** A walking quarter-note bass, one chord per bar. */
function walkingBass(startBeat: number, chords: readonly Chord[], velocity: number): ArrangementNote[] {
  const out: ArrangementNote[] = [];
  chords.forEach((chord, bar) => {
    out.push(...melody(startBeat + bar * BAR, BASS_LINE[chord], velocity).notes);
  });
  return out;
}

/** One sustained chord per bar under the tune. */
function pad(startBeat: number, chords: readonly Chord[], velocity: number): ArrangementNote[] {
  const out: ArrangementNote[] = [];
  chords.forEach((chord, bar) => {
    out.push(...melody(startBeat + bar * BAR, `${PAD_VOICE[chord]}/3`, velocity).notes);
  });
  return out;
}

const bassNotes = join(
  walkingBass(A1, A_HARMONY, 0.6),
  walkingBass(A2, A_HARMONY, 0.65),
  walkingBass(B1, B_HARMONY, 0.6),
  walkingBass(B2, B_HARMONY, 0.65),
  walkingBass(CODA, CODA_HARMONY, 0.7),
);

// The pad joins on the repeats, so the first time through each strain is bare.
const padNotes = join(
  pad(A2, A_HARMONY, 0.35),
  pad(B2, B_HARMONY, 0.35),
  pad(CODA, CODA_HARMONY, 0.4),
);

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
//
// The tune spans an octave and a half, so lanes follow the local shape: the
// quarter that opens each bar takes a lane in the middle and the eighth-note
// run climbs or falls away from it. Bar lines are the anchor, which is what
// makes the minuet read as a dance rather than a scale.

interface Spec {
  id: string;
  /** Beats from the start of the strain. */
  at: number;
  text: string;
}

function block(prefix: string, startBeat: number, specs: readonly Spec[]): BeatEvent[] {
  const out: BeatEvent[] = [];
  for (const s of specs) out.push(...phrase(`${prefix}-${s.id}`, startBeat + s.at, s.text));
  return out;
}

// Novice: the downbeat of every bar plus the last note of each run, so the
// player hears the shape of the phrase without chasing the eighths.
const NOVICE_A: Spec[] = [
  { id: "a1", at: 0, text: "2/1 r 3/1 | 4/1 r/2" },
  { id: "a2", at: 6, text: "3/1 r 4/1 | 4h/2 r/1" },
  { id: "a3", at: 12, text: "3/1 r 2/1 | 2/1 r 1/1" },
  { id: "a4", at: 18, text: "0/1 r 2/1 | 1h!/2 r/1" },
  { id: "b1", at: 24, text: "2/1 r 3/1 | 4/1 r/2" },
  { id: "b2", at: 30, text: "3/1 r 4/1 | 4h/2 r/1" },
  { id: "b3", at: 36, text: "3/1 r 2/1 | 2/1 r 1/1" },
  { id: "b4", at: 42, text: "1/1 r 0/1 | 0h!/2 r/1" },
];

const NOVICE_B: Spec[] = [
  { id: "c1", at: 0, text: "4/1 r 2/1 | 3/1 r/2" },
  { id: "c2", at: 6, text: "4/1 r 1/1 | 2h/2 r/1" },
  { id: "c3", at: 12, text: "2/1 r 1/1 | 1/1 r 0/1" },
  { id: "c4", at: 18, text: "1/1 r 3/1 | 4h!/2 r/1" },
  { id: "d1", at: 24, text: "2/1 r 3/1 | 4/1 r/2" },
  { id: "d2", at: 30, text: "4/1 r 2/1 | 1/1 r 0/1" },
  { id: "d3", at: 36, text: "1/1 r 2/1 | 0/1 r 3/1" },
  { id: "d4", at: 42, text: "2/1 r 1/1 | 0h!/2 r/1" },
];

const NOVICE_CODA: Spec[] = [
  { id: "e1", at: 0, text: "2/1 r 1/1 | 0/1 2 4" },
  { id: "e2", at: 6, text: "0/1 2 4 | 4h!/3" },
];

// Apprentice: every melody note, with the bass joining on the bar lines of
// the cadence bars.
const APPRENTICE_A: Spec[] = [
  { id: "a1", at: 0, text: "2/1 0/0.5 1 2 3 | 4/1 0 0" },
  { id: "a2", at: 6, text: "3/1 1/0.5 2 3 4 | 4/1 0 0" },
  { id: "a3", at: 12, text: "3/1 4/0.5 3 2 1 | 2/1 3/0.5 2 1 0" },
  { id: "a4", at: 18, text: "0/1 1/0.5 2 3 1 | 1h!/2 &3h/2 r/1" },
  { id: "b1", at: 24, text: "2/1 0/0.5 1 2 3 | 4/1 0 0" },
  { id: "b2", at: 30, text: "3/1 1/0.5 2 3 4 | 4/1 0 0" },
  { id: "b3", at: 36, text: "3/1 4/0.5 3 2 1 | 2/1 3/0.5 2 1 0" },
  { id: "b4", at: 42, text: "1/1 2/0.5 1 0 4 | 0h!/2 &2h/2 r/1" },
];

const APPRENTICE_B: Spec[] = [
  { id: "c1", at: 0, text: "4/1 2/0.5 3 4 2 | 3/1 1 1" },
  { id: "c2", at: 6, text: "4/1 2/0.5 3 4 1 | 2/1 0 0" },
  { id: "c3", at: 12, text: "2/1 3/0.5 2 1 0 | 1/1 2/0.5 1 0 4" },
  { id: "c4", at: 18, text: "1/1 2/0.5 3 4 3 | 2h!/2 &4h/2 r/1" },
  { id: "d1", at: 24, text: "2/1 0/0.5 1 2 3 | 4/1 4 4" },
  { id: "d2", at: 30, text: "4/1 3/0.5 2 1 0 | 1/1 0 4" },
  { id: "d3", at: 36, text: "1/1 2/0.5 3 4 3 | 0/1 1/0.5 2 3 4" },
  { id: "d4", at: 42, text: "2/1 1/0.5 0 4 3 | 0h!/2 &2h/2 r/1" },
];

const APPRENTICE_CODA: Spec[] = [
  { id: "e1", at: 0, text: "2/1 1/0.5 0 4 3 | 2/1 3 4" },
  { id: "e2", at: 6, text: "0/1 2 4 | 0h!/3 &2h/3 &4h/3" },
];

// Virtuoso keeps every melody note and adds the left hand: the bass joins
// the tune as a chord on the downbeats that carry a harmony change, and the
// two long cadence bars, where the tune sits on one note, get the walking
// bass that fills them.

/**
 * Add the bass lane to the note that opens a phrase, so the downbeat lands
 * as a chord. A phrase whose first note is already in that lane is left as
 * it is, since a chord cannot repeat a lane.
 */
function chordDownbeat(spec: Spec, lane: number): Spec {
  const [first, ...rest] = spec.text.split(" ");
  const [body, duration] = first.split("/");
  if (body === String(lane)) return spec;
  return { ...spec, text: [`[${lane},${body}]/${duration ?? "1"}`, ...rest].join(" ") };
}

function withLeftHand(specs: readonly Spec[], fills: readonly Spec[]): Spec[] {
  return [...specs.map((s) => chordDownbeat(s, 0)), ...fills];
}

// Both cadence bars hold one melody note for three beats. The first leaves
// lane 0 free, the second is already holding it, so that one uses lane 4.
const A_FILLS: Spec[] = [
  { id: "p0", at: 22, text: "0/1 0/1" },
  { id: "p1", at: 46, text: "4/1 4/1" },
];

const VIRTUOSO_A: Spec[] = withLeftHand(APPRENTICE_A, A_FILLS);
const VIRTUOSO_B: Spec[] = withLeftHand(APPRENTICE_B, A_FILLS);
const VIRTUOSO_CODA: Spec[] = APPRENTICE_CODA;

function buildChart(
  aSpecs: readonly Spec[],
  bSpecs: readonly Spec[],
  codaSpecs: readonly Spec[],
  extra: readonly BeatEvent[] = [],
): BeatEvent[] {
  return [
    ...block("a1", A1, aSpecs),
    ...block("a2", A2, aSpecs),
    ...block("b1", B1, bSpecs),
    ...block("b2", B2, bSpecs),
    ...block("c", CODA, codaSpecs),
    ...extra,
  ];
}

const def: TrackDefinition = {
  metadata: {
    id: "bach-minuet-g",
    order: 1,
    title: "Minuet in G major",
    composer: "Christian Petzold",
    composerShort: "C. Petzold",
    catalogNumber: "BWV Anh. 114",
    attributionNote:
      "From the 1725 Notebook for Anna Magdalena Bach; long credited to J. S. Bach, now attributed to Christian Petzold.",
    movementOrExcerpt: "Main minuet",
    bpm: BPM,
    timeSignature: [3, 4],
    difficulty: "novice",
    arrangementStyle: "Bright harpsichord and chamber synth",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Written from the arranger's own knowledge of the published score; no MIDI file, edition, engraving or recording was consulted. The sixteen bars of the first strain are quoted. The second strain is written in the character of the original rather than quoted, and the closing cadence was written for this arrangement.",
    licenseNotes:
      "Composition: public domain. This is an original arrangement written for the game and synthesized at runtime; no recording or third-party edition is used.",
  },
  tempoMap: [{ beat: 0, bpm: BPM }],
  sections: [
    { name: "First strain", startBeat: A1, endBeat: A2 },
    { name: "First strain repeated", startBeat: A2, endBeat: B1 },
    { name: "Second strain", startBeat: B1, endBeat: B2 },
    { name: "Second strain repeated", startBeat: B2, endBeat: CODA },
    { name: "Closing cadence", startBeat: CODA, endBeat: END },
  ],
  arrangement: {
    parts: [
      part("melody", "harpsichord", melodyNotes, { gain: 1, pan: -0.05 }),
      part("bass", "pluck", bassNotes, { gain: 0.55, pan: 0.2 }),
      part("pad", "strings", padNotes, { gain: 0.3, pan: 0 }),
    ],
  },
  charts: {
    novice: chart("novice", buildChart(NOVICE_A, NOVICE_B, NOVICE_CODA)),
    apprentice: chart("apprentice", buildChart(APPRENTICE_A, APPRENTICE_B, APPRENTICE_CODA)),
    virtuoso: chart(
      "virtuoso",
      buildChart(VIRTUOSO_A, VIRTUOSO_B, VIRTUOSO_CODA),
    ),
  },
};

export default def;
