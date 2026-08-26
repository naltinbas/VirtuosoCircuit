// Bach, Cello Suite No. 1 in G major, BWV 1007, Prelude (opening).
//
// The prelude is one long sweep of sixteenth-note arpeggios over a slowly
// moving bass. This excerpt keeps the opening figures in their score order
// through the first phrase group and adds two link bars (subdominant, then
// dominant seventh) written in the same figure shape so the group can turn
// back to the top. The group is heard twice, the second time with the bass
// pulsing on every beat instead of every half bar, and the excerpt closes
// with the opening bar, the dominant bar and a held G major chord.
//
// Form, 23 bars of 4/4: A (8 bars), link, A (8 bars), link, coda.

import {
  chart,
  join,
  melody,
  part,
  phrase,
  repeatNotes,
  shiftEvents,
  shiftNotes,
  trill,
} from "../Authoring";
import type { ArrangementNote, BeatEvent, TrackDefinition } from "../ChartTypes";

const BAR = 4;
const STATEMENT_BEATS = 8 * BAR;
const LINK_BEATS = 2 * BAR;
const STATEMENT_1 = 0;
const LINK_1 = STATEMENT_1 + STATEMENT_BEATS;
const STATEMENT_2 = LINK_1 + LINK_BEATS;
const LINK_2 = STATEMENT_2 + STATEMENT_BEATS;
const CODA = LINK_2 + LINK_BEATS;
const FINAL_CHORD = CODA + 2 * BAR;
const END = FINAL_CHORD + BAR;

// ---------------------------------------------------------------------------
// Arrangement
// ---------------------------------------------------------------------------

// Half-bar figures of eight sixteenths. Every bar states its figure twice,
// which is how the prelude is written. The shape is always the same: the
// bass note, then a rise to the top note with a neighbour under it.
const FIGURES = {
  bar1: "G2 D3 B3 A3 B3 D3 B3 D3",
  bar2: "G2 E3 C4 B3 C4 E3 C4 E3",
  bar3: "G2 F#3 C4 B3 C4 F#3 C4 F#3",
  bar4: "G2 G3 B3 A3 B3 G3 B3 G3",
  bar5: "G2 E3 B3 A3 B3 E3 B3 E3",
  bar6: "C#3 G3 A3 G3 A3 G3 A3 G3",
  bar7: "F#2 D3 A3 G3 A3 D3 A3 D3",
  bar8: "E2 B2 G3 F#3 G3 B2 G3 B2",
  linkIv: "C3 E3 G3 F#3 G3 E3 G3 E3",
  linkV7: "D3 F#3 C4 B3 C4 F#3 C4 F#3",
} as const;

const STATEMENT_FIGURES: readonly string[] = [
  FIGURES.bar1,
  FIGURES.bar2,
  FIGURES.bar3,
  FIGURES.bar4,
  FIGURES.bar5,
  FIGURES.bar6,
  FIGURES.bar7,
  FIGURES.bar8,
];

// The bass note leads and the notes on the eighth-note pulse sit above the
// ones in between, so the running figure keeps an audible shape.
function figure(startBeat: number, pitches: string): ArrangementNote[] {
  const text = pitches
    .split(" ")
    .map((p, i) => `${p}@${i === 0 ? 0.9 : i % 2 === 0 ? 0.75 : 0.6}/0.25`)
    .join(" ");
  return melody(startBeat, text).notes;
}

function fullBar(startBeat: number, pitches: string): ArrangementNote[] {
  return repeatNotes(figure(startBeat, pitches), 2, 2);
}

function statementNotes(startBeat: number): ArrangementNote[] {
  return STATEMENT_FIGURES.flatMap((f, i) => fullBar(startBeat + i * BAR, f));
}

function linkNotes(startBeat: number): ArrangementNote[] {
  return [...fullBar(startBeat, FIGURES.linkIv), ...fullBar(startBeat + BAR, FIGURES.linkV7)];
}

const statement = statementNotes(STATEMENT_1);
const link = linkNotes(LINK_1);

const arpeggio = join(
  statement,
  link,
  shiftNotes(statement, STATEMENT_2),
  shiftNotes(link, LINK_2 - LINK_1),
  fullBar(CODA, FIGURES.bar1),
  fullBar(CODA + BAR, FIGURES.bar3),
  melody(FINAL_CHORD, "G2+D3+B3+G4@0.9/4"),
);

// One fundamental per bar under the figure.
const STATEMENT_BASS = ["G2", "G2", "G2", "G2", "G2", "C#2", "F#2", "E2"];
const LINK_BASS = ["C2", "D2"];
const CODA_BASS = ["G2", "G2"];

