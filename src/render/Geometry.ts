// Pure geometry for the highway.
//
// Every number the drawing code needs to place a note, a lane edge, a receptor
// or a popup is computed here. The canvas modules are not testable in node, so
// keeping the math in one dependency free module is what makes the layout
// verifiable at all.

import { LAYOUT } from "../app/Config";
import { LANES, type Lane } from "../charts/ChartTypes";
import { clamp, easeOutCubic, lerp } from "../utils/MathUtils";

/** Pixel geometry of the corridor for one canvas size. Rebuilt only on resize. */
export interface HighwayLayout {
  width: number;
  height: number;
  /** y of the Resonance Gate and of the spawn edge, in CSS pixels. */
  gateY: number;
  spawnY: number;
  centerX: number;
  halfWidthAtGate: number;
  halfWidthAtSpawn: number;
  laneWidthAtGate: number;
  laneWidthAtSpawn: number;
  receptorRadius: number;
  /** Lane center x at the gate and at the spawn edge, one entry per lane. */
  laneGateX: readonly number[];
  laneSpawnX: readonly number[];
}

export function computeLayout(width: number, height: number): HighwayLayout {
  const centerX = width / 2;
  const halfWidthAtGate = (width * LAYOUT.bottomWidth) / 2;
  const halfWidthAtSpawn = halfWidthAtGate * LAYOUT.topWidthRatio;
  const laneWidthAtGate = (halfWidthAtGate * 2) / LANES.length;
  const laneWidthAtSpawn = (halfWidthAtSpawn * 2) / LANES.length;
  const laneGateX: number[] = [];
  const laneSpawnX: number[] = [];
  for (const lane of LANES) {
    const offset = lane - (LANES.length - 1) / 2;
    laneGateX.push(centerX + offset * laneWidthAtGate);
    laneSpawnX.push(centerX + offset * laneWidthAtSpawn);
  }
  return {
    width,
    height,
    gateY: height * LAYOUT.gateY,
    spawnY: height * LAYOUT.spawnY,
    centerX,
    halfWidthAtGate,
    halfWidthAtSpawn,
    laneWidthAtGate,
    laneWidthAtSpawn,
    receptorRadius: (laneWidthAtGate * LAYOUT.receptorSize) / 2,
    laneGateX,
    laneSpawnX,
  };
}

/** 1 at the spawn edge, 0 at the gate, negative once the note is past it. */
export function noteProgress(timeMs: number, displayMs: number, approachMs: number): number {
  return approachMs > 0 ? (timeMs - displayMs) / approachMs : 0;
}

export function yAtProgress(layout: HighwayLayout, progress: number): number {
  return lerp(layout.gateY, layout.spawnY, progress);
}

export function laneCenterAtProgress(layout: HighwayLayout, lane: Lane, progress: number): number {
  return lerp(layout.laneGateX[lane], layout.laneSpawnX[lane], progress);
}

/** Edge 0 is the left wall, edge LANES.length the right wall. */
export function edgeXAtProgress(layout: HighwayLayout, edge: number, progress: number): number {
  const offset = edge - LANES.length / 2;
  return layout.centerX + offset * laneWidthAtProgress(layout, progress);
}

export function laneWidthAtProgress(layout: HighwayLayout, progress: number): number {
  return lerp(layout.laneWidthAtGate, layout.laneWidthAtSpawn, progress);
}

/**
 * Perspective scale of a note. It follows the same interpolation as the
 * corridor walls, so a gem never grows wider than its lane.
 */
export function noteScaleAtProgress(progress: number): number {
  return lerp(1, LAYOUT.noteScaleAtSpawn, clamp(progress, 0, 1));
}

/** Oldest song time still drawn on the highway. */
export function visibleBackMs(displayMs: number, approachMs: number): number {
  return displayMs - LAYOUT.pastGateFraction * approachMs;
}

/** Newest song time still drawn on the highway (the spawn edge). */
export function visibleFrontMs(displayMs: number, approachMs: number): number {
  return displayMs + approachMs;
}

/** Same window NoteScheduler uses, so nothing pops in or out at a different moment. */
export function isTimeVisible(
  timeMs: number,
  durationMs: number,
  displayMs: number,
  approachMs: number,
): boolean {
  const tail = timeMs + Math.max(0, durationMs);
  return tail >= visibleBackMs(displayMs, approachMs) && timeMs <= visibleFrontMs(displayMs, approachMs);
}

/** Linear 1 to 0 over the life of an effect. Ages outside the life are silent. */
export function effectFade(ageMs: number, lifeMs: number): number {
  if (!(lifeMs > 0) || ageMs < 0 || ageMs >= lifeMs) return 0;
  return 1 - ageMs / lifeMs;
}

export function popupAlpha(ageMs: number, lifeMs: number = LAYOUT.popupLifeMs): number {
  if (ageMs < 0 || ageMs >= lifeMs || lifeMs <= 0) return 0;
  const rampIn = LAYOUT.popupFadeInMs > 0 ? Math.min(1, ageMs / LAYOUT.popupFadeInMs) : 1;
  return rampIn * (1 - ageMs / lifeMs);
}

export function popupRisePx(ageMs: number, lifeMs: number = LAYOUT.popupLifeMs): number {
  if (lifeMs <= 0) return LAYOUT.popupRisePx;
  return LAYOUT.popupRisePx * easeOutCubic(clamp(ageMs / lifeMs, 0, 1));
}

/**
 * Gentle swell that peaks on the beat and settles before the next one, so the
 * gems breathe with the arrangement instead of blinking.
 */
export function beatPulseScale(beatPhase: number, amount: number): number {
  const p = clamp(beatPhase, 0, 1);
  const fall = 1 - p;
  return 1 + amount * fall * fall * fall;
}

/**
 * Brightness of the conductor beam: mostly the Aura Meter, with a lift from a
 * long Resonance Chain so a clean run visibly brightens the hall.
 */
export function beamEnergy(aura: number, auraMax: number, combo: number, comboFull = 60): number {
  const auraPart = auraMax > 0 ? clamp(aura / auraMax, 0, 1) : 0;
  const comboPart = comboFull > 0 ? clamp(combo / comboFull, 0, 1) : 0;
  return clamp(0.2 + 0.5 * auraPart + 0.3 * comboPart, 0, 1);
}
