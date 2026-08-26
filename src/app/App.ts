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
import { TRACK_DEFINITIONS, getTrack } from "../charts/TrackCatalog";
import type { NoteView } from "../gameplay/NoteScheduler";
import { PracticeSystem } from "../gameplay/PracticeSystem";
import { RhythmGame, type GameSnapshot, type PerformanceSummary } from "../gameplay/RhythmGame";
import { InputManager, type ShortcutAction } from "../input/InputManager";
import { KeyBindings } from "../input/KeyBindings";
import { SaveManager, type TrackResult } from "../persistence/SaveManager";
import { SettingsStore, type Settings } from "../persistence/SettingsStore";
import { safeLocalStorage } from "../persistence/Storage";
import { GameRenderer, type RenderFrame } from "../render/GameRenderer";
import { Hud } from "../ui/Hud";
import { MainMenu } from "../ui/MainMenu";
import { PauseMenu } from "../ui/PauseMenu";
import { ResultsScreen } from "../ui/ResultsScreen";
import { TrackSelect } from "../ui/TrackSelect";
import { UIManager } from "../ui/UIManager";
import { clamp } from "../utils/MathUtils";
import { AUDIO, DEBUG_ENABLED, HIGHWAY, type Judgment } from "./Config";
import { GAMEPLAY_STATES, type GameState, type PlayMode } from "./GameState";
import { Router } from "./Router";

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

export class App implements AppApi {
  readonly router: Router;
  readonly settings: SettingsStore;
  readonly save: SaveManager;
  readonly ready: Promise<void>;
  readonly audio: { available: boolean; unlocked: boolean; unlock(): Promise<boolean> };

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
  private fps = 60;
  private frameMs = 16;
  private seed = 1;
  private debugView = false;

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
      TRACK_DEFINITIONS.map((d) => ({
        id: d.metadata.id,
        title: d.metadata.title,
        unlockAfter: d.metadata.unlockAfter,
      })),
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

