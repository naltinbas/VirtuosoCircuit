import { describe, expect, it } from "vitest";
import { AudioClock } from "../src/audio/AudioClock";

/** A settable audio clock so the arithmetic can be checked exactly. */
function fakeSource(startMs: number): { now: () => number; set: (ms: number) => void; advance: (ms: number) => void } {
  let value = startMs;
  return {
    now: () => value,
    set: (ms: number) => {
      value = ms;
    },
    advance: (ms: number) => {
      value += ms;
    },
  };
}

describe("AudioClock", () => {
  it("starts paused at its initial song time", () => {
    const t = fakeSource(1000);
    const clock = new AudioClock(t.now, -3000);
    expect(clock.running).toBe(false);
    expect(clock.songMs()).toBe(-3000);
    expect(clock.pausedSongMs).toBe(-3000);
    t.advance(5000);
    expect(clock.songMs()).toBe(-3000);
  });

  it("runs song time forward from the anchor pair", () => {
    const t = fakeSource(1000);
    const clock = new AudioClock(t.now);
    clock.start(-3000);
    expect(clock.songMs()).toBe(-3000);
    t.advance(1000);
    expect(clock.songMs()).toBe(-2000);
    t.advance(3000);
    expect(clock.songMs()).toBe(1000);
  });

  it("maps between audio time and song time in both directions", () => {
    const t = fakeSource(1000);
    const clock = new AudioClock(t.now);
    clock.start(-3000);
    expect(clock.audioMsAtSongMs(0)).toBe(4000);
    expect(clock.audioMsAtSongMs(-3000)).toBe(1000);
    expect(clock.songMsAtAudioMs(4000)).toBe(0);
    expect(clock.songMsAtAudioMs(1500)).toBe(-2500);
  });

  it("loses no song time across a pause and resume", () => {
    const t = fakeSource(1000);
    const clock = new AudioClock(t.now);
    clock.start(0);
    t.advance(500);
    clock.pause();
    expect(clock.running).toBe(false);
    expect(clock.pausedSongMs).toBe(500);
    t.advance(60_000);
    expect(clock.songMs()).toBe(500);
    expect(clock.songMsAtAudioMs(999_999)).toBe(500);
    clock.resume();
    expect(clock.running).toBe(true);
    expect(clock.songMs()).toBe(500);
    t.advance(100);
    expect(clock.songMs()).toBe(600);
  });

  it("keeps repeated pause and resume cycles drift free", () => {
    const t = fakeSource(0);
    const clock = new AudioClock(t.now);
    clock.start(0);
    for (let i = 0; i < 20; i++) {
      t.advance(250);
      clock.pause();
      t.advance(3000);
      clock.resume();
    }
    expect(clock.songMs()).toBe(20 * 250);
  });

  it("seeks while paused without resuming", () => {
    const t = fakeSource(1000);
    const clock = new AudioClock(t.now);
    clock.start(0);
    t.advance(400);
    clock.pause();
    clock.seek(12_000);
    expect(clock.running).toBe(false);
    expect(clock.pausedSongMs).toBe(12_000);
    expect(clock.songMs()).toBe(12_000);
    t.advance(5000);
    expect(clock.songMs()).toBe(12_000);
    clock.resume();
    t.advance(100);
    expect(clock.songMs()).toBe(12_100);
  });

  it("seeks while running by re-anchoring", () => {
    const t = fakeSource(1000);
    const clock = new AudioClock(t.now);
    clock.start(0);
    t.advance(500);
    clock.seek(10_000);
    expect(clock.running).toBe(true);
    expect(clock.songMs()).toBe(10_000);
    expect(clock.audioMsAtSongMs(10_000)).toBe(1500);
    t.advance(100);
    expect(clock.songMs()).toBe(10_100);
  });

  it("scales song time and the inverse mapping by the rate", () => {
    const t = fakeSource(1000);
    const clock = new AudioClock(t.now);
    clock.start(0);
    clock.setRate(0.5);
    expect(clock.rate).toBe(0.5);
    t.advance(1000);
    expect(clock.songMs()).toBe(500);
    expect(clock.audioMsAtSongMs(1000)).toBe(3000);
    expect(clock.songMsAtAudioMs(3000)).toBe(1000);
  });

  it("keeps the current position when the rate changes", () => {
    const t = fakeSource(0);
    const clock = new AudioClock(t.now);
    clock.start(0);
    t.advance(1000);
    expect(clock.songMs()).toBe(1000);
    clock.setRate(0.5);
    expect(clock.songMs()).toBe(1000);
    t.advance(1000);
    expect(clock.songMs()).toBe(1500);
    clock.pause();
    clock.setRate(1);
    expect(clock.pausedSongMs).toBe(1500);
    expect(clock.running).toBe(false);
  });

  it("clamps the rate to the guarded range", () => {
    const t = fakeSource(0);
    const clock = new AudioClock(t.now);
    clock.setRate(0);
    expect(clock.rate).toBe(0.125);
    clock.setRate(99);
    expect(clock.rate).toBe(2);
  });
});
