import { AUDIO } from "../app/Config";
import type { BeatMark, ScheduledNote, TrackChart } from "../charts/ChartTypes";
import { EventEmitter } from "../utils/EventEmitter";
import { lowerBound } from "../utils/MathUtils";
import type { AudioClock } from "./AudioClock";
import type { SfxName } from "./SoundEffects";
import type { Synth } from "./SynthInstruments";

/** All the transport needs from SoundEffects to click the metronome. */
export interface MetronomeSink {
  playAt(name: SfxName, atAudioMs: number): () => void;
}

export type TransportEvents = {
  /** Song time reached the end of the practice loop. App owns the seek back. */
  loop: { songMs: number };
};

export interface TransportOptions {
  clock: AudioClock;
  synth: Synth;
  /** Live audio time. Read once per tick, never from the frame cache. */
  audioNowMs: () => number;
  sfx?: MetronomeSink | null;
}

interface PendingClick {
  atAudioMs: number;
  cancel: () => void;
}

/**
 * Walks the arrangement with a cursor and schedules everything inside the
 * lookahead horizon, from a setInterval tick. Never from the frame loop: a
 * dropped frame must not drop a note.
 *
 * The horizon is AUDIO.lookaheadMs of wall time, so in song time it is
 * lookaheadMs * rate. A note whose audio time has already passed by more than
 * AUDIO.lateNoteDropMs is skipped rather than started late.
 */
export class TrackTransport extends EventEmitter<TransportEvents> {
  private readonly clock: AudioClock;
  private readonly synth: Synth;
  private readonly audioNowMs: () => number;
  private readonly sfx: MetronomeSink | null;

  private music: readonly ScheduledNote[] = [];
  private grid: readonly BeatMark[] = [];
  private cursor = 0;
  private beatCursor = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private loopEndMs: number | null = null;
  private loopStartMs = 0;
  private loopFired = false;
  private metronomeOn = false;
  private clicks: PendingClick[] = [];
  private scheduled = 0;

  constructor(options: TransportOptions) {
    super();
    this.clock = options.clock;
    this.synth = options.synth;
    this.audioNowMs = options.audioNowMs;
    this.sfx = options.sfx ?? null;
  }

  /** Notes handed to the synth since the track was loaded. Debug only. */
  get scheduledCount(): number {
    return this.scheduled;
  }

  get cursorIndex(): number {
    return this.cursor;
  }

  get ticking(): boolean {
    return this.timer !== null;
  }

  setTrack(track: TrackChart | null): void {
    this.stop();
    this.music = track?.music ?? [];
    this.grid = track?.beatGrid ?? [];
    this.cursor = 0;
    this.beatCursor = 0;
    this.scheduled = 0;
    this.loopEndMs = null;
    this.loopStartMs = 0;
    this.loopFired = false;
  }

  /** Derives the cursor from the clock and starts ticking. */
  start(): void {
    if (this.timer === null) {
      this.timer = setInterval(() => this.tick(), AUDIO.schedulerIntervalMs);
    }
    this.resync();
  }

  /** Stops ticking and silences everything. The cursor stays where it is. */
  stop(): void {
    this.stopTimer();
    this.stopAll();
  }

  /**
   * The scheduler stops with the clock. A tick against a paused clock would
   * measure the horizon from a stale anchor and drop notes as late.
   */
  pause(): void {
    this.stopTimer();
    this.stopAll();
  }

  resume(): void {
    this.start();
  }

  /** Call after the clock has been seeked. */
  seek(): void {
    this.resync();
  }

  setRate(rate: number): void {
    this.clock.setRate(rate);
    this.resync();
  }

  /** An end at or before the start is no loop: the scheduler keeps running to the end of the track. */
  setLoop(startMs: number, endMs: number | null): void {
    this.loopStartMs = startMs;
    this.loopEndMs = endMs !== null && endMs > startMs ? endMs : null;
    this.loopFired = false;
  }

  get loopStart(): number {
    return this.loopStartMs;
  }

  get loopEnd(): number | null {
    return this.loopEndMs;
  }

