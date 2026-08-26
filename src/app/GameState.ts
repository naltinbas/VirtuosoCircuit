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

/**
 * States in which lane key presses reach the game. The countdown is included
 * because the first notes are already on the highway and may legally be hit
 * up to 200 ms early.
 */
export const GAMEPLAY_STATES: ReadonlySet<GameState> = new Set(["COUNTDOWN", "PLAYING", "PRACTICE"]);

export type PlayMode = "performance" | "practice" | "free";
