// Practice Studio state: playback rate, the loop range and the section
// checkpoints. It answers questions about song time and nothing else; the app
// owns the clock and does the seeking.

import { HIGHWAY, PRACTICE_SPEEDS } from "../app/Config";
import type { Section, TrackChart } from "../charts/ChartTypes";

export interface PracticeOptions {
  rate?: number;
  loopStartMs?: number;
  loopEndMs?: number;
  loopEnabled?: boolean;
}

/** Nearest speed the practice menu offers, so an odd stored value cannot leak through. */
export function snapPracticeRate(rate: number): number {
  let best = PRACTICE_SPEEDS[0];
  let bestGap = Infinity;
  for (const speed of PRACTICE_SPEEDS) {
    const gap = Math.abs(speed - rate);
    if (gap < bestGap) {
      bestGap = gap;
      best = speed;
    }
  }
  return best;
}

export class PracticeSystem {
  readonly checkpointsMs: readonly number[];
  /** Song time at which the track counts as over, matching the performance rule. */
  readonly endMs: number;

  private readonly durationMs: number;
  private readonly sections: readonly Section[];
  private rateValue: number;
  private startMs: number;
  private stopMs: number;
  private enabled: boolean;

  constructor(track: TrackChart, options: PracticeOptions = {}) {
    this.durationMs = track.metadata.durationMs;
    this.endMs = this.durationMs + HIGHWAY.outroMs;
    this.sections = track.sections;
    this.checkpointsMs = track.sections.length > 0 ? track.sections.map((s) => this.clampMs(s.startMs)) : [0];
    this.rateValue = snapPracticeRate(options.rate ?? 1);
    this.startMs = this.clampMs(options.loopStartMs ?? 0);
    this.stopMs = this.clampMs(options.loopEndMs ?? this.durationMs);
    this.enabled = options.loopEnabled ?? false;
  }

  get rate(): number {
    return this.rateValue;
  }

  get loopStartMs(): number {
    return this.startMs;
  }

  get loopEndMs(): number {
    return this.stopMs;
  }

  get loopEnabled(): boolean {
    return this.enabled;
  }

  /** True when the loop is on and covers a real range. */
  get looping(): boolean {
    return this.enabled && this.stopMs > this.startMs;
  }

  setRate(rate: number): void {
    this.rateValue = snapPracticeRate(rate);
  }

  setLoop(startMs: number, endMs: number, enabled: boolean): void {
    this.startMs = this.clampMs(Math.min(startMs, endMs));
    this.stopMs = this.clampMs(Math.max(startMs, endMs));
    this.enabled = enabled;
  }

  setLoopEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Loops one section, or the whole track when the section is null. */
  setSection(section: Section | null): void {
    if (section === null) this.setLoop(0, this.durationMs, false);
    else this.setLoop(section.startMs, section.endMs, true);
  }

  shouldWrap(songMs: number): boolean {
    return this.looping && songMs >= this.stopMs;
  }

  /** First song time the pass plays: the loop start, or the top of the track. */
  get passStartMs(): number {
    return this.looping ? this.startMs : 0;
  }

  /** Where a run or a loop pass starts, `prerollMs` of run-up included. */
  entryMs(prerollMs: number = HIGHWAY.practicePrerollMs): number {
    return this.passStartMs - prerollMs;
  }

  isPastEnd(songMs: number): boolean {
    return songMs >= this.endMs;
  }

  sectionAt(songMs: number): Section | null {
    for (const section of this.sections) {
      if (songMs >= section.startMs && songMs < section.endMs) return section;
    }
    return null;
  }

  /** Nearest checkpoint before `songMs`, for jumping back a section. */
  checkpointBefore(songMs: number): number {
    let best = this.checkpointsMs[0];
    for (const ms of this.checkpointsMs) {
      if (ms < songMs) best = ms;
      else break;
    }
    return best;
  }

  /** Nearest checkpoint after `songMs`, for jumping forward a section. */
  checkpointAfter(songMs: number): number {
    for (const ms of this.checkpointsMs) {
      if (ms > songMs) return ms;
    }
    return this.checkpointsMs[this.checkpointsMs.length - 1];
  }

  private clampMs(ms: number): number {
    return ms < 0 ? 0 : ms > this.durationMs ? this.durationMs : ms;
  }
}
