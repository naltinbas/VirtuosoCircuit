// Backdrop, corridor, Resonance Gate and the in-canvas debug layers.
//
// Gradients and the corridor path are cached and only rebuilt when the canvas
// size or the palette changes. The backdrop runs on scene time, which the
// caller freezes under reduced motion and while a frame is frozen, so nothing
// here needs a motion branch of its own; a backdrop that has settled is kept
// as pixels and copied back rather than painted again.

import { HIGHWAY, JUDGMENTS, LANE_IDENTITIES, LAYOUT } from "../app/Config";
import { LANES, type BeatMark, type Lane } from "../charts/ChartTypes";
import { clamp, lowerBound, seededRandom } from "../utils/MathUtils";
import type { RenderFrame } from "./GameRenderer";
import { edgeXAtProgress, effectFade, noteProgress, visibleBackMs, yAtProgress } from "./Geometry";
import {
  SCENE,
  clearGlow,
  judgmentColor,
  laneColor,
  pathLaneColumn,
  pathLaneSymbol,
  rgba,
  setGlow,
  type Palette,
  type ViewMetrics,
} from "./Theme";

const TAU = Math.PI * 2;
/** Floats per backdrop particle: x, y, speed in px per ms, radius. */
const PARTICLE_STRIDE = 4;
// Reused so a dashed stroke does not allocate an array per frame.
const GHOST_DASH: number[] = [6, 6];
const NO_DASH: number[] = [];
const beatTimeKey = (mark: BeatMark): number => mark.timeMs;

export class HighwayRenderer {
  private cacheWidth = -1;
  private cacheHeight = -1;
  private cachePalette: Palette | null = null;
  private sky: CanvasGradient | null = null;
  private corridorFill: CanvasGradient | null = null;
  private beamFill: CanvasGradient | null = null;
  private gateFill: CanvasGradient | null = null;
  private corridorPath: Path2D | null = null;
  private particles = new Float64Array(SCENE.particleCount * PARTICLE_STRIDE);
  private random = seededRandom(1);
  private seed = 1;
  /** Backdrop inputs of the previous frame, to spot a scene that has stopped moving. */
  private lastSceneTimeMs = Number.NaN;
  private lastEnergy = Number.NaN;
  /** The last backdrop kept as pixels, and the inputs it was drawn from. */
  private backdrop: HTMLCanvasElement | null = null;
  private backdropCtx: CanvasRenderingContext2D | null = null;
  private backdropSceneTimeMs = Number.NaN;
  private backdropEnergy = Number.NaN;
  /** Song time of the next pending note per lane, for the ghost guide. */
  private readonly ghostTimes = new Float64Array(LANES.length);

  reseed(seed: number): void {
    this.seed = seed;
    this.cachePalette = null;
  }

  prepare(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette): void {
    if (this.cacheWidth === m.width && this.cacheHeight === m.height && this.cachePalette === pal) return;
    this.cacheWidth = m.width;
    this.cacheHeight = m.height;
    this.cachePalette = pal;
    this.dropBackdrop();
    const { layout } = m;

    const sky = ctx.createLinearGradient(0, 0, 0, m.height);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBottom);
    this.sky = sky;

    const corridor = ctx.createLinearGradient(0, layout.gateY, 0, layout.spawnY);
    corridor.addColorStop(0, pal.corridorNear);
    corridor.addColorStop(1, pal.corridorFar);
    this.corridorFill = corridor;

    const beam = ctx.createLinearGradient(0, 0, 0, layout.gateY);
    beam.addColorStop(0, rgba(pal.beam, 0.34));
    beam.addColorStop(0.55, rgba(pal.beam, 0.12));
    beam.addColorStop(1, rgba(pal.beam, 0));
    this.beamFill = beam;

    const barHeight = this.gateBarHeight(m);
    const gate = ctx.createLinearGradient(0, layout.gateY - barHeight, 0, layout.gateY + barHeight);
    gate.addColorStop(0, rgba(pal.gateBar, 0));
    gate.addColorStop(0.5, rgba(pal.gateBar, 0.75));
    gate.addColorStop(1, rgba(pal.gateBar, 0));
    this.gateFill = gate;

    const path = new Path2D();
    path.moveTo(edgeXAtProgress(layout, 0, 0), layout.gateY);
    path.lineTo(edgeXAtProgress(layout, LANES.length, 0), layout.gateY);
    path.lineTo(edgeXAtProgress(layout, LANES.length, 1), layout.spawnY);
    path.lineTo(edgeXAtProgress(layout, 0, 1), layout.spawnY);
    path.closePath();
    this.corridorPath = path;

