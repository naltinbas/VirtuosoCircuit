import { BeatMapper } from "./BeatMapper";
import {
  DIFFICULTIES,
  type BeatChart,
  type ChartEvent,
  type ChartStats,
  type CompiledChart,
  type Difficulty,
  type NoteInstance,
  type ScheduledNote,
  type Section,
  type TrackChart,
  type TrackDefinition,
  inferEventType,
} from "./ChartTypes";

/** Silence kept after the final music note so the last hold can ring out. */
const MUSIC_TAIL_MS = 400;

const DIFFICULTY_PREFIX: Record<Difficulty, string> = {
  novice: "n",
  apprentice: "a",
  virtuoso: "v",
  maestro: "m",
};

export function compileMusic(def: TrackDefinition, mapper: BeatMapper): ScheduledNote[] {
  const out: ScheduledNote[] = [];
  for (const p of def.arrangement.parts) {
    for (const n of p.notes) {
      const start = mapper.beatToMs(n.beat);
      const end = mapper.beatToMs(n.beat + n.durationBeats);
      out.push({
        timeMs: start,
        durationMs: Math.max(1, end - start),
        midi: n.midi,
        velocity: n.velocity ?? 0.8,
        instrument: p.instrument,
        partId: p.id,
        gain: p.gain ?? 1,
        pan: p.pan ?? 0,
      });
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs || a.midi - b.midi);
  return out;
}

export function musicEndMs(music: readonly ScheduledNote[]): number {
  let end = 0;
  for (const n of music) end = Math.max(end, n.timeMs + n.durationMs);
  return Math.ceil(end + MUSIC_TAIL_MS);
}

export function computeStats(events: readonly ChartEvent[], notes: readonly NoteInstance[]): ChartStats {
  let singleCount = 0;
  let chordCount = 0;
  let holdCount = 0;
  const phrases = new Set<string>();
  for (const e of events) {
    if (e.type === "single") singleCount++;
    else if (e.type === "chord") chordCount++;
    else holdCount++;
    if (e.phraseId) phrases.add(e.phraseId);
  }
  let peak = 0;
  let j = 0;
  for (let i = 0; i < notes.length; i++) {
    while (notes[i].timeMs - notes[j].timeMs >= 1000) j++;
    peak = Math.max(peak, i - j + 1);
  }
  return {
    eventCount: events.length,
    noteCount: notes.length,
    singleCount,
    chordCount,
    holdCount,
    phraseCount: phrases.size,
    peakNotesPerSecond: peak,
    firstNoteMs: notes.length ? notes[0].timeMs : 0,
    lastNoteMs: notes.length ? notes[notes.length - 1].timeMs + notes[notes.length - 1].durationMs : 0,
  };
}

/** Compile one beat-authored chart to ms. Events keep their authored order. */
export function compileChart(beatChart: BeatChart, mapper: BeatMapper): CompiledChart {
  const prefix = DIFFICULTY_PREFIX[beatChart.difficulty];
  const events: ChartEvent[] = beatChart.events.map((ev, i) => {
    const type = inferEventType(ev);
    const timeMs = mapper.beatToMs(ev.beat);
    // An authored duration is carried through whatever the event turned out to
    // be. Only a hold is allowed to have one, and the validator says so, which
    // it can only do if the duration survives compilation.
    const durationMs = ev.durationBeats ? mapper.beatToMs(ev.beat + ev.durationBeats) - timeMs : 0;
    const out: ChartEvent = {
      id: `${prefix}${i}`,
      timeMs,
      type,
      lanes: [...ev.lanes],
      durationMs,
      beat: ev.beat,
      measure: mapper.measureOf(ev.beat),
    };
    if (ev.phraseId) out.phraseId = ev.phraseId;
    if (ev.accent) out.accent = true;
    return out;
  });
  const notes: NoteInstance[] = [];
  for (const e of events) {
    for (const lane of e.lanes) {
      notes.push({
        id: `${e.id}L${lane}`,
        eventId: e.id,
        index: notes.length,
        timeMs: e.timeMs,
        lane,
        durationMs: e.durationMs,
        isHold: e.type === "hold",
        chordSize: e.lanes.length,
        phraseId: e.phraseId,
        accent: e.accent === true,
      });
    }
  }
  return { difficulty: beatChart.difficulty, events, notes, stats: computeStats(events, notes) };
}

export function compileTrack(def: TrackDefinition): TrackChart {
  const mapper = new BeatMapper(def.tempoMap, def.metadata.timeSignature);
  const music = compileMusic(def, mapper);
  const durationMs = musicEndMs(music);
  const sections: Section[] = def.sections.map((s) => ({
    name: s.name,
    startBeat: s.startBeat,
    endBeat: s.endBeat,
    startMs: mapper.beatToMs(s.startBeat),
    endMs: mapper.beatToMs(s.endBeat),
  }));
  const charts: Partial<Record<Difficulty, CompiledChart>> = {};
  // The slot a chart lands in comes from its own difficulty field, and nothing
  // in the type ties that to the key it was written under. A key that disagrees
  // would drop one chart on top of another and lose a third without a word, and
  // a difficulty outside the union would get vacuous density limits, so both
  // are refused here rather than compiled.
  for (const [key, bc] of Object.entries(def.charts)) {
    if (!bc) continue;
    if (!DIFFICULTIES.includes(bc.difficulty)) {
      throw new Error(`chart "${key}" has unknown difficulty "${bc.difficulty}"`);
    }
    if (bc.difficulty !== key) {
      throw new Error(`chart under key "${key}" is labelled "${bc.difficulty}"`);
    }
    charts[bc.difficulty] = compileChart(bc, mapper);
  }
  return {
    metadata: { ...def.metadata, durationMs },
    tempoMap: [...def.tempoMap],
    sections,
    beatGrid: mapper.beatGrid(mapper.msToBeat(durationMs)),
    music,
    charts,
  };
}

export function mapperFor(track: TrackChart): BeatMapper {
  return new BeatMapper(track.tempoMap, track.metadata.timeSignature);
}
