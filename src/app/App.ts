// The one place where audio, gameplay, rendering, input, persistence and the
// DOM screens meet.
//
// App owns the frame loop and every transition: the subsystems below it never
// call each other. A UI module gets AppApi and nothing else, which is what
// keeps the screens from reaching into the clock or the transport.

import { AudioClock } from "../audio/AudioClock";
import { AudioEngine } from "../audio/AudioEngine";
import { SoundEffects, type SfxName } from "../audio/SoundEffects";
import { SynthInstruments } from "../audio/SynthInstruments";
import { TrackTransport } from "../audio/TrackTransport";
import { mapperFor } from "../charts/ChartLoader";
import type { BeatMapper } from "../charts/BeatMapper";
import {
  LANES,
  type Difficulty,
  type Lane,
  type NoteInstance,
  type Section,
  type TrackChart,
} from "../charts/ChartTypes";
import { validateChartReport, type ValidationReport } from "../charts/ChartValidator";
import { TRACK_DEFINITIONS, getTrack } from "../charts/TrackCatalog";
import type { NoteView } from "../gameplay/NoteScheduler";
import { PracticeSystem, practicePrerollMs } from "../gameplay/PracticeSystem";
import { RhythmGame, type GameSnapshot, type PerformanceSummary } from "../gameplay/RhythmGame";
import { InputManager, type ShortcutAction } from "../input/InputManager";
import { KeyBindings } from "../input/KeyBindings";
import { SaveManager, chainUnlocks, type TrackResult } from "../persistence/SaveManager";
import { SettingsStore, type Settings } from "../persistence/SettingsStore";
import { safeLocalStorage } from "../persistence/Storage";
import { GameRenderer, type RenderFrame } from "../render/GameRenderer";
import { Hud } from "../ui/Hud";
import { CalibrationPanel } from "../ui/CalibrationPanel";
import { ChartEditor } from "../ui/ChartEditor";
import { ControlsPanel } from "../ui/ControlsPanel";
import { CreditsPanel } from "../ui/CreditsPanel";
import { DebugOverlay } from "../ui/DebugOverlay";
import { MainMenu } from "../ui/MainMenu";
import { PauseMenu } from "../ui/PauseMenu";
import { PracticePanel } from "../ui/PracticePanel";
import { ResultsScreen } from "../ui/ResultsScreen";
import { SettingsPanel } from "../ui/SettingsPanel";
import { TrackSelect } from "../ui/TrackSelect";
import { UIManager } from "../ui/UIManager";
import { clamp } from "../utils/MathUtils";
import { frameTimeAverage } from "../utils/TimeUtils";
import { AUDIO, DEBUG_ENABLED, HIGHWAY, LANE_IDENTITIES, type Judgment } from "./Config";
import { GAMEPLAY_STATES, type GameState, type PlayMode } from "./GameState";
import { PANEL_STATES, pathTo, Router } from "./Router";

export interface Session {
  track: TrackChart;
  difficulty: Difficulty;
  mode: PlayMode;
  game: RhythmGame;
  practice: PracticeSystem | null;
  /** True once a seek, an autoplay or a freeze touched the run. Assisted runs are never saved. */
  assisted: boolean;
  autoplay: boolean;
}

export interface ResultsData {
  track: TrackChart;
  difficulty: Difficulty;
  mode: PlayMode;
  summary: PerformanceSummary;
  previousBest?: TrackResult;
  isNewBest: boolean;
  saved: boolean;
  assisted: boolean;
  unlockedTrackId?: string;
}

/** Why the run is paused, which is what decides between the two paused screens. */
export type PauseReason = "menu" | "practice";

/** The keyboard handover the rebinding screen needs. */
export interface KeyCaptureApi {
  readonly capturing: boolean;
  /** Takes the next key press. The handler gets null when the player cancelled. */
  begin(handler: (code: string | null) => void): () => void;
}

/**
 * What the calibration screen needs from the audio side. It owns its own
 * scheduling loop, so it asks for times and clicks rather than for the engine.
 */
export interface CalibrationApi {
  audioNowMs(): number;
  perfToAudioMs(perfMs: number): number;
  outputLatencyMs(): number;
  readonly outputLatencySupported: boolean;
  isLaneKey(code: string): boolean;
  /** Schedules one metronome click on the audio clock and returns a cancel. */
  clickAt(atAudioMs: number, strong: boolean): () => void;
  playTestTone(): void;
}

/** Renderer and session switches the debug overlay owns. */
export interface DebugFlags {
  beatGrid: boolean;
  hitWindows: boolean;
  noteIds: boolean;
  laneBounds: boolean;
  autoplay: boolean;
  slowMotion: boolean;
  effects: boolean;
}

export interface InputLogEntry {
  lane: Lane;
  laneName: string;
  kind: "press" | "release";
  songMs: number;
  perfTs: number;
  /** Judgment delta of the press, or null when it matched no note. */
  deltaMs: number | null;
  judgment: Judgment | null;
}

/** One reading of everything the debug overlay prints. */
export interface DebugStats {
  state: GameState;
  fps: number;
  frameMs: number;
  audioMs: number;
  songMs: number;
  displayMs: number;
  rate: number;
  outputLatencyMs: number;
  outputLatencySupported: boolean;
  audioOffsetMs: number;
  visualOffsetMs: number;
  inputOffsetMs: number;
  judgmentOffsetMs: number;
  beat: number;
  measure: number;
  beatInMeasure: number;
  approachMs: number;
  trackId: string | null;
  difficulty: Difficulty | null;
  mode: PlayMode | null;
  assisted: boolean;
  eventCursor: number;
  scheduledCount: number;
  liveVoices: number;
  liveEffects: number;
  visibleNotes: number;
  particles: number;
  heldLanes: readonly boolean[];
  heldKeys: readonly string[];
  score: number;
  combo: number;
  multiplier: number;
  aura: number;
  accuracy: number;
  judgedCount: number;
  totalNotes: number;
  misses: number;
  inputLog: readonly InputLogEntry[];
}

/** Debug tooling. Null in a build with the debug flag off. */
export interface DebugApiHooks {
  readonly flags: Readonly<DebugFlags>;
  setFlag(flag: keyof DebugFlags, on: boolean): void;
  stats(): DebugStats;
  /** Validation report for the chart being played, or null with no session. */
  validation(): ValidationReport | null;
  openChartEditor(): void;
}

/** Everything a UI module may do. Screens never see the subsystems themselves. */
export interface AppApi {
  router: Router;
  settings: SettingsStore;
  save: SaveManager;
  audio: { available: boolean; unlocked: boolean; unlock(): Promise<boolean> };
  tracks(): readonly TrackChart[];
  isUnlocked(trackId: string): boolean;
  unlockReason(trackId: string): string | null;
  pendingMode: PlayMode;
  startTrack(id: string, difficulty: Difficulty, mode: PlayMode): Promise<void>;
  pause(): void;
  resume(): void;
  restart(): void;
  exitToTrackSelect(): void;
  exitToMainMenu(): void;
  practiceSection(section: Section | null): void;
  seekTo(ms: number): void;
  setPracticeLoop(startMs: number, endMs: number, enabled: boolean): void;
  session: Session | null;
  lastResults: ResultsData | null;
  pauseReason: PauseReason;
  keys: KeyCaptureApi;
  calibration: CalibrationApi;
  debug: DebugApiHooks | null;
  toggleFullscreen(): void;
  resetProgress(): void;
  announce(text: string): void;
}

