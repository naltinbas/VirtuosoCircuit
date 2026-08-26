// Palette, fonts and lane symbol paths for the canvas layer.
//
// Two looks: the neon conservatory and a high contrast variant that drops
// every glow and paints on flat black. Colors are literal strings picked once,
// because building an rgba() string per note would allocate on every frame.
// Transparency at draw time comes from ctx.globalAlpha instead.

import { JUDGMENT_LABELS, LANE_IDENTITIES, THEME_COLORS, type Judgment, type LaneIdentity } from "../app/Config";
import type { Lane } from "../charts/ChartTypes";
import { clamp } from "../utils/MathUtils";
import { computeLayout, edgeXAtProgress, yAtProgress, type HighwayLayout } from "./Geometry";

export interface Palette {
  /** Backdrop gradient, top to bottom. */
  readonly skyTop: string;
  readonly skyBottom: string;
  readonly ring: string;
  readonly arch: string;
  readonly beam: string;
  readonly particle: string;
  /** Corridor floor gradient, gate end to spawn end. */
  readonly corridorNear: string;
  readonly corridorFar: string;
  readonly laneEdge: string;
  readonly laneEdgeLit: string;
  readonly rung: string;
  readonly gateBar: string;
  readonly gateCore: string;
  readonly receptor: string;
  readonly noteOutline: string;
  readonly noteGlyph: string;
  readonly accentRim: string;
  readonly chordBar: string;
  readonly text: string;
  readonly textMuted: string;
  readonly grid: string;
  readonly gridDownbeat: string;
  readonly warning: string;
  readonly surge: string;
  /** Stroke width for note and receptor outlines. */
  readonly outlineWidth: number;
  /** False turns off every shadowBlur, which is what high contrast wants. */
  readonly glow: boolean;
}

const NEON_PALETTE: Palette = {
  skyTop: "#04061a",
  skyBottom: THEME_COLORS.navy,
  ring: "#2a3a7a",
  arch: "#1b2755",
  beam: "#8fa6ff",
  particle: "#b9c6ff",
  corridorNear: "#141d45",
  corridorFar: "#080d24",
  laneEdge: "#3b4a8f",
  laneEdgeLit: "#b9c6ff",
  rung: "#23306a",
  gateBar: THEME_COLORS.violet,
  gateCore: THEME_COLORS.white,
  receptor: "#c3ccf5",
  noteOutline: "#05081c",
  noteGlyph: "#0b1030",
  accentRim: THEME_COLORS.white,
  chordBar: "#dfe4ff",
  text: THEME_COLORS.white,
  textMuted: THEME_COLORS.textMuted,
  grid: "#38468a",
  gridDownbeat: "#7f8fdd",
  warning: "#ff4d5e",
  surge: THEME_COLORS.amber,
  outlineWidth: 1.6,
  glow: true,
};

const CONTRAST_PALETTE: Palette = {
  skyTop: "#000000",
  skyBottom: "#000000",
  ring: "#000000",
  arch: "#000000",
  beam: "#000000",
  particle: "#000000",
  corridorNear: "#000000",
  corridorFar: "#000000",
  laneEdge: "#8d97c9",
  laneEdgeLit: "#ffffff",
  rung: "#5a63a0",
  gateBar: "#ffffff",
  gateCore: "#ffffff",
  receptor: "#ffffff",
  noteOutline: "#000000",
  noteGlyph: "#000000",
  accentRim: "#ffffff",
  chordBar: "#ffffff",
  text: "#ffffff",
  textMuted: "#d5daf2",
  grid: "#6f7ab0",
  gridDownbeat: "#ffffff",
  warning: "#ff5566",
  surge: "#ffd98a",
  outlineWidth: 3,
  glow: false,
};

export function palette(highContrast: boolean): Palette {
  return highContrast ? CONTRAST_PALETTE : NEON_PALETTE;
}

export function laneColor(lane: Lane, highContrast: boolean): string {
  const identity = LANE_IDENTITIES[lane];
  return highContrast ? identity.highContrastColor : identity.color;
}

const JUDGMENT_COLORS: Readonly<Record<Judgment, string>> = {
  radiant: "#ffe6a3",
  precise: "#7ff0e2",
  good: "#b9a6ff",
  faint: "#9aa3c7",
  miss: "#ff7a6b",
};

const JUDGMENT_COLORS_CONTRAST: Readonly<Record<Judgment, string>> = {
  radiant: "#ffffff",
  precise: "#ffffff",
  good: "#e4e8ff",
  faint: "#c8cee8",
  miss: "#ff8f80",
};

export function judgmentColor(judgment: Judgment, highContrast: boolean): string {
  return highContrast ? JUDGMENT_COLORS_CONTRAST[judgment] : JUDGMENT_COLORS[judgment];
}

export function judgmentLabel(judgment: Judgment): string {
  return JUDGMENT_LABELS[judgment];
}

