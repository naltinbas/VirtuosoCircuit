import { AUDIO } from "../app/Config";
import { seededRandom } from "../utils/MathUtils";
import type { AudioGraph } from "./AudioEngine";

export type SfxName =
  | "hit-radiant"
  | "hit-precise"
  | "hit-good"
  | "hit-faint"
  | "miss"
  | "hold-tick"
  | "menu-move"
  | "menu-select"
  | "menu-back"
  | "pause"
  | "resume"
  | "countdown-tick"
  | "countdown-go"
  | "phrase"
  | "surge-start"
  | "surge-end"
  | "fail"
  | "complete"
  | "metronome-strong"
  | "metronome-weak"
  | "calibration-tone";

/** Exponential ramps cannot reach zero, so silence is this instead. */
const FLOOR = 0.0001;
const NOISE_SECONDS = 0.5;
const NOISE_SEED = 0x1d0d;

const NOOP = (): void => undefined;

interface ToneSpec {
  type?: OscillatorType;
  freq: number;
  /** Sweeps the pitch to this value over `sweepSec` when given. */
  freqEnd?: number;
  sweepSec?: number;
  gain: number;
  attack?: number;
  decay: number;
  delay?: number;
  filter?: { type: BiquadFilterType; freq: number; freqEnd?: number };
}

interface NoiseSpec {
  highpass: number;
  gain: number;
  decay: number;
  delay?: number;
}

interface Cluster {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  /** Sources still to report ended. The cluster is torn down when it hits zero. */
  pending: number;
  endSec: number;
  stopped: boolean;
}

/**
 * Interface sounds, all synthesized. Nothing is loaded or fetched.
 * playAt() schedules on the audio clock and returns a cancel, which is how the
 * countdown drops its remaining ticks when the player pauses.
 */
export class SoundEffects {
  private readonly live: Cluster[] = [];
  private noise: AudioBuffer | null = null;
  private cachedCtx: AudioContext | null = null;

  constructor(private readonly graph: AudioGraph) {}

  get liveCount(): number {
    return this.live.length;
  }

  play(name: SfxName): void {
    this.playAt(name, this.graph.nowMs());
  }

  playAt(name: SfxName, atAudioMs: number): () => void {
    const ctx = this.graph.ctx;
    const dest = this.graph.sfx;
    if (!ctx || !dest) return NOOP;
    if (this.cachedCtx !== ctx) {
      this.cachedCtx = ctx;
      this.noise = null;
      this.live.length = 0;
    }
    const now = this.graph.nowMs() / 1000;
    const atSec = Math.max(now, atAudioMs / 1000);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(dest);
    const cluster: Cluster = { gain, sources: [], pending: 0, endSec: atSec, stopped: false };
    this.render(name, cluster, ctx, atSec);
    cluster.pending = cluster.sources.length;
    for (const source of cluster.sources) {
      this.graph.addVoice();
      source.onended = () => {
        cluster.pending--;
        if (cluster.pending <= 0) this.finish(cluster);
      };
    }
    this.reap(now);
    this.live.push(cluster);
    return () => this.cancel(cluster);
  }

  stopAll(fadeMs: number = AUDIO.voiceFadeMs): void {
    const ctx = this.graph.ctx;
    if (!ctx) {
      this.live.length = 0;
      return;
    }
    const now = this.graph.nowMs() / 1000;
    const fade = Math.max(0.005, fadeMs / 1000);
    for (const cluster of [...this.live]) {
      const param = cluster.gain.gain;
      const level = Math.max(param.value, FLOOR);
      param.cancelScheduledValues(now);
      param.setValueAtTime(level, now);
      param.exponentialRampToValueAtTime(FLOOR, now + fade);
      for (const source of cluster.sources) source.stop(now + fade);
      cluster.endSec = now + fade;
    }
  }

  private cancel(cluster: Cluster): void {
    if (cluster.stopped) return;
    const now = this.graph.nowMs() / 1000;
    const param = cluster.gain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(FLOOR, now);
    for (const source of cluster.sources) source.stop(now);
    this.finish(cluster);
  }

  private finish(cluster: Cluster): void {
    if (cluster.stopped) return;
    cluster.stopped = true;
    const i = this.live.indexOf(cluster);
    if (i >= 0) this.live.splice(i, 1);
    for (let n = 0; n < cluster.sources.length; n++) this.graph.releaseVoice();
    cluster.gain.disconnect();
  }

  /** Safety net for browsers that do not deliver an ended event for every node. */
  private reap(now: number): void {
    for (const cluster of [...this.live]) {
      if (cluster.endSec + 0.25 < now) this.finish(cluster);
    }
  }

