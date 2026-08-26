import { describe, expect, it } from "vitest";
import { AudioClock } from "../src/audio/AudioClock";
import type { SfxName } from "../src/audio/SoundEffects";
import type { Synth } from "../src/audio/SynthInstruments";
import { type MetronomeSink, TrackTransport } from "../src/audio/TrackTransport";
import type { BeatMark, ScheduledNote, TrackChart } from "../src/charts/ChartTypes";

interface PlayCall {
  timeMs: number;
  atSec: number;
  durSec: number;
  offsetSec: number;
}

class FakeSynth implements Synth {
  readonly calls: PlayCall[] = [];
  readonly fades: number[] = [];
  voiceCount = 0;

  play(note: ScheduledNote, atSec: number, durSec: number, offsetSec = 0): void {
    this.calls.push({ timeMs: note.timeMs, atSec, durSec, offsetSec });
  }

  stopAll(fadeMs: number): void {
    this.fades.push(fadeMs);
  }
}

class FakeSfx implements MetronomeSink {
  readonly played: { name: SfxName; atAudioMs: number }[] = [];
  cancels = 0;

  playAt(name: SfxName, atAudioMs: number): () => void {
    this.played.push({ name, atAudioMs });
    return () => {
      this.cancels++;
    };
  }
}

function note(timeMs: number, durationMs = 100): ScheduledNote {
  return {
    timeMs,
    durationMs,
    midi: 60,
    velocity: 0.8,
    instrument: "piano",
    partId: "melody",
    gain: 1,
    pan: 0,
  };
}

function beat(timeMs: number, index: number, beatsPerBar = 4): BeatMark {
  return {
    beat: index,
    timeMs,
    measure: Math.floor(index / beatsPerBar) + 1,
    beatInMeasure: index % beatsPerBar,
    isDownbeat: index % beatsPerBar === 0,
  };
}

function makeTrack(music: ScheduledNote[], beatGrid: BeatMark[] = []): TrackChart {
  return {
    metadata: {
      id: "fixture",
      order: 1,
      title: "Fixture",
      composer: "Test Composer",
      composerShort: "T. Composer",
      movementOrExcerpt: "Whole",
      bpm: 120,
      timeSignature: [4, 4],
      durationMs: 10_000,
      difficulty: "novice",
      arrangementStyle: "Test tone",
      arrangementCredit: "Tests",
      scoreSourceCredit: "Tests",
      licenseNotes: "Test data",
    },
    tempoMap: [{ beat: 0, bpm: 120 }],
    sections: [],
    beatGrid,
    music,
    charts: {},
  };
}

interface Rig {
  clock: AudioClock;
  synth: FakeSynth;
  sfx: FakeSfx;
  transport: TrackTransport;
  set: (audioMs: number) => void;
  advance: (ms: number) => void;
}

function rig(music: ScheduledNote[], beatGrid: BeatMark[] = [], startAudioMs = 1000): Rig {
  let audio = startAudioMs;
  const clock = new AudioClock(() => audio);
  const synth = new FakeSynth();
  const sfx = new FakeSfx();
  const transport = new TrackTransport({ clock, synth, audioNowMs: () => audio, sfx });
  transport.setTrack(makeTrack(music, beatGrid));
  // setTrack silences whatever was playing; the tests start from a clean sheet.
  synth.fades.length = 0;
  return {
    clock,
    synth,
    sfx,
    transport,
    set: (ms: number) => {
      audio = ms;
    },
    advance: (ms: number) => {
      audio += ms;
    },
  };
}