/** window.vc, for the debug overlay, tests and screenshot scripts. */
export interface DebugApi {
  app: App;
  router: Router;
  settings: SettingsStore;
  save: SaveManager;
  ready: Promise<void>;
  version: string;
  startTrack(id: string, difficulty: Difficulty, mode?: PlayMode): Promise<void>;
  goTo(state: GameState): void;
  pause(): void;
  resume(): void;
  restart(): void;
  seek(songMs: number): void;
  freezeAt(songMs: number): void;
  setAutoplay(on: boolean): void;
  snapshot(): GameSnapshot | null;
  summary(): PerformanceSummary | null;
  forceComplete(): void;
  forceFail(): void;
  debug: { show(): void; hide(): void; perf(on: boolean): void };
}

declare global {
  interface Window {
    vc?: DebugApi;
  }
}

const JUDGMENT_SFX: Record<Judgment, SfxName> = {
  radiant: "hit-radiant",
  precise: "hit-precise",
  good: "hit-good",
  faint: "hit-faint",
  miss: "miss",
};

/** States that keep the play overlay on screen. */
const HUD_STATES: ReadonlySet<GameState> = new Set([
  "COUNTDOWN",
  "PLAYING",
  "PRACTICE",
  "PAUSED",
  "TRACK_COMPLETE",
  "PERFORMANCE_INTERRUPTED",
]);

/** States window.vc.goTo may jump to. Anything with a session goes through startTrack. */
const DEBUG_GOTO_STATES: ReadonlySet<GameState> = new Set([
  "MAIN_MENU",
  "TRACK_SELECT",
  "SETTINGS",
  "CALIBRATION",
  "CONTROLS",
  "CREDITS",
]);

/** Song time step used when the debug api runs a run forward without frames. */
const STEP_MS = 8;

/** Input events kept for the debug overlay. */
const INPUT_LOG_SIZE = 8;

/** What the debug slow motion multiplies the clock rate by. */
const SLOW_MOTION_RATE = 0.5;

export class App implements AppApi {
  readonly router: Router;
  readonly settings: SettingsStore;
  readonly save: SaveManager;
  readonly ready: Promise<void>;
  readonly audio: { available: boolean; unlocked: boolean; unlock(): Promise<boolean> };
  readonly keys: KeyCaptureApi;
  readonly calibration: CalibrationApi;
  readonly debug: DebugApiHooks | null;

  pendingMode: PlayMode = "performance";

  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly announcer: HTMLElement;
  private readonly engine: AudioEngine;
  private readonly clock: AudioClock;
  private readonly synth: SynthInstruments;
  private readonly sfx: SoundEffects;
  private readonly transport: TrackTransport;
  private readonly renderer: GameRenderer;
  private readonly bindings: KeyBindings;
  private readonly input: InputManager;
  private readonly ui: UIManager;
  private readonly hud: Hud;

  private debugOverlay: DebugOverlay | null = null;
  private trackCache: TrackChart[] | null = null;
  private current: Session | null = null;
  private results: ResultsData | null = null;
  private mapper: BeatMapper | null = null;
  private frame: RenderFrame | null = null;

  private rafId: number | null = null;
  private resolveReady: () => void = () => undefined;
  private unbindGame: (() => void)[] = [];
  private countdownCancels: (() => void)[] = [];
  private dwellTimer: ReturnType<typeof setTimeout> | null = null;
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private forcedOutcome = false;
  /** True while stepTo is walking the run forward without frames. */
  private stepping = false;

  private readonly noteBuffer: NoteView[] = [];
  private readonly heldLanes: boolean[] = LANES.map(() => false);
  private readonly keyFlashMs: number[] = LANES.map(() => Number.POSITIVE_INFINITY);
  private readonly lastPressDisplayMs: number[] = LANES.map(() => Number.NEGATIVE_INFINITY);

  private autoNotes: NoteInstance[] = [];
  private autoCursor = 0;
  private autoReleases: { lane: Lane; atMs: number }[] = [];
  private readonly autoHeld: boolean[] = LANES.map(() => false);

  private judgmentOffsetMs = 0;
  private lastDisplayMs: number | null = null;
  private lastFrameAudioMs: number | null = null;
  private lastFramePerfMs: number | null = null;
  private fps = 60;
  private frameMs = 16;
  private seed = 1;
  private debugView = false;

  private pauseReasonValue: PauseReason = "menu";
  /** Loop and speed as they were when the practice panel opened. */
  private practiceMark = "";
  private readonly debugFlags: DebugFlags = {
    beatGrid: false,
    hitWindows: false,
    noteIds: false,
    laneBounds: false,
    autoplay: false,
    slowMotion: false,
    effects: true,
  };
  private readonly inputLog: InputLogEntry[] = [];
  private validatedGame: RhythmGame | null = null;
  private validationReport: ValidationReport | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    const canvas = root.querySelector<HTMLCanvasElement>("#highway");
    const uiRoot = root.querySelector<HTMLElement>("#ui");
    const announcer = root.querySelector<HTMLElement>("#announcer");
    if (!canvas || !uiRoot || !announcer) throw new Error("The page is missing #highway, #ui or #announcer");
    this.canvas = canvas;
    this.announcer = announcer;

    const storage = safeLocalStorage();
    this.settings = new SettingsStore(storage, { prefersReducedMotion: prefersReducedMotion() });
    this.save = new SaveManager(
      storage,
      chainUnlocks(
        TRACK_DEFINITIONS.map((d) => ({
          id: d.metadata.id,
          title: d.metadata.title,
          unlockAfter: d.metadata.unlockAfter,
        })),
      ),
    );
    this.router = new Router({ initial: "MAIN_MENU" });

    const settings = this.settings.current;
    this.engine = new AudioEngine({
      volumes: { master: settings.masterVolume, music: settings.musicVolume, effects: settings.effectsVolume },
      muted: settings.muted,
    });
    this.clock = new AudioClock(() => this.engine.nowMs());
    this.synth = new SynthInstruments(this.engine);
    this.sfx = new SoundEffects(this.engine);
    this.transport = new TrackTransport({
      clock: this.clock,
      synth: this.synth,
      audioNowMs: () => this.engine.nowMs(),
      sfx: this.sfx,
    });
    this.renderer = new GameRenderer(canvas, root);
    this.bindings = new KeyBindings(settings.keyBindings);
    this.input = new InputManager({
      bindings: this.bindings,
      state: () => this.router.state,
      debug: DEBUG_ENABLED,
    });
    const engine = this.engine;
    this.audio = {
      get available(): boolean {
        return engine.available;
      },
      get unlocked(): boolean {
        return engine.unlocked;
      },
      unlock: () => engine.unlock(),
    };

    const input = this.input;
    this.keys = {
      get capturing(): boolean {
        return input.capturing;
      },
      begin: (handler) => input.beginCapture(handler),
    };
    this.calibration = {
      audioNowMs: () => this.engine.nowMs(),
      perfToAudioMs: (perfMs) => this.engine.perfToAudioMs(perfMs),
      outputLatencyMs: () => this.engine.outputLatencyMs(),
      get outputLatencySupported(): boolean {
        return engine.outputLatencySupported;
      },
      isLaneKey: (code) => this.bindings.isLaneCode(code),
      clickAt: (atAudioMs, strong) =>
        this.sfx.playAt(strong ? "metronome-strong" : "metronome-weak", atAudioMs),
      playTestTone: () => this.sfx.play("calibration-tone"),
    };
    this.debug = DEBUG_ENABLED
      ? {
          flags: this.debugFlags,
          setFlag: (flag, on) => this.setDebugFlag(flag, on),
          stats: () => this.debugStats(),
          validation: () => this.chartValidation(),
          openChartEditor: () => this.openChartEditor(),
        }
      : null;

