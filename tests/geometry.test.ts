import { describe, expect, it } from "vitest";
import { LAYOUT } from "../src/app/Config";
import { LANES } from "../src/charts/ChartTypes";
import {
  beamEnergy,
  beatPulseScale,
  computeLayout,
  edgeXAtProgress,
  effectFade,
  isTimeVisible,
  laneCenterAtProgress,
  laneWidthAtProgress,
  noteProgress,
  noteScaleAtProgress,
  popupAlpha,
  popupRisePx,
  visibleBackMs,
  visibleFrontMs,
  yAtProgress,
} from "../src/render/Geometry";

const layout = computeLayout(1280, 720);

describe("computeLayout", () => {
  it("puts the gate and the spawn edge at the configured fractions", () => {
    expect(layout.gateY).toBeCloseTo(720 * LAYOUT.gateY, 6);
    expect(layout.spawnY).toBeCloseTo(720 * LAYOUT.spawnY, 6);
    expect(layout.gateY).toBeGreaterThan(layout.spawnY);
  });

  it("centers the corridor and narrows it toward the top", () => {
    expect(layout.centerX).toBe(640);
    expect(layout.halfWidthAtGate).toBeCloseTo((1280 * LAYOUT.bottomWidth) / 2, 6);
    expect(layout.halfWidthAtSpawn / layout.halfWidthAtGate).toBeCloseTo(LAYOUT.topWidthRatio, 6);
    expect(layout.laneWidthAtGate * LANES.length).toBeCloseTo(layout.halfWidthAtGate * 2, 6);
  });

  it("spreads the five lanes symmetrically around the center", () => {
    expect(layout.laneGateX[2]).toBeCloseTo(layout.centerX, 6);
    expect(layout.laneGateX[0] - layout.centerX).toBeCloseTo(layout.centerX - layout.laneGateX[4], 6);
    for (let lane = 1; lane < LANES.length; lane++) {
      expect(layout.laneGateX[lane]).toBeGreaterThan(layout.laneGateX[lane - 1]);
      expect(layout.laneSpawnX[lane]).toBeGreaterThan(layout.laneSpawnX[lane - 1]);
    }
    expect(layout.receptorRadius).toBeCloseTo((layout.laneWidthAtGate * LAYOUT.receptorSize) / 2, 6);
  });

  it("keeps the outermost lane inside the corridor at both ends", () => {
    expect(layout.laneGateX[4] + layout.laneWidthAtGate / 2).toBeCloseTo(
      layout.centerX + layout.halfWidthAtGate,
      6,
    );
    expect(layout.laneSpawnX[0] - layout.laneWidthAtSpawn / 2).toBeCloseTo(
      layout.centerX - layout.halfWidthAtSpawn,
      6,
    );
  });
});

describe("noteProgress", () => {
  it("is 1 at the spawn edge, 0 at the gate and negative past it", () => {
    expect(noteProgress(3000, 1000, 2000)).toBe(1);
    expect(noteProgress(1000, 1000, 2000)).toBe(0);
    expect(noteProgress(700, 1000, 2000)).toBeCloseTo(-0.15, 6);
  });

  it("does not divide by a zero approach time", () => {
    expect(noteProgress(3000, 1000, 0)).toBe(0);
  });
});

describe("position at progress", () => {
  it("maps progress onto the gate and spawn rows", () => {
    expect(yAtProgress(layout, 0)).toBeCloseTo(layout.gateY, 6);
    expect(yAtProgress(layout, 1)).toBeCloseTo(layout.spawnY, 6);
    expect(yAtProgress(layout, 0.5)).toBeCloseTo((layout.gateY + layout.spawnY) / 2, 6);
    expect(yAtProgress(layout, -0.15)).toBeGreaterThan(layout.gateY);
  });

  it("converges lanes toward the vanishing point", () => {
    for (const lane of LANES) {
      expect(laneCenterAtProgress(layout, lane, 0)).toBeCloseTo(layout.laneGateX[lane], 6);
      expect(laneCenterAtProgress(layout, lane, 1)).toBeCloseTo(layout.laneSpawnX[lane], 6);
    }
    const spreadNear = laneCenterAtProgress(layout, 4, 0.1) - laneCenterAtProgress(layout, 0, 0.1);
    const spreadFar = laneCenterAtProgress(layout, 4, 0.9) - laneCenterAtProgress(layout, 0, 0.9);
    expect(spreadFar).toBeLessThan(spreadNear);
  });

  it("keeps lane edges ordered and flanking their lane center", () => {
    for (const p of [0, 0.5, 1]) {
      const width = laneWidthAtProgress(layout, p);
      expect(edgeXAtProgress(layout, 0, p)).toBeCloseTo(layout.centerX - (LANES.length * width) / 2, 6);
      for (const lane of LANES) {
        const left = edgeXAtProgress(layout, lane, p);
        const right = edgeXAtProgress(layout, lane + 1, p);
        expect(right - left).toBeCloseTo(width, 6);
        expect(laneCenterAtProgress(layout, lane, p)).toBeCloseTo((left + right) / 2, 6);
      }
    }
  });
});