describe("TrackTransport", () => {
  it("schedules every note inside the lookahead horizon", () => {
    const r = rig([note(0), note(100), note(200), note(201), note(5000)]);
    r.clock.start(0);
    r.transport.tick();
    expect(r.synth.calls.map((c) => c.timeMs)).toEqual([0, 100, 200]);
    expect(r.synth.calls.map((c) => c.atSec)).toEqual([1, 1.1, 1.2]);
    expect(r.synth.calls[0].durSec).toBeCloseTo(0.1, 10);
    expect(r.transport.scheduledCount).toBe(3);
  });

  it("advances the cursor so a note is never scheduled twice", () => {
    const r = rig([note(0), note(100), note(201)]);
    r.clock.start(0);
    r.transport.tick();
    r.transport.tick();
    expect(r.synth.calls).toHaveLength(2);
    r.advance(150);
    r.transport.tick();
    expect(r.synth.calls.map((c) => c.timeMs)).toEqual([0, 100, 201]);
    expect(r.synth.calls[2].atSec).toBeCloseTo(1.201, 10);
  });

  it("drops notes whose audio time is already too far past", () => {
    const r = rig([note(0), note(300), note(380)]);
    r.clock.start(0);
    r.set(1400);
    r.transport.tick();
    expect(r.synth.calls.map((c) => c.timeMs)).toEqual([380]);
    // Started at the current audio time rather than 20 ms in the past.
    expect(r.synth.calls[0].atSec).toBe(1.4);
    expect(r.transport.cursorIndex).toBe(3);
  });

  it("scales the horizon and the durations by the clock rate", () => {
    const r = rig([note(0), note(100), note(150)]);
    r.clock.start(0);
    r.transport.setRate(0.5);
    expect(r.synth.calls.map((c) => c.timeMs)).toEqual([0, 100]);
    expect(r.synth.calls.map((c) => c.atSec)).toEqual([1, 1.2]);
    expect(r.synth.calls[0].durSec).toBeCloseTo(0.2, 10);
  });

  it("clamps the horizon to the loop end and reports the wrap once", () => {
    const r = rig([note(0), note(100), note(260), note(400)]);
    const loops: number[] = [];
    r.transport.on("loop", (payload) => loops.push(payload.songMs));
    r.transport.setLoop(0, 250);
    r.clock.start(0);
    r.transport.tick();
    expect(r.synth.calls.map((c) => c.timeMs)).toEqual([0, 100]);
    r.advance(100);
    r.transport.tick();
    expect(r.synth.calls.map((c) => c.timeMs)).toEqual([0, 100]);
    r.advance(200);
    r.transport.tick();
    r.transport.tick();
    expect(loops).toEqual([300]);
  });

  it("re-triggers a note that is still sounding at a seek target", () => {
    const r = rig([note(0, 4000), note(900, 100), note(3000, 100)]);
    r.clock.start(0);
    r.transport.tick();
    r.synth.calls.length = 0;
    r.set(2000);
    r.clock.seek(1000);
    r.transport.seek();
    expect(r.synth.fades.length).toBeGreaterThan(0);
    expect(r.synth.calls).toHaveLength(1);
    const call = r.synth.calls[0];
    expect(call.timeMs).toBe(0);
    expect(call.atSec).toBe(2);
    expect(call.durSec).toBeCloseTo(3, 10);
    expect(call.offsetSec).toBeCloseTo(1, 10);
    expect(r.transport.cursorIndex).toBe(2);
  });

  it("re-derives the cursor when seeking backwards", () => {
    const r = rig([note(0), note(1000), note(2000)]);
    r.clock.start(0);
    r.transport.tick();
    r.advance(1000);
    r.transport.tick();
    expect(r.synth.calls.map((c) => c.timeMs)).toEqual([0, 1000]);
    r.clock.seek(0);
    r.transport.seek();
    expect(r.transport.cursorIndex).toBe(1);
    expect(r.synth.calls.map((c) => c.timeMs)).toEqual([0, 1000, 0]);
    expect(r.synth.calls[2].atSec).toBe(2);
  });

  it("schedules nothing while the clock is paused", () => {
    const r = rig([note(0), note(100)]);
    r.clock.start(0);
    r.transport.pause();
    r.clock.pause();
    expect(r.synth.fades).toHaveLength(1);
    r.advance(500);
    r.transport.tick();
    expect(r.synth.calls).toHaveLength(0);
  });

  it("clicks the metronome on the beat grid and cancels pending clicks", () => {
    const r = rig([], [beat(0, 0), beat(150, 1), beat(300, 2), beat(600, 4)]);
    r.clock.start(0);
    r.transport.setMetronome(true);
    expect(r.sfx.played).toEqual([
      { name: "metronome-strong", atAudioMs: 1000 },
      { name: "metronome-weak", atAudioMs: 1150 },
    ]);
    r.advance(200);
    r.transport.tick();
    expect(r.sfx.played).toHaveLength(3);
    expect(r.sfx.played[2]).toEqual({ name: "metronome-weak", atAudioMs: 1300 });
    r.transport.setMetronome(false);
    expect(r.sfx.cancels).toBe(1);
  });

  it("starts and stops its scheduler timer", () => {
    const r = rig([note(0)]);
    r.clock.start(0);
    r.transport.start();
    expect(r.transport.ticking).toBe(true);
    r.transport.stop();
    expect(r.transport.ticking).toBe(false);
  });
});
