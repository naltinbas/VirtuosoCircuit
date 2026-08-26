// The Resonance Chain and the Harmony Factor it drives, plus the miss streak
// that the Recenter bonus watches.

import { AURA_CONFIG, SCORE_CONFIG } from "../app/Config";

export class ComboSystem {
  private chain = 0;
  private best = 0;
  private streak = 0;
  private factor = 1;

  get combo(): number {
    return this.chain;
  }

  get bestCombo(): number {
    return this.best;
  }

  get multiplier(): number {
    return this.factor;
  }

  get missStreak(): number {
    return this.streak;
  }

  /**
   * Records a non-miss judgment. Returns true when this hit ends a miss streak
   * long enough to earn a Recenter.
   */
  registerHit(): boolean {
    const recenter = this.streak >= AURA_CONFIG.recenterAfterMisses;
    this.streak = 0;
    this.chain += 1;
    if (this.chain > this.best) this.best = this.chain;
    this.factor = Math.min(
      SCORE_CONFIG.maxMultiplier,
      1 + Math.floor(this.chain / SCORE_CONFIG.multiplierStepEvery),
    );
    return recenter;
  }

  registerMiss(): void {
    this.chain = 0;
    this.factor = 1;
    this.streak += 1;
  }

  reset(): void {
    this.chain = 0;
    this.best = 0;
    this.streak = 0;
    this.factor = 1;
  }
}
