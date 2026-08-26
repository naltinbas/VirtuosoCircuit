// Keyboard input for the whole game.
//
// Listening happens on window in the capture phase so a stray focused element
// cannot swallow a lane key. Timestamps come from event.timeStamp, which sits
// on the performance timeline; App maps them onto the audio clock, so a press
// is judged at the moment it happened rather than at the frame that noticed it.

import { GAME_KEYS } from "../app/Config";
import { GAMEPLAY_STATES, type GameState } from "../app/GameState";
import type { Lane } from "../charts/ChartTypes";
import { EventEmitter } from "../utils/EventEmitter";
import { perfNowMs } from "../utils/TimeUtils";
import { HeldKeyState } from "./HeldKeyState";
import type { KeyBindings } from "./KeyBindings";

export type ShortcutAction = "pause" | "restart" | "practicePanel" | "perfOverlay" | "debugOverlay" | "focusSurge";

export type InputEvents = {
  lanePress: { lane: Lane; code: string; perfTs: number };
  laneRelease: { lane: Lane; code: string; perfTs: number };
  shortcut: { action: ShortcutAction; perfTs: number };
  /** The window lost focus or the tab went to the background. */
  focusLost: { reason: "blur" | "hidden" };
};

export interface InputManagerOptions {
  bindings: KeyBindings;
  state: () => GameState;
  /** Debug shortcuts and their preventDefault are off outside debug builds. */
  debug?: boolean;
  target?: Window;
  /**
   * Performance timeline reader. AudioEngine owns the clocks, but a keyboard
   * event has to be sanity checked against the same timeline it was stamped
   * on, so this is the one other place that reads it.
   */
  now?: () => number;
}

const ARROWS: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
// Widened once so the literal tuples in Config can be tested against a code.
const PAUSE_KEYS: readonly string[] = GAME_KEYS.pause;
const RESTART_KEYS: readonly string[] = GAME_KEYS.restart;
const PRACTICE_KEYS: readonly string[] = GAME_KEYS.practiceMenu;
const PERF_KEYS: readonly string[] = GAME_KEYS.perfOverlay;
const DEBUG_KEYS: readonly string[] = GAME_KEYS.debugOverlay;
const SURGE_KEYS: readonly string[] = GAME_KEYS.focusSurge;
/** Keys that always keep their browser behavior: reload, fullscreen, dev tools. */
const NEVER_PREVENTED: readonly string[] = ["F5", "F11", "F12"];

