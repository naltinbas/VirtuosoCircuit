// Mozart, Piano Sonata No. 16 in C major, K. 545, first movement (Allegro).
//
// The opening period is stated once in full. Bars 1 and 2 are the theme as the
// arranger knows the published score; bars 3 and 4 are a reconstruction of the
// answering half, which climbs to A5 and falls back through F5 to E5. The
// sixteenth note transition in bars 5 to 12 is this arrangement's own
// figuration, an octave arch a step lower each bar, not the score's. From bar
// 13 the track condenses the material for the game: the theme in the dominant,
// a strain in G, the opening group again in C with the theme echoed an octave
// up, closing scales with neighbour note trills, and a coda that quotes the
// theme once more and cadences on a trill over the dominant.
//
// The left hand is this arrangement's own Alberti realization of the harmony,
// with a soft pad and a bass note per half bar, so a chart event always has a
// note onset under it.
//
// Form: theme, running scales, dominant strain, return, closing scales, coda.
// 44 bars of 4/4 at 120 bpm, about 88 seconds.

import {
  chart,
  join,
  lanes,
  melody,
  part,
  phrase,
  shiftEvents,
  shiftNotes,
  trill,
} from "../Authoring";
import type { ArrangementNote, BeatEvent, TrackDefinition } from "../ChartTypes";

const BAR = 4;

// One bar of harmony per entry, bars 1 to 44. A hyphen splits the bar into two
// half bars, which is how the opening period (and every later quotation of it)
// and the closing bar 41 change chord halfway through.
const HARMONY: readonly string[] = [
  "c", "g7-c", "f-c", "g-c",
  "f", "c", "dm", "c",
  "dm", "dm", "g", "g",
  "g", "d7", "g", "d7",
  "g", "d7", "g", "g",
  "d7", "g",
  "c", "g7-c", "c", "g7-c",
  "f", "c", "dm", "c",
  "c", "c", "g7", "c",
  "c", "g7", "c", "g7",
  "c", "g7-c", "f-c", "g7",
  "g", "c",
];

// Alberti figure for each chord, half a bar of eighths: low, high, middle, high.
const ALBERTI_HALF: Record<string, string> = {
  c: "C3/0.5 G3 E3 G3",
  g7: "B2/0.5 G3 D3 G3",
  g: "G2/0.5 D3 B2 D3",
  d7: "F#2/0.5 C3 A2 C3",
  dm: "D3/0.5 A3 F3 A3",
  f: "A2/0.5 F3 C3 F3",
};

// Soft string pad: the same chords held, and a bass note per half bar.
const PAD_CHORD: Record<string, string> = {
  c: "G3+C4+E4",
  g7: "G3+B3+D4",
  g: "G3+B3+D4",
  d7: "F#3+A3+D4",
  dm: "F3+A3+D4",
  f: "F3+A3+C4",
};

const BASS_ROOT: Record<string, string> = {
  c: "C2",
  g7: "G2",
  g: "G2",
  d7: "D2",
  dm: "D2",
  f: "F2",
};

function halvesOf(bar: string): [string, string] {
  const parts = bar.split("-");
  return parts.length === 2 ? [parts[0], parts[1]] : [parts[0], parts[0]];
}

/** Alberti eighths for the given bars (1-based, inclusive). */
function albertiBars(fromBar: number, toBar: number): ArrangementNote[] {
  const out: ArrangementNote[] = [];
  for (let b = fromBar; b <= toBar; b++) {
    const [first, second] = halvesOf(HARMONY[b - 1]);
    const start = (b - 1) * BAR;
    out.push(...melody(start, ALBERTI_HALF[first], 0.55).notes);
    out.push(...melody(start + 2, ALBERTI_HALF[second], 0.55).notes);
  }
  return out;
}

