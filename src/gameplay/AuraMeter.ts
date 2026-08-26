// The Aura Meter and the Focus Surge that spends it.
//
// The meter is stored in tenths of a percent so a long run adds up the same
// way every time; floating point deltas would drift and make two identical
// performances score differently.

import { AURA_CONFIG, SCORE_CONFIG } from "../app/Config";

const MAX_TENTHS = AURA_CONFIG.max * 10;
const START_TENTHS = AURA_CONFIG.start * 10;
const WARNING_TENTHS = AURA_CONFIG.warningBelow * 10;
const SURGE_COST_TENTHS = AURA_CONFIG.focusSurgeCost * 10;

export type AuraEvent = "none" | "warning" | "recovered";

export class AuraMeter {
  private value = START_TENTHS;
  private warningActive = false;
  private pending: AuraEvent = "none";
  private drainCarry = 0;
  private surgeOn = false;
  private surgeLeftMs = 0;

  get tenths(): number {
    return this.value;
  }

  /** Meter position on the 0..AURA_CONFIG.max scale the HUD draws. */
  get aura(): number {
    return this.value / 10;
  }

  get warning(): boolean {
    return this.warningActive;
  }

  get full(): boolean {
    return this.value === MAX_TENTHS;
  }

  get empty(): boolean {
    return this.value === 0;
  }

  get surgeActive(): boolean {
    return this.surgeOn;
  }

  get surgeRemainingMs(): number {
    return this.surgeLeftMs;
  }

  add(delta: number): void {
    this.setTenths(this.value + Math.round(delta * 10));
  }

  recenter(): void {
    this.add(AURA_CONFIG.recenterBonus);
  }

  /** Debug hook for window.vc.forceFail and the like. */
  setAura(value: number): void {
    this.setTenths(Math.round(value * 10));
  }

  /** Returns the warning transition since the last call, if any. */
  takeEvent(): AuraEvent {
    const event = this.pending;
    this.pending = "none";
    return event;
  }

  tryStartSurge(): boolean {
    if (this.surgeOn || this.value < MAX_TENTHS) return false;
    this.surgeOn = true;
    this.surgeLeftMs = SCORE_CONFIG.focusSurgeDurationMs;
    this.drainCarry = 0;
    return true;
  }

  /** Advances a running surge. Returns true on the update that ends it. */
  advanceSurge(dtMs: number): boolean {
    if (!this.surgeOn || dtMs <= 0) return false;
    const step = Math.min(dtMs, this.surgeLeftMs);
    this.drainTenths((SURGE_COST_TENTHS * step) / SCORE_CONFIG.focusSurgeDurationMs);
    this.surgeLeftMs -= step;
    if (this.surgeLeftMs > 0) return false;
    this.cancelSurge();
    return true;
  }

  cancelSurge(): void {
    this.surgeOn = false;
    this.surgeLeftMs = 0;
    this.drainCarry = 0;
  }

  reset(): void {
    this.value = START_TENTHS;
    this.warningActive = false;
    this.pending = "none";
    this.cancelSurge();
  }

  /** Spends a fractional amount of meter, keeping the remainder for later. */
  private drainTenths(amount: number): void {
    this.drainCarry += amount;
    const whole = Math.floor(this.drainCarry);
    if (whole <= 0) return;
    this.drainCarry -= whole;
    this.setTenths(this.value - whole);
  }

  private setTenths(next: number): void {
    this.value = next < 0 ? 0 : next > MAX_TENTHS ? MAX_TENTHS : next;
    const warning = this.value < WARNING_TENTHS;
    if (warning === this.warningActive) return;
    this.warningActive = warning;
    this.pending = warning ? "warning" : "recovered";
  }
}
