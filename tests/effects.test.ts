import { describe, expect, it } from "vitest";
import { LAYOUT } from "../src/app/Config";
import { EffectRenderer } from "../src/render/EffectRenderer";
import type { RenderFrame } from "../src/render/GameRenderer";
import { computeLayout } from "../src/render/Geometry";
import { SCENE, type ViewMetrics } from "../src/render/Theme";

const metrics: ViewMetrics = {
  width: 1280,
  height: 720,
  dpr: 1,
  textScale: 1,
  layout: computeLayout(1280, 720),
  popupSizePx: 20,
  labelSizePx: 16,
  smallSizePx: 12,
  fontPopup: "20px sans-serif",
  fontLabel: "16px sans-serif",
  fontSmall: "12px sans-serif",
};

/** Only the fields the effect update reads; the rest never leaves the renderer. */
function frameAt(displayMs: number): RenderFrame {
  return {
    displayMs,
    effectsEnabled: true,
    flashEffects: true,
    reducedMotion: false,
    game: { auraWarning: false },
  } as unknown as RenderFrame;
}

function burstAt(songMs: number): EffectRenderer {
  const effects = new EffectRenderer();
  effects.setMetrics(metrics);
  effects.addJudgment(0, "radiant", 0, songMs, false);
  return effects;
}

describe("hit bursts", () => {
  it("throws one burst of sparks on a radiant hit", () => {
    const effects = burstAt(1000);
    expect(effects.particleCount).toBe(SCENE.burstParticles);
    effects.update(frameAt(1000));
    expect(effects.particleCount).toBe(SCENE.burstParticles);
  });

  it("ages sparks on display time, not on the frame delta", () => {
    const effects = burstAt(1000);
    // A frozen frame draws the same sparks again rather than expiring them.
    for (let i = 0; i < 20; i++) effects.update(frameAt(1100));
    expect(effects.particleCount).toBe(SCENE.burstParticles);
    // The longest spark lives 1.2 times the configured life.
    effects.update(frameAt(1000 + LAYOUT.burstLifeMs * 1.2));
    expect(effects.particleCount).toBe(0);
  });

  it("culls a burst the run has already left behind", () => {
    const effects = burstAt(1000);
    // What forceComplete and a forward seek leave: sparks judged a whole song
    // ago, with the clock parked so the frame delta is zero.
    effects.update(frameAt(100000));
    expect(effects.particleCount).toBe(0);
  });
});
