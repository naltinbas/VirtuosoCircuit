// Bach, Cello Suite No. 1 in G major, BWV 1007, Prelude (opening).
//
// The excerpt is the first eight bars of the prelude: the arpeggiated
// sixteenth-note figures over the G pedal and the move through A7 and D to
// E minor. Those eight bars are stated twice, the second time with the bass
// pulsing on every beat instead of every half bar. Each statement is followed
// by a two-bar link (IV then V7) written for this arrangement in the same
// figure shape, and the piece closes with bar 1, bar 3 and a held G chord.
//
// Form, 23 bars of 4/4: A (score bars 1 to 8) | link | A | link | coda.

import { chart, melody, part, phrase } from "../Authoring";
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

// Half-bar figures, eight sixteenths each, as written in the score. Bars 1 to
// 4, 6 and 8 repeat their figure for the second half of the bar; bars 5 and 7
// have two different halves.
const BAR1 = "G2 D3 B3 A3 B3 D3 B3 D3";
const BAR2 = "G2 E3 C4 B3 C4 E3 C4 E3";
const BAR3 = "G2 F#3 C4 B3 C4 F#3 C4 F#3";
const BAR4 = "G2 G3 B3 A3 B3 G3 B3 G3";
const BAR5A = "G2 E3 B3 A3 B3 G3 F#3 G3";
const BAR5B = "E3 G3 F#3 G3 B2 D3 C#3 B2";
const BAR6 = "C#3 G3 A3 G3 A3 G3 A3 G3";
const BAR7A = "F#2 A3 D4 C#4 D4 A3 G3 A3";
const BAR7B = "F#3 A3 G3 A3 D3 F#3 E3 D3";
const BAR8 = "E2 B2 G3 F#3 G3 B2 G3 B2";

// The two link bars, subdominant and dominant seventh in the same figure.
const LINK_IV = "C3 E3 G3 F#3 G3 E3 G3 E3";
const LINK_V7 = "D3 F#3 C4 B3 C4 F#3 C4 F#3";

// Eight sixteenths. The bass note leads, the notes on the eighth-note pulse
// sit a little above the ones in between so the figure has a shape.
function figure(startBeat: number, pitches: string): ArrangementNote[] {
  const text = pitches
    .split(" ")
    .map((p, i) => `${p}@${i === 0 ? 0.9 : i % 2 === 0 ? 0.75 : 0.6}/0.25`)
    .join(" ");
  return melody(startBeat, text).notes;
}

function fullBar(startBeat: number, pitches: string): ArrangementNote[] {
  return [...figure(startBeat, pitches), ...figure(startBeat + 2, pitches)];
}

// Score bars 1 to 8 starting at startBeat.
function statement(startBeat: number): ArrangementNote[] {
  const b = (n: number) => startBeat + n * BAR;
  return [
    ...fullBar(b(0), BAR1),
    ...fullBar(b(1), BAR2),
    ...fullBar(b(2), BAR3),
    ...fullBar(b(3), BAR4),
    ...figure(b(4), BAR5A),
    ...figure(b(4) + 2, BAR5B),
    ...fullBar(b(5), BAR6),
    ...figure(b(6), BAR7A),
    ...figure(b(6) + 2, BAR7B),
    ...fullBar(b(7), BAR8),
  ];
}

function link(startBeat: number): ArrangementNote[] {
  return [...fullBar(startBeat, LINK_IV), ...fullBar(startBeat + BAR, LINK_V7)];
}

const arpeggio = [
  ...statement(STATEMENT_1),
  ...link(LINK_1),
  ...statement(STATEMENT_2),
  ...link(LINK_2),
  ...fullBar(CODA, BAR1),
  ...fullBar(CODA + BAR, BAR3),
  ...melody(FINAL_CHORD, "G2+D3+B3+G4@0.9/4").notes,
];

// Bass fundamentals per bar. A two-note entry changes on the third beat.
const STATEMENT_BASS = ["G2", "G2", "G2", "G2", "G2 E2", "C#2", "F#2", "E2"];
const LINK_BASS = ["C2", "D2"];
const CODA_BASS = ["G2", "G2"];

// The first statement has the bass on the half bars only; from the first link
// on it pulses on every beat, softer on the weak ones.
function bassBars(startBeat: number, bars: string[], everyBeat: boolean): ArrangementNote[] {
  const out: ArrangementNote[] = [];
  bars.forEach((entry, i) => {
    const [first, second = first] = entry.split(" ");
    const text = everyBeat
      ? `${first}@0.8/1 ${first}@0.5 ${second}@0.7 ${second}@0.5`
      : `${first}@0.8/2 ${second}@0.7/2`;
    out.push(...melody(startBeat + i * BAR, text).notes);
  });
  return out;
}

const bassLine = [
  ...bassBars(STATEMENT_1, STATEMENT_BASS, false),
  ...bassBars(LINK_1, LINK_BASS, true),
  ...bassBars(STATEMENT_2, STATEMENT_BASS, true),
  ...bassBars(LINK_2, LINK_BASS, true),
  ...bassBars(CODA, CODA_BASS, true),
  ...melody(FINAL_CHORD, "G2@0.8/4").notes,
];

