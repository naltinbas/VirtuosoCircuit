import { AUDIO } from "../app/Config";
import { DRUM } from "../charts/ChartTypes";
import type { InstrumentId, ScheduledNote } from "../charts/ChartTypes";
import { clamp, seededRandom } from "../utils/MathUtils";
import type { AudioGraph } from "./AudioEngine";

/** What the transport needs from a synth. Tests pass a recording stub. */
export interface Synth {
  play(note: ScheduledNote, atSec: number, durSec: number, offsetSec?: number): void;
  stopAll(fadeMs: number): void;
  readonly voiceCount: number;
}

/** Exponential ramps cannot reach zero, so silence is this instead. */
const FLOOR = 0.0001;

/** Two seconds of noise, generated once and reused by every percussion voice. */
const NOISE_SECONDS = 2;
const NOISE_SEED = 0x5eed;

interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

interface BuiltVoice {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  endSec: number;
}

interface Voice {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  startSec: number;
  endSec: number;
  retired: boolean;
}

type DrumName = keyof typeof DRUM;

const DRUM_BY_MIDI = new Map<number, DrumName>(
  (Object.entries(DRUM) as [DrumName, number][]).map(([name, midi]) => [midi, name]),
);

/** Per instrument output trim so the mix stays balanced without a mastering stage. */
const TRIM: Record<InstrumentId, number> = {
  piano: 0.3,
  harpsichord: 0.24,
  strings: 0.14,
  organ: 0.1,
  bass: 0.34,
  pluck: 0.3,
  bell: 0.22,
  percussion: 0.5,
};

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Envelope level at `t` seconds after the note started, as a fraction of the peak. */
function envelopeLevel(env: Envelope, t: number): number {
  if (t <= 0) return 0;
  if (t < env.attack) return env.attack > 0 ? t / env.attack : 1;
  const intoDecay = t - env.attack;
  if (intoDecay < env.decay) return 1 - (1 - env.sustain) * (intoDecay / env.decay);
  return env.sustain;
}

/**
 * Schedules an ADSR on `param`. `offsetSec` starts the note part way through
 * its envelope, which is how a note that is already sounding is picked up again
 * after a seek or a resume. Returns the time the voice falls silent.
 */
function scheduleEnvelope(
  param: AudioParam,
  env: Envelope,
  peak: number,
  atSec: number,
  holdSec: number,
  offsetSec: number,
): number {
  const releaseAt = atSec + Math.max(0.004, holdSec);
  let cursor = offsetSec;
  let time = atSec;
  param.cancelScheduledValues(atSec);
  param.setValueAtTime(Math.max(peak * envelopeLevel(env, cursor), FLOOR), time);
  if (cursor < env.attack) {
    const attackEnd = time + (env.attack - cursor);
    if (attackEnd < releaseAt) {
      param.linearRampToValueAtTime(Math.max(peak, FLOOR), attackEnd);
      cursor = env.attack;
      time = attackEnd;
    } else {
      // The note ends before the attack finishes: ramp to the level it reaches.
      const reached = peak * envelopeLevel(env, cursor + (releaseAt - time));
      param.linearRampToValueAtTime(Math.max(reached, FLOOR), releaseAt);
      cursor += releaseAt - time;
      time = releaseAt;
    }
  }
  const decayEnd = env.attack + env.decay;
  if (cursor < decayEnd) {
    const at = time + (decayEnd - cursor);
    if (at < releaseAt) {
      param.exponentialRampToValueAtTime(Math.max(peak * env.sustain, FLOOR), at);
      cursor = decayEnd;
      time = at;
    }
  }
  param.exponentialRampToValueAtTime(FLOOR, releaseAt + env.release);
  return releaseAt + env.release;
}

/** Exponential parameter sweep that can also start part way through. */
function sweep(param: AudioParam, from: number, to: number, atSec: number, spanSec: number, offsetSec: number): void {
  const t = spanSec > 0 ? clamp(offsetSec / spanSec, 0, 1) : 1;
  const start = from * Math.pow(to / from, t);
  param.setValueAtTime(start, atSec);
  if (t < 1) param.exponentialRampToValueAtTime(to, atSec + spanSec * (1 - t));
}

