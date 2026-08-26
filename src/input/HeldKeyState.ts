// Which codes are down in each lane.
//
// A lane can be reached by several keys at once (the primary plus its fixed
// alternates), so the lane is held while any of its codes is down. Only the
// first code down presses the lane and only the last one up releases it, which
// is what keeps a hold alive when the player rolls from the arrow key onto the
// letter key.

import { LANES, type Lane } from "../charts/ChartTypes";

export interface LaneRelease {
  lane: Lane;
  /** True when the lane has no codes left down and the hold should end. */
  released: boolean;
}

export class HeldKeyState {
  private readonly codes: Set<string>[] = LANES.map(() => new Set<string>());
  private readonly held: boolean[] = LANES.map(() => false);

  get heldLanes(): readonly boolean[] {
    return this.held;
  }

  isHeld(lane: Lane): boolean {
    return this.held[lane];
  }

  /** True when a code is down anywhere, whichever lane it belongs to. */
  hasCode(code: string): boolean {
    for (const lane of LANES) {
      if (this.codes[lane].has(code)) return true;
    }
    return false;
  }

  /** Records a key going down. True when the lane just went from idle to held. */
  down(lane: Lane, code: string): boolean {
    if (code === "" || this.hasCode(code)) return false;
    const set = this.codes[lane];
    const wasEmpty = set.size === 0;
    set.add(code);
    this.held[lane] = true;
    return wasEmpty;
  }

  /** Records a key going up. Null when the code was not down. */
  up(code: string): LaneRelease | null {
    for (const lane of LANES) {
      const set = this.codes[lane];
      if (!set.delete(code)) continue;
      const released = set.size === 0;
      if (released) this.held[lane] = false;
      return { lane, released };
    }
    return null;
  }

  /** Drops every key without reporting a release; the caller cancels holds itself. */
  clear(): void {
    for (const lane of LANES) {
      this.codes[lane].clear();
      this.held[lane] = false;
    }
  }
}
