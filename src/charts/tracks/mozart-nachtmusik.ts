// Mozart, Eine kleine Nachtmusik, K. 525, first movement (Allegro), opening.
//
// The two fanfare bars are quoted: the quarter rest, the rising G major
// arpeggio in eighths (G D G D G B) landing on D5, and the D7 answer that
// falls back through C A C A F# A to D4. Everything after those two bars,
// the cadential answer with its dotted figure, the eight-bar continuation,
// the transition and the closing cadence, is written for this arrangement
// in the character of the movement rather than quoted from the score.
//
// 4/4 at 120 bpm, 40 bars, about 80 seconds. Form: opening fanfare (twice
// with its answer), continuation, transition on the dominant, the fanfare
// again, closing cadence. The tremolo accompaniment of the score is
// simplified to repeated eighth chords in the inner strings.

import { join, melody, part, transposeNotes } from "../Authoring";
import type { ArrangementNote, TrackDefinition } from "../ChartTypes";

const BPM = 120;
const BAR = 4;

// Section starts, in beats.
const OPENING = 0;
const CONTINUATION = 32;
const TRANSITION = 64;
const RETURN = 96;
const CODA = 128;
const END = 160;

// Where each statement of the two fanfare bars begins.
const FANFARES = [OPENING, OPENING + 2 * BAR, RETURN, RETURN + 2 * BAR, CODA] as const;

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

const def: TrackDefinition = {
  metadata: {
    id: "mozart-nachtmusik",
    order: 5,
    title: "Eine kleine Nachtmusik",
    composer: "Wolfgang Amadeus Mozart",
    composerShort: "W. A. Mozart",
    catalogNumber: "K. 525",
    movementOrExcerpt: "I. Allegro, opening theme",
    bpm: BPM,
    timeSignature: [4, 4],
    difficulty: "apprentice",
    arrangementStyle: "String ensemble with a walking bass and light percussion on the strong beats",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Written out from knowledge of the public-domain score. The first two bars are the movement's opening as it stands: the quarter rest, the rising arpeggio in eighths and the answering fall to D. The cadential answer, the eight-bar continuation, the transition and the closing bars are written for this arrangement in the character of those pages rather than quoted from them. No external MIDI, edition or recording was used.",
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
  charts: {},
};

export default def;