// The first statement pulses on the half bar; from the first link on the bass
// marks every beat, softer on the weak ones, so the return has more drive.
function bassBars(startBeat: number, roots: readonly string[], everyBeat: boolean): ArrangementNote[] {
  return roots.flatMap((root, i) =>
    melody(
      startBeat + i * BAR,
      everyBeat
        ? `${root}@0.8/1 ${root}@0.5 ${root}@0.7 ${root}@0.5`
        : `${root}@0.8/2 ${root}@0.7/2`,
    ).notes,
  );
}

const bassLine = join(
  bassBars(STATEMENT_1, STATEMENT_BASS, false),
  bassBars(LINK_1, LINK_BASS, true),
  bassBars(STATEMENT_2, STATEMENT_BASS, true),
  bassBars(LINK_2, LINK_BASS, true),
  bassBars(CODA, CODA_BASS, true),
  melody(FINAL_CHORD, "G2@0.8/4"),
);

// One sustained chord per bar on the harmony the figure spells out.
const STATEMENT_PAD =
  "G3+B3+D4/4 G3+C4+E4 F#3+A3+C4 G3+B3+D4 E3+G3+B3 E3+G3+C#4 F#3+A3+D4 E3+G3+B3";
const LINK_PAD = "G3+C4+E4/4 F#3+A3+C4";
const CODA_PAD = "G3+B3+D4/4 F#3+A3+C4 G3+B3+D4+G4";

const pad = join(
  melody(STATEMENT_1, STATEMENT_PAD, 0.5),
  melody(LINK_1, LINK_PAD, 0.5),
  melody(STATEMENT_2, STATEMENT_PAD, 0.5),
  melody(LINK_2, LINK_PAD, 0.5),
  melody(CODA, CODA_PAD, 0.5),
);

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
//
// Lane numbers track the pitch contour of the figure: the bass note lowest,
// the top note highest, the neighbour under it one lane down. Half-bar lane
// strings are written without durations; sixteenths() gives the first token
// its duration and the rest inherit it.

function sixteenths(text: string): string {
  return text.replace(/^(\S+)/, "$1/0.25");
}

function accent(text: string): string {
  return text.replace(/^(\S+)/, "$1!");
}

// The downbeat becomes a two-note chord with the pad entry, marked as an accent.
function withChord(text: string, lane: number): string {
  return text.replace(/^(\S+)/, `[$1,${lane}]!`);
}

interface Half {
  id: string;
  text: string;
  /** Turns the first sixteenth into a hold this many beats long. */
  hold?: number;
  /** Alternation figures pay the trill bonus instead of the phrase bonus. */
  trill?: boolean;
}

// Half bars sit two beats apart from startBeat. A held downbeat keeps its own
// lane down while the rest of the figure runs on from the second sixteenth,
// and ends half a beat before that lane is needed again.
function halves(startBeat: number, list: readonly Half[]): BeatEvent[] {
  return list.flatMap((h, i) => {
    const beat = startBeat + i * 2;
    if (h.trill) return trill(h.id, beat, sixteenths(h.text));
    if (h.hold === undefined) return phrase(h.id, beat, sixteenths(h.text));
    const space = h.text.indexOf(" ");
    return [
      ...phrase(h.id, beat, `${h.text.slice(0, space)}h/${h.hold}`),
      ...phrase(h.id, beat + 0.25, sixteenths(h.text.slice(space + 1))),
    ];
  });
}

// Virtuoso plays every sixteenth, so both hands share each figure.
const V = {
  narrow: "0 1 3 2 3 1 3 1",
  open: "0 2 4 3 4 2 4 2",
  leap: "0 1 4 3 4 1 4 1",
  alternating: "1 2 3 2 3 2 3 2",
} as const;

const V_STATEMENT: readonly Half[] = [
  { id: "a1", text: accent(V.narrow) },
  { id: "a2", text: V.narrow },
  { id: "a3", text: V.open },
  { id: "a4", text: V.open },
  { id: "a5", text: V.open },
  { id: "a6", text: V.open },
  { id: "a7", text: V.narrow },
  { id: "a8", text: V.narrow },
  { id: "b1", text: withChord(V.open, 4) },
  { id: "b2", text: V.open },
  { id: "b3", text: V.alternating, trill: true },
  { id: "b4", text: V.alternating, trill: true },
  { id: "b5", text: withChord(V.leap, 4) },
  { id: "b6", text: V.leap },
  { id: "b7", text: V.narrow },
  { id: "b8", text: V.narrow },
];