/** The two overlay keys, which belong to the player whatever has focus. */
function isOverlayKey(code: string): boolean {
  return PERF_KEYS.includes(code) || DEBUG_KEYS.includes(code);
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

export class InputManager extends EventEmitter<InputEvents> {
  private readonly heldState = new HeldKeyState();
  private readonly bindings: KeyBindings;
  private readonly stateOf: () => GameState;
  private readonly now: () => number;
  private readonly target: Window;
  private readonly debug: boolean;
  private attached = false;
  private captureHandler: ((code: string | null) => void) | null = null;

  constructor(options: InputManagerOptions) {
    super();
    this.bindings = options.bindings;
    this.stateOf = options.state;
    this.debug = options.debug ?? false;
    this.now = options.now ?? perfNowMs;
    this.target = options.target ?? window;
  }

  get heldLanes(): readonly boolean[] {
    return this.heldState.heldLanes;
  }

  /** True while a rebinding capture owns the keyboard. */
  get capturing(): boolean {
    return this.captureHandler !== null;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.target.addEventListener("keydown", this.onKeyDown, true);
    this.target.addEventListener("keyup", this.onKeyUp, true);
    this.target.addEventListener("blur", this.onBlur);
    this.target.document.addEventListener("visibilitychange", this.onVisibility);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.target.removeEventListener("keydown", this.onKeyDown, true);
    this.target.removeEventListener("keyup", this.onKeyUp, true);
    this.target.removeEventListener("blur", this.onBlur);
    this.target.document.removeEventListener("visibilitychange", this.onVisibility);
    this.endCapture();
  }

  setBindings(codes: readonly string[]): void {
    this.bindings.setBindings(codes);
    this.clearHeld();
  }

  /** Forgets every key without releasing holds; App cancels those itself. */
  clearHeld(): void {
    this.heldState.clear();
  }

  /**
   * Takes over the keyboard for one key, for the rebinding screen. The handler
   * gets the code, or null when the player pressed Escape to cancel.
   */
  beginCapture(handler: (code: string | null) => void): () => void {
    this.endCapture();
    this.captureHandler = handler;
    this.clearHeld();
    this.target.addEventListener("keydown", this.onCaptureKey, true);
    this.target.addEventListener("keyup", this.onCaptureSwallow, true);
    return () => this.endCapture();
  }

  endCapture(): void {
    if (this.captureHandler === null) return;
    this.captureHandler = null;
    this.target.removeEventListener("keydown", this.onCaptureKey, true);
    this.target.removeEventListener("keyup", this.onCaptureSwallow, true);
  }

  private readonly onCaptureKey = (event: KeyboardEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    const handler = this.captureHandler;
    if (handler === null) return;
    const code = event.code;
    this.endCapture();
    handler(code === "Escape" || code === "" ? null : code);
  };

  private readonly onCaptureSwallow = (event: KeyboardEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly onBlur = (): void => {
    this.emit("focusLost", { reason: "blur" });
  };

  private readonly onVisibility = (): void => {
    if (this.target.document.visibilityState === "hidden") this.emit("focusLost", { reason: "hidden" });
  };

  /**
   * event.timeStamp is normally the moment the key was pressed. A few browsers
   * and synthetic events hand back something else, so anything from the far
   * past or the future falls back to now.
   */
  private timestamp(event: KeyboardEvent): number {
    const perf = this.now();
    const ts = event.timeStamp;
    if (!Number.isFinite(ts) || ts < perf - 1000 || ts > perf + 5) return perf;
    return ts;
  }

  private shouldPrevent(code: string, state: GameState): boolean {
    if (NEVER_PREVENTED.includes(code)) return false;
    if (code === "F1" || code === "F3") return this.debug;
    const gameplay = GAMEPLAY_STATES.has(state);
    if (!gameplay && state !== "PAUSED") return false;
    if (gameplay && this.bindings.isLaneCode(code)) return true;
    if (code === "Space" || code === "Tab") return true;
    if (ARROWS.includes(code)) return true;
    return PAUSE_KEYS.includes(code) || RESTART_KEYS.includes(code);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.captureHandler !== null) return;
    const code = event.code;
    if (code === "") return;
    const state = this.stateOf();
    const gameplay = GAMEPLAY_STATES.has(state);
    if (!gameplay && !isOverlayKey(code) && isTextTarget(event.target)) return;
    if (this.shouldPrevent(code, state)) event.preventDefault();
    if (event.repeat) return;
    const perfTs = this.timestamp(event);

    if (PERF_KEYS.includes(code)) {
      this.emit("shortcut", { action: "perfOverlay", perfTs });
      return;
    }
    if (DEBUG_KEYS.includes(code)) {
      if (this.debug) this.emit("shortcut", { action: "debugOverlay", perfTs });
      return;
    }
    if (!gameplay && state !== "PAUSED") return;

    if (RESTART_KEYS.includes(code)) {
      event.stopPropagation();
      this.emit("shortcut", { action: "restart", perfTs });
      return;
    }
    if (PRACTICE_KEYS.includes(code)) {
      // Tab still moves focus inside the pause menu, so the menu keeps the
      // event; only the practice studio treats it as a shortcut.
      if (gameplay) event.stopPropagation();
      this.emit("shortcut", { action: "practicePanel", perfTs });
      return;
    }
    if (PAUSE_KEYS.includes(code)) {
      // Escape in the pause menu belongs to the menu itself, which knows
      // whether a dialog is open on top of it.
      if (!gameplay && code === "Escape") return;
      event.stopPropagation();
      this.emit("shortcut", { action: "pause", perfTs });
      return;
    }
    if (!gameplay) return;
    if (SURGE_KEYS.includes(code)) {
      event.stopPropagation();
      this.emit("shortcut", { action: "focusSurge", perfTs });
      return;
    }
    const lane = this.bindings.laneForCode(code);
    if (lane === null) return;
    event.stopPropagation();
    if (this.heldState.down(lane, code)) this.emit("lanePress", { lane, code, perfTs });
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.captureHandler !== null) return;
    const code = event.code;
    if (code === "") return;
    const state = this.stateOf();
    const gameplay = GAMEPLAY_STATES.has(state);
    if (!gameplay && !isOverlayKey(code) && isTextTarget(event.target)) return;
    if (this.shouldPrevent(code, state)) event.preventDefault();
    if (gameplay && this.bindings.isLaneCode(code)) event.stopPropagation();
    const release = this.heldState.up(code);
    if (release === null || !release.released) return;
    if (!gameplay) return;
    this.emit("laneRelease", { lane: release.lane, code, perfTs: this.timestamp(event) });
  };
}
