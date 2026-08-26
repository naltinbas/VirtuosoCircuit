export type GameState =
  | "MAIN_MENU"
  | "TRACK_SELECT"
  | "CALIBRATION"
  | "SETTINGS"
  | "CONTROLS"
  | "CREDITS"
  | "LOADING_TRACK"
  | "COUNTDOWN"
  | "PLAYING"
  | "PAUSED"
  | "PRACTICE"
  | "TRACK_COMPLETE"
  | "PERFORMANCE_INTERRUPTED"
  | "RESULTS"
  | "CHART_EDITOR";

/** States in which lane key presses are judged. */
export const GAMEPLAY_STATES: ReadonlySet<GameState> = new Set(["PLAYING", "PRACTICE"]);

export type PlayMode = "performance" | "practice" | "free";
