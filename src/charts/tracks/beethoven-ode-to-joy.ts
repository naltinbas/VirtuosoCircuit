// Beethoven, Symphony No. 9 in D minor, Op. 125, fourth movement: the
// "Ode to Joy" theme.
//
// The 16-bar theme in D major is stated three times, following the way the
// finale builds it: first as a bare line in the cello register, then with
// sustained harmony and bass, then as the full anthem with the tune in
// octaves, organ chord pulses and light percussion. A two-bar cadence
// (IV, V7, I) closes it. 4/4 at 118 bpm, 50 bars, about 102 seconds. The
// theme starts on the downbeat, so beat 0 is its first note.

import {
  chart,
  join,
  lanes,
  melody,
  part,
  repeatNotes,
  shiftNotes,
  transposeNotes,
} from "../Authoring";
import type { BeatEvent, TrackDefinition } from "../ChartTypes";

const BPM = 118;
const BAR = 4;
const THEME_BEATS = 16 * BAR;
const STATEMENT = [0, THEME_BEATS, 2 * THEME_BEATS] as const;
const CODA_BEAT = 3 * THEME_BEATS;
const END_BEAT = CODA_BEAT + 2 * BAR;

// ---------------------------------------------------------------------------
// Melody, as in the score (bars 1 to 16 of the theme)
// ---------------------------------------------------------------------------

const A_OPEN = "F#4/1 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | F#4/1.5 E4/0.5 E4/2";
const A_CLOSE = "F#4/1 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | E4/1.5 D4/0.5 D4/2";
const B_MIDDLE =
  "E4/1 E4 F#4 D4 | E4 F#4/0.5 G4/0.5 F#4/1 D4 | E4 F#4/0.5 G4/0.5 F#4/1 E4 | D4 E4 A3/2";
const THEME = `${A_OPEN} ${A_CLOSE} ${B_MIDDLE} ${A_CLOSE}`;

// The closing cadence: the tune rests on D, dips to the leading tone and
// settles on D again over IV, V7, I.
const CODA_TUNE = "D4+D5/2 C#4+C#5/2 | D4+D5/4";

const themeAlone = transposeNotes(melody(STATEMENT[0], THEME, 0.5).notes, -12);
const themeWithHarmony = melody(STATEMENT[1], THEME, 0.7).notes;
const themeTutti = melody(STATEMENT[2], THEME, 0.9).notes;
const melodyNotes = join(
  themeAlone,
  themeWithHarmony,
  themeTutti,
  transposeNotes(themeTutti, 12),
  melody(CODA_BEAT, CODA_TUNE, 0.9),
);

// ---------------------------------------------------------------------------
// Harmony: one chord per beat, then rendered as pads, pulses and bass
// ---------------------------------------------------------------------------

type Chord = "D" | "G" | "A7" | "A";

const BAR_TONIC: Chord[] = ["D", "D", "D", "D"];
const BAR_DOMINANT_TURN: Chord[] = ["A7", "A7", "D", "A7"];
const BAR_TONIC_RISE: Chord[] = ["D", "D", "A7", "D"];
const BAR_HALF_CADENCE: Chord[] = ["D", "D", "A", "A"];
const BAR_FULL_CADENCE: Chord[] = ["A7", "A7", "D", "D"];
const BAR_B1: Chord[] = ["A7", "A7", "D", "D"];
const BAR_B2: Chord[] = ["A7", "D", "D", "D"];
const BAR_B3: Chord[] = ["A7", "D", "D", "A7"];
const BAR_B4: Chord[] = ["D", "A7", "A", "A"];

const A_OPEN_HARMONY = [...BAR_TONIC, ...BAR_DOMINANT_TURN, ...BAR_TONIC_RISE, ...BAR_HALF_CADENCE];
const A_CLOSE_HARMONY = [...BAR_TONIC, ...BAR_DOMINANT_TURN, ...BAR_TONIC_RISE, ...BAR_FULL_CADENCE];
const B_HARMONY = [...BAR_B1, ...BAR_B2, ...BAR_B3, ...BAR_B4];
const THEME_HARMONY: Chord[] = [...A_OPEN_HARMONY, ...A_CLOSE_HARMONY, ...B_HARMONY, ...A_CLOSE_HARMONY];
const CODA_HARMONY: Chord[] = ["G", "G", "A7", "A7", "D", "D", "D", "D"];