    this.ui = new UIManager(
      uiRoot,
      this,
      {
        move: () => this.sfx.play("menu-move"),
        select: () => this.sfx.play("menu-select"),
        back: () => this.sfx.play("menu-back"),
      },
      (state) => (state === "PAUSED" ? this.pauseReasonValue : null),
    );
    this.hud = new Hud(this);
    root.insertBefore(this.hud.element, uiRoot);
    // The performance readout works in every state, so it sits outside the HUD,
    // which is hidden on the menus.
    root.append(this.hud.perfElement);

    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  start(): void {
    this.ui.register("MAIN_MENU", new MainMenu(this));
    this.ui.register("TRACK_SELECT", new TrackSelect(this));
    this.ui.register("PAUSED", new PauseMenu(this));
    this.ui.register("PAUSED", new PracticePanel(this), "practice");
    this.ui.register("RESULTS", new ResultsScreen(this));
    this.ui.register("SETTINGS", new SettingsPanel(this));
    this.ui.register("CONTROLS", new ControlsPanel(this));
    this.ui.register("CALIBRATION", new CalibrationPanel(this));
    this.ui.register("CREDITS", new CreditsPanel(this));

    if (this.debug !== null) {
      this.ui.register("CHART_EDITOR", new ChartEditor(this));
      this.debugOverlay = new DebugOverlay(this, this.debug);
      this.root.append(this.debugOverlay.element);
    }

    this.applySettings(this.settings.current);
    this.settings.on("change", ({ settings, changed }) => this.onSettingsChanged(settings, changed));
    this.save.on("change", () => this.ui.refresh());
    this.router.on("change", this.onRouteChange);

    this.engine.events.on("statechange", ({ running }) => {
      if (running) return;
      if (!GAMEPLAY_STATES.has(this.router.state)) return;
      this.pause();
      this.announce("Audio was interrupted");
    });
    this.engine.events.on("unavailable", () => {
      // A run that just lost its audio stops at the pause menu rather than
      // carrying on silently under the player.
      this.pause();
      this.announce("Audio is unavailable in this browser");
      this.ui.refresh();
    });

    this.input.on("lanePress", ({ lane, perfTs }) => this.onLanePress(lane, perfTs));
    this.input.on("laneRelease", ({ lane, perfTs }) => this.onLaneRelease(lane, perfTs));
    this.input.on("shortcut", ({ action }) => this.onShortcut(action));
    this.input.on("focusLost", () => this.onFocusLost());
    this.transport.on("loop", () => this.loopBack());
    this.input.attach();

    this.root.addEventListener("pointerdown", this.onFirstGesture, { once: true });
    window.addEventListener("keydown", this.onFirstGesture, { once: true });

    this.ui.sync();
    this.renderer.resize();
    this.rafId = requestAnimationFrame(this.onFrame);
    this.resolveReady();
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.cancelDwell();
    this.teardownSession();
    this.input.detach();
    this.debugOverlay?.destroy();
    this.ui.destroy();
    this.renderer.destroy();
  }

  // -------------------------------------------------------------------------
  // AppApi
  // -------------------------------------------------------------------------

  tracks(): readonly TrackChart[] {
    if (this.trackCache === null) {
      this.trackCache = TRACK_DEFINITIONS.map((definition) => getTrack(definition.metadata.id));
    }
    return this.trackCache;
  }

  isUnlocked(trackId: string): boolean {
    return this.save.isUnlocked(trackId, this.settings.current.unlockAll);
  }

  unlockReason(trackId: string): string | null {
    return this.save.unlockReason(trackId, this.settings.current.unlockAll);
  }

  get session(): Session | null {
    return this.current;
  }

  get lastResults(): ResultsData | null {
    return this.results;
  }

  async startTrack(id: string, difficulty: Difficulty, mode: PlayMode): Promise<void> {
    const track = this.tracks().find((t) => t.metadata.id === id) ?? getTrack(id);
    if (track.charts[difficulty] === undefined) throw new Error(`Track "${id}" has no ${difficulty} chart`);
    this.pendingMode = mode;
    this.teardownSession();
    this.enterLoading();
    await this.engine.unlock();
    if (this.router.state !== "LOADING_TRACK") return;

    const settings = this.settings.current;
    const game = new RhythmGame(track, difficulty, {
      mode,
      noFail: settings.noFail,
      focusSurgeEnabled: settings.focusSurgeEnabled,
      judgmentOffsetMs: this.judgmentOffsetMs,
    });
    const practice = mode === "practice" ? new PracticeSystem(track, { rate: settings.practiceSpeed }) : null;
    this.current = { track, difficulty, mode, game, practice, assisted: this.assistActive(), autoplay: false };
    this.mapper = mapperFor(track);
    this.autoNotes = [...game.chart.notes].sort((a, b) => a.timeMs - b.timeMs || a.lane - b.lane);
    this.bindGame(game);
    this.transport.setTrack(track);
    this.transport.setMetronome(settings.metronome);
    this.hud.setTrack(track, difficulty, mode);
    this.hud.setShowDelta(this.debugView);
    this.seed = 1;
    this.renderer.clearEffects();
    this.resetFlashes();
    this.buildFrame(track, game);

    if (practice) {
      this.transport.setRate(this.effectiveRate());
      this.enterPractice();
    } else {
      this.transport.setRate(this.effectiveRate());
      const start = this.countdownStartMs();
      this.clock.start(start);
      this.router.goTo("COUNTDOWN");
      this.transport.start();
      this.scheduleCountdown();
    }
    this.focusHighway();
  }

  /** Walks to LOADING_TRACK the legal way, wherever the request came from. */
  private enterLoading(): void {
    // A panel reaches the loading screen through the menu, a finished run
    // through its results screen, and most states through track select.
    for (const step of pathTo(this.router.state, "LOADING_TRACK")) this.router.goTo(step);
  }

  /** Opening the practice panel is a pause too. A run with no practice state pauses to the menu. */
  pause(reason: PauseReason = "menu"): void {
    const session = this.current;
    if (!session || !GAMEPLAY_STATES.has(this.router.state)) return;
    this.input.clearHeld();
    session.game.cancelHolds();
    this.clearAutoHold();
    this.cancelCountdown();
    this.clock.pause();
    this.transport.pause();
    this.sfx.play("pause");
    this.pauseReasonValue = session.practice ? reason : "menu";
    this.practiceMark = this.practiceSignature();
    this.router.goTo("PAUSED");
    this.announce(this.pauseReasonValue === "practice" ? "Practice panel" : "Paused");
  }

  get pauseReason(): PauseReason {
    return this.pauseReasonValue;
  }

