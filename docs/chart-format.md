# Chart format

Tracks are authored in beats and compiled to milliseconds once, when the track is loaded. Nothing that runs during a performance knows what a beat is, apart from the beat grid and the debug readout. This document describes both halves: the beat-shaped types you write, and the millisecond-shaped types the game plays.

The types are in `src/charts/ChartTypes.ts`, the notation in `src/charts/Authoring.ts`, the tempo maths in `src/charts/BeatMapper.ts`, the compiler in `src/charts/ChartLoader.ts` and the rules in `src/charts/ChartValidator.ts`.

```
src/charts/tracks/<id>.ts   default export: TrackDefinition   (beats)
        |
        |  compileTrack()          BeatMapper: beat <-> ms under the tempo map
        v
TrackChart                                                    (milliseconds)
    metadata     TrackMetadata, durationMs filled in by the compiler
    tempoMap     copied through
    sections     Section[]        startMs / endMs added
    beatGrid     BeatMark[]       one entry per whole beat
    music        ScheduledNote[]  every arrangement note, flat and sorted
    charts       CompiledChart per difficulty
                     events   ChartEvent[]    one per authored BeatEvent
                     notes    NoteInstance[]  one per lane of each event
                     stats    ChartStats
```

## TrackDefinition

One module in `src/charts/tracks/` per track, with a default export of this shape. `src/charts/TrackCatalog.ts` finds them with `import.meta.glob("./tracks/*.ts", { eager: true })` and orders them by `metadata.order`.

```ts
interface TrackDefinition {
  metadata: TrackMetadataSource;
  tempoMap: TempoChange[];
  sections: SectionSource[];
  arrangement: Arrangement;
  charts: Partial<Record<Difficulty, BeatChart>>;
}
```

`TrackMetadataSource` is `TrackMetadata` without `durationMs`, because the compiler derives that from the arrangement rather than trusting a number in the file.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Lowercase kebab, matches the filename. The validator enforces `/^[a-z0-9-]+$/`. |
| `order` | `number` | 1-based position in the catalog, unique across it. |
| `title` | `string` | Work title as it appears in the library. |
| `composer` | `string` | Full name. |
| `composerShort` | `string` | For narrow cards, for example `J. S. Bach`. |
| `catalogNumber` | `string?` | `BWV 1007`, `K. 545`, `Op. 67`. |
| `attributionNote` | `string?` | Printed when a work is commonly credited to the wrong person, or when the sources are disputed. |
| `movementOrExcerpt` | `string` | Which part of the work this is. |
| `bpm` | `number` | Opening tempo. Should match the first tempo map entry; the validator warns when it does not. |
| `timeSignature` | `[number, number]` | The numerator sets beats per measure, the denominator says what a beat is. |
| `difficulty` | `Difficulty` | Headline difficulty, the level the arrangement was pitched at. Nothing in `src/` reads it at present: the track select card lists the difficulties the track actually ships. |
| `arrangementStyle` | `string` | One line describing the synth arrangement. |
| `arrangementCredit` | `string` | Pinned to one exact string by `tests/tracks.test.ts`. |
| `scoreSourceCredit` | `string` | What the arrangement was written from, and which bars are quoted. Must state that no external MIDI or recording was used. |
| `licenseNotes` | `string` | Why the piece may be used. Ends up in the licence table and on the credits screen. |
| `unlockAfter` | `string?` | Id of the track that gates this one. Absent means unlocked from the start. |

## The tempo map

```ts
interface TempoChange { beat: number; bpm: number }
```

`BeatMapper` turns the list into segments and converts in both directions:

```
timeMs = segment.startMs + (beat - segment.startBeat) * 60000 / segment.bpm
```

Rules: the list must start at beat 0, beats must strictly increase, and every bpm must be positive. `BeatMapper` throws on all three, so a broken tempo map fails at compile rather than at play.

A beat is the denominator of the time signature: a quarter in 4/4, an eighth in 3/8. `beatsPerMeasure` is the numerator, and `measureOf(beat)` returns a 1-based measure number from it.

