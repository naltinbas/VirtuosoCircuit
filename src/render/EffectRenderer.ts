// Judgment popups, hit bursts, lane flashes, the Perfect Passage edge pulse,
// the Focus Surge sweep and the low aura vignette.
//
// Every effect ages on display time, so a frozen frame draws the same pixels
// each time and a pause does not fast forward a popup. Particles come from an
// ObjectPool and fly a ballistic path from where and when they were thrown.
// Nothing here fades faster than 250 ms and every flash obeys flashEffects.

import { LAYOUT, type Judgment } from "../app/Config";
import { LANES, type Lane } from "../charts/ChartTypes";
import { clamp, seededRandom } from "../utils/MathUtils";
import { ObjectPool } from "../utils/ObjectPool";
import { formatOffset } from "../utils/TimeUtils";
import type { RenderFrame } from "./GameRenderer";
import { edgeXAtProgress, effectFade, popupAlpha, popupRisePx, yAtProgress } from "./Geometry";
import {
  SCENE,
  clearGlow,
  judgmentColor,
  judgmentLabel,
  laneColor,
  pathLaneColumn,
  rgba,
  setGlow,
  type Palette,
  type ViewMetrics,
} from "./Theme";

interface Popup {
  lane: Lane;
  judgment: Judgment;
  /** Corrected song time of the judgment; the age is displayMs minus this. */
  songMs: number;
  text: string;
}

interface Spark {
  /** Where the burst left the gate, in CSS pixels. */
  x0: number;
  y0: number;
  /** Velocity at that moment, in CSS pixels per ms. */
  vx: number;
  vy: number;
  /** Corrected song time of the judgment that threw it; the age is displayMs minus this. */
  spawnSongMs: number;
  x: number;
  y: number;
  ageMs: number;
  lifeMs: number;
  size: number;
  /** The colour is resolved at draw time, so a palette change reaches sparks already in flight. */
  lane: Lane;
}

/** Downward pull on a spark, in px per ms squared. */
const SPARK_GRAVITY = 0.0009;
const TAU = Math.PI * 2;

export class EffectRenderer {
  private readonly popupPool = new ObjectPool<Popup>(
    () => ({ lane: 0, judgment: "radiant", songMs: 0, text: "" }),
    (popup) => {
      popup.songMs = 0;
      popup.text = "";
    },
    12,
  );
  private readonly sparkPool = new ObjectPool<Spark>(
    () => ({ x0: 0, y0: 0, vx: 0, vy: 0, spawnSongMs: 0, x: 0, y: 0, ageMs: 0, lifeMs: 0, size: 1, lane: 0 }),
    (spark) => {
      spark.ageMs = 0;
      spark.spawnSongMs = 0;
    },
    SCENE.burstParticles * 4,
  );
  private readonly popups: Popup[] = [];
  private readonly sparks: Spark[] = [];
  private readonly laneFlashSongMs = new Float64Array(LANES.length);
  private edgePulseSongMs = Number.NEGATIVE_INFINITY;
  private warningActive = false;
  private warningSinceMs = 0;
  private random = seededRandom(1);

  private cacheWidth = -1;
  private cacheHeight = -1;
  private cachePalette: Palette | null = null;
  private metrics: ViewMetrics | null = null;
  private edgeTop: CanvasGradient | null = null;
  private edgeBottom: CanvasGradient | null = null;
  private edgeLeft: CanvasGradient | null = null;
  private edgeRight: CanvasGradient | null = null;
  private vignette: CanvasGradient | null = null;
  /** Last known frame flags, for events that arrive between frames. */
  private allowFlash = true;
  private allowMotion = true;
  private allowEffects = true;

  constructor() {
    this.laneFlashSongMs.fill(Number.NEGATIVE_INFINITY);
  }

  get particleCount(): number {
    return this.sparks.length;
  }

  reseed(seed: number): void {
    this.random = seededRandom(seed);
  }

  /**
   * Kept current from resize as well as from prepare, so a judgment that lands
   * before the first frame of a session still knows where the gate is.
   */
  setMetrics(m: ViewMetrics): void {
    this.metrics = m;
  }