  resume(): void {
    const session = this.current;
    if (!session || this.router.state !== "PAUSED") return;
    void this.engine.unlock();
    if (this.pauseReasonValue === "practice" && session.practice) {
      // A new loop range or a new speed means the pass starts again from the
      // loop entry; anything else picks up where it stopped.
      const rebuilt = this.practiceSignature() !== this.practiceMark;
      this.router.goTo("PRACTICE");
      if (rebuilt) this.restartPracticePass();
      else {
        this.clock.resume();
        this.transport.resume();
      }
      this.lastDisplayMs = null;
      this.sfx.play("resume");
      this.focusHighway();
      return;
    }
    const resumeTarget = this.router.resumeState ?? (session.mode === "practice" ? "PRACTICE" : "PLAYING");
    // A seek made while paused wins: the countdown only makes sense while the
    // clock is still before the first note.
    const target = resumeTarget === "COUNTDOWN" && this.clock.pausedSongMs >= 0 ? "PLAYING" : resumeTarget;
    if (target === "COUNTDOWN") {
      // Give the player a moment of run up rather than dropping them on a note.
      const back = Math.max(this.clock.pausedSongMs - 1000, this.countdownStartMs());
      this.clock.seek(back);
    }
    this.router.goTo(target);
    this.clock.resume();
    this.transport.resume();
    if (target === "COUNTDOWN") this.scheduleCountdown();
    this.lastDisplayMs = null;
    this.sfx.play("resume");
    this.focusHighway();
  }

  restart(): void {
    const session = this.current;
    if (!session) return;
    // Only a live run can start again. The results screen still has its
    // session, and the countdown it would ask for is not a move it can make.
    if (!GAMEPLAY_STATES.has(this.router.state) && this.router.state !== "PAUSED") return;
    this.cancelDwell();
    this.cancelCountdown();
    this.input.clearHeld();
    session.game.cancelHolds();
    this.clearAutoHold();
    this.transport.stop();
    session.game.reset();
    session.assisted = session.autoplay || this.assistActive();
    this.seed = 1;
    this.renderer.clearEffects();
    this.resetFlashes();
    this.hud.setBanner(null);
    if (session.practice) {
      this.enterPractice();
    } else {
      const start = this.countdownStartMs();
      this.clock.start(start);
      this.autoCursor = 0;
      this.autoReleases = [];
      this.router.goTo("COUNTDOWN");
      this.transport.start();
      this.scheduleCountdown();
    }
    this.focusHighway();
  }

  exitToTrackSelect(): void {
    this.teardownSession();
    this.router.goTo("TRACK_SELECT");
  }

  exitToMainMenu(): void {
    this.teardownSession();
    this.router.goTo("MAIN_MENU");
  }

  /** Abandons the run and opens the same track in practice, looping one section. */
  practiceSection(section: Section | null): void {
    const session = this.current;
    if (!session) return;
    const { track, difficulty } = session;
    const settings = this.settings.current;
    this.cancelDwell();
    this.cancelCountdown();
    this.input.clearHeld();
    this.releaseGame();
    this.transport.stop();

    const game = new RhythmGame(track, difficulty, {
      mode: "practice",
      noFail: settings.noFail,
      focusSurgeEnabled: settings.focusSurgeEnabled,
      judgmentOffsetMs: this.judgmentOffsetMs,
    });
    const practice = new PracticeSystem(track, { rate: settings.practiceSpeed });
    practice.setSection(section ?? track.sections[0] ?? null);
    this.current = { track, difficulty, mode: "practice", game, practice, assisted: this.assistActive(), autoplay: false };
    this.mapper = mapperFor(track);
    this.autoNotes = [...game.chart.notes].sort((a, b) => a.timeMs - b.timeMs || a.lane - b.lane);
    this.bindGame(game);
    this.transport.setTrack(track);
    this.transport.setMetronome(settings.metronome);
    this.transport.setRate(this.effectiveRate());
    this.hud.setTrack(track, difficulty, "practice");
    this.seed = 1;
    this.renderer.clearEffects();
    this.resetFlashes();
    this.buildFrame(track, game);
    this.enterPractice();
    this.focusHighway();
  }

  /** The only seek path: the practice scrubber, loop re-entry, checkpoints and window.vc. */
  seekTo(ms: number): void {
    const session = this.current;
    if (!session) return;
    this.input.clearHeld();
    session.game.cancelHolds();
    this.clearAutoHold();
    // The count-in clicks are booked at absolute audio times, so a seek that
    // re-anchors the clock leaves them pointing at song positions that no
    // longer mean anything.
    this.cancelCountdown();
    session.game.rearmFrom(ms);
    session.game.skipBefore(ms);
    this.clock.seek(ms);
    this.transport.seek();
    // After clock.seek, so the new anchor is the one the clicks are booked on.
    if (this.router.state === "COUNTDOWN" && this.clock.running) this.scheduleCountdown();
    this.renderer.clearEffects();
    this.resetFlashes();
    this.resetAutoplayCursor(ms);
    this.lastDisplayMs = null;
    if (session.mode !== "practice") session.assisted = true;
  }

  setPracticeLoop(startMs: number, endMs: number, enabled: boolean): void {
    const session = this.current;
    if (!session?.practice) return;
    session.practice.setLoop(startMs, endMs, enabled);
    this.setTransportLoop(session.practice);
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void this.root.requestFullscreen().catch(() => undefined);
  }

  resetProgress(): void {
    this.save.resetProgress();
  }

  announce(text: string): void {
    if (this.announceTimer !== null) clearTimeout(this.announceTimer);
    this.announcer.textContent = "";
    // A live region only speaks when the text node changes, so repeats need a beat.
    this.announceTimer = setTimeout(() => {
      this.announcer.textContent = text;
      this.announceTimer = null;
    }, 30);
  }

  // -------------------------------------------------------------------------
  // Debug api
  // -------------------------------------------------------------------------

  debugApi(): DebugApi {
    return {
      app: this,
      router: this.router,
      settings: this.settings,
      save: this.save,
      ready: this.ready,
      version: __APP_VERSION__,
      startTrack: (id, difficulty, mode) => this.startTrack(id, difficulty, mode ?? "performance"),
      goTo: (state) => {
        if (!DEBUG_GOTO_STATES.has(state)) throw new Error(`vc.goTo cannot jump to ${state}`);
        this.teardownSession();
        this.router.force(state);
      },
      pause: () => this.pause(),
      resume: () => this.resume(),
      restart: () => this.restart(),
      seek: (songMs) => this.seekTo(songMs),
      freezeAt: (songMs) => this.freezeAt(songMs),
      setAutoplay: (on) => this.setAutoplay(on),
      snapshot: () => (this.current ? { ...this.current.game.snapshot() } : null),
      summary: () => this.current?.game.summary() ?? null,
      forceComplete: () => this.forceComplete(),
      forceFail: () => this.forceFail(),
      debug: {
        show: () => this.setDebugView(true),
        hide: () => this.setDebugView(false),
        perf: (on) => this.hud.setPerfVisible(on),
      },
    };
  }

  private setAutoplay(on: boolean): void {
    const session = this.current;
    // With no run to play there is nothing to turn on, and the overlay's
    // checkbox says so on its next refresh.
    if (!session) return;
    this.debugFlags.autoplay = on;
    session.autoplay = on;
    if (on) {
      session.assisted = true;
      this.resetAutoplayCursor(this.clock.songMs() - this.judgmentOffsetMs);
    } else {
      this.clearAutoHold();
    }
  }

  private setDebugView(on: boolean): void {
    this.debugView = on && DEBUG_ENABLED;
    this.hud.setShowDelta(this.debugView);
    this.debugOverlay?.setVisible(this.debugView);
  }