  setMetronome(on: boolean): void {
    if (this.metronomeOn === on) return;
    this.metronomeOn = on;
    if (!on) {
      this.cancelClicks();
      return;
    }
    this.beatCursor = lowerBound(this.grid, this.clock.songMs(), (b) => b.timeMs);
    if (this.clock.running) this.tick();
  }

  get metronome(): boolean {
    return this.metronomeOn;
  }

  stopAll(fadeMs: number = AUDIO.voiceFadeMs): void {
    this.synth.stopAll(fadeMs);
    this.cancelClicks();
  }

  /** One scheduling pass. Public so tests can drive it without a timer. */
  tick(): void {
    if (!this.clock.running) return;
    const nowAudio = this.audioNowMs();
    const songNow = this.clock.songMs();
    const rate = this.clock.rate;
    if (this.loopEndMs !== null && songNow >= this.loopEndMs) {
      if (!this.loopFired) {
        this.loopFired = true;
        this.emit("loop", { songMs: songNow });
      }
      return;
    }
    const horizon = songNow + AUDIO.lookaheadMs * rate;
    while (this.cursor < this.music.length) {
      const note = this.music[this.cursor];
      if (note.timeMs > horizon) break;
      if (this.loopEndMs !== null && note.timeMs >= this.loopEndMs) break;
      this.cursor++;
      const at = this.clock.audioMsAtSongMs(note.timeMs);
      if (nowAudio - at > AUDIO.lateNoteDropMs) continue;
      this.synth.play(note, Math.max(at, nowAudio) / 1000, note.durationMs / rate / 1000);
      this.scheduled++;
    }
    this.tickMetronome(nowAudio, horizon);
    this.pruneClicks(nowAudio);
  }

  private tickMetronome(nowAudio: number, horizon: number): void {
    const sfx = this.sfx;
    if (!this.metronomeOn || !sfx) return;
    while (this.beatCursor < this.grid.length) {
      const beat = this.grid[this.beatCursor];
      if (beat.timeMs > horizon) break;
      if (this.loopEndMs !== null && beat.timeMs >= this.loopEndMs) break;
      this.beatCursor++;
      const at = this.clock.audioMsAtSongMs(beat.timeMs);
      if (nowAudio - at > AUDIO.lateNoteDropMs) continue;
      const name: SfxName = beat.isDownbeat ? "metronome-strong" : "metronome-weak";
      this.clicks.push({ atAudioMs: at, cancel: sfx.playAt(name, Math.max(at, nowAudio)) });
    }
  }

  /**
   * Silences everything, moves both cursors to the clock position, restarts the
   * notes that would still be sounding there and schedules the next horizon.
   */
  private resync(): void {
    this.stopAll();
    const songNow = this.clock.songMs();
    this.cursor = lowerBound(this.music, songNow, (n) => n.timeMs);
    this.beatCursor = lowerBound(this.grid, songNow, (b) => b.timeMs);
    this.loopFired = false;
    if (!this.clock.running) return;
    this.retriggerSustained(songNow);
    this.tick();
  }

  /**
   * A note that started before the resume point and still has real time left
   * starts again from the middle of its envelope, so a long chord does not
   * vanish after a pause or a seek.
   */
  private retriggerSustained(songNow: number): void {
    const rate = this.clock.rate;
    const nowAudio = this.audioNowMs();
    const from = lowerBound(this.music, songNow - AUDIO.retriggerScanMs, (n) => n.timeMs);
    for (let i = from; i < this.cursor; i++) {
      const note = this.music[i];
      if (note.timeMs >= songNow) continue;
      const endMs = note.timeMs + note.durationMs;
      if (endMs <= songNow + AUDIO.retriggerMinRemainingMs) continue;
      const remaining = (endMs - songNow) / rate / 1000;
      const offset = (songNow - note.timeMs) / rate / 1000;
      this.synth.play(note, nowAudio / 1000, remaining, offset);
      this.scheduled++;
    }
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private cancelClicks(): void {
    for (const click of this.clicks) click.cancel();
    this.clicks = [];
  }

  private pruneClicks(nowAudio: number): void {
    if (this.clicks.length === 0) return;
    this.clicks = this.clicks.filter((click) => click.atAudioMs > nowAudio);
  }
}