// Close voicings under the tune's register.
const PAD_VOICE: Record<Chord, string> = {
  D: "F#3+A3+D4",
  G: "G3+B3+D4",
  A7: "E3+G3+C#4",
  A: "E3+A3+C#4",
};

const BASS_LOW: Record<Chord, string> = { D: "D2", G: "G2", A7: "A2", A: "A2" };
const BASS_HIGH: Record<Chord, string> = { D: "D3", G: "G3", A7: "A3", A: "A3" };

/** One note per run of equal chords, re-struck at every bar line. */
function sustained(startBeat: number, chords: readonly Chord[], voice: Record<Chord, string>, velocity: number) {
  const tokens: string[] = [];
  let i = 0;
  while (i < chords.length) {
    let len = 1;
    while ((i + len) % BAR !== 0 && chords[i + len] === chords[i]) len++;
    tokens.push(`${voice[chords[i]]}/${len}`);
    i += len;
  }
  return melody(startBeat, tokens.join(" "), velocity).notes;
}

/** Detached chord on every beat, a little louder on beats 1 and 3. */
function pulsed(startBeat: number, chords: readonly Chord[], strong: number, weak: number) {
  const tokens = chords.map((c, i) => `${PAD_VOICE[c]}@${i % 2 === 0 ? strong : weak}/0.7 r/0.3`);
  return melody(startBeat, tokens.join(" ")).notes;
}

/** Root on every beat, low on 1 and 3, an octave up on 2 and 4. */
function marching(startBeat: number, chords: readonly Chord[], velocity: number) {
  const tokens = chords.map((c, i) => `${(i % 2 === 0 ? BASS_LOW : BASS_HIGH)[c]}/1`);
  return melody(startBeat, tokens.join(" "), velocity).notes;
}

const padNotes = join(
  sustained(STATEMENT[1], THEME_HARMONY, PAD_VOICE, 0.45),
  sustained(STATEMENT[2], THEME_HARMONY, PAD_VOICE, 0.6),
  sustained(CODA_BEAT, CODA_HARMONY, PAD_VOICE, 0.6),
);

const organNotes = join(
  pulsed(STATEMENT[2], THEME_HARMONY, 0.7, 0.55),
  pulsed(CODA_BEAT, CODA_HARMONY.slice(0, BAR), 0.7, 0.55),
  melody(CODA_BEAT + BAR, "D3+F#3+A3+D4/4", 0.75),
);

const bassNotes = join(
  sustained(STATEMENT[1], THEME_HARMONY, BASS_LOW, 0.6),
  marching(STATEMENT[2], THEME_HARMONY, 0.75),
  marching(CODA_BEAT, CODA_HARMONY.slice(0, BAR), 0.75),
  melody(CODA_BEAT + BAR, "D2/4", 0.8),
);

const drumBar = melody(0, "k@0.5/1 s@0.4 k@0.5 s@0.4");
const drumNotes = join(
  shiftNotes(repeatNotes(drumBar.notes, 17, BAR), STATEMENT[2]),
  melody(CODA_BEAT + BAR, "k+cr@0.55/4"),
);

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
//
// Lanes follow the five scale steps of the tune: D 0, E 1, F# 2, G 3, A 4,
// so rising phrases climb to the right hand and falling ones come home to
// the left. Bass and organ hits join a melody note as a chord two lanes
// away; pulses that fall inside a held note go to a free lane.
//
// Two spots leave that mapping. The low A that closes the middle section is
// the lowest note of the tune, so it takes lane 0 rather than lane 4. The
// coda (D, C#, D, and C# has no lane at all) is charted as a rise to the top
// lane instead, so the piece finishes on a long high hold.

interface PhraseSpec {
  id: string;
  /** Offset in beats from the start of the theme statement. */
  at: number;
  text: string;
}

/** Lay one statement's phrases at `startBeat`, prefixing ids so each statement scores separately. */
function statement(prefix: string, startBeat: number, specs: readonly PhraseSpec[]): BeatEvent[] {
  const out: BeatEvent[] = [];
  for (const s of specs) out.push(...lanes(startBeat + s.at, s.text, `${prefix}-${s.id}`));
  return out;
}