// The return adds the opening chord and three held downbeats.
const V_RETURN: readonly Half[] = [
  { id: "a1", text: withChord(V.narrow, 3) },
  { id: "a2", text: V.narrow },
  { id: "a3", text: V.open, hold: 1.5 },
  { id: "a4", text: V.open },
  { id: "a5", text: V.open },
  { id: "a6", text: V.open, hold: 1.5 },
  { id: "a7", text: V.narrow, hold: 1.5 },
  { id: "a8", text: V.narrow },
  { id: "b1", text: withChord(V.open, 4) },
  { id: "b2", text: V.open },
  { id: "b3", text: V.alternating, trill: true },
  { id: "b4", text: V.alternating, trill: true },
  { id: "b5", text: withChord(V.leap, 4) },
  { id: "b6", text: V.leap },
  { id: "b7", text: V.narrow },
  { id: "b8", text: V.narrow },
];

const V_LINK: readonly Half[] = [
  { id: "c1", text: V.narrow },
  { id: "c2", text: V.narrow },
  { id: "c3", text: withChord(V.open, 4) },
  { id: "c4", text: V.open },
];

const V_CODA: readonly Half[] = [
  { id: "d1", text: withChord(V.narrow, 3) },
  { id: "d2", text: V.narrow },
  { id: "d3", text: V.open, hold: 1.5 },
  { id: "d4", text: V.open },
];

// Apprentice keeps the bass note, the pickup after it and the top note on the
// eighth-note pulse. The full shapes add the echo of the pickup.
const A = {
  narrow: "0 1 3 r 3 r 3 r",
  narrowFull: "0 1 3 r 3 1 3 r",
  narrowChord: "[0,3]! r 3 r 3 r 3 r",
  open: "0 2 4 r 4 r 4 r",
  openFull: "0 2 4 r 4 2 4 r",
  openChord: "[0,4]! r 4 r 4 r 4 r",
  leap: "0 1 4 r 4 r 4 r",
  leapFull: "0 1 4 r 4 1 4 r",
  alternating: "1 2 3 2 r r r r",
} as const;

const A_STATEMENT: readonly Half[] = [
  { id: "a1", text: accent(A.narrow) },
  { id: "a2", text: A.narrow },
  { id: "a3", text: A.open },
  { id: "a4", text: A.open },
  { id: "a5", text: A.open },
  { id: "a6", text: A.open },
  { id: "a7", text: A.narrow, hold: 1.5 },
  { id: "a8", text: A.narrow },
  { id: "b1", text: A.openChord },
  { id: "b2", text: A.open },
  { id: "b3", text: A.alternating, trill: true },
  { id: "b4", text: A.alternating, trill: true },
  { id: "b5", text: A.openChord },
  { id: "b6", text: A.leap },
  { id: "b7", text: A.narrow },
  { id: "b8", text: A.narrow },
];

const A_RETURN: readonly Half[] = [
  { id: "a1", text: A.narrowChord },
  { id: "a2", text: A.narrowFull },
  { id: "a3", text: A.openFull, hold: 1.5 },
  { id: "a4", text: A.openFull },
  { id: "a5", text: A.openFull },
  { id: "a6", text: A.openFull, hold: 1.5 },
  { id: "a7", text: A.narrowFull, hold: 1.5 },
  { id: "a8", text: A.narrow },
  { id: "b1", text: A.openChord },
  { id: "b2", text: A.openFull },
  { id: "b3", text: A.alternating, trill: true },
  { id: "b4", text: A.alternating, trill: true },
  { id: "b5", text: A.openChord },
  { id: "b6", text: A.leapFull },
  { id: "b7", text: A.narrowFull },
  { id: "b8", text: A.narrow },
];

const A_LINK: readonly Half[] = [
  { id: "c1", text: A.narrow },
  { id: "c2", text: A.narrow },
  { id: "c3", text: A.openChord },
  { id: "c4", text: A.open },
];

const A_CODA: readonly Half[] = [
  { id: "d1", text: A.narrowChord },
  { id: "d2", text: A.narrowFull },
  { id: "d3", text: A.openFull, hold: 1.5 },
  { id: "d4", text: A.open },
];

// Novice takes one note per beat: the bass note of each half bar and the top
// note between them, with the downbeat held. The "turn" bars add the
// neighbour and the top note as a pair of sixteenths into the last beat.
const N = {
  narrow: "0h/1 3/1 0 3",
  narrowAccent: "0h!/1 3/1 0 3",
  narrowTurn: "0h/1 3/1 0/0.75 2/0.25 3/1",
  narrowChord: "[0,3]!/1 3/1 0 3",
  open: "0h/1 4/1 0 4",
  openAccent: "0h!/1 4/1 0 4",
  openTurn: "0h/1 4/1 0/0.75 3/0.25 4/1",
  openChord: "[0,4]!/1 4/1 0 4",
  alternating: "1/1 3 1 3",
} as const;

interface NoviceBar {
  id: string;
  text: string;
  trill?: boolean;
}

function noviceBars(startBeat: number, list: readonly NoviceBar[]): BeatEvent[] {
  return list.flatMap((b, i) => {
    const beat = startBeat + i * BAR;
    return b.trill ? trill(b.id, beat, b.text) : phrase(b.id, beat, b.text);
  });
}

