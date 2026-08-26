import {
  CHART_ALIGNMENT_TOLERANCE_MS,
  DENSITY_LIMITS,
  TRACK_LENGTH_MS,
  type DensityLimits,
} from "../app/Config";
import {
  INSTRUMENT_IDS,
  type CompiledChart,
  type Difficulty,
  type TrackChart,
  type TrackDefinition,
  isLane,
} from "./ChartTypes";

export type IssueLevel = "error" | "warning";

export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  message: string;
  difficulty?: Difficulty;
  eventId?: string;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  ok: boolean;
}

function report(issues: ValidationIssue[]): ValidationReport {
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  return { issues, errors, warnings, ok: errors.length === 0 };
}

/**
 * Validate one compiled chart against the track it belongs to.
 *
 * Rules: sorted, non-negative, within the track, valid unique lanes,
 * consistent types, same-lane spacing (including after holds), event
 * spacing, simultaneous-key limits, density windows, and alignment of every
 * event with an actual arrangement note onset.
 */
export function validateChart(
  chart: CompiledChart,
  track: TrackChart,
  limitsOverride?: Partial<DensityLimits>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const d = chart.difficulty;
  const limits: DensityLimits = { ...DENSITY_LIMITS[d], ...limitsOverride };
  const push = (level: IssueLevel, code: string, message: string, eventId?: string) =>
    issues.push({ level, code, message, difficulty: d, eventId });

  const events = chart.events;
  if (events.length === 0) {
    push("error", "empty", "chart has no events");
    return issues;
  }

  const onsets = new Float64Array(track.music.length);
  for (let i = 0; i < track.music.length; i++) onsets[i] = track.music[i].timeMs;

  const alignedToMusic = (t: number): boolean => {
    let lo = 0;
    let hi = onsets.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (onsets[mid] < t - CHART_ALIGNMENT_TOLERANCE_MS) lo = mid + 1;
      else hi = mid;
    }
    return lo < onsets.length && onsets[lo] <= t + CHART_ALIGNMENT_TOLERANCE_MS;
  };

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (i > 0 && e.timeMs < events[i - 1].timeMs) {
      push("error", "unsorted", `event ${e.id} at ${e.timeMs.toFixed(0)}ms comes after a later event`, e.id);
    }
    if (e.beat < 0 || e.timeMs < 0) push("error", "before-start", `event ${e.id} starts before the track`, e.id);
    if (e.timeMs + e.durationMs > track.metadata.durationMs) {
      push("error", "past-end", `event ${e.id} ends after the track (${track.metadata.durationMs}ms)`, e.id);
    }
    if (e.lanes.length === 0) push("error", "no-lanes", `event ${e.id} has no lanes`, e.id);
    for (const l of e.lanes) {
      if (!isLane(l)) push("error", "bad-lane", `event ${e.id} uses lane ${l}`, e.id);
    }
    if (new Set(e.lanes).size !== e.lanes.length) {
      push("error", "duplicate-lane", `event ${e.id} repeats a lane`, e.id);
    }
    if (e.type === "chord") {
      if (e.lanes.length < 2) push("error", "chord-size", `chord ${e.id} needs at least two lanes`, e.id);
      if (e.lanes.length > limits.maxChordSize) {
        push("error", "chord-size", `chord ${e.id} has ${e.lanes.length} lanes, limit ${limits.maxChordSize}`, e.id);
      }
      if (e.durationMs > 0) push("error", "chord-hold", `chord ${e.id} cannot also be a hold`, e.id);
    } else if (e.type === "hold") {
      if (e.lanes.length !== 1) push("error", "hold-lanes", `hold ${e.id} must use exactly one lane`, e.id);
      if (e.durationMs < limits.minHoldMs) {
        push("error", "hold-short", `hold ${e.id} lasts ${e.durationMs.toFixed(0)}ms, minimum ${limits.minHoldMs}`, e.id);
      }
    } else {
      if (e.lanes.length !== 1) push("error", "single-lanes", `single ${e.id} must use exactly one lane`, e.id);
      if (e.durationMs > 0) push("error", "single-duration", `single ${e.id} has a duration`, e.id);
    }
    if (!alignedToMusic(e.timeMs)) {
      push(
        "error",
        "unaligned",
        `event ${e.id} at beat ${e.beat} (${e.timeMs.toFixed(0)}ms) does not coincide with any arrangement note`,
        e.id,
      );
    }
  }

  // Same-lane spacing, measured from the end of the previous note in that lane.
  const lastEndByLane = new Map<number, { end: number; id: string }>();
  for (const n of chart.notes) {
    const prev = lastEndByLane.get(n.lane);
    if (prev) {
      const gap = n.timeMs - prev.end;
      if (gap < 0) {
        push("error", "lane-overlap", `note ${n.id} overlaps ${prev.id} in lane ${n.lane}`, n.eventId);
      } else if (gap < limits.minSameLaneGapMs) {
        push(
          "error",
          "lane-gap",
          `note ${n.id} follows ${prev.id} in lane ${n.lane} after ${gap.toFixed(0)}ms, minimum ${limits.minSameLaneGapMs}`,
          n.eventId,
        );
      }
    }
    lastEndByLane.set(n.lane, { end: n.timeMs + n.durationMs, id: n.id });
  }

  // Event spacing and simultaneous keys.
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].timeMs - events[i - 1].timeMs;
    if (gap > 0 && gap < limits.minEventGapMs) {
      push(
        "error",
        "event-gap",
        `events ${events[i - 1].id} and ${events[i].id} are ${gap.toFixed(0)}ms apart, minimum ${limits.minEventGapMs}`,
        events[i].id,
      );
    }
  }
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const t = e.timeMs;
    const keys = new Set<number>();
    let singlesAtSameTime = 0;
    for (let j = 0; j < events.length; j++) {
      const o = events[j];
      if (o.timeMs > t) break;
      const endsAfter = o.timeMs + o.durationMs > t + 1;
      if (o.timeMs === t) {
        for (const l of o.lanes) keys.add(l);
        if (o.type === "single") singlesAtSameTime++;
      } else if (o.type === "hold" && endsAfter) {
        for (const l of o.lanes) keys.add(l);
      }
    }
    if (keys.size > limits.maxSimultaneousKeys) {
      push(
        "error",
        "too-many-keys",
        `${keys.size} keys needed at ${t.toFixed(0)}ms (event ${e.id}), limit ${limits.maxSimultaneousKeys}`,
        e.id,
      );
    }
    if (singlesAtSameTime > 1 && (i === 0 || events[i - 1].timeMs !== t)) {
      push("warning", "split-chord", `several single notes share the beat at ${t.toFixed(0)}ms; write them as a chord`, e.id);
    }
  }

  // Density: sliding one-second window over judgeable notes.
  const notes = chart.notes;
  let j = 0;
  for (let i = 0; i < notes.length; i++) {
    while (notes[i].timeMs - notes[j].timeMs > 1000) j++;
    const count = i - j + 1;
    if (count > limits.maxNotesPerSecond) {
      push(
        "error",
        "density",
        `${count} notes inside one second ending at ${notes[i].timeMs.toFixed(0)}ms, limit ${limits.maxNotesPerSecond}`,
        notes[i].eventId,
      );
      j = i;
    }
  }

  // Phrases with a single event give a bonus for nothing.
  const phraseSizes = new Map<string, number>();
  for (const e of events) if (e.phraseId) phraseSizes.set(e.phraseId, (phraseSizes.get(e.phraseId) ?? 0) + 1);
  for (const [id, size] of phraseSizes) {
    if (size < 2) push("warning", "tiny-phrase", `phrase "${id}" has only ${size} event`);
  }

  return issues;
}