// Novice, first statement: only beats 1 and 3, the pulse of the tune.
const NOVICE_OUTLINE: PhraseSpec[] = [
  { id: "a1", at: 0, text: "2/2 3/2 | 4/2 2/2" },
  { id: "a2", at: 8, text: "0/2 1/2 | 2h/1 r/1 1h/1.5 r/0.5" },
  { id: "a3", at: 16, text: "2/2 3/2 | 4/2 2/2" },
  { id: "a4", at: 24, text: "0/2 1/2 | 1h/1 r/1 0h!/1.5 r/0.5" },
  { id: "b1", at: 32, text: "1/2 2/2 | 1/2 2/2" },
  { id: "b2", at: 40, text: "1/2 2/2 | 0/2 0h!/1.5 r/0.5" },
  { id: "a5", at: 48, text: "2/2 3/2 | 4/2 2/2" },
  { id: "a6", at: 56, text: "0/2 1/2 | 1h/1 r/1 0h!/1.5 r/0.5" },
];

// Novice, later statements: the tune without the passing eighths. Statement 2
// enters on an accent, statement 3 on a chord, so the arrival of the full
// anthem does not read like a repeat.
const RISE_FALL = "2/1 2 3 4 | 4 3 2 1";
const RISE_FALL_ENTRY = "2!/1 2 3 4 | 4 3 2 1";
const RISE_FALL_ARRIVAL = "[0,2]!/1 2 3 4 | 4 3 2 1";
const NOVICE_TUNE: PhraseSpec[] = [
  { id: "a1", at: 0, text: RISE_FALL_ENTRY },
  { id: "a2", at: 8, text: "0/1 0 1 2 | 2h/1 r/1 1h/1.5 r/0.5" },
  { id: "a3", at: 16, text: RISE_FALL },
  { id: "a4", at: 24, text: "0/1 0 1 2 | 1h/1 r/1 0h!/1.5 r/0.5" },
  { id: "b1", at: 32, text: "1/1 1 2 0 | 1 2 2 0" },
  { id: "b2", at: 40, text: "1/1 2 2 1 | 0/1 1 0h!/1.5 r/0.5" },
  { id: "a5", at: 48, text: RISE_FALL },
  { id: "a6", at: 56, text: "0/1 0 1 2 | 1h/1 r/1 [0,2]!/1 r/1" },
];

const NOVICE_TUTTI: PhraseSpec[] = NOVICE_TUNE.map((s) =>
  s.id === "a1" ? { ...s, text: RISE_FALL_ARRIVAL } : s,
);

// The full melody rhythm, used for the bare first statement.
const CLIMB_HALF_CADENCE = "0/1 0 1 2 | 2h/1 r/0.5 1/0.5 1h/1.5 r/0.5";
const CLIMB_FULL_CADENCE = "0/1 0 1 2 | 1h/1 r/0.5 0/0.5 0h!/1.5 r/0.5";
const TUNE: PhraseSpec[] = [
  { id: "a1", at: 0, text: RISE_FALL },
  { id: "a2", at: 8, text: CLIMB_HALF_CADENCE },
  { id: "a3", at: 16, text: RISE_FALL },
  { id: "a4", at: 24, text: CLIMB_FULL_CADENCE },
  { id: "b1", at: 32, text: "1/1 1 2 0 | 1 2/0.5 3/0.5 2/1 0" },
  { id: "b2", at: 40, text: "1/1 2/0.5 3/0.5 2/1 1 | 0/1 1 0h!/1.5 r/0.5" },
  { id: "a5", at: 48, text: RISE_FALL },
  { id: "a6", at: 56, text: CLIMB_FULL_CADENCE },
];

// Apprentice, second statement: bass entries as chords on the downbeats.
const RISE_FALL_DOWNBEATS = "[0,2]/1 2 3 4 | [2,4] 3 2 1";
const APPRENTICE_HARMONY: PhraseSpec[] = [
  { id: "a1", at: 0, text: RISE_FALL_DOWNBEATS },
  { id: "a2", at: 8, text: "[0,2]/1 0 1 2 | 2h/1 r/0.5 1/0.5 1h/1.5 r/0.5" },
  { id: "a3", at: 16, text: RISE_FALL_DOWNBEATS },
  { id: "a4", at: 24, text: "[0,2]/1 0 1 2 | 1h/1 r/0.5 0/0.5 0h!/1.5 r/0.5" },
  { id: "b1", at: 32, text: "[1,3]/1 1 2 0 | [1,3] 2/0.5 3/0.5 2/1 0" },
  { id: "b2", at: 40, text: "[1,3]/1 2/0.5 3/0.5 2/1 1 | [0,2]/1 1 0h!/1.5 r/0.5" },
  { id: "a5", at: 48, text: RISE_FALL_DOWNBEATS },
  { id: "a6", at: 56, text: "[0,2]/1 0 1 2 | 1h/1 r/0.5 0/0.5 [0,2]!/1 r/1" },
];

