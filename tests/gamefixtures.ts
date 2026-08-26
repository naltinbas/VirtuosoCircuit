// Chart fixtures for the gameplay specs.
//
// Most tests want notes at exact millisecond times, so buildTrack takes event
// specs in ms and assembles a CompiledChart the way ChartLoader would.
// authoredTrack goes the other way and runs the real beat authoring and
// compiler, which keeps the two paths honest about each other.

import { BeatMapper } from "../src/charts/BeatMapper";
import { compileTrack, computeStats } from "../src/charts/ChartLoader";
import type {
  BeatEvent,
  ChartEvent,
  CompiledChart,
  Difficulty,
  Lane,
  NoteInstance,
  Section,
  TrackChart,
  TrackDefinition,
  TrackMetadataSource,
} from "../src/charts/ChartTypes";
import type { GameEvents, GameOptions } from "../src/gameplay/RhythmGame";
import { RhythmGame } from "../src/gameplay/RhythmGame";

export interface EventSpec {
  timeMs: number;
  lanes: Lane[];
  /** Present and positive makes the event a hold. */
  durationMs?: number;
  phraseId?: string;
  accent?: boolean;
}

export interface TrackOptions {
  difficulty?: Difficulty;
  durationMs?: number;
  bpm?: number;
  sections?: readonly { name: string; startMs: number; endMs: number }[];
}

const METADATA: TrackMetadataSource = {
  id: "test-track",
  order: 1,
  title: "Test Piece",
  composer: "Test Composer",
  composerShort: "Test",
  movementOrExcerpt: "Excerpt",
  bpm: 120,
  timeSignature: [4, 4],
  difficulty: "virtuoso",
  arrangementStyle: "Plain test tones",
  arrangementCredit: "Test arrangement",
  scoreSourceCredit: "Test source",
  licenseNotes: "Test only",
};

export function buildCompiledChart(specs: readonly EventSpec[], difficulty: Difficulty): CompiledChart {
  const ordered = [...specs].sort((a, b) => a.timeMs - b.timeMs);
  const events: ChartEvent[] = ordered.map((spec, i) => {
    const durationMs = spec.durationMs ?? 0;
    const event: ChartEvent = {
      id: `e${i}`,
      timeMs: spec.timeMs,
      type: durationMs > 0 ? "hold" : spec.lanes.length > 1 ? "chord" : "single",
      lanes: [...spec.lanes],
      durationMs,
      beat: i,
      measure: 1 + Math.floor(i / 4),
    };
    if (spec.phraseId !== undefined) event.phraseId = spec.phraseId;
    if (spec.accent) event.accent = true;
    return event;
  });
  const notes: NoteInstance[] = [];
  for (const event of events) {
    for (const lane of event.lanes) {
      notes.push({
        id: `${event.id}L${lane}`,
        eventId: event.id,
        index: notes.length,
        timeMs: event.timeMs,
        lane,
        durationMs: event.durationMs,
        isHold: event.type === "hold",
        chordSize: event.lanes.length,
        phraseId: event.phraseId,
        accent: event.accent === true,
      });
    }
  }
  return { difficulty, events, notes, stats: computeStats(events, notes) };
}

export function buildTrack(specs: readonly EventSpec[], options: TrackOptions = {}): TrackChart {
  const difficulty = options.difficulty ?? "virtuoso";
  const bpm = options.bpm ?? 120;
  const chart = buildCompiledChart(specs, difficulty);
  let last = 0;
  for (const note of chart.notes) last = Math.max(last, note.timeMs + note.durationMs);
  const durationMs = options.durationMs ?? last + 2000;
  const mapper = new BeatMapper([{ beat: 0, bpm }], [4, 4]);
  const sections: Section[] = (options.sections ?? []).map((s) => ({
    name: s.name,
    startMs: s.startMs,
    endMs: s.endMs,
    startBeat: mapper.msToBeat(s.startMs),
    endBeat: mapper.msToBeat(s.endMs),
  }));
  return {
    metadata: { ...METADATA, bpm, difficulty, durationMs },
    tempoMap: [{ beat: 0, bpm }],
    sections,
    beatGrid: mapper.beatGrid(mapper.msToBeat(durationMs)),
    music: [],
    charts: { [difficulty]: chart },
  };
}

/** Compiles a beat authored chart through the real loader. */
export function authoredTrack(events: readonly BeatEvent[], difficulty: Difficulty, bpm = 120): TrackChart {
  let lastBeat = 0;
  for (const event of events) lastBeat = Math.max(lastBeat, event.beat + (event.durationBeats ?? 1));
  const definition: TrackDefinition = {
    metadata: { ...METADATA, bpm, difficulty },
    tempoMap: [{ beat: 0, bpm }],
    sections: [{ name: "Whole", startBeat: 0, endBeat: lastBeat }],
    arrangement: {
      parts: [
        {
          id: "lead",
          instrument: "piano",
          notes: Array.from({ length: Math.ceil(lastBeat) + 2 }, (_, i) => ({
            beat: i,
            durationBeats: 1,
            midi: 60,
          })),
        },
      ],
    },
    charts: { [difficulty]: { difficulty, events: [...events] } },
  };
  return compileTrack(definition);
}

export const DEFAULT_OPTIONS: GameOptions = {
  mode: "performance",
  noFail: false,
  focusSurgeEnabled: true,
  judgmentOffsetMs: 0,
};

export function makeGame(track: TrackChart, options: Partial<GameOptions> = {}): RhythmGame {
  return new RhythmGame(track, track.metadata.difficulty, { ...DEFAULT_OPTIONS, ...options });
}

/** Shorthand for the common case: notes in ms, default options. */
export function gameFor(specs: readonly EventSpec[], options: Partial<GameOptions> & TrackOptions = {}): RhythmGame {
  return makeGame(buildTrack(specs, options), options);
}

/** Records every payload of one event, in order. */
export function collect<K extends keyof GameEvents>(game: RhythmGame, name: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  game.events.on(name, (payload) => {
    out.push(payload);
  });
  return out;
}

export const ALL_EVENTS: readonly (keyof GameEvents)[] = [
  "judgment",
  "holdStart",
  "holdEnd",
  "chordComplete",
  "phraseComplete",
  "recenter",
  "auraWarning",
  "auraRecovered",
  "surgeStart",
  "surgeEnd",
  "fail",
  "complete",
];

/** Records the order events fired in, as "name" or "name:detail" strings. */
export function collectNames(game: RhythmGame, names: readonly (keyof GameEvents)[] = ALL_EVENTS): string[] {
  const out: string[] = [];
  for (const name of names) {
    game.events.on(name, (payload) => {
      if (name === "judgment") {
        const detail = payload as GameEvents["judgment"];
        out.push(`judgment:${detail.judgment}:${detail.noteId}`);
      } else {
        out.push(name);
      }
    });
  }
  return out;
}

/** Runs update() at a fixed step from `fromMs` up to and including `toMs`. */
export function runUpdates(game: RhythmGame, fromMs: number, toMs: number, stepMs = 16): void {
  for (let t = fromMs; t < toMs; t += stepMs) game.update(t);
  game.update(toMs);
}