    this.random = seededRandom(this.seed);
    const p = this.particles;
    for (let i = 0; i < SCENE.particleCount; i++) {
      const base = i * PARTICLE_STRIDE;
      p[base] = this.random() * m.width;
      p[base + 1] = this.random() * m.height;
      p[base + 2] = SCENE.particleSpeedMin + this.random() * (SCENE.particleSpeedMax - SCENE.particleSpeedMin);
      p[base + 3] = 0.6 + this.random() * 1.6;
    }
  }

  /** Deep navy, clockwork rings, receding arches, the conductor beam and drifting motes. */
  drawBackdrop(
    ctx: CanvasRenderingContext2D,
    m: ViewMetrics,
    pal: Palette,
    sceneTimeMs: number,
    energy: number,
    deltaMs: number,
  ): void {
    // The backdrop is a pure function of scene time, beam energy and the
    // gradients prepare() holds, so a frame with the same three paints the
    // same pixels: a pause, a frozen frame, the results dwell, an idle menu
    // and gameplay under reduced motion all repeat here. Those frames copy the
    // last one back instead of laying down a full canvas of gradients, rings,
    // arches and motes again.
    const settled = deltaMs === 0 && sceneTimeMs === this.lastSceneTimeMs && energy === this.lastEnergy;
    this.lastSceneTimeMs = sceneTimeMs;
    this.lastEnergy = energy;
    if (settled && this.blitBackdrop(ctx, sceneTimeMs, energy)) return;

    ctx.fillStyle = this.sky ?? pal.skyBottom;
    ctx.fillRect(0, 0, m.width, m.height);
    // High contrast keeps the flat black field and nothing else.
    if (!pal.glow) return;

    const horizonY = m.layout.spawnY * 0.6;
    this.drawRings(ctx, m, pal, sceneTimeMs, horizonY);
    this.drawArches(ctx, m, pal, sceneTimeMs, horizonY);
    this.drawBeam(ctx, m, pal, sceneTimeMs, energy);
    this.drawMotes(ctx, m, pal, deltaMs);
    // Only worth keeping once a frame has repeated: an animating scene would
    // pay for a copy it never reads.
    if (settled) this.keepBackdrop(ctx, sceneTimeMs, energy);
  }

  /** Repaints the stored backdrop if it was drawn from these very inputs. */
  private blitBackdrop(ctx: CanvasRenderingContext2D, sceneTimeMs: number, energy: number): boolean {
    const kept = this.backdrop;
    if (!kept || sceneTimeMs !== this.backdropSceneTimeMs || energy !== this.backdropEnergy) return false;
    const target = ctx.canvas;
    if (kept.width !== target.width || kept.height !== target.height) return false;
    ctx.save();
    // Device pixels, so the copy lands one for one whatever the ratio is.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(kept, 0, 0);
    ctx.restore();
    return true;
  }

  /** Keeps the backdrop just drawn, which is all the canvas holds at this point. */
  private keepBackdrop(ctx: CanvasRenderingContext2D, sceneTimeMs: number, energy: number): void {
    if (typeof document === "undefined") return;
    const source = ctx.canvas;
    let kept = this.backdrop;
    if (!kept) {
      kept = document.createElement("canvas");
      this.backdrop = kept;
      this.backdropCtx = null;
    }
    if (kept.width !== source.width || kept.height !== source.height) {
      kept.width = source.width;
      kept.height = source.height;
      this.backdropCtx = null;
    }
    if (!this.backdropCtx) this.backdropCtx = kept.getContext("2d", { alpha: false });
    const into = this.backdropCtx;
    if (!into) return;
    into.setTransform(1, 0, 0, 1, 0, 0);
    into.drawImage(source, 0, 0);
    this.backdropSceneTimeMs = sceneTimeMs;
    this.backdropEnergy = energy;
  }

  /** A resize, a palette change or a reseed makes the stored pixels wrong. */
  private dropBackdrop(): void {
    this.backdropSceneTimeMs = Number.NaN;
    this.backdropEnergy = Number.NaN;
    this.lastSceneTimeMs = Number.NaN;
    this.lastEnergy = Number.NaN;
  }

  private drawRings(
    ctx: CanvasRenderingContext2D,
    m: ViewMetrics,
    pal: Palette,
    sceneTimeMs: number,
    horizonY: number,
  ): void {
    const cx = m.layout.centerX;
    const base = Math.max(m.width, m.height) * 0.1;
    const phase = (sceneTimeMs % SCENE.ringCycleMs) / SCENE.ringCycleMs;
    const spin = (sceneTimeMs / 90000) * TAU;
    ctx.strokeStyle = pal.ring;
    ctx.lineWidth = 1.2;
    for (let k = 0; k < SCENE.ringCount; k++) {
      const step = k + phase;
      const radius = base * Math.pow(2, step / 2);
      const life = step / SCENE.ringCount;
      ctx.globalAlpha = 0.3 * Math.min(1, step) * (1 - life);
      ctx.beginPath();
      ctx.ellipse(cx, horizonY, radius, radius * 0.42, 0, 0, TAU);
      ctx.stroke();
      // Clockwork ticks on two of the rings, turning slowly.
      if (k === 2 || k === 4) {
        ctx.globalAlpha *= 0.8;
        ctx.beginPath();
        for (let t = 0; t < 12; t++) {
          const angle = spin + (t / 12) * TAU;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle) * 0.42;
          ctx.moveTo(cx + cos * radius, horizonY + sin * radius);
          ctx.lineTo(cx + cos * radius * 1.05, horizonY + sin * radius * 1.05);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawArches(
    ctx: CanvasRenderingContext2D,
    m: ViewMetrics,
    pal: Palette,
    sceneTimeMs: number,
    horizonY: number,
  ): void {
    const cx = m.layout.centerX;
    const phase = (sceneTimeMs % SCENE.archCycleMs) / SCENE.archCycleMs;
    ctx.strokeStyle = pal.arch;
    ctx.lineWidth = 2;
    for (let k = 0; k < SCENE.archCount; k++) {
      // Arches walk toward the viewer, so depth counts down as time runs on.
      const depth = ((k - phase * SCENE.archCount + SCENE.archCount * 2) % SCENE.archCount) / SCENE.archCount;
      const halfWidth = m.width * (0.62 - 0.5 * depth);
      const topY = horizonY + (m.height * 0.42 - horizonY) * depth;
      const footY = m.height * (1 - 0.55 * depth);
      ctx.globalAlpha = 0.34 * Math.sin(Math.PI * depth);
      ctx.beginPath();
      ctx.moveTo(cx - halfWidth, footY);
      ctx.lineTo(cx - halfWidth, topY);
      ctx.quadraticCurveTo(cx, topY - halfWidth * 0.55, cx + halfWidth, topY);
      ctx.lineTo(cx + halfWidth, footY);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawBeam(
    ctx: CanvasRenderingContext2D,
    m: ViewMetrics,
    pal: Palette,
    sceneTimeMs: number,
    energy: number,
  ): void {
    const { layout } = m;
    const sway = Math.sin(sceneTimeMs / 2600) * m.width * 0.015;
    const topHalf = m.width * 0.05;
    const bottomHalf = layout.halfWidthAtGate * 1.15;
    ctx.globalAlpha = clamp(0.1 + 0.6 * energy, 0, 1);
    ctx.fillStyle = this.beamFill ?? pal.beam;
    ctx.beginPath();
    ctx.moveTo(layout.centerX + sway - topHalf, 0);
    ctx.lineTo(layout.centerX + sway + topHalf, 0);
    ctx.lineTo(layout.centerX + sway * 0.4 + bottomHalf, layout.gateY);
    ctx.lineTo(layout.centerX + sway * 0.4 - bottomHalf, layout.gateY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawMotes(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, deltaMs: number): void {
    const p = this.particles;
    ctx.fillStyle = pal.particle;
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    for (let i = 0; i < SCENE.particleCount; i++) {
      const base = i * PARTICLE_STRIDE;
      let y = p[base + 1] - p[base + 2] * deltaMs;
      if (y < -4) {
        y = m.height + 4;
        p[base] = this.random() * m.width;
      }
      p[base + 1] = y;
      const radius = p[base + 3];
      ctx.moveTo(p[base] + radius, y);
      ctx.arc(p[base], y, radius, 0, TAU);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Five lanes converging from the gate toward the vanishing point. */
  drawCorridor(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, frame: RenderFrame): void {
    const { layout } = m;
    const path = this.corridorPath;
    if (path) {
      ctx.fillStyle = this.corridorFill ?? pal.corridorNear;
      ctx.globalAlpha = pal.glow ? 0.92 : 1;
      ctx.fill(path);
      ctx.globalAlpha = 1;
    }

    // Depth cues across the corridor, evenly spaced in progress.
    ctx.strokeStyle = pal.rung;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for (let i = 1; i <= SCENE.rungCount; i++) {
      const progress = i / (SCENE.rungCount + 1);
      const y = yAtProgress(layout, progress);
      ctx.moveTo(edgeXAtProgress(layout, 0, progress), y);
      ctx.lineTo(edgeXAtProgress(layout, LANES.length, progress), y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    for (const lane of LANES) {
      if (!frame.heldLanes[lane]) continue;
      ctx.fillStyle = laneColor(lane, frame.highContrast);
      ctx.globalAlpha = 0.12;
      pathLaneColumn(ctx, layout, lane, -LAYOUT.pastGateFraction, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.lineWidth = pal.glow ? 1.4 : 2.4;
    for (let edge = 0; edge <= LANES.length; edge++) {
      const lit =
        (edge > 0 && frame.heldLanes[edge - 1] === true) ||
        (edge < LANES.length && frame.heldLanes[edge] === true);
      ctx.strokeStyle = lit ? pal.laneEdgeLit : pal.laneEdge;
      ctx.globalAlpha = lit ? 0.9 : 0.5;
      setGlow(ctx, pal, pal.laneEdgeLit, lit ? 10 : 0);
      ctx.beginPath();
      ctx.moveTo(edgeXAtProgress(layout, edge, 0), layout.gateY);
      ctx.lineTo(edgeXAtProgress(layout, edge, 1), layout.spawnY);
      ctx.stroke();
    }
    clearGlow(ctx);
    ctx.globalAlpha = 1;
  }

  /** The gate bar and its five receptors. */
  drawGate(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, frame: RenderFrame): void {
    const { layout } = m;
    const barHeight = this.gateBarHeight(m);
    const left = edgeXAtProgress(layout, 0, 0) - layout.laneWidthAtGate * 0.12;
    const right = edgeXAtProgress(layout, LANES.length, 0) + layout.laneWidthAtGate * 0.12;

    ctx.fillStyle = this.gateFill ?? pal.gateBar;
    ctx.globalAlpha = pal.glow ? 0.9 : 1;
    ctx.fillRect(left, layout.gateY - barHeight, right - left, barHeight * 2);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = pal.gateCore;
    ctx.lineWidth = pal.glow ? 2 : 3;
    setGlow(ctx, pal, pal.gateCore, 12);
    ctx.beginPath();
    ctx.moveTo(left, layout.gateY);
    ctx.lineTo(right, layout.gateY);
    ctx.stroke();
    clearGlow(ctx);

    if (frame.ghostGuide) this.collectGhostTimes(frame);

    for (const lane of LANES) {
      const identity = LANE_IDENTITIES[lane];
      const color = laneColor(lane, frame.highContrast);
      const x = layout.laneGateX[lane];
      const y = layout.gateY;
      const radius = layout.receptorRadius;
      const held = frame.heldLanes[lane] === true;

      pathLaneSymbol(ctx, identity.symbol, x, y, radius);
      ctx.fillStyle = color;
      ctx.globalAlpha = held ? 0.85 : 0.1;
      setGlow(ctx, pal, color, held ? 22 : 0);
      ctx.fill();
      clearGlow(ctx);

      ctx.globalAlpha = held ? 1 : 0.75;
      ctx.strokeStyle = held ? pal.gateCore : pal.receptor;
      ctx.lineWidth = pal.outlineWidth + (held ? 1 : 0);
      ctx.stroke();

      const flash = effectFade(frame.keyFlashMs[lane], LAYOUT.receptorFlashMs);
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.8;
        ctx.strokeStyle = color;
        ctx.lineWidth = pal.outlineWidth;
        setGlow(ctx, pal, color, 16 * flash);
        pathLaneSymbol(ctx, identity.symbol, x, y, radius * (1 + (1 - flash) * 0.55));
        ctx.stroke();
        clearGlow(ctx);
      }

      if (frame.ghostGuide) {
        const lead = this.ghostTimes[lane] - frame.displayMs;
        if (lead >= 0 && lead <= HIGHWAY.ghostLeadMs) {
          ctx.globalAlpha = 0.35 + 0.45 * (1 - lead / HIGHWAY.ghostLeadMs);
          ctx.strokeStyle = pal.gateCore;
          ctx.lineWidth = pal.outlineWidth;
          ctx.setLineDash(GHOST_DASH);
          pathLaneSymbol(ctx, identity.symbol, x, y, radius * 1.35);
          ctx.stroke();
          ctx.setLineDash(NO_DASH);
        }
      }

      const labels = frame.laneKeyLabels;
      if (labels) {
        ctx.globalAlpha = held ? 1 : 0.72;
        ctx.fillStyle = held ? pal.text : pal.textMuted;
        ctx.font = m.fontLabel;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(labels[lane], x, y + radius + LAYOUT.keyLabelOffsetPx);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Beat grid and hit windows sit under the notes so they never hide a gem. */
  drawDebugUnder(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, frame: RenderFrame): void {
    if (frame.showHitWindows) this.drawHitWindows(ctx, m, frame);
    if (frame.showBeatGrid) this.drawBeatGrid(ctx, m, pal, frame);
  }

  /** Lane bounds go over everything, because they are a measuring tool. */
  drawDebugOver(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, frame: RenderFrame): void {
    if (!frame.showLaneBounds) return;
    const { layout } = m;
    ctx.setLineDash(GHOST_DASH);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    for (let edge = 0; edge <= LANES.length; edge++) {
      ctx.strokeStyle = edge === 0 || edge === LANES.length ? pal.gridDownbeat : pal.grid;
      ctx.beginPath();
      ctx.moveTo(edgeXAtProgress(layout, edge, -LAYOUT.pastGateFraction), yAtProgress(layout, -LAYOUT.pastGateFraction));
      ctx.lineTo(edgeXAtProgress(layout, edge, 1), layout.spawnY);
      ctx.stroke();
    }
    ctx.setLineDash(NO_DASH);
    ctx.font = m.fontSmall;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = pal.textMuted;
    for (const lane of LANES) {
      ctx.fillText(LANE_IDENTITIES[lane].name, layout.laneGateX[lane], layout.spawnY - 4);
    }
    ctx.globalAlpha = 1;
  }

  private drawBeatGrid(
    ctx: CanvasRenderingContext2D,
    m: ViewMetrics,
    pal: Palette,
    frame: RenderFrame,
  ): void {
    const grid = frame.track.beatGrid;
    const { layout } = m;
    let index = lowerBound(grid, visibleBackMs(frame.displayMs, frame.approachMs), beatTimeKey);
    ctx.lineWidth = 1;
    for (; index < grid.length; index++) {
      const mark = grid[index];
      const progress = noteProgress(mark.timeMs, frame.displayMs, frame.approachMs);
      if (progress > 1) break;
      const y = yAtProgress(layout, progress);
      ctx.strokeStyle = mark.isDownbeat ? pal.gridDownbeat : pal.grid;
      ctx.globalAlpha = mark.isDownbeat ? 0.55 : 0.28;
      ctx.beginPath();
      ctx.moveTo(edgeXAtProgress(layout, 0, progress), y);
      ctx.lineTo(edgeXAtProgress(layout, LANES.length, progress), y);
      ctx.stroke();
      if (mark.isDownbeat) {
        ctx.font = m.fontSmall;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = pal.gridDownbeat;
        ctx.fillText(String(mark.measure), edgeXAtProgress(layout, 0, progress) - 6, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawHitWindows(ctx: CanvasRenderingContext2D, m: ViewMetrics, frame: RenderFrame): void {
    const { layout } = m;
    // Widest window first, so the tighter ones read as brighter bands on top.
    for (let i = JUDGMENTS.length - 1; i >= 0; i--) {
      const judgment = JUDGMENTS[i];
      const windowMs = frame.windows[judgment];
      const progress = windowMs / frame.approachMs;
      const yNear = yAtProgress(layout, -progress);
      const yFar = yAtProgress(layout, progress);
      ctx.fillStyle = judgmentColor(judgment, frame.highContrast);
      ctx.globalAlpha = 0.09;
      // The corridor narrows with distance, so each band follows the walls the
      // notes it measures travel between.
      ctx.beginPath();
      ctx.moveTo(edgeXAtProgress(layout, 0, -progress), yNear);
      ctx.lineTo(edgeXAtProgress(layout, LANES.length, -progress), yNear);
      ctx.lineTo(edgeXAtProgress(layout, LANES.length, progress), yFar);
      ctx.lineTo(edgeXAtProgress(layout, 0, progress), yFar);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private collectGhostTimes(frame: RenderFrame): void {
    for (const lane of LANES) this.ghostTimes[lane] = Number.POSITIVE_INFINITY;
    for (let i = 0; i < frame.noteCount; i++) {
      const view = frame.notes[i];
      if (view.state !== "pending") continue;
      const lane: Lane = view.note.lane;
      if (view.note.timeMs < frame.displayMs) continue;
      if (view.note.timeMs < this.ghostTimes[lane]) this.ghostTimes[lane] = view.note.timeMs;
    }
  }

  private gateBarHeight(m: ViewMetrics): number {
    return Math.max(3, m.height * 0.011);
  }
}