  private setDebugFlag(flag: keyof DebugFlags, on: boolean): void {
    // Autoplay lives on the session, and setAutoplay writes the flag with it.
    // Going straight there keeps a stale flag from swallowing the click.
    if (flag === "autoplay") {
      this.setAutoplay(on);
      return;
    }
    if (this.debugFlags[flag] === on) return;
    this.debugFlags[flag] = on;
    if (flag !== "slowMotion") return;
    const session = this.current;
    if (!session) return;
    // Changing the rate mid stream is a debug assist, so the run stops counting.
    session.assisted = true;
    this.transport.setRate(this.effectiveRate());
  }

  private chartValidation(): ValidationReport | null {
    const session = this.current;
    if (!session) return null;
    if (this.validatedGame !== session.game) {
      this.validatedGame = session.game;
      this.validationReport = validateChartReport(session.game.chart, session.track);
    }
    return this.validationReport;
  }

  /** One reading for the debug overlay. Built on demand, a few times a second. */
  private debugStats(): DebugStats {
    const settings = this.settings.current;
    const session = this.current;
    const snapshot = session?.game.snapshot() ?? null;
    const displayMs = this.lastDisplayMs ?? 0;
    const position = this.mapper?.positionAtMs(displayMs) ?? { beat: 0, measure: 0, beatInMeasure: 0 };
    return {
      state: this.router.state,
      fps: this.fps,
      frameMs: this.frameMs,
      audioMs: this.lastFrameAudioMs ?? 0,
      songMs: snapshot?.songMs ?? 0,
      displayMs,
      rate: this.clock.rate,
      outputLatencyMs: this.engine.outputLatencyMs(),
      outputLatencySupported: this.engine.outputLatencySupported,
      audioOffsetMs: settings.audioOffsetMs,
      visualOffsetMs: settings.visualOffsetMs,
      inputOffsetMs: settings.inputOffsetMs,
      judgmentOffsetMs: this.judgmentOffsetMs,
      beat: position.beat,
      measure: position.measure,
      beatInMeasure: position.beatInMeasure,
      approachMs: settings.approachMs,
      trackId: session?.track.metadata.id ?? null,
      difficulty: session?.difficulty ?? null,
      mode: session?.mode ?? null,
      assisted: session?.assisted ?? false,
      eventCursor: this.transport.cursorIndex,
      scheduledCount: this.transport.scheduledCount,
      liveVoices: this.synth.voiceCount,
      liveEffects: this.sfx.liveCount,
      visibleNotes: this.frame?.noteCount ?? 0,
      particles: this.renderer.particleCount,
      heldLanes: this.heldLanes,
      heldKeys: LANES.filter((lane) => this.heldLanes[lane]).map((lane) => this.bindings.labelFor(lane)),
      score: snapshot?.score ?? 0,
      combo: snapshot?.combo ?? 0,
      multiplier: snapshot?.multiplier ?? 1,
      aura: snapshot?.aura ?? 0,
      accuracy: snapshot?.accuracy ?? 0,
      judgedCount: snapshot?.judgedCount ?? 0,
      totalNotes: snapshot?.totalNotes ?? 0,
      misses: snapshot?.misses ?? 0,
      inputLog: this.inputLog,
    };
  }

  /** The chart editor is developer tooling, reached from the debug overlay only. */
  private openChartEditor(): void {
    if (!DEBUG_ENABLED) return;
    this.teardownSession();
    if (this.router.can("CHART_EDITOR")) this.router.goTo("CHART_EDITOR");
    else this.router.force("CHART_EDITOR");
  }

  private logInput(entry: InputLogEntry): void {
    this.inputLog.push(entry);
    if (this.inputLog.length > INPUT_LOG_SIZE) this.inputLog.shift();
  }

  /** Seeks, then walks the run forward without frames so a screenshot has state on screen. */
  private freezeAt(songMs: number): void {
    const session = this.current;
    if (!session) return;
    const from = songMs - HIGHWAY.freezeWarmupMs;
    this.seekTo(from);
    // The warm-up always plays itself: stepping it without autoplay would
    // auto-miss every note in the window the screenshot is meant to show.
    this.stepTo(from, songMs, true);
    this.clock.seek(songMs);
    this.clock.pause();
    this.transport.pause();
    this.cancelCountdown();
    session.assisted = true;
    this.lastDisplayMs = null;
  }

  private forceComplete(): void {
    const session = this.current;
    if (!session) return;
    const end = session.track.metadata.durationMs + HIGHWAY.outroMs;
    // Stepping the run forward is an assist, so the result is never saved.
    session.assisted = true;
    this.forcedOutcome = true;
    this.stepTo(this.clock.songMs(), end, true);
    if (session.mode === "practice" && !session.game.finished) this.finishPractice();
    // Park the clock at the end so the frozen highway matches the results.
    this.clock.seek(end);
    this.lastDisplayMs = null;
    this.forcedOutcome = false;
  }

  private forceFail(): void {
    const session = this.current;
    if (!session) return;
    session.assisted = true;
    this.forcedOutcome = true;
    session.game.debugSetAura(0);
    session.game.update(this.clock.songMs());
    this.forcedOutcome = false;
  }

  private stepTo(fromMs: number, toMs: number, withAutoplay: boolean): void {
    const session = this.current;
    if (!session) return;
    // A whole run can pass through here in one synchronous call, so the
    // judgment sounds it produces are dropped rather than stacked on one
    // audio timestamp. The popups and bursts stay: they are what a frozen
    // frame is meant to show.
    this.stepping = true;
    try {
      for (let t = fromMs; t < toMs; t += STEP_MS) {
        if (withAutoplay) this.stepAutoplay(t - this.judgmentOffsetMs);
        session.game.update(t);
        if (session.game.finished) return;
      }
      if (withAutoplay) this.stepAutoplay(toMs - this.judgmentOffsetMs);
      session.game.update(toMs);
    } finally {
      this.stepping = false;
    }
  }

  // -------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------

