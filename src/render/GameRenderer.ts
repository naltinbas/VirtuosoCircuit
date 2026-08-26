// The canvas layer.
//
// The renderer reads a frame and draws it. It never touches game state, never
// reads a clock (App hands it display time and a frame delta) and never
// allocates inside render(): arrays, pools, gradients and paths are built on
// resize and reused. Effect ages come from display time so a frozen frame
// (debug freezeAt, a pause) is pixel stable.

import { AUDIO, type Judgment, type JudgmentWindows } from "../app/Config";
import type { Lane, TrackChart } from "../charts/ChartTypes";
import type { NoteView } from "../gameplay/NoteScheduler";
import type { GameSnapshot } from "../gameplay/RhythmGame";
import { clamp } from "../utils/MathUtils";
import { EffectRenderer } from "./EffectRenderer";
import { beamEnergy } from "./Geometry";
import { HighwayRenderer } from "./HighwayRenderer";
import { NoteRenderer } from "./NoteRenderer";
import { buildMetrics, palette, type ViewMetrics } from "./Theme";

export interface RenderFrame {
  /** Song time the highway is drawn at, already corrected for output latency and the visual offset. */
  displayMs: number;
  approachMs: number;
  track: TrackChart;
  game: GameSnapshot;
  /** Filled by RhythmGame.visibleNotes, far notes first. */
  notes: NoteView[];
  noteCount: number;
  heldLanes: readonly boolean[];
  /** Display ms since each lane was last pressed, Infinity if never. */
  keyFlashMs: readonly number[];
  reducedMotion: boolean;
  highContrast: boolean;
  flashEffects: boolean;
  showBeatGrid: boolean;
  showHitWindows: boolean;
  showNoteIds: boolean;
  showLaneBounds: boolean;
  effectsEnabled: boolean;
  /** Key labels under the receptors, or null when hints are off. */
  laneKeyLabels: readonly string[] | null;
  ghostGuide: boolean;
  /** 0..1 through the current beat, for the gem pulse. */
  beatPhase: number;
  frameDeltaMs: number;
  /** UI text scale, applied to every canvas string. */
  textScale: number;
  /** Seed for the renderer's own randomness. Reset on restart. */
  seed: number;
  /** Windows the run is judged with, for the debug hit window bands. */
  windows: JudgmentWindows;
}

/** Devicepixel ratio ceiling. Past this the fill rate costs more than it shows. */
const MAX_DPR = 2;
/** How much of the highway is left after a performance is interrupted. */
const FAILED_DIM = 0.4;

export class GameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly host: HTMLElement | null;
  private readonly highway = new HighwayRenderer();
  private readonly noteLayer = new NoteRenderer();
  private readonly effects = new EffectRenderer();
  private readonly onFullscreenChange = (): void => this.resize();
  private observer: ResizeObserver | null = null;
  private metrics: ViewMetrics;
  private dpr = 1;
  private sceneTimeMs = 0;
  private seed = 1;

  constructor(canvas: HTMLCanvasElement, host?: HTMLElement | null) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available in this browser");
    this.canvas = canvas;
    this.ctx = ctx;
    this.host = host ?? canvas.parentElement;
    this.metrics = buildMetrics(1, 1, 1, 1);
    this.resize();
    if (typeof ResizeObserver !== "undefined" && this.host) {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.host);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("fullscreenchange", this.onFullscreenChange);
    }
  }

  get width(): number {
    return this.metrics.width;
  }

  get height(): number {
    return this.metrics.height;
  }

  /** Matches the backing store to the element and rebuilds every cached path. */
  resize(): void {
    const dpr = Math.min(MAX_DPR, typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1);
    const width = Math.max(1, Math.round(this.canvas.clientWidth || this.metrics.width));
    const height = Math.max(1, Math.round(this.canvas.clientHeight || this.metrics.height));
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
    if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;
    this.dpr = dpr;
    this.metrics = buildMetrics(width, height, dpr, this.metrics.textScale);
    this.effects.setMetrics(this.metrics);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(frame: RenderFrame): void {
    const ctx = this.ctx;
    const pal = palette(frame.highContrast);
    if (frame.textScale !== this.metrics.textScale) {
      this.metrics = buildMetrics(this.metrics.width, this.metrics.height, this.dpr, frame.textScale);
      this.effects.setMetrics(this.metrics);
    }
    if (frame.seed !== this.seed) {
      this.seed = frame.seed;
      this.highway.reseed(frame.seed);
      this.effects.reseed(frame.seed);
    }
    const m = this.metrics;
    const deltaMs = frame.reducedMotion ? 0 : clamp(frame.frameDeltaMs, 0, AUDIO.maxFrameDeltaMs);
    this.sceneTimeMs += deltaMs;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    this.highway.prepare(ctx, m, pal);
    this.effects.prepare(ctx, m, pal);

    const energy = beamEnergy(frame.game.aura, frame.game.auraMax, frame.game.combo);
    this.highway.drawBackdrop(ctx, m, pal, this.sceneTimeMs, energy, deltaMs);
    this.highway.drawCorridor(ctx, m, pal, frame);
    this.highway.drawGate(ctx, m, pal, frame);
    this.noteLayer.draw(ctx, m, pal, frame);

    if (frame.game.failed) {
      ctx.globalAlpha = 1 - FAILED_DIM;
      ctx.fillStyle = pal.skyTop;
      ctx.fillRect(0, 0, m.width, m.height);
      ctx.globalAlpha = 1;
    }

    this.effects.update(frame, deltaMs);
    this.effects.draw(ctx, m, pal, frame);
    ctx.globalAlpha = 1;
  }

  /**
   * Menu backdrop: the conservatory without a corridor. Menus have no session,
   * so this one runs on wall time.
   */
  renderIdle(wallDeltaMs: number, reducedMotion = false, highContrast = false): void {
    const ctx = this.ctx;
    const pal = palette(highContrast);
    const m = this.metrics;
    const deltaMs = reducedMotion ? 0 : clamp(wallDeltaMs, 0, AUDIO.maxFrameDeltaMs);
    this.sceneTimeMs += deltaMs;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    this.highway.prepare(ctx, m, pal);
    // Slow breathing so the hall looks alive while nobody is playing.
    const energy = 0.35 + 0.12 * Math.sin(this.sceneTimeMs / 3200);
    this.highway.drawBackdrop(ctx, m, pal, this.sceneTimeMs, energy, deltaMs);
  }

  /** Feeds one judgment to the effect layer. `withOffset` adds the signed delta in debug. */
  addJudgment(lane: Lane, judgment: Judgment, deltaMs: number, songMs: number, withOffset = false): void {
    this.effects.addJudgment(lane, judgment, deltaMs, songMs, withOffset);
  }

  /** Perfect Passage: the screen edges pulse once. */
  addPhrasePulse(songMs: number): void {
    this.effects.addPhrasePulse(songMs);
  }

  /** Drops every popup, burst and particle. Called on seeks and restarts. */
  clearEffects(): void {
    this.effects.clear();
  }

  /** Live particles, for the performance overlay. */
  get particleCount(): number {
    return this.effects.particleCount;
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (typeof document !== "undefined") {
      document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    }
    this.effects.clear();
  }
}
