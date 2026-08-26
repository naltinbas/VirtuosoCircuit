// Mozart, Piano Sonata No. 16 in C major, K. 545, first movement (Allegro).
//
// Condensed from the exposition. The opening theme is stated as written and
// echoed an octave higher, the sixteenth note transition is reduced to its
// scale shapes, the theme is restated in the dominant, then the whole opening
// group returns in C and the piece closes with cadential scales, three
// neighbour note trills and a plain V7 to I.
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
// half bars, which is how bars 12 and 41 change chord halfway through.
const HARMONY: readonly string[] = [
  "c", "g7", "c", "g7",
  "c", "g7", "c", "g",
  "c", "d7", "g", "d7-g",
  "g", "d7", "g", "d7",
  "g", "d7", "g", "g",
  "d7", "g",
  "c", "g7", "c", "g7",
  "c", "g7", "c", "g",
  "c", "c", "g7", "c",
  "c", "g7", "c", "g7",
  "c", "g7", "f-c", "g7",
  "g", "c",
];

// Alberti figure for each chord, half a bar of eighths: low, high, middle, high.
const ALBERTI_HALF: Record<string, string> = {
  c: "C3/0.5 G3 E3 G3",
  g7: "B2/0.5 G3 D3 G3",
  g: "G2/0.5 D3 B2 D3",
  d7: "F#2/0.5 C3 A2 C3",
  f: "A2/0.5 F3 C3 F3",
};

// Soft string pad: the same chords held, and a bass note per half bar.
const PAD_CHORD: Record<string, string> = {
  c: "G3+C4+E4",
  g7: "G3+B3+D4",
  g: "G3+B3+D4",
  d7: "F#3+A3+D4",
  f: "F3+A3+C4",
};

