import { describe, expect, it } from "vitest";
import { JUDGMENT_WINDOWS_MS } from "../src/app/Config";
import { EffectRenderer } from "../src/render/EffectRenderer";
import type { RenderFrame } from "../src/render/GameRenderer";
import { computeLayout } from "../src/render/Geometry";
import { laneColor, palette, type ViewMetrics } from "../src/render/Theme";

const layout = computeLayout(1280, 720);

const metrics: ViewMetrics = {
  width: 1280,
  height: 720,
  dpr: 1,
  textScale: 1,
  layout,
  popupSizePx: 20,
  labelSizePx: 16,
  smallSizePx: 12,
  fontPopup: "20px sans-serif",
  fontLabel: "16px sans-serif",
  fontSmall: "12px sans-serif",
};

interface PathPoint {
  x: number;
  y: number;
}

interface RecordedFill {
  style: string;
  alpha: number;
  points: PathPoint[];
  arcs: number;
}

/** Enough of a 2D context to record what the renderer asked to be filled. */
class RecordingContext {
  fillStyle = "";
  strokeStyle = "";
  globalAlpha = 1;
  shadowBlur = 0;
  shadowColor = "";
  lineWidth = 1;
  font = "";
  textAlign = "";
  textBaseline = "";
  readonly fills: RecordedFill[] = [];
  private points: PathPoint[] = [];
  private arcs = 0;

  beginPath(): void {
    this.points = [];
    this.arcs = 0;
  }
  moveTo(x: number, y: number): void {
    this.points.push({ x, y });
  }
  lineTo(x: number, y: number): void {
    this.points.push({ x, y });
  }
  closePath(): void {}
  arc(x: number, y: number): void {
    this.points.push({ x, y });
    this.arcs++;
  }
  fill(): void {
    this.fills.push({ style: this.fillStyle, alpha: this.globalAlpha, points: this.points.slice(), arcs: this.arcs });
  }
  stroke(): void {}
  fillRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({
      style: this.fillStyle,
      alpha: this.globalAlpha,
      points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
      arcs: 0,
    });
  }
  fillText(): void {}
  setLineDash(): void {}
  save(): void {}
  restore(): void {}
}

function context(): { ctx: CanvasRenderingContext2D; recorder: RecordingContext } {
  const recorder = new RecordingContext();
  return { ctx: recorder as unknown as CanvasRenderingContext2D, recorder };
}

function frame(overrides: Partial<RenderFrame> = {}): RenderFrame {
  return {
    displayMs: 1000,
    approachMs: 1600,
    windows: JUDGMENT_WINDOWS_MS,
    effectsEnabled: true,
    flashEffects: true,
    reducedMotion: false,
    highContrast: false,
    showHitWindows: false,
    showBeatGrid: false,
    showLaneBounds: false,
    game: { auraWarning: false, surgeActive: false },
    ...overrides,
  } as unknown as RenderFrame;
}

describe("hit burst colour", () => {
  it("paints sparks with the palette in use rather than the neon set", () => {
    const effects = new EffectRenderer();
    effects.setMetrics(metrics);
    effects.addJudgment(3, "radiant", 0, 1000, false);

    const plain = context();
    const plainFrame = frame({ displayMs: 1100 });
    effects.update(plainFrame);
    effects.draw(plain.ctx, metrics, palette(false), plainFrame);
    const plainSparks = plain.recorder.fills.filter((f) => f.arcs > 0);
    expect(plainSparks.length).toBeGreaterThan(0);
    for (const spark of plainSparks) expect(spark.style).toBe(laneColor(3, false));

    // The same sparks, still in flight, follow a live high contrast switch.
    const contrast = context();
    const contrastFrame = frame({ displayMs: 1120, highContrast: true });
    effects.update(contrastFrame);
    effects.draw(contrast.ctx, metrics, palette(true), contrastFrame);
    const contrastSparks = contrast.recorder.fills.filter((f) => f.arcs > 0);
    expect(contrastSparks.length).toBe(plainSparks.length);
    for (const spark of contrastSparks) expect(spark.style).toBe(laneColor(3, true));
  });
});