Tempo changes take effect exactly on their beat. There is no interpolation, so a ritardando is written as a few successive slower entries:

```ts
tempoMap: [
  { beat: 0, bpm: 132 },
  { beat: 240, bpm: 120 },
  { beat: 244, bpm: 108 },
  { beat: 248, bpm: 92 },
],
```

`beatGrid(untilBeat)` produces one `BeatMark` per whole beat from 0 through `ceil(untilBeat)`, which is what the metronome clicks on and what the beat grid draws.

## Sections

```ts
interface SectionSource { name: string; startBeat: number; endBeat: number }
```

Compiled to `Section`, which keeps the beats and adds `startMs` and `endMs`. Sections are the practice studio's checkpoints and its loop presets, and the pause menu offers "practice this section" from the one you were in.

They must be non-empty (`endBeat > startBeat`), inside the track, and non-overlapping in order. The first should start at beat 0; `tests/tracks.test.ts` requires it and requires at least two sections.

## The arrangement

```ts
interface Arrangement { parts: ArrangementPart[] }

interface ArrangementPart {
  id: string;              // unique within the track
  instrument: InstrumentId;
  notes: ArrangementNote[];
  gain?: number;           // linear, default 1
  pan?: number;            // -1..1, default 0
}

interface ArrangementNote {
  beat: number;
  durationBeats: number;   // must be > 0
  midi: number;            // 0..127, or a DRUM constant for percussion parts
  velocity?: number;       // 0..1, default 0.8
}
```

`InstrumentId` is one of `piano`, `harpsichord`, `strings`, `organ`, `bass`, `pluck`, `bell`, `percussion`. Percussion parts use the `DRUM` map as pitches: `kick` 36, `click` 37, `snare` 38, `hat` 42, `tom` 45, `openHat` 46, `crash` 49, `ride` 51. The synth maps those to noise and envelope voices instead of oscillator pitches.

`compileMusic()` flattens every part into one `ScheduledNote[]` sorted by time then pitch, which is what the transport walks with a cursor:

```ts
interface ScheduledNote {
  timeMs: number;
  durationMs: number;      // at least 1
  midi: number;
  velocity: number;
  instrument: InstrumentId;
  partId: string;
  gain: number;
  pan: number;
}
```

`metadata.durationMs` is the end of the last arrangement note plus a 400 ms tail (`MUSIC_TAIL_MS`), rounded up, so the final chord has room to ring. A performance counts as complete `HIGHWAY.outroMs` (2500 ms) after that.

The arrangement is not just the soundtrack. Every chart event has to line up with a note in it, so writing the arrangement first and the charts against it is the order that works.

## BeatEvent and BeatChart

```ts
interface BeatEvent {
  beat: number;
  lanes: Lane[];           // 0..4
  type?: EventType;        // "single" | "chord" | "hold", inferred when absent
  durationBeats?: number;
  phraseId?: string;
  accent?: boolean;
}

interface BeatChart { difficulty: Difficulty; events: BeatEvent[] }
```

`inferEventType()` decides the type when it is left out: more than one lane is a chord, a positive `durationBeats` is a hold, anything else is a single. Writing `type` by hand is only useful when you want the validator to complain about a mismatch.

`phraseId` groups events. Completing every note carrying an id, with no miss and no skip, pays the phrase bonus. An id starting with `trill-` is a trill instead: it pays a smaller bonus and the validator holds it to stricter rules.

`accent` is a drawing hint (a bright rim on the gem) and carries no scoring weight.

The `difficulty` inside a `BeatChart` must match the key it is filed under in `charts`. `compileTrack()` throws otherwise, because a mismatch would drop one chart on top of another and lose a third without a word.

## Compiled forms