  private readonly onFrame = (): void => {
    this.rafId = requestAnimationFrame(this.onFrame);
    const frameAudioMs = this.engine.sampleClock();
    const wallDeltaMs =
      this.lastFrameAudioMs === null ? 0 : clamp(frameAudioMs - this.lastFrameAudioMs, 0, AUDIO.maxFrameDeltaMs);
    this.lastFrameAudioMs = frameAudioMs;
    // The overlay reports what a frame really cost, so it measures the wall
    // clock instead of the delta the effects are clamped to; a dropped frame
    // worse than that clamp is the one worth seeing.
    const framePerfMs = this.engine.sampledPerfMs;
    if (this.lastFramePerfMs !== null) {
      this.frameMs = frameTimeAverage(this.frameMs, framePerfMs - this.lastFramePerfMs, AUDIO.maxFrameSampleMs);
      this.fps = this.frameMs > 0 ? 1000 / this.frameMs : 0;
    }
    this.lastFramePerfMs = framePerfMs;

    const settings = this.settings.current;
    const session = this.current;
    const frame = this.frame;
    if (!session || !frame) {
      this.renderer.renderIdle(wallDeltaMs, settings.reducedMotion, settings.highContrast);
      if (this.hud.perfVisible) this.hud.updatePerf(this.fps, this.frameMs, 0, this.renderer.particleCount);
      return;
    }

    const rate = this.clock.rate;
    const latencyMs = this.engine.outputLatencyMs();
    const judgmentOffsetMs = (latencyMs + settings.audioOffsetMs + settings.inputOffsetMs) * rate;
    if (judgmentOffsetMs !== this.judgmentOffsetMs) {
      this.judgmentOffsetMs = judgmentOffsetMs;
      session.game.setJudgmentOffsetMs(judgmentOffsetMs);
    }

    // The frame reads song time through the same audio mapping the presses in
    // it use, so a gem crossing the gate and a press at that moment agree.
    let songMs = this.clock.songMsAtAudioMs(frameAudioMs);
    // Only a running run is driven forward, the same rule the lane input
    // follows. A pause menu, a panel over it or the results screen keeps
    // rendering the frozen run without judging anything in it.
    if (GAMEPLAY_STATES.has(this.router.state)) {
      if (session.autoplay) this.stepAutoplay(songMs - judgmentOffsetMs);
      session.game.update(songMs);
      this.advance(songMs);
      // advance() can move the clock: a practice loop re-entry seeks back to
      // the loop entry and rearms the notes, so the frame reads it again.
      songMs = this.clock.songMsAtAudioMs(frameAudioMs);
    }

    const displayMs = songMs - (latencyMs + settings.audioOffsetMs - settings.visualOffsetMs) * rate;
    const frameDeltaMs =
      this.lastDisplayMs === null ? 0 : clamp(displayMs - this.lastDisplayMs, 0, AUDIO.maxFrameDeltaMs);
    this.lastDisplayMs = displayMs;

    const inputHeld = this.input.heldLanes;
    for (const lane of LANES) {
      this.heldLanes[lane] = inputHeld[lane] || this.autoHeld[lane];
      this.keyFlashMs[lane] = displayMs - this.lastPressDisplayMs[lane];
    }

    const snapshot = session.game.snapshot();
    this.hud.update(snapshot, songMs);

    frame.displayMs = displayMs;
    frame.approachMs = settings.approachMs;
    frame.game = snapshot;
    frame.noteCount = session.game.visibleNotes(displayMs, settings.approachMs, this.noteBuffer);
    frame.reducedMotion = settings.reducedMotion;
    frame.highContrast = settings.highContrast;
    frame.flashEffects = settings.flashEffects;
    frame.showBeatGrid =
      (session.mode === "practice" ? settings.practiceBeatGrid : settings.showBeatGrid) || this.debugFlags.beatGrid;
    frame.showHitWindows = this.debugFlags.hitWindows;
    frame.showNoteIds = this.debugFlags.noteIds;
    frame.showLaneBounds = this.debugFlags.laneBounds;
    frame.effectsEnabled = this.debugFlags.effects;
    frame.laneKeyLabels = settings.showHints ? this.bindings.laneLabels() : null;
    frame.ghostGuide = settings.ghostGuide && session.mode === "practice";
    frame.beatPhase = this.beatPhase(displayMs);
    frame.frameDeltaMs = frameDeltaMs;
    frame.textScale = settings.textScale;
    frame.seed = this.seed;
    frame.windows = session.game.windows;
    this.renderer.render(frame);

    if (this.hud.perfVisible) {
      this.hud.updatePerf(this.fps, this.frameMs, frame.noteCount, this.renderer.particleCount);
    }
  };

  /** State changes the clock alone decides: the countdown ending, a loop, the end of a practice run. */
  private advance(songMs: number): void {
    const session = this.current;
    if (!session) return;
    if (this.router.state === "COUNTDOWN" && songMs >= 0) {
      this.router.goTo("PLAYING");
      this.hud.clearCountIn();
    }
    const practice = session.practice;
    if (!practice || this.router.state !== "PRACTICE") return;
    if (practice.looping) {
      if (practice.shouldWrap(songMs)) this.loopBack();
      return;
    }
    if (practice.isPastEnd(songMs)) this.finishPractice();
  }

  private beatPhase(displayMs: number): number {
    if (displayMs < 0 || this.mapper === null) return 0;
    // Same value as the fractional part of beatInMeasure, without the object.
    const beat = this.mapper.msToBeat(displayMs);
    return beat - Math.floor(beat);
  }

  private loopBack(): void {
    const session = this.current;
    const practice = session?.practice;
    if (!session || !practice || !practice.looping) return;
    // The transport and the frame loop both notice the end of the loop; the
    // second one to arrive finds the clock already back at the start.
    if (!practice.shouldWrap(this.clock.songMs())) return;
    const start = practice.loopStartMs;
    this.seekTo(this.practiceEntryMs(practice));
    session.game.skipBefore(start);
    this.hud.setCountIn(start, this.beatMs());
  }