/**
 * Every instrument is built from oscillators, generated noise, envelopes and
 * filters. Nothing is loaded or fetched.
 */
export class SynthInstruments implements Synth {
  private readonly voices: Voice[] = [];
  private readonly partNodes = new Map<string, GainNode>();
  private noise: AudioBuffer | null = null;
  private cachedCtx: AudioContext | null = null;

  constructor(private readonly graph: AudioGraph) {}

  get voiceCount(): number {
    return this.voices.length;
  }

  play(note: ScheduledNote, atSec: number, durSec: number, offsetSec = 0): void {
    const ctx = this.graph.ctx;
    const dest = this.graph.music;
    if (!ctx || !dest) return;
    this.checkContext(ctx);
    const now = this.graph.nowMs() / 1000;
    this.reap(now);
    if (this.voices.length >= AUDIO.maxVoices) this.stealOldest(now);

    const out = this.partNode(ctx, dest, note);
    const peak = clamp(note.velocity, 0, 1) * TRIM[note.instrument];
    const built = this.build(ctx, out, note, peak, atSec, Math.max(0.01, durSec), Math.max(0, offsetSec));
    const voice: Voice = {
      gain: built.gain,
      sources: built.sources,
      startSec: atSec,
      endSec: built.endSec,
      retired: false,
    };
    for (const source of built.sources) {
      source.start(atSec);
      source.stop(built.endSec);
    }
    if (built.sources.length > 0) {
      built.sources[0].onended = () => {
        this.retire(voice);
        voice.gain.disconnect();
      };
    }
    this.voices.push(voice);
    this.graph.addVoice();
  }

  /**
   * Releases every voice handed to play(), including ones scheduled for a time
   * that has not arrived yet: their gain is cancelled back to silence and their
   * sources are stopped before they would have started.
   */
  stopAll(fadeMs: number = AUDIO.voiceFadeMs): void {
    const ctx = this.graph.ctx;
    if (!ctx) {
      for (const voice of [...this.voices]) this.retire(voice);
      return;
    }
    const now = this.graph.nowMs() / 1000;
    const fade = Math.max(0.005, fadeMs / 1000);
    for (const voice of [...this.voices]) {
      this.fadeOut(voice, now, fade);
      this.retire(voice);
    }
  }

  private build(
    ctx: AudioContext,
    dest: AudioNode,
    note: ScheduledNote,
    peak: number,
    atSec: number,
    durSec: number,
    offsetSec: number,
  ): BuiltVoice {
    if (note.instrument === "percussion") return this.buildPercussion(ctx, dest, note.midi, peak, atSec, offsetSec);
    const freq = midiToHz(note.midi);
    switch (note.instrument) {
      case "piano":
        return this.buildPiano(ctx, dest, freq, peak, atSec, durSec, offsetSec);
      case "harpsichord":
        return this.buildHarpsichord(ctx, dest, freq, peak, atSec, durSec, offsetSec);
      case "strings":
        return this.buildStrings(ctx, dest, freq, peak, atSec, durSec, offsetSec);
      case "organ":
        return this.buildOrgan(ctx, dest, freq, peak, atSec, durSec, offsetSec);
      case "bass":
        return this.buildBass(ctx, dest, freq, peak, atSec, durSec, offsetSec);
      case "pluck":
        return this.buildPluck(ctx, dest, freq, peak, atSec, durSec, offsetSec);
      case "bell":
        return this.buildBell(ctx, dest, freq, peak, atSec, durSec, offsetSec);
    }
  }