```ts
interface ChartEvent {
  id: string;              // difficulty prefix plus authored index: n0, a17, v3, m204
  timeMs: number;
  type: EventType;
  lanes: Lane[];
  durationMs: number;      // 0 for singles and chords
  phraseId?: string;
  accent?: boolean;
  beat: number;            // the authored beat, kept for messages and the editor
  measure: number;         // 1-based
}

interface NoteInstance {
  id: string;              // event id, "L", lane: n0L2
  eventId: string;
  index: number;           // position in the chart's note array
  timeMs: number;
  lane: Lane;
  durationMs: number;
  isHold: boolean;
  chordSize: number;       // lanes in the parent event
  phraseId?: string;
  accent: boolean;
}
```

An event is what the author wrote; a note is what gets judged. A three-lane chord is one `ChartEvent` and three `NoteInstance`s that share an `eventId`, which is how the chord bonus can be decided at the event level while each key press is judged on its own.

An authored duration survives compilation whatever the event turned out to be. Only a hold is allowed to keep one, and the validator can only say so if the number is still there to look at.

`CompiledChart` also carries `ChartStats`: event and note counts, how many of each type, the phrase count, `peakNotesPerSecond`, and the first and last note times. The library cards and the chart editor read those.

## The notation

`src/charts/Authoring.ts` exists so an arrangement reads as music instead of as a wall of object literals. Every function is pure and every malformed token throws. Nothing is dropped silently.

### Music

```ts
melody(startBeat, text, defaultVelocity = 0.8): { notes: ArrangementNote[]; endBeat: number }
```

One token per note:

```
pitch[+pitch...][@velocity][/durationBeats]
```

- **pitch**: a letter `A` to `G`, an optional `#`, `##`, `b` or `bb`, then an octave number. `C4` is middle C and MIDI 60. Negative octaves are allowed (`C-1` is 0).
- **`+`** stacks pitches into a chord at the same beat with the same duration.
- **`@velocity`** is 0 to 1 and is sticky: it applies until another token changes it.
- **`/durationBeats`** is also sticky, starting at 1.
- **`r`** is a rest: it advances the beat and writes nothing.
- **`|`** is ignored, so you can write barlines where they help.
- In a percussion part, use a drum name instead of a pitch: `k s h oh t cr rd cl`.

```ts
melody(0, "E4/1 E4 F4 G4 | G4 F4 E4 D4 | C4+E4/2 r/1 G3@0.5/1")
```

reads as four quarter notes, four more, a two-beat C major third, a one-beat rest, and a quieter G3.

Helpers around it: `join(...)` merges and sorts several results, `shiftNotes(notes, beats)` moves a passage, `transposeNotes(notes, semitones)` moves it in pitch, `repeatNotes(notes, times, lengthBeats)` lays down copies at a fixed spacing, `lastBeat(notes)` reports where a passage ends, and `part(id, instrument, notes, opts)` builds an `ArrangementPart` with the notes sorted.

`pitchToMidi("F#3")` and `midiToPitch(54)` are exported too, for tooling.

### Lanes

```ts
lanes(startBeat, text, phraseId?): BeatEvent[]
```

One token per chart event:

```
[&]laneSpec[h][!][/durationBeats]
```

- **laneSpec** is a single digit `0` to `4`, or a bracketed list like `[0,2,4]` for a chord.
- **`h`** makes it a hold lasting the token's duration. Chords cannot be held; the parser throws and tells you to write separate `&` hold tokens instead.
- **`!`** marks an accent.
- **`/durationBeats`** is sticky, starting at 1, exactly as in `melody`.
- **`&`** in front of a token places it on the same beat as the previous token without advancing the beat. Its duration still becomes the sticky one. This is how two holds start together in different lanes.
- **`r`** is a rest. A rest cannot follow `&`.

```ts
lanes(0, "0/1 1 2 [0,2]/1 1h/2 &3h/2 r/1 4!/0.5", "phrase-a")
```

is four quarter events, then two two-beat holds starting together in lanes 1 and 3, a one-beat rest, and an accented half-beat note in lane 4, all tagged as one phrase.