// Apprentice, third statement: chords on beats 1 and 3, a pulse on beat 4
// under each held cadence note.
const RISE_FALL_HALVES = "[0,2]!/1 2 [1,3] 4 | [2,4] 3 [0,2] 1";
const APPRENTICE_TUTTI: PhraseSpec[] = [
  { id: "a1", at: 0, text: RISE_FALL_HALVES },
  { id: "a2", at: 8, text: "[0,2]/1 0 [1,3] 2 | 2h/1 r/0.5 1/0.5 1h/1.5 r/0.5" },
  { id: "a2", at: 15, text: "3/1" },
  { id: "a3", at: 16, text: RISE_FALL_HALVES },
  { id: "a4", at: 24, text: "[0,2]/1 0 [1,3] 2 | 1h/1 r/0.5 0/0.5 0h!/1.5 r/0.5" },
  { id: "a4", at: 31, text: "2/1" },
  { id: "b1", at: 32, text: "[1,3]!/1 1 [0,2] 0 | [1,3] 2/0.5 3/0.5 [0,2]/1 0" },
  { id: "b2", at: 40, text: "[1,3]/1 2/0.5 3/0.5 [0,2]/1 1 | [0,2]/1 1 0h!/1.5 r/0.5" },
  { id: "b2", at: 47, text: "2/1" },
  { id: "a5", at: 48, text: RISE_FALL_HALVES },
  { id: "a6", at: 56, text: "[0,2]/1 0 [1,3] 2 | 1h/1 r/0.5 0/0.5 [0,2]!/1 r/1" },
];

// Virtuoso, second statement: chords on beats 1 and 3. The turn figures in
// bars 10 and 11 stay inside their phrases; they are turns (F#, G, F#, D),
// not trills, so they do not use the trill notation.
const VIRTUOSO_HARMONY: PhraseSpec[] = [
  { id: "a1", at: 0, text: RISE_FALL_HALVES },
  { id: "a2", at: 8, text: "[0,2]/1 0 [1,3] 2 | 2h/1 r/0.5 1/0.5 1h/1.5 r/0.5" },
  { id: "a3", at: 16, text: RISE_FALL_HALVES },
  { id: "a4", at: 24, text: "[0,2]/1 0 [1,3] 2 | 1h/1 r/0.5 0/0.5 0h!/1.5 r/0.5" },
  { id: "b1", at: 32, text: "[1,3]!/1 1 [0,2] 0 | [1,3] 2/0.5 3/0.5 [0,2]/1 0" },
  { id: "b2", at: 40, text: "[1,3]/1 2/0.5 3/0.5 [0,2]/1 1 | [0,2]/1 1 0h!/1.5 r/0.5" },
  { id: "a5", at: 48, text: RISE_FALL_HALVES },
  { id: "a6", at: 56, text: "[0,2]/1 0 [1,3] 2 | 1h/1 r/0.5 0/0.5 [0,2]!/1 r/1" },
];