/** Drawing-only scene counts. Nothing here changes how the game plays. */
export const SCENE = {
  ringCount: 7,
  /** One full ring cycle in ms; rings grow outward and fade at the rim. */
  ringCycleMs: 14000,
  archCount: 5,
  archCycleMs: 22000,
  particleCount: 64,
  /** Slowest and fastest drift speed of a backdrop particle, in px per ms. */
  particleSpeedMin: 0.004,
  particleSpeedMax: 0.018,
  /** Sparks thrown by one Radiant hit. */
  burstParticles: 12,
  burstSpeedPxPerMs: 0.22,
  /** Depth cues drawn across the corridor between the gate and the spawn edge. */
  rungCount: 5,
  beatPulseAmount: 0.08,
} as const;

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Canvas size, text metrics and corridor layout. Rebuilt on resize only. */
export interface ViewMetrics {
  width: number;
  height: number;
  dpr: number;
  textScale: number;
  layout: HighwayLayout;
  popupSizePx: number;
  labelSizePx: number;
  smallSizePx: number;
  fontPopup: string;
  fontLabel: string;
  fontSmall: string;
}

export function buildMetrics(width: number, height: number, dpr: number, textScale: number): ViewMetrics {
  // Sizes track the canvas height and are floored so a small window stays
  // readable, capped so a large one does not turn the popups into banners.
  const popupSizePx = Math.round(clamp(height * 0.03 * textScale, 14, 46));
  const labelSizePx = Math.round(clamp(height * 0.021 * textScale, 11, 32));
  const smallSizePx = Math.round(clamp(height * 0.015 * textScale, 10, 22));
  return {
    width,
    height,
    dpr,
    textScale,
    layout: computeLayout(width, height),
    popupSizePx,
    labelSizePx,
    smallSizePx,
    fontPopup: `700 ${popupSizePx}px ${FONT_STACK}`,
    fontLabel: `600 ${labelSizePx}px ${FONT_STACK}`,
    fontSmall: `500 ${smallSizePx}px ${FONT_STACK}`,
  };
}

/**
 * Translucent form of a palette color. Only cache builders call this: an rgba
 * string per frame would allocate, so draw code uses ctx.globalAlpha instead.
 */
export function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const TAU = Math.PI * 2;
const STAR_OUTER = 1;
const STAR_INNER = 0.46;
/** Unit star vertices, so the star lane does not run trigonometry per gem. */
const STAR_POINTS = buildStarPoints();

function buildStarPoints(): Float64Array {
  const points = new Float64Array(20);
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? STAR_OUTER : STAR_INNER;
    points[i * 2] = Math.cos(angle) * radius;
    points[i * 2 + 1] = Math.sin(angle) * radius;
  }
  return points;
}

/**
 * Begins a path shaped like the lane symbol, centered on (x, y) with radius r.
 * The caller fills or strokes it.
 */
export function pathLaneSymbol(
  ctx: CanvasRenderingContext2D,
  symbol: LaneIdentity["symbol"],
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  switch (symbol) {
    case "triangle":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.92, y + r * 0.72);
      ctx.lineTo(x - r * 0.92, y + r * 0.72);
      ctx.closePath();
      break;
    case "diamond":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.86, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.86, y);
      ctx.closePath();
      break;
    case "circle":
      ctx.arc(x, y, r * 0.94, 0, TAU);
      break;
    case "square": {
      const half = r * 0.8;
      ctx.rect(x - half, y - half, half * 2, half * 2);
      break;
    }
    case "star":
      ctx.moveTo(x + STAR_POINTS[0] * r, y + STAR_POINTS[1] * r);
      for (let i = 1; i < 10; i++) ctx.lineTo(x + STAR_POINTS[i * 2] * r, y + STAR_POINTS[i * 2 + 1] * r);
      ctx.closePath();
      break;
  }
}

/** Glow helper. High contrast passes glow: false and gets flat shapes. */
export function setGlow(ctx: CanvasRenderingContext2D, pal: Palette, color: string, blur: number): void {
  if (!pal.glow || blur <= 0) {
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    return;
  }
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
}

export function clearGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
}

/** Traces one lane column between two progress values, for held lanes and flashes. */
export function pathLaneColumn(
  ctx: CanvasRenderingContext2D,
  layout: HighwayLayout,
  lane: Lane,
  fromProgress: number,
  toProgress: number,
): void {
  const yNear = yAtProgress(layout, fromProgress);
  const yFar = yAtProgress(layout, toProgress);
  ctx.beginPath();
  ctx.moveTo(edgeXAtProgress(layout, lane, fromProgress), yNear);
  ctx.lineTo(edgeXAtProgress(layout, lane + 1, fromProgress), yNear);
  ctx.lineTo(edgeXAtProgress(layout, lane + 1, toProgress), yFar);
  ctx.lineTo(edgeXAtProgress(layout, lane, toProgress), yFar);
  ctx.closePath();
}
