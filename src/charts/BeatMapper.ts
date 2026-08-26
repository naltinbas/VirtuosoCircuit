import type { BeatMark, TempoChange } from "./ChartTypes";

interface TempoSegment {
  startBeat: number;
  startMs: number;
  bpm: number;
  msPerBeat: number;
}

/**
 * Converts between beats and milliseconds under a tempo map.
 *
 *   timeMs = segment.startMs + (beat - segment.startBeat) * 60000 / segment.bpm
 *
 * A beat is the denominator note value of the time signature (a quarter in
 * 4/4, an eighth in 3/8). Tempo changes take effect exactly on their beat;
 * a ritardando is written as a few successive slower entries.
 */
export class BeatMapper {
  private readonly segments: TempoSegment[];
  readonly beatsPerMeasure: number;

  constructor(tempoMap: readonly TempoChange[], timeSignature: readonly [number, number]) {
    if (tempoMap.length === 0) throw new Error("Tempo map is empty");
    const sorted = [...tempoMap].sort((a, b) => a.beat - b.beat);
    if (sorted[0].beat !== 0) throw new Error("Tempo map must start at beat 0");
    this.beatsPerMeasure = timeSignature[0];
    this.segments = [];
    let ms = 0;
    for (let i = 0; i < sorted.length; i++) {
      const { beat, bpm } = sorted[i];
      if (!(bpm > 0)) throw new Error(`Tempo at beat ${beat} must be positive`);
      if (i > 0) {
        const prev = this.segments[i - 1];
        if (beat <= prev.startBeat) throw new Error(`Tempo map beats must increase (beat ${beat})`);
        ms = prev.startMs + (beat - prev.startBeat) * prev.msPerBeat;
      }
      this.segments.push({ startBeat: beat, startMs: ms, bpm, msPerBeat: 60000 / bpm });
    }
  }

  private segmentForBeat(beat: number): TempoSegment {
    let seg = this.segments[0];
    for (const s of this.segments) {
      if (s.startBeat <= beat) seg = s;
      else break;
    }
    return seg;
  }

  private segmentForMs(ms: number): TempoSegment {
    let seg = this.segments[0];
    for (const s of this.segments) {
      if (s.startMs <= ms) seg = s;
      else break;
    }
    return seg;
  }

  beatToMs(beat: number): number {
    const seg = this.segmentForBeat(beat);
    return seg.startMs + (beat - seg.startBeat) * seg.msPerBeat;
  }

  msToBeat(ms: number): number {
    const seg = this.segmentForMs(ms);
    return seg.startBeat + (ms - seg.startMs) / seg.msPerBeat;
  }

  bpmAtBeat(beat: number): number {
    return this.segmentForBeat(beat).bpm;
  }

  bpmAtMs(ms: number): number {
    return this.segmentForMs(ms).bpm;
  }

  /** 1-based measure number for a beat. */
  measureOf(beat: number): number {
    return Math.floor(beat / this.beatsPerMeasure + 1e-9) + 1;
  }

  /** Beat and measure information for display, e.g. "measure 5, beat 2". */
  positionAtMs(ms: number): { beat: number; measure: number; beatInMeasure: number } {
    const beat = this.msToBeat(ms);
    const measure = this.measureOf(Math.max(0, beat));
    const beatInMeasure = ((beat % this.beatsPerMeasure) + this.beatsPerMeasure) % this.beatsPerMeasure;
    return { beat, measure, beatInMeasure };
  }

  /** Every whole beat from 0 through `untilBeat` inclusive. */
  beatGrid(untilBeat: number): BeatMark[] {
    const marks: BeatMark[] = [];
    const last = Math.ceil(untilBeat);
    for (let b = 0; b <= last; b++) {
      const beatInMeasure = b % this.beatsPerMeasure;
      marks.push({
        beat: b,
        timeMs: this.beatToMs(b),
        measure: this.measureOf(b),
        beatInMeasure,
        isDownbeat: beatInMeasure === 0,
      });
    }
    return marks;
  }
}
