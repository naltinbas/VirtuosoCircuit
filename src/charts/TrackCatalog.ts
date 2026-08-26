import { compileTrack } from "./ChartLoader";
import type { Difficulty, TrackChart, TrackDefinition } from "./ChartTypes";

// Every module in ./tracks is a catalog entry. Adding a track means adding a
// file there; nothing else needs registering.
const modules = import.meta.glob<{ default: TrackDefinition }>("./tracks/*.ts", { eager: true });

export const TRACK_DEFINITIONS: readonly TrackDefinition[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.metadata.order - b.metadata.order);

const compiled = new Map<string, TrackChart>();

export function getTrackDefinition(id: string): TrackDefinition | undefined {
  return TRACK_DEFINITIONS.find((t) => t.metadata.id === id);
}

/** Compiled tracks are memoized; compiling is deterministic so this is safe. */
export function getTrack(id: string): TrackChart {
  const cached = compiled.get(id);
  if (cached) return cached;
  const def = getTrackDefinition(id);
  if (!def) throw new Error(`Unknown track "${id}"`);
  const track = compileTrack(def);
  compiled.set(id, track);
  return track;
}

export function trackIds(): string[] {
  return TRACK_DEFINITIONS.map((t) => t.metadata.id);
}

export function nextTrackId(id: string): string | undefined {
  const i = TRACK_DEFINITIONS.findIndex((t) => t.metadata.id === id);
  return i >= 0 && i + 1 < TRACK_DEFINITIONS.length ? TRACK_DEFINITIONS[i + 1].metadata.id : undefined;
}

export function availableDifficulties(track: TrackChart): Difficulty[] {
  return (["novice", "apprentice", "virtuoso", "maestro"] as const).filter((d) => track.charts[d] !== undefined);
}
