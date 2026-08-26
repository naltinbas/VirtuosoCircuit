import { describe, expect, it, vi } from "vitest";
import { PANEL_STATES, Router, TRANSITIONS } from "../src/app/Router";
import type { GameState } from "../src/app/GameState";

function router(initial: GameState = "MAIN_MENU"): Router {
  return new Router({ initial, strict: true });
}

const ALL_STATES: readonly GameState[] = Object.keys(TRANSITIONS) as GameState[];

describe("transition table", () => {
  it("lists only known states", () => {
    for (const from of ALL_STATES) {
      for (const to of TRANSITIONS[from]) {
        expect(ALL_STATES).toContain(to);
      }
    }
  });

  it("never lists a state as its own target", () => {
    for (const from of ALL_STATES) expect(TRANSITIONS[from]).not.toContain(from);
  });

  it("can reach every state from the main menu", () => {
    const seen = new Set<GameState>(["MAIN_MENU"]);
    const queue: GameState[] = ["MAIN_MENU"];
    while (queue.length > 0) {
      const from = queue.shift() as GameState;
      for (const to of TRANSITIONS[from]) {
        if (seen.has(to)) continue;
        seen.add(to);
        queue.push(to);
      }
    }
    expect([...ALL_STATES].filter((s) => !seen.has(s))).toEqual([]);
  });

  it("lets every state reach the main menu again", () => {
    for (const from of ALL_STATES) {
      const seen = new Set<GameState>([from]);
      const queue: GameState[] = [from];
      let found = from === "MAIN_MENU";
      while (queue.length > 0 && !found) {
        const at = queue.shift() as GameState;
        for (const to of TRANSITIONS[at]) {
          if (to === "MAIN_MENU") found = true;
          if (seen.has(to)) continue;
          seen.add(to);
          queue.push(to);
        }
      }
      expect(found, `no path from ${from} to MAIN_MENU`).toBe(true);
    }
  });
});

describe("goTo", () => {
  it("moves and emits from and to", () => {
    const r = router();
    const seen: string[] = [];
    r.on("change", ({ from, to }) => seen.push(`${from}->${to}`));
    r.goTo("TRACK_SELECT");
    expect(r.state).toBe("TRACK_SELECT");
    expect(r.previous).toBe("MAIN_MENU");
    expect(seen).toEqual(["MAIN_MENU->TRACK_SELECT"]);
  });

  it("ignores a move to the state it is already in", () => {
    const r = router();
    const seen: string[] = [];
    r.on("change", () => seen.push("change"));
    r.goTo("MAIN_MENU");
    expect(seen).toEqual([]);
  });

  it("throws on an illegal transition when strict", () => {
    const r = router();
    expect(() => r.goTo("RESULTS")).toThrow(/Illegal transition MAIN_MENU -> RESULTS/);
    expect(r.state).toBe("MAIN_MENU");
  });

  it("logs and stays put when not strict", () => {
    const r = new Router({ initial: "MAIN_MENU", strict: false });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    r.goTo("RESULTS");
    expect(r.state).toBe("MAIN_MENU");
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("walks a whole performance", () => {
    const r = router();
    for (const to of ["TRACK_SELECT", "LOADING_TRACK", "COUNTDOWN", "PLAYING", "TRACK_COMPLETE", "RESULTS"] as const) {
      r.goTo(to);
    }
    expect(r.state).toBe("RESULTS");
    r.goTo("LOADING_TRACK");
    expect(r.state).toBe("LOADING_TRACK");
  });
});

describe("open and back", () => {
  it("returns to the screen that opened the panel", () => {
    const r = router();
    r.open("SETTINGS");
    expect(r.returnTo).toBe("MAIN_MENU");
    r.back();
    expect(r.state).toBe("MAIN_MENU");
    expect(r.returnTo).toBeNull();
  });

  it("unwinds nested panels one at a time", () => {
    const r = router("PLAYING");
    r.goTo("PAUSED");
    r.open("SETTINGS");
    r.open("CONTROLS");
    r.back();
    expect(r.state).toBe("SETTINGS");
    r.back();
    expect(r.state).toBe("PAUSED");
  });

  it("falls back to a default when nothing opened the screen", () => {
    const r = router();
    r.goTo("TRACK_SELECT");
    r.back();
    expect(r.state).toBe("MAIN_MENU");
  });

  it("does nothing on back from the main menu", () => {
    const r = router();
    r.back();
    expect(r.state).toBe("MAIN_MENU");
  });

  it("sends the pause menu back to the interrupted state", () => {
    const r = router("PRACTICE");
    r.goTo("PAUSED");
    r.back();
    expect(r.state).toBe("PRACTICE");
  });

  it("drops a panel chain once the game leaves the panels", () => {
    const r = router("PLAYING");
    r.goTo("PAUSED");
    r.open("SETTINGS");
    r.goTo("PAUSED");
    r.goTo("MAIN_MENU");
    expect(r.returnTo).toBeNull();
  });
});

describe("resume state", () => {
  it("remembers which gameplay state was paused", () => {
    const r = router("COUNTDOWN");
    r.goTo("PAUSED");
    expect(r.resumeState).toBe("COUNTDOWN");
    r.open("SETTINGS");
    r.back();
    expect(r.resumeState).toBe("COUNTDOWN");
  });

  it("forgets it once the player leaves the track", () => {
    const r = router("PLAYING");
    r.goTo("PAUSED");
    r.goTo("TRACK_SELECT");
    expect(r.resumeState).toBeNull();
  });
});

describe("force", () => {
  it("skips the table for the debug api", () => {
    const r = router();
    r.force("RESULTS");
    expect(r.state).toBe("RESULTS");
    expect(r.previous).toBe("MAIN_MENU");
  });
});

describe("panel states", () => {
  it("all return to the main menu", () => {
    for (const panel of PANEL_STATES) {
      expect(TRANSITIONS[panel]).toContain("MAIN_MENU");
    }
  });

  it("has no panel that can reach an outcome screen", () => {
    for (const panel of PANEL_STATES) {
      expect(TRANSITIONS[panel]).not.toContain("TRACK_COMPLETE");
      expect(TRANSITIONS[panel]).not.toContain("PERFORMANCE_INTERRUPTED");
    }
  });

  it("returns a panel opened over a paused run to the pause menu", () => {
    const r = router("PLAYING");
    r.goTo("PAUSED");
    r.open("CALIBRATION");
    // A run ended from the debug api under the panel goes back this way
    // before it can reach the interrupted screen.
    r.back();
    expect(r.state).toBe("PAUSED");
    expect(r.resumeState).toBe("PLAYING");
    expect(r.can("PLAYING")).toBe(true);
  });
});