  private render(name: SfxName, c: Cluster, ctx: AudioContext, at: number): void {
    switch (name) {
      case "hit-radiant":
        this.tone(c, ctx, at, { freq: 1318, gain: 0.22, decay: 0.18 });
        this.tone(c, ctx, at, { freq: 1976, gain: 0.11, decay: 0.14, delay: 0.02 });
        return;
      case "hit-precise":
        this.tone(c, ctx, at, { freq: 1046, gain: 0.2, decay: 0.13 });
        return;
      case "hit-good":
        this.tone(c, ctx, at, { freq: 784, gain: 0.18, decay: 0.11 });
        return;
      case "hit-faint":
        this.tone(c, ctx, at, { freq: 587, gain: 0.14, decay: 0.09 });
        return;
      case "miss":
        this.tone(c, ctx, at, {
          type: "square",
          freq: 165,
          freqEnd: 92,
          sweepSec: 0.13,
          gain: 0.16,
          decay: 0.24,
          filter: { type: "lowpass", freq: 900, freqEnd: 400 },
        });
        this.noiseBurst(c, ctx, at, { highpass: 900, gain: 0.05, decay: 0.06 });
        return;
      case "hold-tick":
        this.tone(c, ctx, at, { freq: 1568, gain: 0.05, decay: 0.04 });
        return;
      case "menu-move":
        this.tone(c, ctx, at, { type: "triangle", freq: 660, gain: 0.1, decay: 0.06 });
        return;
      case "menu-select":
        this.tone(c, ctx, at, { type: "triangle", freq: 880, freqEnd: 1320, sweepSec: 0.08, gain: 0.12, decay: 0.17 });
        return;
      case "menu-back":
        this.tone(c, ctx, at, { type: "triangle", freq: 660, freqEnd: 440, sweepSec: 0.08, gain: 0.1, decay: 0.15 });
        return;
      case "pause":
        this.tone(c, ctx, at, { freq: 880, gain: 0.14, decay: 0.1 });
        this.tone(c, ctx, at, { freq: 587, gain: 0.14, decay: 0.18, delay: 0.09 });
        return;
      case "resume":
        this.tone(c, ctx, at, { freq: 587, gain: 0.14, decay: 0.1 });
        this.tone(c, ctx, at, { freq: 880, gain: 0.14, decay: 0.18, delay: 0.09 });
        return;
      case "countdown-tick":
        this.tone(c, ctx, at, { freq: 880, gain: 0.17, decay: 0.11 });
        return;
      case "countdown-go":
        this.tone(c, ctx, at, { freq: 1318, gain: 0.2, decay: 0.32 });
        this.tone(c, ctx, at, { freq: 659, gain: 0.12, decay: 0.32 });
        return;
      case "phrase":
        this.tone(c, ctx, at, { freq: 784, gain: 0.13, decay: 0.3 });
        this.tone(c, ctx, at, { freq: 988, gain: 0.13, decay: 0.3, delay: 0.07 });
        this.tone(c, ctx, at, { freq: 1318, gain: 0.13, decay: 0.34, delay: 0.14 });
        return;
      case "surge-start":
        this.tone(c, ctx, at, {
          type: "sawtooth",
          freq: 220,
          freqEnd: 880,
          sweepSec: 0.35,
          gain: 0.12,
          attack: 0.02,
          decay: 0.45,
          filter: { type: "lowpass", freq: 900, freqEnd: 4200 },
        });
        return;
      case "surge-end":
        this.tone(c, ctx, at, {
          type: "sawtooth",
          freq: 660,
          freqEnd: 220,
          sweepSec: 0.3,
          gain: 0.1,
          decay: 0.36,
          filter: { type: "lowpass", freq: 3000, freqEnd: 600 },
        });
        return;
      case "fail":
        this.tone(c, ctx, at, {
          type: "sawtooth",
          freq: 330,
          freqEnd: 82,
          sweepSec: 0.8,
          gain: 0.18,
          decay: 1,
          filter: { type: "lowpass", freq: 1200, freqEnd: 260 },
        });
        return;
      case "complete":
        this.tone(c, ctx, at, { freq: 523, gain: 0.12, decay: 0.9 });
        this.tone(c, ctx, at, { freq: 659, gain: 0.12, decay: 0.9, delay: 0.06 });
        this.tone(c, ctx, at, { freq: 784, gain: 0.12, decay: 0.9, delay: 0.12 });
        this.tone(c, ctx, at, { freq: 1046, gain: 0.1, decay: 0.95, delay: 0.18 });
        return;
      case "metronome-strong":
        this.tone(c, ctx, at, { type: "square", freq: 2000, gain: 0.12, decay: 0.035 });
        return;
      case "metronome-weak":
        this.tone(c, ctx, at, { type: "square", freq: 1400, gain: 0.07, decay: 0.03 });
        return;
      case "calibration-tone":
        this.tone(c, ctx, at, { freq: 1000, gain: 0.2, decay: 0.16 });
        return;
    }
  }

  private tone(c: Cluster, ctx: AudioContext, at: number, spec: ToneSpec): void {
    const start = at + (spec.delay ?? 0);
    const attack = spec.attack ?? 0.004;
    const osc = ctx.createOscillator();
    osc.type = spec.type ?? "sine";
    osc.frequency.setValueAtTime(spec.freq, start);
    if (spec.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(spec.freqEnd, 1), start + (spec.sweepSec ?? spec.decay));
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(FLOOR, start);
    gain.gain.linearRampToValueAtTime(spec.gain, start + attack);
    gain.gain.exponentialRampToValueAtTime(FLOOR, start + attack + spec.decay);
    let tail: AudioNode = gain;
    if (spec.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = spec.filter.type;
      filter.frequency.setValueAtTime(spec.filter.freq, start);
      if (spec.filter.freqEnd !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(spec.filter.freqEnd, 1),
          start + (spec.sweepSec ?? spec.decay),
        );
      }
      gain.connect(filter);
      tail = filter;
    }
    osc.connect(gain);
    tail.connect(c.gain);
    const end = start + attack + spec.decay + 0.02;
    osc.start(start);
    osc.stop(end);
    c.sources.push(osc);
    c.endSec = Math.max(c.endSec, end);
  }

  private noiseBurst(c: Cluster, ctx: AudioContext, at: number, spec: NoiseSpec): void {
    const start = at + (spec.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = spec.highpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(spec.gain, start);
    gain.gain.exponentialRampToValueAtTime(FLOOR, start + spec.decay);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(c.gain);
    const end = start + spec.decay + 0.02;
    source.start(start);
    source.stop(end);
    c.sources.push(source);
    c.endSec = Math.max(c.endSec, end);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const random = seededRandom(NOISE_SEED);
    for (let i = 0; i < length; i++) data[i] = random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }
}