/** Validate track-level data: metadata, tempo map, sections, arrangement, chart set. */
export function validateTrack(def: TrackDefinition, track: TrackChart): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (level: IssueLevel, code: string, message: string) => issues.push({ level, code, message });
  const m = def.metadata;

  for (const field of [
    "id",
    "title",
    "composer",
    "composerShort",
    "movementOrExcerpt",
    "arrangementStyle",
    "arrangementCredit",
    "scoreSourceCredit",
    "licenseNotes",
  ] as const) {
    if (!m[field] || m[field]!.trim().length === 0) push("error", "metadata", `metadata.${field} is empty`);
  }
  if (!/^[a-z0-9-]+$/.test(m.id)) push("error", "metadata", `track id "${m.id}" should be lowercase-kebab`);
  if (!(m.order >= 1)) push("error", "metadata", "metadata.order must be >= 1");
  if (!(m.bpm > 0)) push("error", "metadata", "metadata.bpm must be positive");
  if (def.tempoMap.length === 0 || def.tempoMap[0].beat !== 0) push("error", "tempo", "tempo map must start at beat 0");
  if (def.tempoMap.length > 0 && def.tempoMap[0].bpm !== m.bpm) {
    push("warning", "tempo", "metadata.bpm differs from the first tempo map entry");
  }
  for (let i = 1; i < def.tempoMap.length; i++) {
    if (def.tempoMap[i].beat <= def.tempoMap[i - 1].beat) push("error", "tempo", "tempo map beats must increase");
  }

  const dur = track.metadata.durationMs;
  if (dur < TRACK_LENGTH_MS.min || dur > TRACK_LENGTH_MS.max) {
    push("warning", "length", `track lasts ${(dur / 1000).toFixed(1)}s, target ${TRACK_LENGTH_MS.min / 1000}-${TRACK_LENGTH_MS.max / 1000}s`);
  }

  if (def.arrangement.parts.length === 0) push("error", "arrangement", "arrangement has no parts");
  const partIds = new Set<string>();
  for (const p of def.arrangement.parts) {
    if (partIds.has(p.id)) push("error", "arrangement", `duplicate part id "${p.id}"`);
    partIds.add(p.id);
    if (!INSTRUMENT_IDS.includes(p.instrument)) push("error", "arrangement", `part "${p.id}" uses unknown instrument "${p.instrument}"`);
    if (p.notes.length === 0) push("warning", "arrangement", `part "${p.id}" has no notes`);
    for (let i = 0; i < p.notes.length; i++) {
      const n = p.notes[i];
      if (n.beat < 0) push("error", "arrangement", `part "${p.id}" note ${i} starts before beat 0`);
      if (!(n.durationBeats > 0)) push("error", "arrangement", `part "${p.id}" note ${i} has no duration`);
      if (!Number.isInteger(n.midi) || n.midi < 0 || n.midi > 127) push("error", "arrangement", `part "${p.id}" note ${i} pitch ${n.midi} out of range`);
      if (n.velocity !== undefined && (n.velocity < 0 || n.velocity > 1)) push("error", "arrangement", `part "${p.id}" note ${i} velocity out of range`);
      if (i > 0 && n.beat < p.notes[i - 1].beat) push("error", "arrangement", `part "${p.id}" notes are not sorted`);
    }
  }

  if (def.sections.length === 0) push("warning", "sections", "track has no sections");
  for (let i = 0; i < track.sections.length; i++) {
    const s = track.sections[i];
    if (!(s.endBeat > s.startBeat)) push("error", "sections", `section "${s.name}" is empty`);
    if (s.startMs < 0 || s.endMs > dur + 1) push("error", "sections", `section "${s.name}" is outside the track`);
    if (i > 0 && s.startBeat < track.sections[i - 1].endBeat) push("error", "sections", `section "${s.name}" overlaps the previous one`);
  }

  for (const d of ["novice", "apprentice", "virtuoso"] as const) {
    if (!track.charts[d]) push("error", "charts", `missing ${d} chart`);
  }
  if (m.order >= 7 && !track.charts.maestro) push("warning", "charts", "tracks 7-10 should have a maestro chart");
  for (const c of Object.values(track.charts)) {
    if (c) issues.push(...validateChart(c, track));
  }
  return issues;
}

export function validateTrackReport(def: TrackDefinition, track: TrackChart): ValidationReport {
  return report(validateTrack(def, track));
}

export function validateChartReport(chart: CompiledChart, track: TrackChart): ValidationReport {
  return report(validateChart(chart, track));
}