`phrase(id, startBeat, text)` is `lanes` with a phrase id. `trill(id, startBeat, text)` is `lanes` with the id prefixed by `trill-`. `shiftEvents(events, beats, phraseSuffix?)` moves events later, and the suffix is how a repeated section keeps its phrases separate from the original's. `chart(difficulty, ...groups)` merges event lists and sorts them by beat then lane.

## A worked example

A whole track module, small enough to read at once: 96 beats at 96 bpm (60.4 seconds with the tail), two parts, six repeats of a four-bar block. It compiles and validates with no errors and no warnings. Saving it as `src/charts/tracks/example-etude.ts` puts it in the catalog, where `order: 1` collides with the minuet: a file that stays there needs a free order, an `unlockAfter` naming the track before it, and a maestro chart from order 7 on, all of which `tests/tracks.test.ts` checks.

```ts
// src/charts/tracks/example-etude.ts
import { chart, lanes, melody, part, repeatNotes, shiftEvents } from "../Authoring";
import type { BeatEvent, TrackDefinition } from "../ChartTypes";

const BPM = 96;
const BLOCK = 16; // beats in one four-bar block
const REPEATS = 6;

const tuneText = "C4/1 D4 E4 G4 | E4/1 D4 C4/2 | F4/1 E4 D4 C4 | G3/2 C4/2";
const bassText = "C3/4 G2 F2 C3";

const melodyNotes = repeatNotes(melody(0, tuneText, 0.85).notes, REPEATS, BLOCK);
const bassNotes = repeatNotes(melody(0, bassText, 0.6).notes, REPEATS, BLOCK);

/** The same block six times over, with a distinct phrase id per repeat. */
function everyBlock(text: string, phraseId: string): BeatEvent[] {
  const one = lanes(0, text, phraseId);
  const out: BeatEvent[] = [];
  for (let i = 0; i < REPEATS; i++) out.push(...shiftEvents(one, i * BLOCK, `-${i}`));
  return out;
}

const def: TrackDefinition = {
  metadata: {
    id: "example-etude",
    order: 1,
    title: "Example Etude",
    composer: "Anonymous",
    composerShort: "Anon.",
    movementOrExcerpt: "Whole",
    bpm: BPM,
    timeSignature: [4, 4],
    difficulty: "novice",
    arrangementStyle: "Piano over a plain bass",
    arrangementCredit:
      "Original game arrangement based on a public-domain composition, written for Virtuoso Circuit",
    scoreSourceCredit: "Written for this example; no external MIDI or recording was used.",
    licenseNotes: "Public-domain composition, original arrangement.",
  },
  tempoMap: [{ beat: 0, bpm: BPM }],
  sections: [
    { name: "First half", startBeat: 0, endBeat: 3 * BLOCK },
    { name: "Second half", startBeat: 3 * BLOCK, endBeat: REPEATS * BLOCK },
  ],
  arrangement: {
    parts: [
      part("melody", "piano", melodyNotes, { gain: 1 }),
      part("bass", "bass", bassNotes, { gain: 0.6 }),
    ],
  },
  charts: {
    novice: chart("novice", everyBlock("0/1 1 2 3 | 2/1 1 0/2 | 3/1 2 1 0 | 4/2 0/2", "n")),
    apprentice: chart(
      "apprentice",
      everyBlock("[0,1]/1 1 2 3 | [2,4]/1 1 0/2 | 3/1 2 1 0 | [4,1]/2 0/2", "a"),
    ),
    virtuoso: chart(
      "virtuoso",
      everyBlock("[0,1]/1 1 2 3 | [2,4]/1 1 0h/2 | [3,2]/1 2 1 0 | [4,1]/2 2h/2", "v"),
    ),
  },
};

export default def;
```

Things worth noticing in it, because they are the constraints that bite:

- Every chart beat is a beat where the melody or the bass actually plays. The melody has onsets at beats 0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12 and 14 of each block; the bass adds 0, 4, 8 and 12. Nothing in any chart falls anywhere else.
- Every chord sits on a beat where the melody and the bass strike together: 0, 4 and 12 at apprentice, and 8 as well at virtuoso. A chord over fewer onsets than it has lanes gets a `thin-chord` warning.
- The virtuoso hold in lane 2 runs from beat 14 to beat 16 of its block, and the next block's lane 2 note is at beat 18. Same-lane spacing is measured from the **end** of a hold, so ending a hold on the beat where the same lane restarts is an error, not a tight squeeze.
- Each repeat gets its own phrase suffix. Without it the six copies are one phrase spanning the whole track, which pays only if every note in it is clean. The validator stays quiet either way: consecutive events are never more than two beats apart, so `phrase-split` has nothing to catch.

Check it without starting the game:

```ts
// tests/example.test.ts
import { expect, it } from "vitest";
import { compileTrack } from "../src/charts/ChartLoader";
import { validateTrack } from "../src/charts/ChartValidator";
import def from "../src/charts/tracks/example-etude";

it("compiles clean", () => {
  const track = compileTrack(def);
  const issues = validateTrack(def, track);
  for (const w of issues.filter((i) => i.level === "warning")) console.warn(w.code, w.message);
  expect(issues.filter((i) => i.level === "error")).toEqual([]);
});
```

`tests/tracks.test.ts` already does this for every module in `src/charts/tracks/`, so in practice `npx vitest run tests/tracks.test.ts` is enough.

## Validation

```ts
validateTrack(def, track): ValidationIssue[]      // metadata, tempo, sections, arrangement, plus every chart
validateChart(chart, track, limitsOverride?): ValidationIssue[]
validateTrackReport(def, track): ValidationReport // the same issues split into errors and warnings, plus ok
```

```ts
interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  difficulty?: Difficulty;  // set by chart-level checks
  eventId?: string;         // set where an event is to blame
}
```

Errors mean the chart is wrong and `tests/tracks.test.ts` fails. Warnings are printed and left to the author, because a few of them are judgement calls made on purpose.

### Track-level codes

| Code | Level | Meaning |
| --- | --- | --- |
| `metadata` | error | A required string field is missing, empty or not a string; `id` is not lowercase kebab; `order` is below 1; `bpm` is not positive. |
| `tempo` | error | The tempo map is empty, does not start at beat 0, or has beats that do not strictly increase. |
| `tempo` | warning | `metadata.bpm` differs from the first tempo map entry. |
| `length` | warning | The compiled track is outside `TRACK_LENGTH_MS`, which is 55 to 125 seconds. |
| `arrangement` | error | No parts at all; a duplicate part id; an unknown instrument; a note before beat 0, with no duration, with a pitch outside 0 to 127, with a velocity outside 0 to 1, or out of order within its part. |
| `arrangement` | warning | A part with no notes. |
| `sections` | error | A section is empty, falls outside the track, or overlaps the previous one. |
| `sections` | warning | The track has no sections. |
| `charts` | error | A novice, apprentice or virtuoso chart is missing. |
| `charts` | warning | A track at `order >= 7` has no maestro chart. |

### Chart-level codes