const N_STATEMENT: readonly NoviceBar[] = [
  { id: "a1", text: N.narrowAccent },
  { id: "a2", text: N.open },
  { id: "a3", text: N.open },
  { id: "a4", text: N.narrowTurn },
  { id: "b1", text: N.openChord },
  { id: "b2", text: N.alternating, trill: true },
  { id: "b3", text: N.openAccent },
  { id: "b4", text: N.narrow },
];

const N_RETURN: readonly NoviceBar[] = [
  { id: "a1", text: N.narrowChord },
  { id: "a2", text: N.openTurn },
  { id: "a3", text: N.open },
  { id: "a4", text: N.narrowTurn },
  { id: "b1", text: N.openChord },
  { id: "b2", text: N.alternating, trill: true },
  { id: "b3", text: N.openChord },
  { id: "b4", text: N.narrow },
];

const N_LINK: readonly NoviceBar[] = [
  { id: "c1", text: N.narrow },
  { id: "c2", text: N.openChord },
];

const N_CODA: readonly NoviceBar[] = [
  { id: "d1", text: N.narrowChord },
  { id: "d2", text: N.openTurn },
];

// The closing bar: the fundamental held under a struck top note.
const CLOSING_CHORD = "0h!/3.5 &4!";

const novice = chart(
  "novice",
  noviceBars(STATEMENT_1, N_STATEMENT),
  noviceBars(LINK_1, N_LINK),
  shiftEvents(noviceBars(0, N_RETURN), STATEMENT_2, "r"),
  shiftEvents(noviceBars(0, N_LINK), LINK_2, "r"),
  noviceBars(CODA, N_CODA),
  phrase("d3", FINAL_CHORD, CLOSING_CHORD),
);

const apprentice = chart(
  "apprentice",
  halves(STATEMENT_1, A_STATEMENT),
  halves(LINK_1, A_LINK),
  shiftEvents(halves(0, A_RETURN), STATEMENT_2, "r"),
  shiftEvents(halves(0, A_LINK), LINK_2, "r"),
  halves(CODA, A_CODA),
  phrase("d5", FINAL_CHORD, CLOSING_CHORD),
);

const virtuoso = chart(
  "virtuoso",
  halves(STATEMENT_1, V_STATEMENT),
  halves(LINK_1, V_LINK),
  shiftEvents(halves(0, V_RETURN), STATEMENT_2, "r"),
  shiftEvents(halves(0, V_LINK), LINK_2, "r"),
  halves(CODA, V_CODA),
  phrase("d5", FINAL_CHORD, CLOSING_CHORD),
);

const def: TrackDefinition = {
  metadata: {
    id: "bach-cello-prelude",
    order: 4,
    title: "Cello Suite No. 1 in G major",
    composer: "Johann Sebastian Bach",
    composerShort: "J. S. Bach",
    catalogNumber: "BWV 1007",
    attributionNote:
      "No autograph of the cello suites survives. The piece is known from early manuscript copies, the best known of them in Anna Magdalena Bach's hand.",
    movementOrExcerpt: "Prelude, opening",
    bpm: 68,
    timeSignature: [4, 4],
    difficulty: "apprentice",
    arrangementStyle: "Plucked arpeggios over a bass pulse with a soft strings pad",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Written out from knowledge of the public-domain score: the opening bars keep the prelude's arpeggio figure and the harmonies it moves through, and the two link bars and the closing cadence were written for this arrangement in the same figure shape. No external MIDI, edition or recording was used.",
    licenseNotes:
      "The composition is in the public domain. What the game plays is an original arrangement written for it and synthesized at runtime, with no third-party editions or recordings involved.",
    unlockAfter: "beethoven-ode-to-joy",
  },
  tempoMap: [{ beat: 0, bpm: 68 }],
  sections: [
    { name: "Opening theme", startBeat: STATEMENT_1, endBeat: STATEMENT_1 + 4 * BAR },
    { name: "Answer", startBeat: STATEMENT_1 + 4 * BAR, endBeat: STATEMENT_2 },
    { name: "Return", startBeat: STATEMENT_2, endBeat: STATEMENT_2 + 4 * BAR },
    { name: "Second answer", startBeat: STATEMENT_2 + 4 * BAR, endBeat: CODA },
    { name: "Closing cadence", startBeat: CODA, endBeat: END },
  ],
  arrangement: {
    parts: [
      part("arpeggio", "pluck", arpeggio, { gain: 1, pan: 0.1 }),
      part("bass", "bass", bassLine, { gain: 0.7, pan: -0.15 }),
      part("pad", "strings", pad, { gain: 0.3, pan: -0.3 }),
    ],
  },
  charts: { novice, apprentice, virtuoso },
};

export default def;
