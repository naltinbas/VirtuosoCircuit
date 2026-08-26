import { AUDIO } from "../app/Config";
import { clamp } from "../utils/MathUtils";

/** Returns the current audio time in milliseconds. AudioEngine supplies the real one. */
export type AudioTimeSource = () => number;

/**
 * Maps audio time to song time with an anchor pair and a rate:
 *
 *   songMs = songAnchorMs + (audioMs - audioAnchorMs) * rate   while running
 *   songMs = pausedSongMs                                      while paused
 *
 * Nothing here reads a real clock, so the whole class can be driven by a fake
 * time source in tests. Song time is negative during the countdown.
 */
export class AudioClock {
  private songAnchorMs: number;
  private audioAnchorMs: number;
  private rateValue = 1;
  private isRunning = false;
  private pausedAtSongMs: number;

  constructor(
    private readonly audioNowMs: AudioTimeSource,
    startSongMs = 0,
  ) {
    this.songAnchorMs = startSongMs;
    this.pausedAtSongMs = startSongMs;
    this.audioAnchorMs = audioNowMs();
  }

  get running(): boolean {
    return this.isRunning;
  }

  get rate(): number {
    return this.rateValue;
  }

  get pausedSongMs(): number {
    return this.pausedAtSongMs;
  }

  songMs(): number {
    return this.songMsAtAudioMs(this.audioNowMs());
  }

  songMsAtAudioMs(audioMs: number): number {
    if (!this.isRunning) return this.pausedAtSongMs;
    return this.songAnchorMs + (audioMs - this.audioAnchorMs) * this.rateValue;
  }

  audioMsAtSongMs(songMs: number): number {
    return this.audioAnchorMs + (songMs - this.songAnchorMs) / this.rateValue;
  }

  /** Anchors at the current audio time and runs from `songMs`. */
  start(songMs: number): void {
    this.isRunning = true;
    this.anchorAt(songMs);
  }

  pause(): void {
    if (!this.isRunning) return;
    const at = this.songMs();
    this.isRunning = false;
    this.anchorAt(at);
  }

  /** Re-anchors at the current audio time, so a long pause costs no song time. */
  resume(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.anchorAt(this.pausedAtSongMs);
  }

  /** Seeking while paused stays paused at the new position. */
  seek(songMs: number): void {
    this.anchorAt(songMs);
  }

  setRate(rate: number): void {
    const at = this.isRunning ? this.songMs() : this.pausedAtSongMs;
    this.rateValue = clamp(rate, AUDIO.rateMin, AUDIO.rateMax);
    this.anchorAt(at);
  }

  private anchorAt(songMs: number): void {
    this.songAnchorMs = songMs;
    this.audioAnchorMs = this.audioNowMs();
    if (!this.isRunning) this.pausedAtSongMs = songMs;
  }
}
