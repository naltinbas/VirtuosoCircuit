// Score, judgment counts, accuracy, the Performance Seal and the timing
// histogram the results screen draws. Every award is rounded as it lands so
// the running total is always an integer.

import {
  ACCURACY_WEIGHTS,
  JUDGMENT_WINDOWS_MS,
  JUDGMENTS,
  SCORE_CONFIG,
  SEAL_THRESHOLDS,
  type Judgment,
  type Seal,
} from "../app/Config";

export class ScoreSystem {
  /** Mutated in place so the snapshot can hold this object without copying. */
  readonly counts: Record<Judgment, number> = { radiant: 0, precise: 0, good: 0, faint: 0, miss: 0 };
  readonly timingDeltas: number[] = [];

  private total = 0;
  private judged = 0;
  private early = 0;
  private ticks = 0;
  private phrases = 0;
  private trills = 0;
  private chords = 0;

  get score(): number {
    return this.total;
  }

  get judgedCount(): number {
    return this.judged;
  }

  get misses(): number {
    return this.counts.miss;
  }

  get earlyReleases(): number {
    return this.early;
  }

  get holdTicks(): number {
    return this.ticks;
  }

  get phrasesCompleted(): number {
    return this.phrases;
  }

  get trillsCompleted(): number {
    return this.trills;
  }

  get chordsCompleted(): number {
    return this.chords;
  }

  get accuracy(): number {
    if (this.judged === 0) return 0;
    let weighted = 0;
    for (const j of JUDGMENTS) weighted += this.counts[j] * ACCURACY_WEIGHTS[j];
    return (100 * weighted) / this.judged;
  }

  /** Counts one resolved note. Only hits contribute a timing delta. */
  recordJudgment(judgment: Judgment, deltaMs: number): void {
    this.counts[judgment] += 1;
    this.judged += 1;
    if (judgment !== "miss") this.timingDeltas.push(deltaMs);
  }

  /** Undoes recordJudgment for a note that a practice loop put back on the highway. */
  removeJudgment(judgment: Judgment, deltaMs: number): void {
    if (this.counts[judgment] > 0) this.counts[judgment] -= 1;
    if (this.judged > 0) this.judged -= 1;
    if (judgment === "miss") return;
    const at = this.timingDeltas.indexOf(deltaMs);
    if (at >= 0) this.timingDeltas.splice(at, 1);
  }

  /** Adds base * Harmony Factor * surge to the score and returns what was added. */
  award(base: number, multiplier: number, surgeActive: boolean): number {
    const amount = Math.round(base * multiplier * (surgeActive ? SCORE_CONFIG.focusSurgeMultiplier : 1));
    this.total += amount;
    return amount;
  }

  addHoldTick(): void {
    this.ticks += 1;
  }

  addEarlyRelease(): void {
    this.early += 1;
  }

  addPhrase(trill: boolean): void {
    if (trill) this.trills += 1;
    else this.phrases += 1;
  }

  addChord(): void {
    this.chords += 1;
  }

  seal(completed: boolean): Seal {
    if (!completed) return "unfinished";
    const accuracy = this.accuracy;
    if (accuracy >= SEAL_THRESHOLDS.S.accuracy && this.counts.miss <= SEAL_THRESHOLDS.S.maxMisses) return "S";
    if (accuracy >= SEAL_THRESHOLDS.A.accuracy) return "A";
    if (accuracy >= SEAL_THRESHOLDS.B.accuracy) return "B";
    if (accuracy >= SEAL_THRESHOLDS.C.accuracy) return "C";
    return "D";
  }

  reset(): void {
    for (const j of JUDGMENTS) this.counts[j] = 0;
    this.timingDeltas.length = 0;
    this.total = 0;
    this.judged = 0;
    this.early = 0;
    this.ticks = 0;
    this.phrases = 0;
    this.trills = 0;
    this.chords = 0;
  }
}

/**
 * Buckets hit deltas for the results histogram. Bucket 0 holds the earliest
 * presses, the last bucket the latest; positive deltas are late.
 */
export function timingHistogram(
  deltas: readonly number[],
  bucketMs = 20,
  rangeMs: number = JUDGMENT_WINDOWS_MS.faint,
): number[] {
  const count = Math.max(1, Math.ceil((rangeMs * 2) / bucketMs));
  const buckets = new Array<number>(count).fill(0);
  for (const d of deltas) {
    const index = Math.floor((d + rangeMs) / bucketMs);
    buckets[index < 0 ? 0 : index >= count ? count - 1 : index] += 1;
  }
  return buckets;
}