// One sustained chord per bar on the implied harmony (bar 5 changes halfway).
const STATEMENT_PAD =
  "G3+B3+D4/4 G3+C4+E4 F#3+A3+C4 G3+B3+D4 | G3+B3+D4/2 E3+G3+B3 | E3+G3+C#4/4 F#3+A3+D4 E3+G3+B3";
const LINK_PAD = "E3+G3+C4/4 F#3+A3+C4";

const pad = [
  ...melody(STATEMENT_1, STATEMENT_PAD).notes,
  ...melody(LINK_1, LINK_PAD).notes,
  ...melody(STATEMENT_2, STATEMENT_PAD).notes,
  ...melody(LINK_2, LINK_PAD).notes,
  ...melody(CODA, "G3+B3+D4/4 F#3+A3+C4 G3+B3+D4+G4").notes,
];

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

// Lane strings are written in sixteenths without durations; run() gives the
// first token /0.25 and the rest follow. Lanes track the pitch contour of each
// figure: the bass note low, the top note high, so the hands alternate.

function run(id: string, beat: number, ...halves: string[]): BeatEvent[] {
  return phrase(id, beat, halves.join(" ").replace(/^(\S+)/, "$1/0.25"));
}

// Virtuoso: every sixteenth.
const V = {
  bar1: "0 1 3 2 3 1 3 1",
  bar2: "0 2 4 3 4 2 4 2",
  bar3: "0 2 4 3 4 2 4 2",
  bar4: "0 1 3 2 3 1 3 1",
  bar5a: "0 2 4 3 4 2 1 2",
  bar5b: "1 3 2 3 0 2 1 0",
  bar6: "1 2 3 2 3 2 3 2",
  bar7a: "0 2 4 3 4 2 1 2",
  bar7b: "1 3 2 3 1 3 2 1",
  bar8: "0 1 3 2 3 1 3 1",
  iv: "0 1 3 2 3 1 3 1",
  v7: "0 2 4 3 4 2 4 2",
};

// Apprentice: the bass note, the pickup and the notes on the eighth-note
// pulse, with rests in between so the hands get a breath.
const A = {
  bar1: "0 1 3 r 3 r 3 r",
  bar2: "0 2 4 r 4 r 4 r",
  bar3: "0 2 4 r 4 r 4 r",
  bar4: "0 1 3 r 3 r 3 r",
  bar5a: "0 2 4 r 4 2 1 r",
  bar5b: "1 3 2 r 0 2 1 r",
  bar6: "1 2 3 2 r 2 3 r",
  bar7a: "0 2 4 r 4 2 1 r",
  bar7b: "1 3 2 r 1 3 2 r",
  bar8: "0 1 3 r 3 r 3 r",
  iv: "0 1 3 r 3 r 3 r",
  v7: "0 2 4 r 4 r 4 r",
};

function virtuosoStatement(startBeat: number, suffix: string): BeatEvent[] {
  const b = (n: number) => startBeat + n * BAR;
  const id = (name: string) => `${name}${suffix}`;
  return [
    ...run(id("a1"), b(0), V.bar1, V.bar1),
    ...run(id("a2"), b(1), V.bar2, V.bar2),
    ...run(id("a3"), b(2), V.bar3, V.bar3),
    ...run(id("a4"), b(3), V.bar4, V.bar4),
    ...run(id("b1"), b(4), V.bar5a, V.bar5b),
    ...run(id("trill-b2"), b(5), V.bar6, V.bar6),
    ...run(id("b3"), b(6), V.bar7a, V.bar7b),
    ...run(id("b4"), b(7), V.bar8, V.bar8),
  ];
}

function virtuosoLink(startBeat: number, suffix: string): BeatEvent[] {
  return [
    ...run(`c1${suffix}`, startBeat, V.iv, V.iv),
    ...run(`c2${suffix}`, startBeat + BAR, V.v7, V.v7),
  ];
}

function apprenticeStatement(startBeat: number, suffix: string): BeatEvent[] {
  const b = (n: number) => startBeat + n * BAR;
  const id = (name: string) => `${name}${suffix}`;
  return [
    ...run(id("a1"), b(0), A.bar1, A.bar1),
    ...run(id("a2"), b(1), A.bar2, A.bar2),
    ...run(id("a3"), b(2), A.bar3, A.bar3),
    ...run(id("a4"), b(3), A.bar4, A.bar4),
    ...run(id("b1"), b(4), A.bar5a, A.bar5b),
    ...run(id("trill-b2"), b(5), A.bar6, A.bar6),
    ...run(id("b3"), b(6), A.bar7a, A.bar7b),
    ...run(id("b4"), b(7), A.bar8, A.bar8),
  ];
}

