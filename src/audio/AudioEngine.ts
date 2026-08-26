import { AUDIO } from "../app/Config";
import { EventEmitter } from "../utils/EventEmitter";
import { clamp } from "../utils/MathUtils";
import { perfNowMs } from "../utils/TimeUtils";

/** The slice of the engine that the synth and the effects need. */
export interface AudioGraph {
  readonly ctx: AudioContext | null;
  readonly music: GainNode | null;
  readonly sfx: GainNode | null;
  /** Current audio time in ms. */
  nowMs(): number;
  addVoice(): void;
  releaseVoice(): void;
}

export type AudioEngineEvents = {
  /** The context changed state. Gameplay pauses when it stops running. */
  statechange: { state: AudioContextState; running: boolean };
  /** The engine gave up on audio for this session and went silent. */
  unavailable: { reason: string };
};

export interface Volumes {
  master: number;
  music: number;
  effects: number;
}

export interface AudioEngineOptions {
  /** Injected by tests. The default looks for the standard and prefixed constructors. */
  createContext?: () => AudioContext | null;
  /** Injected by tests. The default is performance.now(). */
  now?: () => number;
  volumes?: Volumes;
  muted?: boolean;
}

type AudioContextCtor = new () => AudioContext;

function findAudioContextCtor(): AudioContextCtor | null {
  const scope = globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function defaultCreateContext(): AudioContext | null {
  const Ctor = findAudioContextCtor();
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/** Gain changes ramp over this long so a slider drag does not click. */
const GAIN_RAMP_SEC = 0.02;

/**
 * Owns the AudioContext and is the only place in the game that reads
 * ctx.currentTime or performance.now(). Everything else receives times as
 * parameters.
 *
 * The audio and performance timelines are related by a single offset:
 * offsetMs = audioMs - perfMs, taken as the maximum of the last
 * AUDIO.clockSampleCount samples. The maximum is the least delayed estimate,
 * which is what an input timestamp should be mapped with. A sample that jumps
 * by more than AUDIO.clockResyncMs replaces the whole buffer, which is how the
 * engine recovers after the tab was suspended.
 */
export class AudioEngine implements AudioGraph {
  readonly events = new EventEmitter<AudioEngineEvents>();

  private readonly createContext: () => AudioContext | null;
  private readonly now: () => number;
  private readonly supported: boolean;

  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private silent = false;
  private silentShiftMs = 0;
  private unlockPromise: Promise<boolean> | null = null;

  private readonly offsets: number[] = [];
  private offsetCursor = 0;
  private offsetMs = 0;
  private lastSamplePerfMs = Number.NEGATIVE_INFINITY;

  private latencyMs = 0;
  private latencySupported = false;

  private voices = 0;
  private volumes: Volumes;
  private mutedFlag: boolean;

  constructor(options: AudioEngineOptions = {}) {
    this.createContext = options.createContext ?? defaultCreateContext;
    this.now = options.now ?? perfNowMs;
    this.supported = options.createContext !== undefined || findAudioContextCtor() !== null;
    this.volumes = { ...(options.volumes ?? AUDIO.defaultVolume) };
    this.mutedFlag = options.muted ?? false;
  }

  /** False once Web Audio is missing or the context refused to start. */
  get available(): boolean {
    return this.supported && !this.silent;
  }

  get unlocked(): boolean {
    const ctx = this.audioContext();
    return ctx !== null && ctx.state === "running";
  }

  get ctx(): AudioContext | null {
    return this.audioContext();
  }

  get master(): GainNode | null {
    return this.silent ? null : this.masterGain;
  }

  get music(): GainNode | null {
    return this.silent ? null : this.musicGain;
  }

  get sfx(): GainNode | null {
    return this.silent ? null : this.sfxGain;
  }

  get voiceCount(): number {
    return this.voices;
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  addVoice(): void {
    this.voices++;
  }

  releaseVoice(): void {
    if (this.voices > 0) this.voices--;
  }

  /**
   * Creates or resumes the context from a user gesture. Resolves false and
   * switches to silent mode for the session if the context is not running
   * within AUDIO.unlockTimeoutMs.
   */
  unlock(): Promise<boolean> {
    if (!this.available) return Promise.resolve(false);
    if (this.unlocked) return Promise.resolve(true);
    if (this.unlockPromise) return this.unlockPromise;
    const promise = this.doUnlock().finally(() => {
      this.unlockPromise = null;
    });
    this.unlockPromise = promise;
    return promise;
  }

  /**
   * Samples the audio and performance clocks and returns the audio time to use
   * for this frame. Input timestamps go through perfToAudioMs(), so the frame
   * and the presses inside it share one mapping.
   */
  sampleClock(): number {
    const perf = this.now();
    const ctx = this.audioContext();
    const audio = ctx ? ctx.currentTime * 1000 : perf + this.silentShiftMs;
    this.pushOffset(audio - perf);
    this.lastSamplePerfMs = perf;
    this.readOutputLatency();
    return perf + this.offsetMs;
  }

  nowMs(): number {
    this.sampleIfStale();
    const ctx = this.audioContext();
    return ctx ? ctx.currentTime * 1000 : this.now() + this.silentShiftMs;
  }

  perfToAudioMs(perfMs: number): number {
    this.sampleIfStale();
    return perfMs + this.offsetMs;
  }

  /** How far the sound the player hears lags the clock, in ms. */
  outputLatencyMs(): number {
    return this.latencyMs;
  }

  /** False when the browser does not report outputLatency and baseLatency stands in. */
  get outputLatencySupported(): boolean {
    return this.latencySupported;
  }

  setVolumes(volumes: Volumes): void {
    this.volumes = {
      master: clamp(volumes.master, 0, 1),
      music: clamp(volumes.music, 0, 1),
      effects: clamp(volumes.effects, 0, 1),
    };
    this.applyGains();
  }

  /** Muting drops the master gain to 0 and leaves the stored volumes alone. */
  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    this.applyGains();
  }

  private audioContext(): AudioContext | null {
    return this.silent ? null : this.context;
  }

  private async doUnlock(): Promise<boolean> {
    if (!this.context) this.buildGraph();
    const ctx = this.audioContext();
    if (!ctx) {
      this.goSilent("Web Audio is not available in this browser");
      return false;
    }
    if (ctx.state === "running") return true;
    try {
      void ctx.resume();
    } catch {
      // A resume() that throws still leaves the state watcher to time out.
    }
    const running = await this.waitForRunning(ctx);
    if (!running) this.goSilent("The browser did not start audio");
    return running;
  }

  private waitForRunning(ctx: AudioContext): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ctx.removeEventListener("statechange", onState);
        resolve(value);
      };
      const onState = (): void => {
        if (ctx.state === "running") finish(true);
      };
      const timer = setTimeout(() => finish(false), AUDIO.unlockTimeoutMs);
      ctx.addEventListener("statechange", onState);
      if (ctx.state === "running") finish(true);
    });
  }

  private buildGraph(): void {
    const ctx = this.createContext();
    if (!ctx) {
      this.goSilent("Web Audio is not available in this browser");
      return;
    }
    this.context = ctx;
    const master = ctx.createGain();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    // Dense chords stack a lot of oscillators; a gentle compressor on the way
    // out keeps them from clipping without audible pumping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    music.connect(master);
    sfx.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    this.masterGain = master;
    this.musicGain = music;
    this.sfxGain = sfx;
    this.applyGains();
    ctx.addEventListener("statechange", () => {
      this.events.emit("statechange", { state: ctx.state, running: ctx.state === "running" });
    });
  }

  private goSilent(reason: string): void {
    if (this.silent) return;
    // The silent clock continues the timeline the context was on, so a clock
    // anchored to audio time does not jump by the page-to-context gap. With no
    // context ever built the shift is 0 and nowMs() is performance.now().
    this.silentShiftMs = this.context ? this.context.currentTime * 1000 - this.now() : 0;
    this.silent = true;
    this.offsets.length = 0;
    this.offsetCursor = 0;
    this.offsetMs = this.silentShiftMs;
    this.latencyMs = 0;
    this.latencySupported = false;
    this.voices = 0;
    this.events.emit("unavailable", { reason });
  }

  private applyGains(): void {
    const ctx = this.audioContext();
    if (!ctx) return;
    const at = ctx.currentTime;
    this.ramp(this.masterGain, this.mutedFlag ? 0 : this.volumes.master, at);
    this.ramp(this.musicGain, this.volumes.music, at);
    this.ramp(this.sfxGain, this.volumes.effects, at);
  }

  private ramp(node: GainNode | null, value: number, at: number): void {
    if (!node) return;
    node.gain.cancelScheduledValues(at);
    node.gain.setTargetAtTime(value, at, GAIN_RAMP_SEC);
  }

  private sampleIfStale(): void {
    if (this.now() - this.lastSamplePerfMs > AUDIO.clockSampleMaxAgeMs) this.sampleClock();
  }

  private pushOffset(sample: number): void {
    if (this.offsets.length > 0 && Math.abs(sample - this.offsetMs) > AUDIO.clockResyncMs) {
      this.offsets.length = 0;
      this.offsetCursor = 0;
    }
    if (this.offsets.length < AUDIO.clockSampleCount) {
      this.offsets.push(sample);
    } else {
      this.offsets[this.offsetCursor] = sample;
      this.offsetCursor = (this.offsetCursor + 1) % AUDIO.clockSampleCount;
    }
    let max = this.offsets[0];
    for (let i = 1; i < this.offsets.length; i++) {
      if (this.offsets[i] > max) max = this.offsets[i];
    }
    this.offsetMs = max;
  }

  private readOutputLatency(): void {
    const ctx = this.audioContext();
    if (!ctx) {
      this.latencyMs = 0;
      this.latencySupported = false;
      return;
    }
    const reported = ctx.outputLatency;
    // A hard zero is what browsers without the property report once it is read
    // through an optional chain, so treat it as unsupported and fall back.
    if (typeof reported === "number" && Number.isFinite(reported) && reported > 0) {
      this.latencyMs = reported * 1000;
      this.latencySupported = true;
      return;
    }
    const base = ctx.baseLatency;
    this.latencyMs = typeof base === "number" && Number.isFinite(base) ? base * 1000 : 0;
    this.latencySupported = false;
  }
}