// Virtuoso, third statement: three-note chords on the phrase downbeats and
// the final cadence, pulses on beats 2 and 4 inside the held notes, and a
// chord on every plain quarter of bars 9 to 16. Held notes, the pulses
// inside them and the eighths of the turn figures stay on one lane.
const RISE_FALL_TUTTI = "[0,2,4]!/1 2 [1,3] 4 | [2,4] 3 [0,2] 1";
const VIRTUOSO_TUTTI: PhraseSpec[] = [
  { id: "a1", at: 0, text: RISE_FALL_TUTTI },
  { id: "a2", at: 8, text: "[0,2]/1 0 [1,3] 2 | 2h/1 0/0.5 1/0.5 1h/1.5 r/0.5" },
  { id: "a2", at: 15, text: "3/1" },
  { id: "a3", at: 16, text: RISE_FALL_TUTTI },
  { id: "a4", at: 24, text: "[0,2]/1 0 [1,3] 2 | 1h/1 3/0.5 0/0.5 0h!/1.5 r/0.5" },
  { id: "a4", at: 31, text: "2/1" },
  { id: "b1", at: 32, text: "[1,3,4]!/1 [1,3] [0,2] [0,2] | [1,3] 2/0.5 3/0.5 [0,2]/1 [0,2]" },
  { id: "b2", at: 40, text: "[1,3]/1 2/0.5 3/0.5 [0,2]/1 [1,3] | [0,2]/1 [1,3] 0h!/1.5 r/0.5" },
  { id: "b2", at: 47, text: "2/1" },
  { id: "a5", at: 48, text: "[0,2,4]!/1 [0,2] [1,3] [2,4] | [2,4] [1,3] [0,2] [1,3]" },
  { id: "a6", at: 56, text: "[0,2]/1 [0,2] [1,3] [0,2] | 1h/1 3/0.5 0/0.5 [0,2,4]!/1 r/1" },
];

const noviceChart = chart(
  "novice",
  statement("s1", STATEMENT[0], NOVICE_OUTLINE),
  statement("s2", STATEMENT[1], NOVICE_TUNE),
  statement("s3", STATEMENT[2], NOVICE_TUTTI),
  lanes(CODA_BEAT, "[2,4]!/2 3h/1.5 r/0.5 | 4h!/3.5", "coda"),
);

const apprenticeChart = chart(
  "apprentice",
  statement("s1", STATEMENT[0], TUNE),
  statement("s2", STATEMENT[1], APPRENTICE_HARMONY),
  statement("s3", STATEMENT[2], APPRENTICE_TUTTI),
  lanes(CODA_BEAT, "[2,4]!/2 [1,3]/2 | [0,2]!/1 &4h/3.5", "coda"),
);

const virtuosoChart = chart(
  "virtuoso",
  statement("s1", STATEMENT[0], TUNE),
  statement("s2", STATEMENT[1], VIRTUOSO_HARMONY),
  statement("s3", STATEMENT[2], VIRTUOSO_TUTTI),
  lanes(CODA_BEAT, "[2,4]!/1 0/1 [1,3]/1 0/1 | [0,2]!/1 &4h/3.5", "coda"),
);

const def: TrackDefinition = {
  metadata: {
    id: "beethoven-ode-to-joy",
    order: 3,
    title: "Symphony No. 9 in D minor",
    composer: "Ludwig van Beethoven",
    composerShort: "L. van Beethoven",
    catalogNumber: "Op. 125",
    movementOrExcerpt: 'IV. Finale, "Ode to Joy" theme',
    bpm: BPM,
    timeSignature: [4, 4],
    difficulty: "novice",
    arrangementStyle: "Orchestra-synth anthem: strings and organ over bass, light kick and snare on the last statement",
    arrangementCredit: "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Condensed from the public-domain score of the finale: the 16-bar theme in D major transcribed for this project and stated three times with a short closing cadence, no external MIDI or recording used",
    licenseNotes:
      "Beethoven's Symphony No. 9 (1824) is in the public domain. This is an original arrangement written for the game and rendered by its own synthesizer; no recording or third-party edition is used.",
  },
  tempoMap: [{ beat: 0, bpm: BPM }],
  sections: [
    { name: "Theme alone", startBeat: STATEMENT[0], endBeat: STATEMENT[1] },
    { name: "With harmony", startBeat: STATEMENT[1], endBeat: STATEMENT[2] },
    { name: "Full anthem", startBeat: STATEMENT[2], endBeat: CODA_BEAT },
    { name: "Closing cadence", startBeat: CODA_BEAT, endBeat: END_BEAT },
  ],
  arrangement: {
    parts: [
      part("melody", "strings", melodyNotes, { gain: 1, pan: 0.1 }),
      part("pad", "strings", padNotes, { gain: 0.5, pan: -0.35 }),
      part("organ", "organ", organNotes, { gain: 0.45, pan: 0.3 }),
      part("bass", "bass", bassNotes, { gain: 0.7, pan: 0 }),
      part("drums", "percussion", drumNotes, { gain: 0.5, pan: -0.1 }),
    ],
  },
  charts: {
    novice: noviceChart,
    apprentice: apprenticeChart,
    virtuoso: virtuosoChart,
  },
};

export default def;