function apprenticeLink(startBeat: number, suffix: string): BeatEvent[] {
  return [
    ...run(`c1${suffix}`, startBeat, A.iv, A.iv),
    ...run(`c2${suffix}`, startBeat + BAR, A.v7, A.v7),
  ];
}

// Novice: the bass note of each half bar and the top note on the beat between,
// with the downbeat held under the chord.
function noviceStatement(startBeat: number, suffix: string): BeatEvent[] {
  const b = (n: number) => startBeat + n * BAR;
  const id = (name: string) => `${name}${suffix}`;
  return [
    ...phrase(id("a1"), b(0), "0h/1 3/1 0 3"),
    ...phrase(id("a2"), b(1), "0h/1 4/1 0 4"),
    ...phrase(id("a3"), b(2), "0h/1 4/1 0 4"),
    ...phrase(id("a4"), b(3), "0h/1 3/1 0 3"),
    ...phrase(id("b1"), b(4), "0h/1 3/1 2 1"),
    ...phrase(id("trill-b2"), b(5), "1h/1 3/1 1 3"),
    ...phrase(id("b3"), b(6), "0h/1 4/1 2 1"),
    ...phrase(id("b4"), b(7), "0h/1 2/1 0 2"),
  ];
}

function noviceLink(startBeat: number, suffix: string): BeatEvent[] {
  return [
    ...phrase(`c1${suffix}`, startBeat, "1h/1 3/1 1 3"),
    ...phrase(`c2${suffix}`, startBeat + BAR, "2h/1 4/1 2 4"),
  ];
}

const novice = chart(
  "novice",
  noviceStatement(STATEMENT_1, ""),
  noviceLink(LINK_1, ""),
  noviceStatement(STATEMENT_2, "r"),
  noviceLink(LINK_2, "r"),
  phrase("d1", CODA, "0h!/1 3/1 0 3"),
  phrase("d2", CODA + BAR, "0h/1 4/1 0 4"),
  phrase("d3", FINAL_CHORD, "0h!/3.5 &3!"),
);

const apprentice = chart(
  "apprentice",
  apprenticeStatement(STATEMENT_1, ""),
  apprenticeLink(LINK_1, ""),
  apprenticeStatement(STATEMENT_2, "r"),
  apprenticeLink(LINK_2, "r"),
  run("d1", CODA, A.bar1, A.bar1),
  run("d2", CODA + BAR, A.bar3, A.bar3),
  phrase("d3", FINAL_CHORD, "0h!/3.5 &4!"),
);

const virtuoso = chart(
  "virtuoso",
  virtuosoStatement(STATEMENT_1, ""),
  virtuosoLink(LINK_1, ""),
  virtuosoStatement(STATEMENT_2, "r"),
  virtuosoLink(LINK_2, "r"),
  run("d1", CODA, V.bar1, V.bar1),
  run("d2", CODA + BAR, V.bar3, V.bar3),
  phrase("d3", FINAL_CHORD, "0h!/3.5 &4!"),
);

const def: TrackDefinition = {
  metadata: {
    id: "bach-cello-prelude",
    order: 4,
    title: "Cello Suite No. 1 in G major",
    composer: "Johann Sebastian Bach",
    composerShort: "J. S. Bach",
    catalogNumber: "BWV 1007",
    movementOrExcerpt: "Prelude, opening",
    bpm: 68,
    timeSignature: [4, 4],
    difficulty: "apprentice",
    arrangementStyle: "Plucked arpeggios over a bass pulse and a soft strings pad",
    arrangementCredit: "Original game arrangement for Virtuoso Circuit (synthesized in the browser)",
    scoreSourceCredit:
      "Bars 1 to 8 of the prelude transcribed from the public-domain score for this project, stated twice; the two-bar links and the closing cadence were written for this arrangement in the same figure. No external MIDI or recording used.",
    licenseNotes:
      "The composition is in the public domain. This is an original arrangement made for the game and synthesized at runtime; no recordings or third-party editions are used.",
    unlockAfter: "beethoven-ode-to-joy",
  },
  tempoMap: [{ beat: 0, bpm: 68 }],
  sections: [
    { name: "Opening theme", startBeat: STATEMENT_1, endBeat: STATEMENT_1 + 4 * BAR },
    { name: "Answer", startBeat: STATEMENT_1 + 4 * BAR, endBeat: STATEMENT_2 },
    { name: "Return", startBeat: STATEMENT_2, endBeat: STATEMENT_2 + 4 * BAR },
    { name: "Answer again", startBeat: STATEMENT_2 + 4 * BAR, endBeat: CODA },
    { name: "Closing cadence", startBeat: CODA, endBeat: END },
  ],
  arrangement: {
    parts: [
      part("arpeggio", "pluck", arpeggio, { gain: 1, pan: 0.15 }),
      part("bass", "bass", bassLine, { gain: 0.7, pan: -0.1 }),
      part("pad", "strings", pad, { gain: 0.3, pan: -0.25 }),
    ],
  },
  charts: { novice, apprentice, virtuoso },
};

export default def;
