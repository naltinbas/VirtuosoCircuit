// Turns a signed timing delta into a judgment. Nothing else in gameplay/ is
// allowed to compare against the windows directly, so a track, a debug tool or
// a test can swap the window table without the rest of the code noticing.

import { JUDGMENT_WINDOWS_MS, type Judgment, type JudgmentWindows } from "../app/Config";

export class NoteJudge {
  readonly windows: JudgmentWindows;

  constructor(windows: JudgmentWindows = JUDGMENT_WINDOWS_MS) {
    // Copied so a caller cannot retune the game by mutating the object it passed in.
    this.windows = {
      radiant: windows.radiant,
      precise: windows.precise,
      good: windows.good,
      faint: windows.faint,
      miss: windows.miss,
    };
  }

  /**
   * Judgment for a press whose delta is `deltaMs` (positive = late). Returns
   * null when the press is further out than the miss window, which means it
   * belongs to no note at all.
   */
  judge(deltaMs: number): Judgment | null {
    const off = Math.abs(deltaMs);
    const w = this.windows;
    if (off <= w.radiant) return "radiant";
    if (off <= w.precise) return "precise";
    if (off <= w.good) return "good";
    if (off <= w.faint) return "faint";
    if (off <= w.miss) return "miss";
    return null;
  }

  get missWindowMs(): number {
    return this.windows.miss;
  }

  /** Delta reported for a note that ran out of time without a press. */
  get autoMissDeltaMs(): number {
    return this.windows.miss + 1;
  }
}

export function isHit(judgment: Judgment): boolean {
  return judgment !== "miss";
}