const BASS_ROOT: Record<string, string> = {
  c: "C2",
  g7: "G2",
  g: "G2",
  d7: "D2",
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

// Bars 1 and 2: the theme as written, half note C5 into the rising third and
// fifth, then the dotted quarter B4 with its turn back to C5.
const themeC = melody(0, "C5/2 E5/1 G5 | B4/1.5 C5/0.5 D5/1 C5");

// Bars 3 and 4: the same two bars an octave up and softer, as an echo.
const themeEcho = melody(8, "C6/2 E6/1 G6 | B5/1.5 C6/0.5 D6/1 C6", 0.6);

// Bars 5 to 8: the transition scales, kept as running sixteenths over the
// Alberti bass and closing on a half cadence.
const scalesC = join(
  melody(16, "G4/0.25 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6 D6 E6 D6 C6 B5"),
  melody(20, "A5/0.25 G5 F5 E5 D5 C5 B4 A4 G4 A4 B4 C5 D5 E5 F5 G5"),
  melody(24, "C5/0.25 D5 E5 F5 G5 F5 E5 D5 E5 F5 G5 A5 B5 C6 D6 E6"),
  melody(28, "D6/1 B5 G5 D5"),
);

// Bars 9 to 12: the second wave, turning to G major and cadencing there.
const scalesToG = join(
  melody(32, "C5/0.25 D5 E5 F5 G5 A5 B5 C6 D6 C6 B5 A5 G5 F5 E5 D5"),
  melody(36, "C5/0.25 B4 A4 G4 F#4 G4 A4 B4 C5 D5 E5 F#5 G5 A5 B5 C6"),
  melody(40, "D6/0.5 C6 B5 A5 G5 F#5 G5 A5"),
  melody(44, "A5/1 F#5 G5/2"),
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

// Bars 23 to 30: the opening group returns unchanged.
const returnGroup = join(
  shiftNotes(themeC.notes, 88),
  shiftNotes(themeEcho.notes, 88),
  shiftNotes(scalesC, 88),
);

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

// Bars 39 to 44: the theme once more, a cadential trill and the final chord.
const coda = join(
  melody(152, "C5/2 E5/1 G5 | B4/1.5 C5/0.5 D5/1 C5"),
  melody(160, "A5/1 G5 F5 E5"),
  melody(164, "D6/0.25 C6 D6 C6 D6 C6 D6 C6 B5/0.5 A5 G5 F5"),
  melody(168, "F5/2 D5/1 B4"),
  melody(172, "C5+E5+G5+C6/4"),
);

const melodyNotes = join(
  themeC,
  themeEcho,
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
// The virtuoso reading of a bar of sixteenths: a four note run off the
// downbeat, then eighths for the rest of the bar.
const BURST_HEAD = "L/0.25 L L L r/0.5 L/0.5";
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

/** One bar of sixteenth run plus eighths, written as two phrases. */
function burstBar(start: number, idA: string, head: string, idB: string, tail: string): BeatEvent[] {
  return [
    ...phrase(idA, start, fill(BURST_HEAD, head)),
    ...phrase(idB, start + 2, fill(BURST_TAIL, tail)),
  ];
}

// Left hand answers taken from the Alberti bass. They fill bars where the
// melody sits on a long note, so they belong to no melodic phrase.
function backing(start: number, text: string): BeatEvent[] {
  return lanes(start, text);
}

// The theme keeps one lane shape everywhere it appears: the half note is held,
// the rising third and fifth climb a lane each, and the answering bar dips to
// the lane below before turning back.
const THEME = "1h/1.5 r/0.5 2/1 3 | 0h/1 r/0.5 1/0.5 2/1 1";
// The octave up echo, and the same shape when the theme is restated in G.
const THEME_HIGH = "2h/1.5 r/0.5 3/1 4 | 1h/1 r/0.5 2/0.5 3/1 2";
// The theme an octave down, at the end of the dominant strain.
const THEME_LOW = "0h/1.5 r/0.5 1/1 2 | 0h/1 r/0.5 1/0.5 2/1 1";

// --- novice: the melody alone, long notes held, scales thinned to the beat ---

const nOpening = [
  ...phrase("a1", 0, THEME),
  ...phrase("a2", 8, THEME_HIGH),
  ...phrase("b1", 16, `${fill(QUARTERS, "0 1 3 4")} 3h/1.5 r/0.5 0/1 1`),
  ...phrase("b2", 24, fill(QUARTERS8, "1 3 2 4 [3,4]! 3 2 1")),
];

const noviceChart = chart(
  "novice",
  nOpening,
  phrase("b3", 32, `${fill(QUARTERS, "1 2 4 2")} 1h/1.5 r/0.5 0/1 2`),
  phrase("b4", 40, `${fill(QUARTERS, "4 3 2 2")} 3/1 2 3h/1.5`),
  phrase("c1", 48, THEME_HIGH),
  phrase("c2", 56, THEME_LOW),
  phrase("d1", 64, `${fill(QUARTERS, "1 3 4 3")} 3h/1.5 r/0.5 0/1 2`),
  phrase("d2", 72, fill(QUARTERS8, "3 2 3 3 2 3 4 3")),
  phrase("d3", 80, "2/2 3/1 2 2h/3"),
  shiftEvents(nOpening, 88, "-r"),
  phrase("e1", 120, `${fill(QUARTERS, "3 2 1 0")} 1h/1.5 r/0.5 2/1 4`),
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
  ...backing(1, "0/1 r/7 0/1"),
  ...phrase("a2", 8, THEME_HIGH),
  ...phrase("b1", 16, fill(EIGHTHS, "0 1 1 2 3 3 4 3")),
  ...phrase("b2", 20, fill(EIGHTHS, "3 2 1 1 0 1 1 2")),
  ...phrase("b3", 24, fill(EIGHTHS, "1 2 3 2 2 3 3 4")),
  ...phrase("b4", 28, fill(QUARTERS, "[3,4]! 3 2 1")),
  ...backing(29.5, "0/0.5 r/1.5 0/0.5"),
];

const apprenticeChart = chart(
  "apprentice",
  aOpening,
  phrase("b5", 32, fill(EIGHTHS, "1 2 2 3 4 3 2 2")),
  phrase("b6", 36, fill(EIGHTHS, "1 1 0 1 1 2 2 3")),
  phrase("b7", 40, fill(EIGHTHS, "4 3 3 2 2 1 2 3")),
  phrase("b8", 44, "3/1 2 3h/1.5"),
  backing(47, "0/1"),
  phrase("c1", 48, THEME_HIGH),
  backing(49, "0/1"),
  phrase("c2", 56, THEME_LOW),
  backing(57, "4/1"),
  phrase("d1", 64, fill(EIGHTHS, "1 2 3 3 4 3 3 2")),
  phrase("d2", 68, fill(EIGHTHS, "3 2 1 0 0 1 2 3")),
  phrase("d3", 72, fill(EIGHTHS, "3 2 1 2 3 4 3 2")),
  phrase("d4", 76, fill(EIGHTHS, "1 2 3 3 4 4 3 2")),
  phrase("d5", 80, fill(EIGHTHS, "2 3 2 3 4 3 2 1")),
  phrase("d6", 84, "2h/2 0/1 1"),
  shiftEvents(aOpening, 88, "-r"),
  phrase("e1", 120, fill(EIGHTHS, "4 3 3 2 1 1 0 0")),
  phrase("e2", 124, fill(EIGHTHS, "0 1 2 3 4 3 3 4")),
  phrase("e3", 128, fill(EIGHTHS, "4 4 3 3 2 2 1 1")),
  phrase("e4", 132, "1h/1.5 r/0.5 2/1 3"),
  backing(133, "0/1"),
  phrase("e5", 136, fill(EIGHTHS, "3 4 3 4 3 2 1 0")),
  phrase("e6", 140, fill(EIGHTHS, "4 4 3 3 2 2 1 1")),
  phrase("e7", 144, fill(EIGHTHS, "0 2 4 3 2 0 0 2")),
  phrase("e8", 148, fill(EIGHTHS, "4 2 1 0 1 2 4 2")),
  shiftEvents(phrase("a1", 0, THEME), 152, "-c"),
  backing(153, "0/1"),
  phrase("f1", 160, fill(QUARTERS, "4 3 2 1")),
  backing(160.5, "0/0.5 r/1.5 0/0.5"),
  phrase("f2", 164, fill(EIGHTHS, "3 4 3 4 3 2 2 1")),
  phrase("f3", 168, "2h/1.5 r/0.5 [1,3]/1 0 [1,3]!/4"),
);

// --- virtuoso: sixteenth runs off the beat, fuller backing, chords, trills ---

const vThemeBacking = "0/1 r/1.5 0/0.5 r/0.5 3/0.5 r/1.5 0/0.5";
const vEchoBacking = "0/1 r/1.5 0/0.5 r/0.5 0/0.5 r/1.5 0/0.5";
const vLowBacking = "4/1 r/1.5 4/0.5 r/0.5 4/0.5 r/1.5 4/0.5";

const vTheme = [...phrase("a1", 0, THEME), ...backing(1, vThemeBacking)];

const vOpening = [
  ...vTheme,
  ...phrase("a2", 8, THEME_HIGH),
  ...backing(9, vEchoBacking),
  ...burstBar(16, "b1", "0 1 1 2 2", "b2", "3 3 4 3"),
  ...burstBar(20, "b3", "3 2 2 1 1", "b4", "0 1 1 2"),
  ...burstBar(24, "b5", "1 1 2 2 1", "b6", "2 3 3 4"),
  ...phrase("b7", 28, fill(QUARTERS, "[3,4]! 3 2 1")),
  ...backing(29.5, "0/0.5 r/1.5 0/0.5"),
];

const virtuosoChart = chart(
  "virtuoso",
  vOpening,
  burstBar(32, "b8", "1 1 2 2 3", "b9", "4 3 2 2"),
  burstBar(36, "c1", "1 1 0 0 1", "c2", "1 2 2 3"),
  phrase("c3", 40, fill(EIGHTHS, "[3,4] 3 3 2 2 1 2 3")),
  phrase("c4", 44, "3/1 2 3h/1.5"),
  backing(45.5, "0/0.5 r/1 1/1"),
  phrase("c5", 48, THEME_HIGH),
  backing(49, vEchoBacking),
  phrase("c6", 56, THEME_LOW),
  backing(57, vLowBacking),
  burstBar(64, "d1", "1 2 2 3 3", "d2", "4 3 3 2"),
  burstBar(68, "d3", "3 2 2 1 0", "d4", "1 1 2 2"),
  burstBar(72, "d5", "3 3 2 2 3", "d6", "3 4 3 2"),
  phrase("d7", 76, fill(EIGHTHS, "1 2 3 3 4 4 3 2")),
  trill("t1", 80, "2/0.25 3 2 3 2"),
  phrase("d8", 82, fill(BURST_TAIL, "4 3 2 1")),
  phrase("d9", 84, "2h/2 [0,1,3]!/1 0"),
  shiftEvents(vOpening, 88, "-r"),
  burstBar(120, "e1", "4 3 3 2 2", "e2", "1 0 0 1"),
  burstBar(124, "e3", "0 1 1 2 3", "e4", "4 3 3 4"),
  phrase("e5", 128, fill(EIGHTHS, "[3,4]! 4 3 3 2 2 1 1")),
  phrase("e6", 132, "1h/1.5 r/0.5 2/1 3"),
  backing(133, "0/1 r/1.5 0/0.5"),
  trill("t2", 136, "3/0.25 4 3 4 3"),
  phrase("e7", 138, fill(BURST_TAIL, "3 2 1 0")),
  phrase("e8", 140, fill(EIGHTHS, "[3,4]! 4 3 3 2 2 1 1")),
  burstBar(144, "e9", "0 1 2 3 4", "f1", "2 0 0 2"),
  burstBar(148, "f2", "4 3 2 2 0", "f3", "1 2 4 2"),
  shiftEvents(vTheme, 152, "-c"),
  phrase("f4", 160, fill(QUARTERS, "[3,4]! 3 2 1")),
  backing(160.5, "0/0.5 r/1.5 0/0.5"),
  trill("t3", 164, "4/0.25 3 4 3 4"),
  phrase("f5", 166, fill(BURST_TAIL, "3 2 2 1")),
  phrase("f6", 168, "2h/1.5 r/0.5 [1,3]/1 0 [0,2,4]!/4"),
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
    movementOrExcerpt: "I. Allegro, opening",
    bpm: 120,
    timeSignature: [4, 4],
    difficulty: "novice",
    arrangementStyle: "Light piano with a soft string pad and bass",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Condensed from the arranger's own knowledge of the published score of the first movement. No external MIDI file, edition or recording was used.",
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
