// The state machine behind every screen change.
//
// The table below is the whole contract: a state may only move to a state
// listed for it. An illegal move is a programming error, so a dev build throws
// rather than drifting into a screen nobody can leave; a production build logs
// and stays put.

import { EventEmitter } from "../utils/EventEmitter";
import { DEBUG_ENABLED } from "./Config";
import { GAMEPLAY_STATES, type GameState } from "./GameState";

export type RouterEvents = {
  change: { from: GameState; to: GameState };
};

/**
 * Legal moves out of each state. Panels reached with `open()` list every
 * screen they can return to, which is what `back()` walks.
 */
export const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  MAIN_MENU: ["TRACK_SELECT", "CALIBRATION", "SETTINGS", "CONTROLS", "CREDITS", "CHART_EDITOR"],
  TRACK_SELECT: ["MAIN_MENU", "LOADING_TRACK"],
  CALIBRATION: ["MAIN_MENU", "SETTINGS", "PAUSED"],
  SETTINGS: ["MAIN_MENU", "CALIBRATION", "CONTROLS", "PAUSED"],
  CONTROLS: ["MAIN_MENU", "SETTINGS", "PAUSED"],
  CREDITS: ["MAIN_MENU"],
  LOADING_TRACK: ["COUNTDOWN", "PRACTICE", "TRACK_SELECT", "MAIN_MENU"],
  COUNTDOWN: ["PLAYING", "PAUSED", "TRACK_SELECT", "MAIN_MENU"],
  PLAYING: ["COUNTDOWN", "PAUSED", "TRACK_COMPLETE", "PERFORMANCE_INTERRUPTED", "TRACK_SELECT", "MAIN_MENU"],
  PAUSED: ["COUNTDOWN", "PLAYING", "PRACTICE", "SETTINGS", "CALIBRATION", "CONTROLS", "TRACK_SELECT", "MAIN_MENU"],
  PRACTICE: ["PAUSED", "RESULTS", "TRACK_SELECT", "MAIN_MENU"],
  TRACK_COMPLETE: ["RESULTS"],
  PERFORMANCE_INTERRUPTED: ["RESULTS"],
  RESULTS: ["LOADING_TRACK", "TRACK_SELECT", "MAIN_MENU"],
  CHART_EDITOR: ["MAIN_MENU"],
};

/** Screens that open over whatever asked for them and return there. */
export const PANEL_STATES: ReadonlySet<GameState> = new Set(["SETTINGS", "CALIBRATION", "CONTROLS", "CREDITS"]);

/** Where `back()` goes when nothing recorded a return target. */
const DEFAULT_BACK: Partial<Record<GameState, GameState>> = {
  TRACK_SELECT: "MAIN_MENU",
  SETTINGS: "MAIN_MENU",
  CALIBRATION: "MAIN_MENU",
  CONTROLS: "MAIN_MENU",
  CREDITS: "MAIN_MENU",
  CHART_EDITOR: "MAIN_MENU",
  RESULTS: "TRACK_SELECT",
};

export interface RouterOptions {
  initial?: GameState;
  /** Throw on an illegal transition instead of logging it. Defaults to the debug flag. */
  strict?: boolean;
}

export class Router extends EventEmitter<RouterEvents> {
  private current: GameState;
  private previousState: GameState | null = null;
  /** Chain of screens a panel was opened from, so nested panels return in order. */
  private readonly returnStack: GameState[] = [];
  private resume: GameState | null = null;
  private readonly strict: boolean;

  constructor(options: RouterOptions = {}) {
    super();
    this.current = options.initial ?? "MAIN_MENU";
    this.strict = options.strict ?? DEBUG_ENABLED;
  }

  get state(): GameState {
    return this.current;
  }

  get previous(): GameState | null {
    return this.previousState;
  }

  /** Where the panel on screen was opened from. */
  get returnTo(): GameState | null {
    return this.returnStack.length > 0 ? this.returnStack[this.returnStack.length - 1] : null;
  }

  /** The gameplay state a pause interrupted, so Resume knows where to go. */
  get resumeState(): GameState | null {
    return this.resume;
  }

  can(to: GameState): boolean {
    return to === this.current || TRANSITIONS[this.current].includes(to);
  }

  goTo(to: GameState): void {
    if (to === this.current) return;
    if (!this.can(to)) {
      const message = `Illegal transition ${this.current} -> ${to}`;
      if (this.strict) throw new Error(message);
      console.error(message);
      return;
    }
    this.apply(to);
  }

  /** Enters a panel and remembers the screen it was opened from. */
  open(to: GameState): void {
    if (!this.can(to)) {
      const message = `Illegal transition ${this.current} -> ${to}`;
      if (this.strict) throw new Error(message);
      console.error(message);
      return;
    }
    const from = this.current;
    this.goTo(to);
    if (this.current === to) this.returnStack.push(from);
  }

  /** Returns to the screen that opened this one, or to that state's default. */
  back(): void {
    const target = this.returnStack.pop() ?? this.defaultBack();
    if (target === null || target === this.current) return;
    this.goTo(target);
  }

  /** Debug entry point. Skips the table, so only window.vc uses it. */
  force(to: GameState): void {
    if (to === this.current) return;
    this.apply(to);
  }

  private defaultBack(): GameState | null {
    if (this.current === "PAUSED") return this.resume;
    return DEFAULT_BACK[this.current] ?? null;
  }

  private apply(to: GameState): void {
    const from = this.current;
    if (to === "PAUSED" && GAMEPLAY_STATES.has(from)) this.resume = from;
    if (to === "MAIN_MENU" || to === "TRACK_SELECT") this.resume = null;
    // A panel chain ends the moment the game lands on something that is not a panel.
    if (!PANEL_STATES.has(to)) this.returnStack.length = 0;
    this.previousState = from;
    this.current = to;
    this.emit("change", { from, to });
  }
}
