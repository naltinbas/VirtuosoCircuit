import { describe, expect, it } from "vitest";
import { CalibrationManager } from "../src/audio/CalibrationManager";
import { GUIDED_CALIBRATION } from "../src/app/Config";

const BPM = GUIDED_CALIBRATION.bpm;
const BEAT_MS = 60_000 / BPM;

/** Taps the given deltas, one per beat, starting at the first beat. */
function tapAll(manager: CalibrationManager, deltas: readonly number[], outputLatencyMs = 0): void {
  deltas.forEach((delta, i) => {
    manager.tap(i * BEAT_MS + delta + outputLatencyMs);
  });
}

describe("CalibrationManager", () => {
  it("measures a tap against the nearest beat", () => {
    const m = new CalibrationManager(BPM, 0, 0);
    expect(m.beatMs).toBe(BEAT_MS);
    expect(m.nearestBeatAudioMs(BEAT_MS * 3 + 20)).toBe(BEAT_MS * 3);
    expect(m.nearestBeatAudioMs(BEAT_MS * 3 - 20)).toBe(BEAT_MS * 3);
    expect(m.tap(BEAT_MS * 3 + 24)).toEqual({ deltaMs: 24, accepted: true });
    expect(m.tap(BEAT_MS * 5 - 41)).toEqual({ deltaMs: -41, accepted: true });
  });

  it("counts the beats from the first beat of the test", () => {
    const m = new CalibrationManager(BPM, 5000, 0);
    expect(m.nearestBeatAudioMs(5000 + BEAT_MS * 2 + 10)).toBe(5000 + BEAT_MS * 2);
    expect(m.tap(5000 + BEAT_MS * 2 + 10).deltaMs).toBeCloseTo(10, 10);
  });

  it("takes the output latency off before measuring", () => {
    const m = new CalibrationManager(BPM, 0, 30);
    // The player heard the beat 30 ms after the clock reached it, so a press
    // 30 ms after the beat is exactly on time.
    expect(m.tap(BEAT_MS + 30).deltaMs).toBe(0);
    expect(m.tap(BEAT_MS * 2 + 55).deltaMs).toBe(25);
  });

  it("drops taps that are too far from any beat", () => {
    const m = new CalibrationManager(BPM, 0, 0);
    const far = m.tap(BEAT_MS + GUIDED_CALIBRATION.rejectBeyondMs + 5);
    expect(far.accepted).toBe(false);
    expect(m.tapCount).toBe(1);
    const result = m.result();
    expect(result.kept).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.enough).toBe(false);
    expect(result.suggestedInputOffsetMs).toBe(0);
  });

  it("suggests the median of the kept taps", () => {
    const m = new CalibrationManager(BPM, 0, 0);
    tapAll(m, [19, 20, 21, 20, 19, 21, 20, 20, 21, 19, 20, 21]);
    const result = m.result();
    expect(result.taps).toBe(12);
    expect(result.kept).toBe(12);
    expect(result.rejected).toBe(0);
    expect(result.medianMs).toBe(20);
    expect(result.suggestedInputOffsetMs).toBe(20);
    expect(result.enough).toBe(true);
    expect(result.spreadMs).toBe(1);
  });

  it("rejects outliers beyond 2.5 median absolute deviations", () => {
    const m = new CalibrationManager(BPM, 0, 0);
    tapAll(m, [16, 18, 20, 20, 22, 24, 150]);
    const result = m.result();
    expect(result.taps).toBe(7);
    expect(result.kept).toBe(6);
    expect(result.rejected).toBe(1);
    expect(result.medianMs).toBe(20);
    expect(result.enough).toBe(false);
  });

  it("keeps every tap when the player is perfectly steady", () => {
    const m = new CalibrationManager(BPM, 0, 0);
    tapAll(m, new Array(12).fill(-35));
    const result = m.result();
    expect(result.kept).toBe(12);
    expect(result.spreadMs).toBe(0);
    expect(result.medianMs).toBe(-35);
    expect(result.suggestedInputOffsetMs).toBe(-35);
    expect(result.enough).toBe(true);
  });

  it("rounds the suggestion to whole milliseconds", () => {
    const m = new CalibrationManager(BPM, 0, 0);
    tapAll(m, [12.4, 12.6, 12.4, 12.6, 12.4, 12.6, 12.4, 12.6, 12.4, 12.6, 12.4, 12.6]);
    expect(m.result().suggestedInputOffsetMs).toBe(13);
  });

  it("stops asking for taps at the maximum", () => {
    const m = new CalibrationManager(BPM, 0, 0);
    expect(m.full).toBe(false);
    tapAll(m, new Array(GUIDED_CALIBRATION.maxTaps).fill(5));
    expect(m.full).toBe(true);
    expect(m.result().kept).toBe(GUIDED_CALIBRATION.maxTaps);
  });

  it("clears every tap on reset", () => {
    const m = new CalibrationManager(BPM, 0, 0);
    tapAll(m, [10, 12, 14]);
    m.tap(BEAT_MS * 4 + 400);
    expect(m.tapCount).toBe(4);
    m.reset();
    expect(m.tapCount).toBe(0);
    expect(m.result()).toEqual({
      taps: 0,
      kept: 0,
      rejected: 0,
      medianMs: 0,
      spreadMs: 0,
      suggestedInputOffsetMs: 0,
      enough: false,
    });
  });

  it("reports the marker phase inside the beat with the display correction", () => {
    const m = new CalibrationManager(BPM, 1000, 20);
    expect(m.markerPhase(1020, 0, 0)).toBeCloseTo(0, 10);
    expect(m.markerPhase(1020 + BEAT_MS / 4, 0, 0)).toBeCloseTo(0.25, 10);
    expect(m.markerPhase(1020 - BEAT_MS / 4, 0, 0)).toBeCloseTo(0.75, 10);
    expect(m.markerPhase(1020, 30, 30)).toBeCloseTo(0, 10);
    expect(m.markerPhase(1020, 0, BEAT_MS / 2)).toBeCloseTo(0.5, 10);
  });
});