  /** Two detuned triangles and a sine, fast attack, exponential decay, lowpass closing with it. */
  private buildPiano(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    peak: number,
    atSec: number,
    durSec: number,
    offsetSec: number,
  ): BuiltVoice {
    const env: Envelope = { attack: 0.004, decay: 1.4, sustain: 0.1, release: 0.24 };
    const gain = this.voiceGain(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    sweep(filter.frequency, Math.min(9000, freq * 9 + 1200), Math.max(320, freq * 2.2), atSec, env.decay, offsetSec);
    filter.connect(gain);
    gain.connect(dest);
    const sources = [
      this.osc(ctx, "triangle", freq, -6, filter),
      this.osc(ctx, "triangle", freq, 7, filter),
      this.osc(ctx, "sine", freq * 2, 0, filter, 0.35),
    ];
    const endSec = scheduleEnvelope(gain.gain, env, peak, atSec, durSec, offsetSec);
    return { gain, sources, endSec };
  }

  /** Sawtooth and square pluck with a very short decay and a slight highpass. */
  private buildHarpsichord(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    peak: number,
    atSec: number,
    durSec: number,
    offsetSec: number,
  ): BuiltVoice {
    const env: Envelope = { attack: 0.002, decay: 0.38, sustain: 0.04, release: 0.09 };
    const gain = this.voiceGain(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 220;
    filter.connect(gain);
    gain.connect(dest);
    const sources = [
      this.osc(ctx, "sawtooth", freq, 0, filter),
      this.osc(ctx, "square", freq, 9, filter, 0.35),
    ];
    const endSec = scheduleEnvelope(gain.gain, env, peak, atSec, durSec, offsetSec);
    return { gain, sources, endSec };
  }

  /** Three detuned sawtooths through a lowpass with a slow attack and a real sustain. */
  private buildStrings(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    peak: number,
    atSec: number,
    durSec: number,
    offsetSec: number,
  ): BuiltVoice {
    const env: Envelope = { attack: 0.09, decay: 0.5, sustain: 0.72, release: 0.34 };
    const gain = this.voiceGain(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(6000, freq * 6 + 700);
    filter.Q.value = 0.4;
    filter.connect(gain);
    gain.connect(dest);
    const sources = [
      this.osc(ctx, "sawtooth", freq, -8, filter),
      this.osc(ctx, "sawtooth", freq, 0, filter),
      this.osc(ctx, "sawtooth", freq, 9, filter),
    ];
    const endSec = scheduleEnvelope(gain.gain, env, peak, atSec, durSec, offsetSec);
    return { gain, sources, endSec };
  }

  /** Additive sines on partials 1, 2, 3, 4, 6 and 8, instant attack, short release. */
  private buildOrgan(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    peak: number,
    atSec: number,
    durSec: number,
    offsetSec: number,
  ): BuiltVoice {
    const env: Envelope = { attack: 0.006, decay: 0.02, sustain: 1, release: 0.14 };
    const gain = this.voiceGain(ctx);
    gain.connect(dest);
    const partials: readonly [number, number][] = [
      [1, 1],
      [2, 0.55],
      [3, 0.32],
      [4, 0.22],
      [6, 0.14],
      [8, 0.1],
    ];
    const sources: AudioScheduledSourceNode[] = [];
    for (const [ratio, level] of partials) {
      const hz = freq * ratio;
      if (hz > 16_000) continue;
      sources.push(this.osc(ctx, "sine", hz, 0, gain, level));
    }
    const endSec = scheduleEnvelope(gain.gain, env, peak, atSec, durSec, offsetSec);
    return { gain, sources, endSec };
  }

  /** Sine with a square sub an octave down, quick decay, lowpassed. */
  private buildBass(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    peak: number,
    atSec: number,
    durSec: number,
    offsetSec: number,
  ): BuiltVoice {
    const env: Envelope = { attack: 0.005, decay: 0.55, sustain: 0.28, release: 0.14 };
    const gain = this.voiceGain(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(1400, freq * 6 + 200);
    filter.connect(gain);
    gain.connect(dest);
    const sources = [
      this.osc(ctx, "sine", freq, 0, filter),
      this.osc(ctx, "square", freq / 2, 0, filter, 0.28),
    ];
    const endSec = scheduleEnvelope(gain.gain, env, peak, atSec, durSec, offsetSec);
    return { gain, sources, endSec };
  }

  /** Triangle through a fast closing lowpass. */
  private buildPluck(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    peak: number,
    atSec: number,
    durSec: number,
    offsetSec: number,
  ): BuiltVoice {
    const env: Envelope = { attack: 0.002, decay: 0.28, sustain: 0.02, release: 0.07 };
    const gain = this.voiceGain(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 1.2;
    sweep(filter.frequency, Math.min(9000, freq * 10), Math.max(280, freq * 1.6), atSec, env.decay, offsetSec);
    filter.connect(gain);
    gain.connect(dest);
    const sources = [this.osc(ctx, "triangle", freq, 0, filter)];
    const endSec = scheduleEnvelope(gain.gain, env, peak, atSec, durSec, offsetSec);
    return { gain, sources, endSec };
  }

  /** FM bell: a sine carrier with a 3.5 ratio modulator whose index decays fast. */
  private buildBell(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    peak: number,
    atSec: number,
    durSec: number,
    offsetSec: number,
  ): BuiltVoice {
    const env: Envelope = { attack: 0.003, decay: 2.4, sustain: 0.02, release: 0.5 };
    const gain = this.voiceGain(ctx);
    gain.connect(dest);
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;
    carrier.connect(gain);
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = freq * 3.5;
    const index = ctx.createGain();
    sweep(index.gain, freq * 4, freq * 0.05, atSec, 0.45, offsetSec);
    modulator.connect(index);
    index.connect(carrier.frequency);
    const endSec = scheduleEnvelope(gain.gain, env, peak, atSec, durSec, offsetSec);
    return { gain, sources: [carrier, modulator], endSec };
  }

  private buildPercussion(
    ctx: AudioContext,
    dest: AudioNode,
    midi: number,
    peak: number,
    atSec: number,
    offsetSec: number,
  ): BuiltVoice {
    // Charts address percussion through the DRUM constants; anything else lands
    // on the tom so an unexpected number is still audible and in tune.
    const name = DRUM_BY_MIDI.get(midi) ?? "tom";
    switch (name) {
      case "kick":
        return this.drumTone(ctx, dest, peak, atSec, offsetSec, { from: 130, to: 44, pitchSec: 0.09, decay: 0.34, type: "sine" });
      case "tom":
        return this.drumTone(ctx, dest, peak * 0.8, atSec, offsetSec, { from: 200, to: 90, pitchSec: 0.14, decay: 0.36, type: "sine" });
      case "click":
        return this.drumTone(ctx, dest, peak * 0.5, atSec, offsetSec, { from: 1400, to: 1200, pitchSec: 0.01, decay: 0.03, type: "square" });
      case "snare":
        return this.drumSnare(ctx, dest, peak, atSec, offsetSec);
      case "hat":
        return this.drumNoise(ctx, dest, peak * 0.42, atSec, offsetSec, { highpass: 7200, decay: 0.05 });
      case "openHat":
        return this.drumNoise(ctx, dest, peak * 0.4, atSec, offsetSec, { highpass: 6800, decay: 0.3 });
      case "crash":
        return this.drumNoise(ctx, dest, peak * 0.42, atSec, offsetSec, { highpass: 5200, decay: 1.6 });
      case "ride":
        return this.drumNoise(ctx, dest, peak * 0.34, atSec, offsetSec, { highpass: 6400, decay: 0.9 });
    }
  }

  private drumTone(
    ctx: AudioContext,
    dest: AudioNode,
    peak: number,
    atSec: number,
    offsetSec: number,
    shape: { from: number; to: number; pitchSec: number; decay: number; type: OscillatorType },
  ): BuiltVoice {
    const env: Envelope = { attack: 0.001, decay: shape.decay, sustain: 0.001, release: 0.02 };
    const gain = this.voiceGain(ctx);
    gain.connect(dest);
    const osc = ctx.createOscillator();
    osc.type = shape.type;
    sweep(osc.frequency, shape.from, shape.to, atSec, shape.pitchSec, offsetSec);
    osc.connect(gain);
    const endSec = scheduleEnvelope(gain.gain, env, peak, atSec, shape.decay, offsetSec);
    return { gain, sources: [osc], endSec };
  }

  private drumNoise(
    ctx: AudioContext,
    dest: AudioNode,
    peak: number,
    atSec: number,
    offsetSec: number,
    shape: { highpass: number; decay: number },
  ): BuiltVoice {
    const env: Envelope = { attack: 0.001, decay: shape.decay, sustain: 0.001, release: 0.03 };
    const gain = this.voiceGain(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = shape.highpass;
    filter.connect(gain);
    gain.connect(dest);
    const source = this.noiseSource(ctx, filter);
    const endSec = scheduleEnvelope(gain.gain, env, peak, atSec, shape.decay, offsetSec);
    return { gain, sources: [source], endSec };
  }

  /** Noise burst plus a short body tone. */
  private drumSnare(ctx: AudioContext, dest: AudioNode, peak: number, atSec: number, offsetSec: number): BuiltVoice {
    const env: Envelope = { attack: 0.001, decay: 0.19, sustain: 0.001, release: 0.03 };
    const gain = this.voiceGain(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1600;
    filter.connect(gain);
    gain.connect(dest);
    const noise = this.noiseSource(ctx, filter);
    const body = ctx.createOscillator();
    body.type = "triangle";
    sweep(body.frequency, 260, 170, atSec, 0.06, offsetSec);
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.5;
    body.connect(bodyGain);
    bodyGain.connect(gain);
    const endSec = scheduleEnvelope(gain.gain, env, peak, atSec, 0.19, offsetSec);
    return { gain, sources: [noise, body], endSec };
  }

  private osc(
    ctx: AudioContext,
    type: OscillatorType,
    freq: number,
    detune: number,
    dest: AudioNode,
    level = 1,
  ): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    if (level === 1) {
      osc.connect(dest);
    } else {
      const trim = ctx.createGain();
      trim.gain.value = level;
      osc.connect(trim);
      trim.connect(dest);
    }
    return osc;
  }

  private noiseSource(ctx: AudioContext, dest: AudioNode): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    // Looped so a long crash outlasts the buffer.
    source.loop = true;
    source.connect(dest);
    return source;
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

  private voiceGain(ctx: AudioContext): GainNode {
    const gain = ctx.createGain();
    // Silent until the envelope says otherwise, so cancelling a voice that has
    // not started yet leaves nothing audible behind.
    gain.gain.value = FLOOR;
    return gain;
  }

  private partNode(ctx: AudioContext, dest: GainNode, note: ScheduledNote): GainNode {
    const key = `${note.partId}|${note.gain}|${note.pan}`;
    const cached = this.partNodes.get(key);
    if (cached) return cached;
    const gain = ctx.createGain();
    gain.gain.value = note.gain;
    if (note.pan !== 0 && typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(note.pan, -1, 1);
      gain.connect(panner);
      panner.connect(dest);
    } else {
      gain.connect(dest);
    }
    this.partNodes.set(key, gain);
    return gain;
  }

  private checkContext(ctx: AudioContext): void {
    if (this.cachedCtx === ctx) return;
    this.cachedCtx = ctx;
    this.partNodes.clear();
    this.noise = null;
    this.voices.length = 0;
  }

  private stealOldest(now: number): void {
    const oldest = this.voices[0];
    if (!oldest) return;
    this.fadeOut(oldest, now, AUDIO.voiceFadeMs / 1000);
    this.retire(oldest);
  }

  private fadeOut(voice: Voice, now: number, fadeSec: number): void {
    const param = voice.gain.gain;
    const level = Math.max(param.value, FLOOR);
    param.cancelScheduledValues(now);
    param.setValueAtTime(level, now);
    param.exponentialRampToValueAtTime(FLOOR, now + fadeSec);
    for (const source of voice.sources) source.stop(now + fadeSec);
    voice.endSec = now + fadeSec;
  }

  /** Drops a voice from the live list. Disconnection waits for its ended event. */
  private retire(voice: Voice): void {
    if (voice.retired) return;
    voice.retired = true;
    const i = this.voices.indexOf(voice);
    if (i >= 0) this.voices.splice(i, 1);
    this.graph.releaseVoice();
  }

  /** Safety net for browsers that do not deliver an ended event for every node. */
  private reap(now: number): void {
    for (const voice of [...this.voices]) {
      if (voice.endSec + 0.25 < now) {
        this.retire(voice);
        voice.gain.disconnect();
      }
    }
  }
}