    this.ui = new UIManager(uiRoot, this, {
      move: () => this.sfx.play("menu-move"),
      select: () => this.sfx.play("menu-select"),
      back: () => this.sfx.play("menu-back"),
    });
    this.hud = new Hud(this);
    root.insertBefore(this.hud.element, uiRoot);

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
    this.ui.register("RESULTS", new ResultsScreen(this));

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
    this.current = { track, difficulty, mode, game, practice, assisted: false, autoplay: false };
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
      this.transport.setRate(practice.rate);
      this.enterPractice();
    } else {
      this.transport.setRate(1);
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
    if (this.router.state === "LOADING_TRACK") return;
    if (!this.router.can("LOADING_TRACK")) this.router.goTo("TRACK_SELECT");
    this.router.goTo("LOADING_TRACK");
  }

  pause(): void {
    const session = this.current;
    if (!session || !GAMEPLAY_STATES.has(this.router.state)) return;
    this.input.clearHeld();
    session.game.cancelHolds();
    this.clearAutoHold();
    this.cancelCountdown();
    this.clock.pause();
    this.transport.pause();
    this.sfx.play("pause");
    this.router.goTo("PAUSED");
    this.announce("Paused");
  }

  resume(): void {
    const session = this.current;
    if (!session || this.router.state !== "PAUSED") return;
    void this.engine.unlock();
    const target = this.router.resumeState ?? (session.mode === "practice" ? "PRACTICE" : "PLAYING");
    if (target === "COUNTDOWN") {
      // Give the player a moment of run up rather than dropping them on a note.
      const back = clamp(this.clock.pausedSongMs - 1000, this.countdownStartMs(), 0);
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
    this.cancelDwell();
    this.cancelCountdown();
    this.input.clearHeld();
    session.game.cancelHolds();
    this.clearAutoHold();
    this.transport.stop();
    session.game.reset();
    session.assisted = session.autoplay;
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
    this.current = { track, difficulty, mode: "practice", game, practice, assisted: false, autoplay: false };
    this.mapper = mapperFor(track);
    this.autoNotes = [...game.chart.notes].sort((a, b) => a.timeMs - b.timeMs || a.lane - b.lane);
    this.bindGame(game);
    this.transport.setTrack(track);
    this.transport.setMetronome(settings.metronome);
    this.transport.setRate(practice.rate);
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
    session.game.rearmFrom(ms);
    session.game.skipBefore(ms);
    this.clock.seek(ms);
    this.transport.seek();
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
    this.transport.setLoop(session.practice.loopStartMs, enabled ? session.practice.loopEndMs : null);
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
    if (!session) return;
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
  }

  /** Seeks, then walks the run forward without frames so a screenshot has state on screen. */
  private freezeAt(songMs: number): void {
    const session = this.current;
    if (!session) return;
    const from = songMs - HIGHWAY.freezeWarmupMs;
    this.seekTo(from);
    this.stepTo(from, songMs, session.autoplay);
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
    for (let t = fromMs; t < toMs; t += STEP_MS) {
      if (withAutoplay) this.stepAutoplay(t - this.judgmentOffsetMs);
      session.game.update(t);
      if (session.game.finished) return;
    }
    if (withAutoplay) this.stepAutoplay(toMs - this.judgmentOffsetMs);
    session.game.update(toMs);
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
    this.frameMs = this.frameMs * 0.9 + wallDeltaMs * 0.1;
    this.fps = this.frameMs > 0 ? 1000 / this.frameMs : 0;

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

    const songMs = this.clock.songMs();
    if (session.autoplay) this.stepAutoplay(songMs - judgmentOffsetMs);
    session.game.update(songMs);
    this.advance(songMs);

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
    frame.showBeatGrid = session.mode === "practice" ? settings.practiceBeatGrid : settings.showBeatGrid;
    frame.showHitWindows = this.debugView;
    frame.showNoteIds = this.debugView;
    frame.showLaneBounds = this.debugView;
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
    this.seekTo(practice.entryMs());
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
    const entry = practice.entryMs();
    this.clock.seek(entry);
    this.clock.start(entry);
    this.transport.setLoop(practice.loopStartMs, practice.loopEnabled ? practice.loopEndMs : null);
    session.game.reset();
    session.game.skipBefore(practice.loopStartMs);
    this.resetAutoplayCursor(entry);
    this.router.goTo("PRACTICE");
    this.transport.start();
    this.hud.setCountIn(practice.loopStartMs, this.beatMs());
    this.lastDisplayMs = null;
  }

  private beatMs(): number {
    const bpm = this.current?.track.metadata.bpm ?? 0;
    return bpm > 0 ? 60000 / bpm : 500;
  }

  private countdownStartMs(): number {
    return -Math.max(HIGHWAY.countdownMs, this.settings.current.approachMs + 200);
  }

  private bindGame(game: RhythmGame): void {
    this.releaseListeners();
    const events = game.events;
    this.unbindGame = [
      events.on("judgment", ({ lane, judgment, deltaMs, songMs }) => {
        this.sfx.play(JUDGMENT_SFX[judgment]);
        this.renderer.addJudgment(lane, judgment, deltaMs, songMs, this.debugView);
      }),
      events.on("phraseComplete", ({ trill }) => {
        this.sfx.play("phrase");
        this.renderer.addPhrasePulse(game.snapshot().lastJudgmentSongMs);
        this.hud.flashMessage(trill ? "Trill" : "Perfect Passage");
      }),
      events.on("recenter", () => this.hud.flashMessage("Recenter")),
      events.on("surgeStart", () => {
        this.sfx.play("surge-start");
        this.hud.flashMessage("Focus Surge");
      }),
      events.on("surgeEnd", () => this.sfx.play("surge-end")),
      events.on("complete", () => this.enterOutcome(true)),
      events.on("fail", () => this.enterOutcome(false)),
    ];
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
      this.transport.stopAll(400);
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
    session.game.press(lane, songMs);
    this.lastPressDisplayMs[lane] = this.displayAt(songMs);
  }

  private onLaneRelease(lane: Lane, perfTs: number): void {
    const session = this.current;
    if (!session || !GAMEPLAY_STATES.has(this.router.state)) return;
    session.game.release(lane, this.clock.songMsAtAudioMs(this.engine.perfToAudioMs(perfTs)));
  }

  private onShortcut(action: ShortcutAction): void {
    const state = this.router.state;
    switch (action) {
      case "pause":
        if (GAMEPLAY_STATES.has(state)) this.pause();
        else if (state === "PAUSED") this.resume();
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
        if (state === "PRACTICE") this.pause();
        else if (state === "PAUSED") this.resume();
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