  prepare(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette): void {
    this.metrics = m;
    if (this.cacheWidth === m.width && this.cacheHeight === m.height && this.cachePalette === pal) return;
    this.cacheWidth = m.width;
    this.cacheHeight = m.height;
    this.cachePalette = pal;

    const band = Math.max(24, Math.min(m.width, m.height) * 0.12);
    this.edgeTop = this.edgeGradient(ctx, pal, 0, 0, 0, band);
    this.edgeBottom = this.edgeGradient(ctx, pal, 0, m.height, 0, m.height - band);
    this.edgeLeft = this.edgeGradient(ctx, pal, 0, 0, band, 0);
    this.edgeRight = this.edgeGradient(ctx, pal, m.width, 0, m.width - band, 0);

    const radius = Math.hypot(m.width, m.height) / 2;
    const vignette = ctx.createRadialGradient(
      m.layout.centerX,
      m.layout.gateY,
      radius * 0.25,
      m.layout.centerX,
      m.layout.gateY,
      radius,
    );
    vignette.addColorStop(0, rgba(pal.warning, 0));
    vignette.addColorStop(1, rgba(pal.warning, 0.85));
    this.vignette = vignette;
  }

  private edgeGradient(
    ctx: CanvasRenderingContext2D,
    pal: Palette,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, rgba(pal.gateCore, 0.9));
    gradient.addColorStop(1, rgba(pal.gateCore, 0));
    return gradient;
  }

  addJudgment(lane: Lane, judgment: Judgment, deltaMs: number, songMs: number, withOffset: boolean): void {
    if (!this.allowEffects) return;
    const popup = this.popupPool.acquire();
    popup.lane = lane;
    popup.judgment = judgment;
    popup.songMs = songMs;
    popup.text = withOffset ? `${judgmentLabel(judgment)} ${formatOffset(deltaMs)}` : judgmentLabel(judgment);
    this.popups.push(popup);
    if (judgment === "miss") return;
    this.laneFlashSongMs[lane] = songMs;
    if (judgment === "radiant" && this.allowFlash && this.allowMotion) this.spawnBurst(lane, songMs);
  }

  addPhrasePulse(songMs: number): void {
    if (!this.allowEffects) return;
    this.edgePulseSongMs = songMs;
  }

  clear(): void {
    for (const popup of this.popups) this.popupPool.release(popup);
    this.popups.length = 0;
    for (const spark of this.sparks) this.sparkPool.release(spark);
    this.sparks.length = 0;
    this.laneFlashSongMs.fill(Number.NEGATIVE_INFINITY);
    this.edgePulseSongMs = Number.NEGATIVE_INFINITY;
    this.warningActive = false;
  }

  update(frame: RenderFrame): void {
    this.allowEffects = frame.effectsEnabled;
    this.allowFlash = frame.flashEffects;
    this.allowMotion = !frame.reducedMotion;
    if (!frame.effectsEnabled) {
      if (this.popups.length > 0 || this.sparks.length > 0) this.clear();
      return;
    }
    // Reduced motion skips particles, a burst already in flight included, so
    // nothing keeps travelling after the player asks the screen to settle.
    if (frame.reducedMotion && this.sparks.length > 0) {
      for (const spark of this.sparks) this.sparkPool.release(spark);
      this.sparks.length = 0;
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const popup = this.popups[i];
      if (frame.displayMs - popup.songMs < LAYOUT.popupLifeMs) continue;
      this.popupPool.release(popup);
      this.swapOutPopup(i);
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      const ageMs = frame.displayMs - spark.spawnSongMs;
      if (ageMs >= spark.lifeMs) {
        this.sparkPool.release(spark);
        this.swapOutSpark(i);
        continue;
      }
      // Ballistic from the spawn, so a frozen frame keeps drawing the same
      // pixels and a burst left behind by a seek is culled on sight.
      const t = ageMs > 0 ? ageMs : 0;
      spark.ageMs = t;
      spark.x = spark.x0 + spark.vx * t;
      spark.y = spark.y0 + spark.vy * t + 0.5 * SPARK_GRAVITY * t * t;
    }

    if (frame.game.auraWarning) {
      if (!this.warningActive) {
        this.warningActive = true;
        this.warningSinceMs = frame.displayMs;
      }
    } else {
      this.warningActive = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, frame: RenderFrame): void {
    if (!frame.effectsEnabled) return;
    this.drawLaneFlashes(ctx, m, pal, frame);
    this.drawSurge(ctx, m, pal, frame);
    this.drawSparks(ctx, pal, frame);
    this.drawPopups(ctx, m, pal, frame);
    this.drawEdgePulse(ctx, m, frame);
    this.drawVignette(ctx, m, frame);
    ctx.globalAlpha = 1;
  }

  private drawLaneFlashes(
    ctx: CanvasRenderingContext2D,
    m: ViewMetrics,
    pal: Palette,
    frame: RenderFrame,
  ): void {
    if (!frame.flashEffects) return;
    for (const lane of LANES) {
      const fade = effectFade(frame.displayMs - this.laneFlashSongMs[lane], LAYOUT.laneFlashMs);
      if (fade <= 0) continue;
      ctx.fillStyle = laneColor(lane, frame.highContrast);
      ctx.globalAlpha = fade * 0.28;
      setGlow(ctx, pal, pal.laneEdgeLit, 0);
      pathLaneColumn(ctx, m.layout, lane, -LAYOUT.pastGateFraction, 0.5);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawSurge(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, frame: RenderFrame): void {
    if (!frame.game.surgeActive) return;
    const { layout } = m;
    ctx.fillStyle = pal.surge;
    ctx.globalAlpha = 0.06;
    this.pathCorridorBand(ctx, m, -LAYOUT.pastGateFraction, 1);
    ctx.fill();

    if (frame.reducedMotion) {
      ctx.globalAlpha = 1;
      return;
    }
    // One band riding up the corridor, so the surge reads as motion, not a flash.
    const phase = ((frame.displayMs % LAYOUT.surgeSweepMs) + LAYOUT.surgeSweepMs) % LAYOUT.surgeSweepMs;
    const center = phase / LAYOUT.surgeSweepMs;
    const from = clamp(center - 0.07, 0, 1);
    const to = clamp(center + 0.07, 0, 1);
    if (to > from) {
      ctx.globalAlpha = 0.2 * (1 - center);
      this.pathCorridorBand(ctx, m, from, to);
      ctx.fill();
    }
    ctx.strokeStyle = pal.surge;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35 * (1 - center);
    const y = yAtProgress(layout, center);
    ctx.beginPath();
    ctx.moveTo(edgeXAtProgress(layout, 0, center), y);
    ctx.lineTo(edgeXAtProgress(layout, LANES.length, center), y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawSparks(ctx: CanvasRenderingContext2D, pal: Palette, frame: RenderFrame): void {
    for (let i = 0; i < this.sparks.length; i++) {
      const spark = this.sparks[i];
      const fade = effectFade(spark.ageMs, spark.lifeMs);
      if (fade <= 0) continue;
      const color = laneColor(spark.lane, frame.highContrast);
      ctx.fillStyle = color;
      ctx.globalAlpha = fade;
      setGlow(ctx, pal, color, 8 * fade);
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.size * fade, 0, TAU);
      ctx.fill();
    }
    clearGlow(ctx);
    ctx.globalAlpha = 1;
  }

  private drawPopups(
    ctx: CanvasRenderingContext2D,
    m: ViewMetrics,
    pal: Palette,
    frame: RenderFrame,
  ): void {
    if (this.popups.length === 0) return;
    const { layout } = m;
    const baseY = layout.gateY - layout.receptorRadius - m.popupSizePx;
    ctx.font = m.fontPopup;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < this.popups.length; i++) {
      const popup = this.popups[i];
      const age = frame.displayMs - popup.songMs;
      const alpha = popupAlpha(age);
      if (alpha <= 0) continue;
      const color = judgmentColor(popup.judgment, frame.highContrast);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      setGlow(ctx, pal, color, 10);
      ctx.fillText(popup.text, layout.laneGateX[popup.lane], baseY - popupRisePx(age));
    }
    clearGlow(ctx);
    ctx.globalAlpha = 1;
  }

  private drawEdgePulse(ctx: CanvasRenderingContext2D, m: ViewMetrics, frame: RenderFrame): void {
    if (!frame.flashEffects) return;
    const fade = effectFade(frame.displayMs - this.edgePulseSongMs, LAYOUT.edgePulseMs);
    if (fade <= 0) return;
    const band = Math.max(24, Math.min(m.width, m.height) * 0.12);
    ctx.globalAlpha = fade * 0.5;
    if (this.edgeTop) {
      ctx.fillStyle = this.edgeTop;
      ctx.fillRect(0, 0, m.width, band);
    }
    if (this.edgeBottom) {
      ctx.fillStyle = this.edgeBottom;
      ctx.fillRect(0, m.height - band, m.width, band);
    }
    if (this.edgeLeft) {
      ctx.fillStyle = this.edgeLeft;
      ctx.fillRect(0, 0, band, m.height);
    }
    if (this.edgeRight) {
      ctx.fillStyle = this.edgeRight;
      ctx.fillRect(m.width - band, 0, band, m.height);
    }
    ctx.globalAlpha = 1;
  }

  private drawVignette(ctx: CanvasRenderingContext2D, m: ViewMetrics, frame: RenderFrame): void {
    if (!frame.game.auraWarning || !this.vignette) return;
    const ramp = clamp((frame.displayMs - this.warningSinceMs) / LAYOUT.vignetteFadeMs, 0, 1);
    ctx.globalAlpha = ramp * 0.38;
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, m.width, m.height);
    ctx.globalAlpha = 1;
  }

  private pathCorridorBand(ctx: CanvasRenderingContext2D, m: ViewMetrics, from: number, to: number): void {
    const { layout } = m;
    const yNear = yAtProgress(layout, from);
    const yFar = yAtProgress(layout, to);
    ctx.beginPath();
    ctx.moveTo(edgeXAtProgress(layout, 0, from), yNear);
    ctx.lineTo(edgeXAtProgress(layout, LANES.length, from), yNear);
    ctx.lineTo(edgeXAtProgress(layout, LANES.length, to), yFar);
    ctx.lineTo(edgeXAtProgress(layout, 0, to), yFar);
    ctx.closePath();
  }

  private spawnBurst(lane: Lane, songMs: number): void {
    const m = this.metrics;
    if (!m) return;
    const x = m.layout.laneGateX[lane];
    const y = m.layout.gateY;
    for (let i = 0; i < SCENE.burstParticles; i++) {
      const spark = this.sparkPool.acquire();
      // Upward fan, so the sparks read as the gem breaking through the gate.
      const angle = -Math.PI / 2 + (this.random() - 0.5) * Math.PI * 1.1;
      const speed = SCENE.burstSpeedPxPerMs * (0.4 + this.random() * 0.8);
      spark.x0 = x;
      spark.y0 = y;
      spark.x = x;
      spark.y = y;
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed;
      spark.spawnSongMs = songMs;
      spark.ageMs = 0;
      spark.lifeMs = LAYOUT.burstLifeMs * (0.7 + this.random() * 0.5);
      spark.size = 1.5 + this.random() * 2.5;
      spark.lane = lane;
      this.sparks.push(spark);
    }
    this.laneFlashSongMs[lane] = songMs;
  }

  private swapOutPopup(index: number): void {
    const last = this.popups.length - 1;
    if (index !== last) this.popups[index] = this.popups[last];
    this.popups.pop();
  }

  private swapOutSpark(index: number): void {
    const last = this.sparks.length - 1;
    if (index !== last) this.sparks[index] = this.sparks[last];
    this.sparks.pop();
  }
}