  private finishPractice(): void {
    const session = this.current;
    if (!session) return;
    this.leavePause();
    this.buildResults(session.game.summary());
    this.transport.stop();
    this.clock.pause();
    this.router.goTo("RESULTS");
    this.announce("Practice run, nothing saved");
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  private buildFrame(track: TrackChart, game: RhythmGame): void {
    const settings = this.settings.current;
    this.frame = {
      displayMs: 0,
      approachMs: settings.approachMs,
      track,
      game: game.snapshot(),
      notes: this.noteBuffer,
      noteCount: 0,
      heldLanes: this.heldLanes,
      keyFlashMs: this.keyFlashMs,
      reducedMotion: settings.reducedMotion,
      highContrast: settings.highContrast,
      flashEffects: settings.flashEffects,
      showBeatGrid: false,
      showHitWindows: false,
      showNoteIds: false,
      showLaneBounds: false,
      effectsEnabled: true,
      laneKeyLabels: null,
      ghostGuide: false,
      beatPhase: 0,
      frameDeltaMs: 0,
      textScale: settings.textScale,
      seed: this.seed,
      windows: game.windows,
    };
  }

  private enterPractice(): void {
    const session = this.current;
    const practice = session?.practice;
    if (!session || !practice) return;
    const entry = this.practiceEntryMs(practice);
    // With the loop off the pass plays from the top, so the skip and the count
    // in follow the pass start rather than a loop start nobody is looping.
    const passStartMs = practice.passStartMs;
    this.clock.seek(entry);
    this.clock.start(entry);
    this.setTransportLoop(practice);
    session.game.reset();
    session.game.skipBefore(passStartMs);
    this.resetAutoplayCursor(entry);
    this.router.goTo("PRACTICE");
    this.transport.start();
    this.hud.setCountIn(passStartMs, this.beatMs());
    this.lastDisplayMs = null;
  }

  /** Loop range and speed, so closing the practice panel knows what moved. */
  private practiceSignature(): string {
    const practice = this.current?.practice;
    if (!practice) return "";
    return `${practice.loopStartMs}|${practice.loopEndMs}|${practice.loopEnabled}|${practice.rate}`;
  }

  /** Re-enters the loop after the practice panel changed the range or the speed. */
  private restartPracticePass(): void {
    const session = this.current;
    const practice = session?.practice;
    if (!session || !practice) return;
    const passStartMs = practice.passStartMs;
    this.transport.setRate(this.effectiveRate());
    this.setTransportLoop(practice);
    this.seekTo(this.practiceEntryMs(practice));
    session.game.skipBefore(passStartMs);
    this.clock.resume();
    this.transport.resume();
    this.hud.setCountIn(passStartMs, this.beatMs());
  }

  /**
   * Debug assists that live on App rather than on the session, so they are
   * still on when the next run starts and it has to count as assisted too.
   */
  private assistActive(): boolean {
    return this.debugFlags.slowMotion;
  }

  /** Practice speed, halved again while the debug slow motion is on. */
  private effectiveRate(): number {
    const base = this.current?.practice?.rate ?? 1;
    return this.debugFlags.slowMotion ? base * SLOW_MOTION_RATE : base;
  }

  private beatMs(): number {
    const bpm = this.current?.track.metadata.bpm ?? 0;
    return bpm > 0 ? 60000 / bpm : 500;
  }

  private countdownStartMs(): number {
    return -Math.max(HIGHWAY.countdownMs, this.settings.current.approachMs + 200);
  }

  /**
   * The scheduler loops only over a range the practice system is actually
   * looping: `loopEnabled` can still be true over an empty range, and the
   * stored bounds are ordered and clamped after the caller handed them over.
   */
  private setTransportLoop(practice: PracticeSystem): void {
    this.transport.setLoop(practice.loopStartMs, practice.looping ? practice.loopEndMs : null);
  }

  /** Song time a practice pass enters at, run-up included. */
  private practiceEntryMs(practice: PracticeSystem): number {
    return practice.entryMs(practicePrerollMs(this.settings.current.approachMs));
  }

  private bindGame(game: RhythmGame): void {
    this.releaseListeners();
    const events = game.events;
    this.unbindGame = [
      events.on("judgment", ({ lane, judgment, deltaMs, songMs }) => {
        this.feedback(JUDGMENT_SFX[judgment]);
        this.renderer.addJudgment(lane, judgment, deltaMs, songMs, this.debugView);
      }),
      events.on("phraseComplete", ({ trill }) => {
        this.feedback("phrase");
        this.renderer.addPhrasePulse(game.snapshot().lastJudgmentSongMs);
        this.hud.flashMessage(trill ? "Trill" : "Perfect Passage");
      }),
      events.on("recenter", () => this.hud.flashMessage("Recenter")),
      events.on("surgeStart", () => {
        this.feedback("surge-start");
        this.hud.flashMessage("Focus Surge");
      }),
      events.on("surgeEnd", () => this.feedback("surge-end")),
      events.on("complete", () => this.enterOutcome(true)),
      events.on("fail", () => this.enterOutcome(false)),
    ];
  }

  /** A sound a note made. Silent while a run is being stepped forward. */
  private feedback(name: SfxName): void {
    if (this.stepping) return;
    this.sfx.play(name);
  }

  private releaseListeners(): void {
    for (const off of this.unbindGame) off();
    this.unbindGame = [];
  }

  private releaseGame(): void {
    this.releaseListeners();
    const session = this.current;
    if (session) {
      session.game.cancelHolds();
      session.autoplay = false;
    }
    this.debugFlags.autoplay = false;
    this.clearAutoHold();
    this.current = null;
  }

  private teardownSession(): void {
    this.cancelDwell();
    this.cancelCountdown();
    this.input.clearHeld();
    this.releaseGame();
    this.transport.stop();
    this.transport.setTrack(null);
    this.sfx.stopAll();
    this.clock.pause();
    this.renderer.clearEffects();
    this.resetFlashes();
    this.hud.setTrack(null, null, null);
    this.hud.clearCountIn();
    this.hud.setVisible(false);
    this.frame = null;
    this.mapper = null;
    this.autoNotes = [];
    this.autoCursor = 0;
    this.autoReleases = [];
    this.lastDisplayMs = null;
  }

  private enterOutcome(completed: boolean): void {
    const session = this.current;
    if (!session) return;
    this.leavePause();
    this.cancelCountdown();
    this.input.clearHeld();
    this.clearAutoHold();
    if (completed) {
      this.sfx.play("complete");
      this.router.goTo("TRACK_COMPLETE");
      this.hud.setBanner("Performance complete");
    } else {
      this.sfx.play("fail");
      // The ring-out fade goes first: pause() retires the voices with its own
      // stopAll() at the default fade, and it has to stop the scheduler or the
      // next tick would refill the lookahead under the banner.
      this.transport.stopAll(400);
      this.transport.pause();
      this.router.goTo("PERFORMANCE_INTERRUPTED");
      this.hud.setBanner("Performance interrupted");
    }
    this.buildResults(session.game.summary());
    this.beginDwell(this.forcedOutcome ? 0 : HIGHWAY.resultsDelayMs);
  }

  /** Records the run where the rules allow it and keeps what the results screen shows. */
  private buildResults(summary: PerformanceSummary): void {
    const session = this.current;
    if (!session) return;
    const { track, difficulty, mode } = session;
    const previousBest = this.save.best(track.metadata.id, difficulty);
    const savable = mode === "performance" && summary.completed && !summary.failed && !session.assisted;
    const outcome = savable
      ? this.save.record(summary, track.metadata.id, difficulty)
      : { saved: false, isNewBest: false, unlockedTrackId: undefined };
    this.results = {
      track,
      difficulty,
      mode,
      summary,
      previousBest,
      isNewBest: outcome.isNewBest,
      saved: outcome.saved,
      assisted: session.assisted,
      unlockedTrackId: outcome.unlockedTrackId,
    };
  }

  /**
   * A run can end from the debug api while the countdown is still running or
   * the pause menu is up. Both have a legal way into the play state first.
   */
  private leavePause(): void {
    // Settings, calibration and controls open over the pause menu, and only
    // the pause menu has a way back into the run.
    if (PANEL_STATES.has(this.router.state)) this.router.back();
    const state = this.router.state;
    if (state === "COUNTDOWN") {
      this.router.goTo("PLAYING");
      return;
    }
    if (state !== "PAUSED") return;
    const target = this.router.resumeState ?? (this.current?.mode === "practice" ? "PRACTICE" : "PLAYING");
    this.router.goTo(target);
  }

  private beginDwell(delayMs: number): void {
    this.cancelDwell();
    if (delayMs <= 0) {
      this.showResults();
      return;
    }
    this.dwellTimer = setTimeout(() => this.showResults(), delayMs);
    window.addEventListener("keydown", this.skipDwell);
    window.addEventListener("pointerdown", this.skipDwell);
  }

  private readonly skipDwell = (): void => {
    if (this.dwellTimer === null) return;
    this.showResults();
  };

  private cancelDwell(): void {
    if (this.dwellTimer !== null) clearTimeout(this.dwellTimer);
    this.dwellTimer = null;
    window.removeEventListener("keydown", this.skipDwell);
    window.removeEventListener("pointerdown", this.skipDwell);
  }

  private showResults(): void {
    this.cancelDwell();
    if (this.router.state !== "TRACK_COMPLETE" && this.router.state !== "PERFORMANCE_INTERRUPTED") return;
    this.transport.stop();
    this.clock.pause();
    this.router.goTo("RESULTS");
    this.announce("Results ready");
  }

  private scheduleCountdown(): void {
    this.cancelCountdown();
    const nowAudio = this.engine.nowMs();
    for (const at of [-3000, -2000, -1000]) {
      if (at < this.countdownStartMs()) continue;
      const audioAt = this.clock.audioMsAtSongMs(at);
      if (audioAt > nowAudio) this.countdownCancels.push(this.sfx.playAt("countdown-tick", audioAt));
    }
    const goAt = this.clock.audioMsAtSongMs(0);
    if (goAt > nowAudio) this.countdownCancels.push(this.sfx.playAt("countdown-go", goAt));
  }

  private cancelCountdown(): void {
    for (const cancel of this.countdownCancels) cancel();
    this.countdownCancels = [];
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onLanePress(lane: Lane, perfTs: number): void {
    const session = this.current;
    if (!session || !GAMEPLAY_STATES.has(this.router.state)) return;
    const songMs = this.clock.songMsAtAudioMs(this.engine.perfToAudioMs(perfTs));
    const result = session.game.press(lane, songMs);
    this.lastPressDisplayMs[lane] = this.displayAt(songMs);
    if (!DEBUG_ENABLED) return;
    this.logInput({
      lane,
      laneName: LANE_IDENTITIES[lane].name,
      kind: "press",
      songMs,
      perfTs,
      deltaMs: result?.deltaMs ?? null,
      judgment: result?.judgment ?? null,
    });
  }

  private onLaneRelease(lane: Lane, perfTs: number): void {
    const session = this.current;
    if (!session || !GAMEPLAY_STATES.has(this.router.state)) return;
    const songMs = this.clock.songMsAtAudioMs(this.engine.perfToAudioMs(perfTs));
    session.game.release(lane, songMs);
    if (!DEBUG_ENABLED) return;
    this.logInput({
      lane,
      laneName: LANE_IDENTITIES[lane].name,
      kind: "release",
      songMs,
      perfTs,
      deltaMs: null,
      judgment: null,
    });
  }

  private onShortcut(action: ShortcutAction): void {
    const state = this.router.state;
    switch (action) {
      case "pause":
        if (GAMEPLAY_STATES.has(state)) this.pause("menu");
        // The practice panel has its own key; Escape there goes through the screen.
        else if (state === "PAUSED" && this.pauseReasonValue === "menu") this.resume();
        return;
      case "restart":
        if (GAMEPLAY_STATES.has(state) || state === "PAUSED") this.restart();
        return;
      case "focusSurge": {
        const session = this.current;
        if (!session || (state !== "PLAYING" && state !== "PRACTICE")) return;
        session.game.activateFocusSurge(this.clock.songMs());
        return;
      }
      case "perfOverlay":
        this.hud.setPerfVisible(!this.hud.perfVisible);
        return;
      case "debugOverlay":
        this.setDebugView(!this.debugView);
        return;
      case "practicePanel": {
        // Tab holds a practice run so the player can change the loop, and lets
        // it go again.
        const session = this.current;
        if (session?.mode !== "practice") return;
        if (state === "PRACTICE") this.pause("practice");
        else if (state === "PAUSED" && this.pauseReasonValue === "practice") this.resume();
        return;
      }
    }
  }

  private onFocusLost(): void {
    if (!GAMEPLAY_STATES.has(this.router.state)) return;
    this.pause();
  }

  private readonly onFirstGesture = (): void => {
    void this.engine.unlock();
  };

  private displayAt(songMs: number): number {
    const settings = this.settings.current;
    const rate = this.clock.rate;
    return songMs - (this.engine.outputLatencyMs() + settings.audioOffsetMs - settings.visualOffsetMs) * rate;
  }

  private resetFlashes(): void {
    for (const lane of LANES) {
      this.keyFlashMs[lane] = Number.POSITIVE_INFINITY;
      this.lastPressDisplayMs[lane] = Number.NEGATIVE_INFINITY;
      this.heldLanes[lane] = false;
    }
  }

  private focusHighway(): void {
    this.canvas.focus({ preventScroll: true });
  }

  // -------------------------------------------------------------------------
  // Autoplay
  // -------------------------------------------------------------------------

  private resetAutoplayCursor(songMs: number): void {
    this.autoReleases = [];
    let index = 0;
    while (index < this.autoNotes.length && this.autoNotes[index].timeMs < songMs) index++;
    this.autoCursor = index;
    this.clearAutoHold();
  }

  /** Plays the chart perfectly. `t` is corrected song time, the same clock the judge uses. */
  private stepAutoplay(t: number): void {
    const session = this.current;
    if (!session) return;
    const game = session.game;
    while (this.autoCursor < this.autoNotes.length && this.autoNotes[this.autoCursor].timeMs <= t) {
      const note = this.autoNotes[this.autoCursor++];
      game.press(note.lane, note.timeMs + this.judgmentOffsetMs);
      this.autoHeld[note.lane] = true;
      this.lastPressDisplayMs[note.lane] = this.displayAt(note.timeMs + this.judgmentOffsetMs);
      const holdMs = note.isHold ? note.durationMs : HIGHWAY.autoplayTapMs;
      this.autoReleases.push({ lane: note.lane, atMs: note.timeMs + holdMs });
    }
    if (this.autoReleases.length === 0) return;
    const pending: { lane: Lane; atMs: number }[] = [];
    for (const release of this.autoReleases) {
      if (release.atMs > t) {
        pending.push(release);
        continue;
      }
      game.release(release.lane, release.atMs + this.judgmentOffsetMs);
      this.autoHeld[release.lane] = false;
    }
    this.autoReleases = pending;
  }

  private clearAutoHold(): void {
    for (const lane of LANES) this.autoHeld[lane] = false;
    this.autoReleases = [];
  }

  // -------------------------------------------------------------------------
  // Settings and routing
  // -------------------------------------------------------------------------

  private applySettings(settings: Settings): void {
    this.engine.setVolumes({
      master: settings.masterVolume,
      music: settings.musicVolume,
      effects: settings.effectsVolume,
    });
    this.engine.setMuted(settings.muted);
    this.bindings.setBindings(settings.keyBindings);
    document.documentElement.style.setProperty("--text-scale", `${settings.textScale}`);
    document.body.classList.toggle("high-contrast", settings.highContrast);
    document.body.classList.toggle("reduced-motion", settings.reducedMotion);
    this.transport.setMetronome(settings.metronome);
  }

  private onSettingsChanged(settings: Settings, changed: readonly (keyof Settings)[]): void {
    const touched = new Set<keyof Settings>(changed);
    if (touched.has("masterVolume") || touched.has("musicVolume") || touched.has("effectsVolume")) {
      this.engine.setVolumes({
        master: settings.masterVolume,
        music: settings.musicVolume,
        effects: settings.effectsVolume,
      });
    }
    if (touched.has("muted")) this.engine.setMuted(settings.muted);
    if (touched.has("keyBindings")) this.input.setBindings(settings.keyBindings);
    if (touched.has("textScale")) {
      document.documentElement.style.setProperty("--text-scale", `${settings.textScale}`);
    }
    if (touched.has("highContrast")) document.body.classList.toggle("high-contrast", settings.highContrast);
    if (touched.has("reducedMotion")) document.body.classList.toggle("reduced-motion", settings.reducedMotion);
    if (touched.has("metronome")) this.transport.setMetronome(settings.metronome);
    // The rate itself only moves at the next practice entry, which is what
    // keeps a speed change out of the middle of a scheduled bar.
    if (touched.has("practiceSpeed")) this.current?.practice?.setRate(settings.practiceSpeed);
    if (touched.has("unlockAll")) this.ui.refresh();
  }

  private readonly onRouteChange = ({ to }: { from: GameState; to: GameState }): void => {
    this.ui.sync();
    this.hud.setVisible(HUD_STATES.has(to));
    this.hud.setPaused(to === "PAUSED");
    if (to !== "TRACK_COMPLETE" && to !== "PERFORMANCE_INTERRUPTED") this.hud.setBanner(null);
    if (GAMEPLAY_STATES.has(to)) this.focusHighway();
  };
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