/** Held pad chords: one per bar, or two when the bar changes chord halfway. */
function padBars(fromBar: number, toBar: number): ArrangementNote[] {
  const out: ArrangementNote[] = [];
  for (let b = fromBar; b <= toBar; b++) {
    const [first, second] = halvesOf(HARMONY[b - 1]);
    const start = (b - 1) * BAR;
    if (first === second) {
      out.push(...melody(start, `${PAD_CHORD[first]}/4`, 0.45).notes);
    } else {
      out.push(...melody(start, `${PAD_CHORD[first]}/2`, 0.45).notes);
      out.push(...melody(start + 2, `${PAD_CHORD[second]}/2`, 0.45).notes);
    }
  }
  return out;
}

/** One soft bass note per half bar. */
function bassBars(fromBar: number, toBar: number): ArrangementNote[] {
  const out: ArrangementNote[] = [];
  for (let b = fromBar; b <= toBar; b++) {
    const [first, second] = halvesOf(HARMONY[b - 1]);
    const start = (b - 1) * BAR;
    out.push(...melody(start, `${BASS_ROOT[first]}/2`, 0.5).notes);
    out.push(...melody(start + 2, `${BASS_ROOT[second]}/2`, 0.5).notes);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Melody
// ---------------------------------------------------------------------------

// Bars 1 and 2: the half note C5 into the rising third and fifth, then the
// dotted quarter B4, its eighth note C5 and the turn through D5 back to C5.
const themeC = melody(0, "C5/2 E5/1 G5 | B4/1.5 C5/0.5 D5/1 C5");

// Bars 3 and 4: the answering half of the period, reconstructed from memory,
// up to the half note A5 and back down through F5 with a turn to E5.
const themeAnswer = melody(8, "A5/2 G5/1 C6 | G5/1 F5/0.5 E5/0.25 F5 E5/1 r");

// Bars 5 to 8: the transition, invented for this arrangement rather than taken
// from the score. Each bar is an eighth, a rising scale to the octave above
// and a falling one back, the whole arch a degree lower each time.
const scalesC = join(
  melody(16, "A4/0.5 B4/0.25 C5 D5 E5 F5 G5 A5 G5 F5 E5 D5 C5 B4 A4"),
  melody(20, "G4/0.5 A4/0.25 B4 C5 D5 E5 F5 G5 F5 E5 D5 C5 B4 A4 G4"),
  melody(24, "F4/0.5 G4/0.25 A4 B4 C5 D5 E5 F5 E5 D5 C5 B4 A4 G4 F4"),
  melody(28, "E4/0.5 F4/0.25 G4 A4 B4 C5 D5 E5 D5 C5 B4 A4 G4 F4 E4"),
);

// Bars 9 to 12: the D minor scale with its raised leading note, a wave of
// sixteenths over it, then broken chords into the cadence in G.
const scalesToG = join(
  melody(32, "D4/0.5 E4/0.25 F4 G4 A4 B4 C#5 D5 A4 B4 C#5 D5 E5 F5 G5"),
  melody(36, "A5/0.25 B5 C6 B5 A5 G5 F5 E5 F5 G5 A5 G5 F5 E5 D5 C5"),
  melody(40, "B4/0.5 G5 E5 C5 D5 G5 E5 C5"),
  melody(44, "D5/1 B4+D5+G5 G4 r"),
);

// Bars 13 to 16: the theme in the dominant, stated then answered an octave
// lower.
const themeG = join(
  melody(48, "G5/2 B5/1 D6 | F#5/1.5 G5/0.5 A5/1 G5"),
  melody(56, "G4/2 B4/1 D5 | F#4/1.5 G4/0.5 A4/1 G4", 0.6),
);

// Bars 17 to 22: scales in G, a neighbour note trill on the dominant and the
// arrival on a whole note G.
const strainG = join(
  melody(64, "D5/0.25 E5 F#5 G5 A5 B5 C6 D6 E6 D6 C6 B5 A5 G5 F#5 E5"),
  melody(68, "G5/0.25 F#5 E5 D5 C5 B4 A4 G4 A4 B4 C5 D5 E5 F#5 G5 A5"),
  melody(72, "B5/0.25 A5 G5 F#5 E5 F#5 G5 A5 B5 C6 D6 C6 B5 A5 G5 F#5"),
  melody(76, "G5/0.5 A5 B5 C6 D6 C6 B5 A5"),
  melody(80, "G5/0.25 F#5 G5 F#5 G5 F#5 G5 F#5 B5/0.5 A5 G5 F#5"),
  melody(84, "G5/4"),
);

// Bars 25 and 26: bars 1 and 2 an octave up and softer, answering the return
// of the theme the way bars 3 and 4 answer it at the start.
const themeEcho = melody(96, "C6/2 E6/1 G6 | B5/1.5 C6/0.5 D6/1 C6", 0.6);

// Bars 23 to 30: the theme returns, the echo answers it, and the transition
// scales run again.
const returnGroup = join(shiftNotes(themeC.notes, 88), themeEcho, shiftNotes(scalesC, 88));

// Bars 31 to 38: closing scales, a broken chord wave and a second trill.
const closing = join(
  melody(120, "C6/0.25 B5 A5 G5 F5 E5 D5 C5 B4 A4 G4 F4 E4 F4 G4 A4"),
  melody(124, "B4/0.25 C5 D5 E5 F5 G5 A5 B5 C6 B5 A5 G5 A5 B5 C6 D6"),
  melody(128, "C6/0.5 B5 A5 G5 F5 E5 D5 C5"),
  melody(132, "C5/2 E5/1 G5"),
  melody(136, "C6/0.25 B5 C6 B5 C6 B5 C6 B5 A5/0.5 G5 F5 E5"),
  melody(140, "D6/0.5 C6 B5 A5 G5 F5 E5 D5"),
  melody(144, "G4/0.25 C5 E5 G5 C6 E6 C6 G5 E5 C5 G4 E4 G4 C5 E5 G5"),
  melody(148, "D6/0.25 B5 G5 F5 D5 B4 G4 B4 D5 F5 G5 B5 D6 B5 G5 F5"),
);

// Bars 39 to 44: the theme once more, a cadential trill on the supertonic
// with its upper auxiliary, and the final chord.
const coda = join(
  melody(152, "C5/2 E5/1 G5 | B4/1.5 C5/0.5 D5/1 C5"),
  melody(160, "A5/1 G5 F5 E5"),
  melody(164, "D6/0.25 E6 D6 E6 D6 E6 D6 C6 B5/0.5 A5 G5 F5"),
  melody(168, "F5/2 D5/1 B4"),
  melody(172, "C5+E5+G5+C6/4"),
);

const melodyNotes = join(
  themeC,
  themeAnswer,
  scalesC,
  scalesToG,
  themeG,
  strainG,
  returnGroup,
  closing,
  coda,
);

const albertiNotes = albertiBars(1, 43);
const padNotes = padBars(1, 44);
const bassNotes = bassBars(1, 43).concat(melody(172, "C2/4", 0.5).notes);

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

// Rhythm templates. Each L is replaced by the next lane spec, so a passage is
// written once as a rhythm and once as a contour.
const QUARTERS = "L/1 L L L";
const QUARTERS8 = "L/1 L L L L L L L";
const EIGHTHS = "L/0.5 L L L L L L L";
// Virtuoso readings of a half bar of sixteenths, six notes each, which is as
// much of a run as the density limit allows. RUN_HEAD opens on the eighth that
// starts bars 5 to 12, RUN_BEAT opens on the beat and holds back its last note
// for the eighth that ends the half bar, and RUN_TAIL is the unbroken half bar
// that answers either of them. A six note run cannot climb five lanes without
// turning, so its last note steps back one lane instead of jumping the hand.
const RUN_HEAD = "L/0.5 L/0.25 L L L L";
const RUN_BEAT = "L/0.25 L L L L r/0.25 L/0.5";
const RUN_TAIL = "L/0.25 L L L L L";
const BURST_TAIL = "L/0.5 L L L";

function fill(template: string, spec: string): string {
  const specs = spec.split(/\s+/).filter((s) => s.length > 0);
  let i = 0;
  const out = template.replace(/L/g, () => {
    if (i >= specs.length) throw new Error(`fill: not enough lanes for "${template}"`);
    return specs[i++];
  });
  if (i !== specs.length) throw new Error(`fill: ${specs.length - i} lanes left over`);
  return out;
}

/** One bar of sixteenths as two phrases, the second starting two beats in. */
function twoPhrases(
  start: number,
  head: string,
  idA: string,
  headLanes: string,
  idB: string,
  tailLanes: string,
): BeatEvent[] {
  return [
    ...phrase(idA, start, fill(head, headLanes)),
    ...phrase(idB, start + 2, fill(RUN_TAIL, tailLanes)),
  ];
}

/** A bar of bars 5 to 12: the opening eighth, five sixteenths, then six more. */
function runBar(start: number, idA: string, headLanes: string, idB: string, tailLanes: string): BeatEvent[] {
  return twoPhrases(start, RUN_HEAD, idA, headLanes, idB, tailLanes);
}

/** A bar that starts on the beat: five sixteenths and an eighth, then six more. */
function burstBar(start: number, idA: string, headLanes: string, idB: string, tailLanes: string): BeatEvent[] {
  return twoPhrases(start, RUN_BEAT, idA, headLanes, idB, tailLanes);
}

// Left hand answers taken from the Alberti bass. They fill bars where the
// melody sits on a long note, so they belong to no melodic phrase.
function backing(start: number, text: string): BeatEvent[] {
  return lanes(start, text);
}

// The theme keeps one lane shape everywhere it appears: the half note is held,
// the rising third and fifth climb a lane each, and the answering bar dips to
// the lane below before turning back.
const THEME = "1h/1.5 r/0.5 2/1 3 | 0h/1.5 r/0.5 2/1 1";
// The same shape with the eighth note of bar 2 played as well.
const THEME_V = "1h/1.5 r/0.5 2/1 3 | 0h/1.5 1/0.5 2/1 1";
// The answer of bars 3 and 4, which sits a hand higher and comes back down.
const ANSWER = "4h/1.5 r/0.5 3/1 4 | 3/1 2 1";
const ANSWER_A = "4h/1.5 r/0.5 3/1 4 | 3/1 2/0.5 1/0.25 r/0.25 1/1";
const ANSWER_V = "4h/1.5 r/0.5 3/1 4 | 3/1 2/0.5 1/0.25 2 1/1";
// The octave up echo of bars 25 and 26.
const THEME_ECHO = "2h/1.5 r/0.5 3/1 4 | 1h/1.5 r/0.5 3/1 2";
const THEME_ECHO_V = "2h/1.5 r/0.5 3/1 4 | 1h/1.5 2/0.5 3/1 2";
// The theme restated in the dominant, and the same shape an octave down.
const THEME_G = "2h/1.5 r/0.5 3/1 4 | 1h/1 r/0.5 2/0.5 3/1 2";
const THEME_LOW = "0h/1.5 r/0.5 1/1 2 | 0h/1 r/0.5 1/0.5 2/1 1";

// --- novice: the melody alone, long notes held, scales thinned to the beat ---

const nOpening = [...phrase("a1", 0, THEME), ...phrase("a2", 8, ANSWER)];

// Bars 5 to 8 on the quarter, resting on the last beat of each pair of bars.
const nScales = [
  ...phrase("b1", 16, "1/1 2 4 2 0 1 3"),
  ...phrase("b2", 24, "0/1 1 3 1 0 1 2"),
];

const noviceChart = chart(
  "novice",
  nOpening,
  nScales,
  phrase("b3", 32, "0/1 1 2 r 4 4 3"),
  phrase("b4", 40, "0/1 3 2 3 2 [2,4]!/1 0h/1"),
  phrase("c1", 48, THEME_G),
  phrase("c2", 56, THEME_LOW),
  phrase("d1", 64, `${fill(QUARTERS, "1 3 4 3")} 3/1 r/1 0/1 2`),
  phrase("d2", 72, fill(QUARTERS8, "3 2 3 3 2 3 4 3")),
  phrase("d3", 80, "2/2 3/1 2 2h/3"),
  phrase("a3", 88, THEME),
  phrase("a4", 96, THEME_ECHO),
  shiftEvents(nScales, 88, "-r"),
  phrase("e1", 120, `${fill(QUARTERS, "3 2 1 0")} 1/1 r/1 3/1 2`),
  phrase("e2", 128, `${fill(QUARTERS, "4 3 2 1")} 1h/1.5 r/0.5 2/1 3`),
  phrase("e3", 136, "4/2 3/1 2 4/1 3 2 1"),
  phrase("e4", 144, fill(QUARTERS8, "0 4 2 0 4 1 1 4")),
  shiftEvents(phrase("a1", 0, THEME), 152, "-c"),
  phrase("f1", 160, `${fill(QUARTERS, "4 3 2 1")} 4/2 3/1 2`),
  phrase("f2", 168, "2h/1.5 r/0.5 1/1 0 [1,3]!/4"),
);

// --- apprentice: the melody rhythm in full, with left hand answers ---

const aOpening = [
  ...phrase("a1", 0, THEME),
  ...backing(1, "0/1"),
  ...phrase("a2", 8, ANSWER_A),
  ...backing(9, "0/1"),
];

// Bars 5 to 8 as eighths: the arch each bar draws, an octave up and back.
const aScales = [
  ...phrase("b1", 16, fill(EIGHTHS, "0 1 2 3 4 3 2 1")),
  ...phrase("b2", 20, fill(EIGHTHS, "0 1 2 3 4 3 2 1")),
  ...phrase("b3", 24, fill(EIGHTHS, "0 1 2 3 4 3 2 1")),
  ...phrase("b4", 28, fill(EIGHTHS, "0 1 2 3 4 3 2 1")),
];

const apprenticeChart = chart(
  "apprentice",
  aOpening,
  aScales,
  phrase("b5", 32, "0/0.5 1 2 3 4 3 4"),
  phrase("b6", 36, fill(EIGHTHS, "3 4 3 2 2 3 2 1")),
  phrase("b7", 40, fill(EIGHTHS, "0 4 3 1 2 4 3 1")),
  phrase("b8", 44, "2/1 [2,4]!/1 0h/1"),
  phrase("c1", 48, THEME_G),
  backing(49, "0/1"),
  phrase("c2", 56, THEME_LOW),
  backing(57, "4/1"),
  phrase("d1", 64, fill(EIGHTHS, "1 2 3 3 4 3 3 2")),
  phrase("d2", 68, fill(EIGHTHS, "3 2 1 0 0 1 2 3")),
  phrase("d3", 72, fill(EIGHTHS, "3 2 1 2 3 4 3 2")),
  phrase("d4", 76, fill(EIGHTHS, "0 1 2 3 4 3 2 1")),
  phrase("d5", 80, fill(EIGHTHS, "2 3 2 3 4 3 2 1")),
  phrase("d6", 84, "2h/2 0/1 1"),
  phrase("a3", 88, THEME),
  backing(89, "0/1"),
  phrase("a4", 96, THEME_ECHO),
  backing(97, "0/1"),
  shiftEvents(aScales, 88, "-r"),
  phrase("e1", 120, fill(EIGHTHS, "4 3 3 2 1 1 0 1")),
  phrase("e2", 124, fill(EIGHTHS, "0 1 2 3 4 3 3 4")),
  phrase("e3", 128, fill(EIGHTHS, "4 4 3 3 2 2 1 1")),
  phrase("e4", 132, "1h/1.5 r/0.5 2/1 3"),
  backing(133, "0/1"),
  phrase("e5", 136, fill(EIGHTHS, "3 4 3 4 3 2 1 0")),
  phrase("e6", 140, fill(EIGHTHS, "4 4 3 3 2 2 1 1")),
  phrase("e7", 144, fill(EIGHTHS, "0 2 4 4 2 0 0 2")),
  phrase("e8", 148, fill(EIGHTHS, "4 2 1 0 1 2 4 2")),
  shiftEvents(phrase("a1", 0, THEME), 152, "-c"),
  backing(153, "0/1"),
  phrase("f1", 160, fill(QUARTERS, "4 3 2 1")),
  backing(160.5, "0/0.5 r/1.5 0/0.5"),
  phrase("f2", 164, fill(EIGHTHS, "3 4 3 4 3 2 2 1")),
  phrase("f3", 168, "2h/1.5 r/0.5 [0,1]/1 0 [1,3]!/4"),
);

// --- virtuoso: the sixteenth runs charted, fuller backing, chords, trills ---

const vThemeBacking = "0/1 r/1.5 0/0.5 r/0.5 3/0.5 r/1.5 0/0.5";
const vEchoBacking = "0/1 r/1.5 0/0.5 r/0.5 0/0.5 r/1.5 0/0.5";
const vLowBacking = "4/1 r/1.5 4/0.5 r/0.5 4/0.5 r/1.5 4/0.5";

const vTheme = [...phrase("a1", 0, THEME_V), ...backing(1, vThemeBacking)];
const vAnswer = [...phrase("a2", 8, ANSWER_V), ...backing(9, vEchoBacking)];

// Bars 5 to 8: the rise charted from the opening eighth, the fall from its peak.
const vScales = [
  ...runBar(16, "b1", "0 1 2 3 4 3", "b2", "4 3 2 1 0 1"),
  ...runBar(20, "b3", "0 1 2 3 4 3", "b4", "4 3 2 1 0 1"),
  ...runBar(24, "b5", "0 1 2 3 4 3", "b6", "4 3 2 1 0 1"),
  ...runBar(28, "b7", "0 1 2 3 4 3", "b8", "4 3 2 1 0 1"),
];

const virtuosoChart = chart(
  "virtuoso",
  vTheme,
  vAnswer,
  vScales,
  phrase("c1", 32, fill(RUN_HEAD, "0 1 2 3 4 3")),
  phrase("c2", 34, fill(RUN_BEAT, "3 0 1 2 3 4")),
  phrase("c3", 36, fill(RUN_BEAT, "1 2 3 2 1 0")),
  phrase("c4", 38, fill(RUN_BEAT, "1 2 3 2 1 0")),
  phrase("c5", 40, fill(EIGHTHS, "0 4 3 1 2 4 3 1")),
  phrase("c6", 44, "2/1 [0,2,4]!/1 0h/1"),
  phrase("c7", 48, THEME_G),
  backing(49, vEchoBacking),
  phrase("c8", 56, THEME_LOW),
  backing(57, vLowBacking),
  burstBar(64, "d1", "0 1 2 3 4 3", "d2", "4 3 2 1 0 1"),
  burstBar(68, "d3", "4 3 2 1 0 1", "d4", "0 1 2 3 4 3"),
  burstBar(72, "d5", "4 3 2 1 0 2", "d6", "1 2 3 2 1 0"),
  phrase("d7", 76, fill(EIGHTHS, "0 1 2 3 4 3 2 1")),
  trill("t1", 80, "3/0.25 2 3 2 3 2 3"),
  phrase("d8", 82, fill(BURST_TAIL, "4 3 2 1")),
  phrase("d9", 84, "2h!/2 0/1 1"),
  phrase("a3", 88, THEME_V),
  backing(89, vThemeBacking),
  phrase("a4", 96, THEME_ECHO_V),
  backing(97, vEchoBacking),
  shiftEvents(vScales, 88, "-r"),
  burstBar(120, "e1", "4 3 2 1 0 1", "e2", "4 3 2 1 0 1"),
  burstBar(124, "e3", "0 1 2 3 4 3", "e4", "4 3 2 1 2 3"),
  phrase("e5", 128, fill(EIGHTHS, "[3,4]! 4 3 3 2 2 1 1")),
  phrase("e6", 132, "1h/1.5 r/0.5 2/1 3"),
  backing(133, "0/1 r/1.5 0/0.5"),
  trill("t2", 136, "4/0.25 3 4 3 4 3 4"),
  phrase("e7", 138, fill(BURST_TAIL, "3 2 1 0")),
  phrase("e8", 140, fill(EIGHTHS, "[3,4]! 4 3 3 2 2 1 1")),
  burstBar(144, "e9", "0 1 2 3 4 3", "f1", "3 2 1 0 1 2"),
  burstBar(148, "f2", "4 3 2 1 0 1", "f3", "0 1 2 3 4 3"),
  shiftEvents(vTheme, 152, "-c"),
  phrase("f4", 160, fill(QUARTERS, "[3,4]! 3 2 1")),
  backing(160.5, "0/0.5 r/1.5 0/0.5"),
  trill("t3", 164, "3/0.25 4 3 4 3 4 3"),
  phrase("f5", 166, fill(BURST_TAIL, "2 1 0 1")),
  phrase("f6", 168, "2h/1.5 r/0.5 [0,1]/1 0 [0,2,4]!/4"),
  backing(169.5, "0/0.5"),
);

const def: TrackDefinition = {
  metadata: {
    id: "mozart-k545",
    order: 2,
    title: "Piano Sonata No. 16 in C major",
    composer: "Wolfgang Amadeus Mozart",
    composerShort: "W. A. Mozart",
    catalogNumber: "K. 545",
    movementOrExcerpt: "I. Allegro, opening (condensed)",
    bpm: 120,
    timeSignature: [4, 4],
    difficulty: "novice",
    arrangementStyle: "Light piano with a soft string pad and bass",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Written from the arranger's own knowledge of the published score. No MIDI file, edition, engraving or recording was consulted. Bars 1 and 2 quote the opening theme; bars 3 and 4 reconstruct the answering half of the period from memory and are not guaranteed note for note. The sixteenth note transition in bars 5 to 12 is this arrangement's own figuration rather than the score's, and everything from bar 13 is a condensation written for the game.",
    licenseNotes:
      "Mozart's composition is in the public domain. This is an original arrangement of it and the note data belongs to this project.",
  },
  tempoMap: [{ beat: 0, bpm: 120 }],
  sections: [
    { name: "Opening theme", startBeat: 0, endBeat: 16 },
    { name: "Running scales", startBeat: 16, endBeat: 48 },
    { name: "Dominant strain", startBeat: 48, endBeat: 88 },
    { name: "Return of the theme", startBeat: 88, endBeat: 120 },
    { name: "Closing scales", startBeat: 120, endBeat: 152 },
    { name: "Coda", startBeat: 152, endBeat: 176 },
  ],
  arrangement: {
    parts: [
      part("melody", "piano", melodyNotes, { gain: 1, pan: 0.08 }),
      part("alberti", "piano", albertiNotes, { gain: 0.5, pan: -0.12 }),
      part("pad", "strings", padNotes, { gain: 0.32, pan: -0.3 }),
      part("bass", "bass", bassNotes, { gain: 0.38, pan: 0.05 }),
    ],
  },
  charts: {
    novice: noviceChart,
    apprentice: apprenticeChart,
    virtuoso: virtuosoChart,
  },
};

export default def;
