import { CALIBRATION_RANGE_MS, GUIDED_CALIBRATION } from "../app/Config";
import { clamp, median, medianAbsoluteDeviation } from "../utils/MathUtils";

export interface CalibrationTap {
  /** How late the press was against the beat it belongs to, in ms. */
  deltaMs: number;
  /** False when the tap was too far from any beat to mean anything. */
  accepted: boolean;
}

export interface CalibrationResult {
  /** Every tap the player made, accepted or not. */
  taps: number;
  kept: number;
  rejected: number;
  medianMs: number;
  /** Median absolute deviation of the kept taps: how steady the player was. */
  spreadMs: number;
  suggestedInputOffsetMs: number;
  /** True once enough taps survived for the suggestion to mean something. */
  enough: boolean;
}

/**
 * Statistics for the guided calibration test. Pure: it is handed audio times
 * and returns numbers, so the panel can stay a thin piece of DOM.
 *
 * A tap is measured against the beat nearest to it, after the output latency
 * is taken off, because the player reacts to what they hear and that lags the
 * clock. No user offset is applied during the measurement: the point is to
 * find one.
 */
export class CalibrationManager {
  private readonly accepted: number[] = [];
  private rejectedAtEntry = 0;

  constructor(
    private readonly bpm: number,
    private readonly firstBeatAudioMs: number,
    private readonly outputLatencyMs: number,
  ) {}

  get beatMs(): number {
    return 60_000 / this.bpm;
  }

  /** Total taps offered, including the ones that were too far off to use. */
  get tapCount(): number {
    return this.accepted.length + this.rejectedAtEntry;
  }

  get full(): boolean {
    return this.tapCount >= GUIDED_CALIBRATION.maxTaps;
  }

  /** Audio time of the beat closest to `audioMs`. */
  nearestBeatAudioMs(audioMs: number): number {
    const beats = Math.round((audioMs - this.firstBeatAudioMs) / this.beatMs);
    return this.firstBeatAudioMs + beats * this.beatMs;
  }

  tap(audioMs: number): CalibrationTap {
    const heard = audioMs - this.outputLatencyMs;
    const deltaMs = heard - this.nearestBeatAudioMs(heard);
    if (Math.abs(deltaMs) > GUIDED_CALIBRATION.rejectBeyondMs) {
      this.rejectedAtEntry++;
      return { deltaMs, accepted: false };
    }
    this.accepted.push(deltaMs);
    return { deltaMs, accepted: true };
  }

  result(): CalibrationResult {
    const taps = this.tapCount;
    if (this.accepted.length === 0) {
      return {
        taps,
        kept: 0,
        rejected: taps,
        medianMs: 0,
        spreadMs: 0,
        suggestedInputOffsetMs: 0,
        enough: false,
      };
    }
    const centre = median(this.accepted);
    const deviation = medianAbsoluteDeviation(this.accepted);
    // With a perfectly steady player the deviation is zero, and a zero limit
    // would throw away every tap that is not exactly the median.
    const limit = deviation > 0 ? GUIDED_CALIBRATION.madFactor * deviation : Number.POSITIVE_INFINITY;
    const kept = this.accepted.filter((d) => Math.abs(d - centre) <= limit);
    const medianMs = median(kept);
    return {
      taps,
      kept: kept.length,
      rejected: taps - kept.length,
      medianMs,
      spreadMs: medianAbsoluteDeviation(kept),
      suggestedInputOffsetMs: clamp(Math.round(medianMs), CALIBRATION_RANGE_MS.min, CALIBRATION_RANGE_MS.max),
      enough: kept.length >= GUIDED_CALIBRATION.minTaps,
    };
  }

  reset(): void {
    this.accepted.length = 0;
    this.rejectedAtEntry = 0;
  }

  /**
   * Where the moving marker sits inside the current beat, 0 at the beat and
   * approaching 1 just before the next one. Corrected the same way the highway
   * is, so the marker and the sound agree.
   */
  markerPhase(audioNowMs: number, audioOffsetMs: number, visualOffsetMs: number): number {
    const corrected = audioNowMs - this.outputLatencyMs - audioOffsetMs + visualOffsetMs - this.firstBeatAudioMs;
    const beat = this.beatMs;
    const phase = ((corrected % beat) + beat) % beat;
    return phase / beat;
  }
}
