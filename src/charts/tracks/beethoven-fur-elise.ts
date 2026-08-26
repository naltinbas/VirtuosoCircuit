// Beethoven, Bagatelle No. 25 in A minor, WoO 59, "Fur Elise": the A section.
//
// The A section is built from one four-bar period: the E5 D#5 alternation
// falling through B4 D5 C5 to A4, then three bars that answer it over the
// left-hand arpeggios A2 E3 A3, E2 E3 G#3, A2 E3 A3. The period comes in two
// forms, one that turns back to the theme and one that closes E4 C5 B4 A4 on
// the tonic. This arrangement plays the pair twelve times, thin at first and
// filling out as it goes, and ends on an A minor chord.
//
// 3/8 at 200 eighths per minute, 100 bars, 90 seconds. Bar 1 and bar 2 are an
// accompaniment introduction so the upbeat E5 D#5 falls on the last beat of
// bar 2 and every later bar line sits on a multiple of three beats.

import { chart, lanes, melody, part, phrase, trill } from "../Authoring";
import type { ArrangementNote, BeatEvent, TrackDefinition } from "../ChartTypes";

const BPM = 200;
const BAR = 3;
const PERIOD = 4 * BAR;
const STATEMENT = 2 * PERIOD;
const STATEMENTS = 12;
const PERIOD_COUNT = 2 * STATEMENTS;
/** First theme downbeat, after the two introduction bars. */
const FIRST = 2 * BAR;
const CODA = FIRST + STATEMENTS * STATEMENT;
const END = CODA + 2 * BAR;

const periodStart = (i: number): number => FIRST + i * PERIOD;

// ---------------------------------------------------------------------------
// Arrangement
// ---------------------------------------------------------------------------

// The eight sixteenths of the theme, from its downbeat. The upbeat pair that
// leads into it is the tail of whatever comes before.
const THEME = "E5/0.5 D#5 E5 B4 D5 C5";

// Three answering bars. Each is an eighth held through the following rest,
// then two sixteenths that lead into the next bar. The first form turns back
// to the theme, the second closes on A4 before doing so.
const ANSWER_TURN = "A4/2 C4/0.5 E4 A4/2 E4/0.5 G#4 B4/2 E5/0.5 D#5";
const ANSWER_CLOSE = "A4/2 C4/0.5 E4 A4/2 E4/0.5 C5 B4/1 A4/1 E5/0.5 D#5";

// Left hand: the arpeggio of each answering bar, rolled as sixteenths. The
// theme bar itself is unaccompanied in the score, so the figure rests there.
const ARPEGGIO = "r/3 A2/0.5 E3 A3 r/1.5 E2/0.5 E3 G#3 r/1.5 A2/0.5 E3 A3 r/1.5";
const PAD = "A3+C4+E4/3 A3+C4+E4/3 G#3+B3+E4/3 A3+C4+E4/3";
const BASS = "A2/3 A2/3 E2/3 A2/3";
const HAT = "h/1 h h h h h h h h h h h";

const melodyNotes: ArrangementNote[] = [];
const pluckNotes: ArrangementNote[] = [];
const padNotes: ArrangementNote[] = [];
const bassNotes: ArrangementNote[] = [];
const hatNotes: ArrangementNote[] = [];

/** The piano grows through the track and eases back for the last statement. */
function melodyVelocity(statement: number): number {
  if (statement < 2) return 0.6;
  if (statement < 5) return 0.7;
  if (statement < 8) return 0.8;
  if (statement < 11) return 0.85;
  return 0.72;
}

// Introduction: two bars of the tonic arpeggio and pad, then the upbeat.
pluckNotes.push(...melody(0, "A2/0.5 E3 A3 r/1.5 A2/0.5 E3 A3 r/1.5", 0.45).notes);
padNotes.push(...melody(0, "A3+C4+E4/3 A3+C4+E4/3", 0.3).notes);
melodyNotes.push(...melody(FIRST - 1, "E5/0.5 D#5", 0.6).notes);

for (let i = 0; i < PERIOD_COUNT; i++) {
  const p = periodStart(i);
  const statement = Math.floor(i / 2);
  const closing = i % 2 === 1;
  melodyNotes.push(
    ...melody(p, `${THEME} ${closing ? ANSWER_CLOSE : ANSWER_TURN}`, melodyVelocity(statement)).notes,
  );
  pluckNotes.push(...melody(p, ARPEGGIO, statement < 5 ? 0.45 : 0.55).notes);
  if (statement >= 2) padNotes.push(...melody(p, PAD, 0.3).notes);
  if (statement >= 3) bassNotes.push(...melody(p, BASS, 0.55).notes);
  if (statement >= 6 && statement <= 10) hatNotes.push(...melody(p, HAT, 0.22).notes);
}

// Coda: the theme once more, then the A minor chord it has been resolving to.
melodyNotes.push(...melody(CODA, `${THEME} A4+C5+E5/3`, 0.8).notes);
pluckNotes.push(...melody(CODA, "r/3 A2/0.5 E3 A3", 0.5).notes);
padNotes.push(...melody(CODA, "A3+C4+E4/3 A3+C4+E4/3", 0.35).notes);
bassNotes.push(...melody(CODA, "A2/3 A2/3", 0.6).notes);

const def: TrackDefinition = {
  metadata: {
    id: "beethoven-fur-elise",
    order: 6,
    title: "Für Elise",
    composer: "Ludwig van Beethoven",
    composerShort: "L. van Beethoven",
    catalogNumber: "WoO 59",
    attributionNote:
      "The bagatelle was published in 1867, forty years after Beethoven's death, from a manuscript that has since been lost. Who the dedication names is still argued over.",
    movementOrExcerpt: "A section",
    bpm: BPM,
    timeSignature: [3, 8],
    difficulty: "apprentice",
    arrangementStyle: "Piano over plucked arpeggios with a soft strings pad and a light hat",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit:
      "Written out from knowledge of the public-domain score: the melody of the A section and its left-hand arpeggios are quoted as they stand, while the two introduction bars, the pad and bass parts, the closing chord and the number of repeats belong to this arrangement. No external MIDI, edition or recording was used.",
    licenseNotes:
      "The composition is in the public domain. What the game plays is an original arrangement written for it and synthesized at runtime, with no third-party editions or recordings involved.",
    unlockAfter: "mozart-nachtmusik",
  },
  tempoMap: [{ beat: 0, bpm: BPM }],
  sections: [
    { name: "Theme", startBeat: 0, endBeat: FIRST + 2 * STATEMENT },
    { name: "Repeat", startBeat: FIRST + 2 * STATEMENT, endBeat: FIRST + 5 * STATEMENT },
    { name: "Return", startBeat: FIRST + 5 * STATEMENT, endBeat: FIRST + 8 * STATEMENT },
    { name: "Full return", startBeat: FIRST + 8 * STATEMENT, endBeat: FIRST + 11 * STATEMENT },
    { name: "Closing cadence", startBeat: FIRST + 11 * STATEMENT, endBeat: END },
  ],
  arrangement: {
    parts: [
      part("melody", "piano", melodyNotes, { gain: 1, pan: 0.1 }),
      part("arpeggio", "pluck", pluckNotes, { gain: 0.6, pan: -0.25 }),
      part("pad", "strings", padNotes, { gain: 0.3, pan: -0.4 }),
      part("bass", "bass", bassNotes, { gain: 0.5, pan: 0 }),
      part("hat", "percussion", hatNotes, { gain: 0.35, pan: 0.3 }),
    ],
  },
  charts: {},
};

export default def;