describe("noteScaleAtProgress", () => {
  it("is full size at the gate and shrinks toward the spawn edge", () => {
    expect(noteScaleAtProgress(0)).toBe(1);
    expect(noteScaleAtProgress(1)).toBeCloseTo(LAYOUT.noteScaleAtSpawn, 6);
    expect(noteScaleAtProgress(0.5)).toBeGreaterThan(noteScaleAtProgress(0.75));
  });

  it("clamps outside the corridor so a note past the gate never inflates", () => {
    expect(noteScaleAtProgress(-0.4)).toBe(1);
    expect(noteScaleAtProgress(2)).toBeCloseTo(LAYOUT.noteScaleAtSpawn, 6);
  });

  it("matches the corridor taper, so a gem always fits its lane", () => {
    expect(noteScaleAtProgress(1)).toBeCloseTo(
      laneWidthAtProgress(layout, 1) / laneWidthAtProgress(layout, 0),
      6,
    );
  });
});

describe("visible window", () => {
  it("reaches one approach ahead and pastGateFraction behind", () => {
    expect(visibleFrontMs(1000, 2000)).toBe(3000);
    expect(visibleBackMs(1000, 2000)).toBe(1000 - LAYOUT.pastGateFraction * 2000);
  });

  it("includes a note exactly on either edge and drops the ones beyond", () => {
    expect(isTimeVisible(3000, 0, 1000, 2000)).toBe(true);
    expect(isTimeVisible(3001, 0, 1000, 2000)).toBe(false);
    expect(isTimeVisible(700, 0, 1000, 2000)).toBe(true);
    expect(isTimeVisible(699, 0, 1000, 2000)).toBe(false);
  });

  it("keeps a hold on screen while its tail is still above the gate", () => {
    expect(isTimeVisible(0, 900, 1000, 2000)).toBe(true);
    expect(isTimeVisible(0, 100, 1000, 2000)).toBe(false);
  });
});

describe("effect timing", () => {
  it("fades linearly and stays silent outside its life", () => {
    expect(effectFade(0, 400)).toBe(1);
    expect(effectFade(200, 400)).toBeCloseTo(0.5, 6);
    expect(effectFade(400, 400)).toBe(0);
    expect(effectFade(-5, 400)).toBe(0);
    expect(effectFade(10, 0)).toBe(0);
    expect(effectFade(Number.POSITIVE_INFINITY, 400)).toBe(0);
  });

  it("ramps a popup in and back out over at least 250 ms", () => {
    expect(LAYOUT.popupLifeMs).toBeGreaterThanOrEqual(250);
    expect(popupAlpha(-1)).toBe(0);
    expect(popupAlpha(0)).toBe(0);
    expect(popupAlpha(LAYOUT.popupFadeInMs)).toBeCloseTo(1 - LAYOUT.popupFadeInMs / LAYOUT.popupLifeMs, 6);
    expect(popupAlpha(LAYOUT.popupLifeMs)).toBe(0);
    expect(popupAlpha(LAYOUT.popupLifeMs + 50)).toBe(0);
    expect(popupAlpha(300)).toBeGreaterThan(popupAlpha(500));
  });

  it("rises to the full offset and stops there", () => {
    expect(popupRisePx(0)).toBe(0);
    expect(popupRisePx(LAYOUT.popupLifeMs)).toBeCloseTo(LAYOUT.popupRisePx, 6);
    expect(popupRisePx(LAYOUT.popupLifeMs * 4)).toBeCloseTo(LAYOUT.popupRisePx, 6);
    expect(popupRisePx(100)).toBeGreaterThan(popupRisePx(50));
    expect(popupRisePx(200) - popupRisePx(100)).toBeLessThan(popupRisePx(100) - popupRisePx(0));
  });

  it("every flash constant outlasts the 250 ms strobe floor", () => {
    expect(LAYOUT.laneFlashMs).toBeGreaterThanOrEqual(250);
    expect(LAYOUT.edgePulseMs).toBeGreaterThanOrEqual(250);
    expect(LAYOUT.burstLifeMs).toBeGreaterThanOrEqual(250);
    expect(LAYOUT.receptorFlashMs).toBeGreaterThanOrEqual(250);
  });
});

describe("beat pulse and beam energy", () => {
  it("peaks on the beat and settles before the next one", () => {
    expect(beatPulseScale(0, 0.08)).toBeCloseTo(1.08, 6);
    expect(beatPulseScale(1, 0.08)).toBe(1);
    expect(beatPulseScale(0.25, 0.08)).toBeGreaterThan(beatPulseScale(0.5, 0.08));
    expect(beatPulseScale(-2, 0.08)).toBeCloseTo(1.08, 6);
    expect(beatPulseScale(4, 0.08)).toBe(1);
  });

  it("follows the aura first and the chain second", () => {
    expect(beamEnergy(0, 100, 0)).toBeCloseTo(0.2, 6);
    expect(beamEnergy(100, 100, 0)).toBeCloseTo(0.7, 6);
    expect(beamEnergy(100, 100, 60)).toBeCloseTo(1, 6);
    expect(beamEnergy(100, 100, 600)).toBeCloseTo(1, 6);
    expect(beamEnergy(50, 100, 0)).toBeLessThan(beamEnergy(50, 100, 30));
    expect(beamEnergy(50, 0, 0)).toBeCloseTo(0.2, 6);
  });
});