| Code | Level | Meaning |
| --- | --- | --- |
| `empty` | error | The chart has no events. Nothing else is checked. |
| `unsorted` | error | An event starts earlier than the event before it. |
| `before-start` | error | An event has a negative beat or a negative time. |
| `past-end` | error | An event, including a hold tail, ends after `metadata.durationMs`. |
| `no-lanes` | error | An event has an empty `lanes` array. |
| `bad-lane` | error | A lane outside 0 to 4. |
| `duplicate-lane` | error | The same lane twice in one event. |
| `chord-size` | error | A chord with fewer than two lanes, or more than `maxChordSize` for the difficulty. |
| `chord-hold` | error | A chord with a non-zero duration. Chords are struck, never held. |
| `hold-lanes` | error | A hold that does not use exactly one lane. |
| `hold-short` | error | A hold shorter than `minHoldMs` for the difficulty. |
| `single-lanes` | error | A single that does not use exactly one lane. |
| `single-duration` | error | A single with a duration. Give it a hold type or take the duration off. |
| `unaligned` | error | The event does not land within `CHART_ALIGNMENT_TOLERANCE_MS` (25 ms) of any arrangement note onset. The player would be pressing over silence. |
| `lane-overlap` | error | A note in a lane starts before the previous note in that lane has ended. |
| `lane-gap` | error | Two notes in one lane are closer than `minSameLaneGapMs`, measured from the end of the earlier one. This is a one-finger ergonomics rule. |
| `event-gap` | error | Two consecutive events at different times are closer than `minEventGapMs`. Events at the same time are exempt, since they are one action. |
| `too-many-keys` | error | More than `maxSimultaneousKeys` have to be down at one moment. Held tails still in progress count toward the total. |
| `density` | error | More than `maxNotesPerSecond` notes inside one sliding second. |
| `phrase-id` | error | A `phraseId` that is not a non-empty string. Reachable through imported JSON, not through the notation. |
| `trill-lanes` | error | A trill phrase contains something other than a single note, or two consecutive trill notes share a lane. Trills alternate. |
| `thin-chord` | warning | The chord asks for more keys than the arrangement starts notes at that moment. Usually a chord pattern reused over a texture that strikes less often. |
| `split-chord` | warning | Several separate single events share one beat. Write them as one chord so they pay the chord bonus. |
| `tiny-phrase` | warning | A phrase with one event, which is a bonus for nothing. |
| `phrase-split` | warning | Two consecutive events in one phrase are more than 8 beats apart, which almost always means a repeated section reused a phrase id without a suffix. |

The alignment check is the one that catches the most real mistakes. It binary-searches the arrangement onsets for anything within 25 ms of the event time, and it also counts how many it found, which is where `thin-chord` comes from.

## Density limits

`DENSITY_LIMITS` in `src/app/Config.ts` holds one `DensityLimits` per difficulty, and `validateChart` looks up the row for `chart.difficulty`. There is no inheritance and no scaling: each difficulty states all six numbers.

| Limit | Novice | Apprentice | Virtuoso | Maestro | What it means |
| --- | --- | --- | --- | --- | --- |
| `maxNotesPerSecond` | 3.5 | 5 | 7 | 9 | Most notes inside any one-second window, counted over judgeable notes. |
| `minSameLaneGapMs` | 240 | 170 | 120 | 95 | Least time between two notes in one lane, from the end of the earlier one. |
| `minEventGapMs` | 200 | 140 | 95 | 80 | Least time between two events at different times. |
| `maxChordSize` | 2 | 2 | 3 | 3 | Largest chord. |
| `maxSimultaneousKeys` | 2 | 3 | 3 | 3 | Most keys down at once, held tails included. |
| `minHoldMs` | 400 | 350 | 300 | 250 | Shortest hold. |

The notes-per-second check walks a two-pointer window over the note list, and resets the window start after it reports, so one very dense passage produces one error rather than one per note.

Note that `maxNotesPerSecond` counts **notes**, not events: a three-lane chord spends three of the budget. That is deliberate, since three keys is three actions.

`validateChart` takes an optional third argument, `limitsOverride: Partial<DensityLimits>`, which is merged over the difficulty's row. It exists for tests and for tooling that wants to ask "would this pass at apprentice spacing?". Track validation never uses it, so a chart that ships is always measured against its own difficulty.

Adding a difficulty means adding a row here, a member of the `Difficulty` union and of `DIFFICULTIES` in `src/charts/ChartTypes.ts`, a label in `DIFFICULTY_LABELS`, an event id prefix in `DIFFICULTY_PREFIX` in `src/charts/ChartLoader.ts`, and an entry in `availableDifficulties()` in `src/charts/TrackCatalog.ts`. A difficulty outside the union is refused at compile time rather than given empty limits.
