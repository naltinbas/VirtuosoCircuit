import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioClock } from "../src/audio/AudioClock";
import { AudioEngine } from "../src/audio/AudioEngine";
import { AUDIO } from "../src/app/Config";
import { frameTimeAverage } from "../src/utils/TimeUtils";

/** Just enough of a GainNode for the engine's graph and gain ramps. */
function fakeGain(): GainNode {
  return {
    gain: {
      value: 1,
      cancelScheduledValues: () => undefined,
      setTargetAtTime: () => undefined,
    },
    connect: () => undefined,
    disconnect: () => undefined,
  } as unknown as GainNode;
}

function fakeParam(): AudioParam {
  return { value: 0 } as unknown as AudioParam;
}

interface FakeContext {
  ctx: AudioContext;
  setCurrentTimeMs: (ms: number) => void;
  setState: (state: AudioContextState) => void;
}

/** A context whose clock and state the test drives by hand. resume() never lands. */
function fakeContext(startMs: number, state: AudioContextState = "running"): FakeContext {
  const listeners: (() => void)[] = [];
  const ctx = {
    currentTime: startMs / 1000,
    state,
    baseLatency: 0.01,
    destination: {} as AudioDestinationNode,
    createGain: fakeGain,
    createDynamicsCompressor: () => ({
      threshold: fakeParam(),
      knee: fakeParam(),
      ratio: fakeParam(),
      attack: fakeParam(),
      release: fakeParam(),
      connect: () => undefined,
    }),
    resume: () => Promise.resolve(),
    addEventListener: (_type: string, fn: () => void) => listeners.push(fn),
    removeEventListener: () => undefined,
  };
  return {
    ctx: ctx as unknown as AudioContext,
    setCurrentTimeMs: (ms: number) => {
      ctx.currentTime = ms / 1000;
    },
    setState: (next: AudioContextState) => {
      ctx.state = next;
      for (const fn of [...listeners]) fn();
    },
  };
}

describe("AudioEngine silent mode", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("keeps the clock on one timeline when the context stops running", async () => {
    vi.useFakeTimers();
    // The page has been up for 12 s before the first gesture builds the context.
    let perfMs = 12_000;
    const fake = fakeContext(0);
    const engine = new AudioEngine({ createContext: () => fake.ctx, now: () => perfMs });
    expect(await engine.unlock()).toBe(true);

    perfMs = 13_000;
    fake.setCurrentTimeMs(1000);
    const clock = new AudioClock(() => engine.nowMs());
    clock.start(0);
    expect(clock.songMs()).toBe(0);

    // The device changes under the context: it leaves "running" and never comes
    // back, so unlock() times out and the engine gives up on audio.
    fake.setState("suspended");
    const unlocking = engine.unlock();
    perfMs += AUDIO.unlockTimeoutMs;
    await vi.advanceTimersByTimeAsync(AUDIO.unlockTimeoutMs);
    expect(await unlocking).toBe(false);
    expect(engine.available).toBe(false);

    // The context clock stalled at 1000 ms while performance.now() ran on, so
    // the song time may only move by the real time that passed.
    expect(engine.nowMs()).toBe(1000);
    expect(clock.songMs()).toBe(0);
    perfMs += 200;
    expect(clock.songMs()).toBe(200);
    vi.useRealTimers();
  });

  it("maps input timestamps onto the same timeline as nowMs while silent", async () => {
    vi.useFakeTimers();
    let perfMs = 8000;
    const fake = fakeContext(0);
    const engine = new AudioEngine({ createContext: () => fake.ctx, now: () => perfMs });
    await engine.unlock();
    perfMs = 9000;
    fake.setCurrentTimeMs(1000);
    fake.setState("interrupted" as AudioContextState);
    const unlocking = engine.unlock();
    perfMs += AUDIO.unlockTimeoutMs;
    await vi.advanceTimersByTimeAsync(AUDIO.unlockTimeoutMs);
    await unlocking;

    expect(engine.perfToAudioMs(perfMs)).toBe(engine.nowMs());
    expect(engine.perfToAudioMs(perfMs + 30)).toBe(engine.nowMs() + 30);
    vi.useRealTimers();
  });

  it("runs on performance time when no context is ever built", async () => {
    let perfMs = 4000;
    const engine = new AudioEngine({ createContext: () => null, now: () => perfMs });
    expect(await engine.unlock()).toBe(false);
    expect(engine.nowMs()).toBe(4000);
    perfMs = 4500;
    expect(engine.nowMs()).toBe(4500);
    expect(engine.perfToAudioMs(perfMs)).toBe(4500);
  });
});

describe("frame timing", () => {
  it("reports the wall clock time of the last frame sample", () => {
    let perfMs = 1000;
    const engine = new AudioEngine({ createContext: () => null, now: () => perfMs });
    engine.sampleClock();
    const first = engine.sampledPerfMs;
    perfMs = 1157;
    engine.sampleClock();
    // The gap between two frames is real time, whatever the offset does.
    expect(engine.sampledPerfMs - first).toBe(157);
  });

  it("averages frame times past the clamp the visual effects use", () => {
    let averageMs = 16;
    for (let i = 0; i < 300; i++) {
      averageMs = frameTimeAverage(averageMs, 157, AUDIO.maxFrameSampleMs);
    }
    expect(averageMs).toBeCloseTo(157, 3);
    expect(averageMs).toBeGreaterThan(AUDIO.maxFrameDeltaMs);
    expect(1000 / averageMs).toBeLessThan(7);
  });

  it("drops a stretch where the page was not rendering", () => {
    expect(frameTimeAverage(16, 5000, AUDIO.maxFrameSampleMs)).toBe(16);
    expect(frameTimeAverage(16, 0, AUDIO.maxFrameSampleMs)).toBe(16);
    expect(frameTimeAverage(16, -20, AUDIO.maxFrameSampleMs)).toBe(16);
    expect(frameTimeAverage(16, 26, AUDIO.maxFrameSampleMs)).toBeCloseTo(17, 6);
  });
});
