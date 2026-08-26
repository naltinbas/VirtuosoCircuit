// The gameplay facade. Everything the app, the HUD and the renderer need from
// a run in progress goes through this class; the pieces it composes hold the
// actual rules.
//
// Nothing here reads a clock. Times arrive as song milliseconds and are
// corrected once, at the top of every entry point, by judgmentOffsetMs. That
// is the only place the player's calibration is applied, so a caller can pass
// raw song time and still get the timing it hears.

import {
  AURA_CONFIG,
  HIGHWAY,
  SCORE_CONFIG,
  type Judgment,
  type JudgmentWindows,
  type Seal,
} from "../app/Config";
import type { PlayMode } from "../app/GameState";
import type { CompiledChart, Difficulty, Lane, TrackChart } from "../charts/ChartTypes";
import { EventEmitter } from "../utils/EventEmitter";
import { AuraMeter } from "./AuraMeter";
import { ChordSystem } from "./ChordSystem";
import { ComboSystem } from "./ComboSystem";
import { HoldNoteSystem } from "./HoldNoteSystem";
import { NoteJudge, isHit } from "./NoteJudge";
import { NoteScheduler, type NoteRuntime, type NoteView } from "./NoteScheduler";
import { ScoreSystem } from "./ScoreSystem";

export interface GameOptions {
  mode: PlayMode;
  noFail: boolean;
  focusSurgeEnabled: boolean;
  judgmentOffsetMs: number;
  /** Defaults to JUDGMENT_WINDOWS_MS. */
  windows?: JudgmentWindows;
}

export interface PressResult {
  noteId: string;
  judgment: Judgment;
  deltaMs: number;
}

export interface GameSnapshot {
  mode: PlayMode;
  songMs: number;
  score: number;
  combo: number;
  bestCombo: number;
  multiplier: number;
  aura: number;
  auraMax: number;
  auraWarning: boolean;
  accuracy: number;
  judgedCount: number;
  totalNotes: number;
  counts: Record<Judgment, number>;
  misses: number;
  missStreak: number;
  holdingLanes: boolean[];
  lastJudgment: Judgment | null;
  lastDeltaMs: number;
  lastJudgmentSongMs: number;
  lastJudgmentLane: Lane | -1;
  surgeActive: boolean;
  surgeReady: boolean;
  surgeRemainingMs: number;
  phrasesCompleted: number;
  trillsCompleted: number;
  chordsCompleted: number;
  finished: boolean;
  failed: boolean;
  completed: boolean;
}

export interface PerformanceSummary {
  trackId: string;
  difficulty: Difficulty;
  mode: PlayMode;
  score: number;
  accuracy: number;
  seal: Seal;
  bestChain: number;
  counts: Record<Judgment, number>;
  misses: number;
  earlyReleases: number;
  holdTicks: number;
  phrasesCompleted: number;
  phraseCount: number;
  trillsCompleted: number;
  trillCount: number;
  chordsCompleted: number;
  chordCount: number;
  auraEnd: number;
  timingDeltas: number[];
  totalNotes: number;
  judgedCount: number;
  completed: boolean;
  failed: boolean;
}

export type GameEvents = {
  judgment: { noteId: string; lane: Lane; judgment: Judgment; deltaMs: number; songMs: number };
  holdStart: { noteId: string };
  holdEnd: { noteId: string; completed: boolean; quiet: boolean };
  chordComplete: { eventId: string };
  phraseComplete: { phraseId: string; trill: boolean };
  recenter: { songMs: number };
  auraWarning: { aura: number };
  auraRecovered: { aura: number };
  surgeStart: { songMs: number };
  surgeEnd: { songMs: number };
  fail: { songMs: number };
  complete: { songMs: number };
};

export class RhythmGame {
  readonly events = new EventEmitter<GameEvents>();
  readonly track: TrackChart;
  readonly difficulty: Difficulty;
  readonly chart: CompiledChart;
  readonly mode: PlayMode;

  private readonly noFail: boolean;
  private readonly surgeEnabled: boolean;
  private readonly endSongMs: number;
  private readonly judge: NoteJudge;
  private readonly scheduler: NoteScheduler;
  private readonly holds: HoldNoteSystem;
  private readonly chords: ChordSystem;
  private readonly combo = new ComboSystem();
  private readonly score = new ScoreSystem();
  private readonly aura = new AuraMeter();
  private readonly snap: GameSnapshot;

  private offsetMs: number;
  private lastSongMs = 0;
  private lastUpdateSongMs: number | null = null;
  private finishedFlag = false;
  private completedFlag = false;
  private failedFlag = false;

  constructor(track: TrackChart, difficulty: Difficulty, options: GameOptions) {
    const chart = track.charts[difficulty];
    if (!chart) throw new Error(`Track ${track.metadata.id} has no ${difficulty} chart`);
    this.track = track;
    this.difficulty = difficulty;
    this.chart = chart;
    this.mode = options.mode;
    this.noFail = options.noFail;
    this.surgeEnabled = options.focusSurgeEnabled;
    this.offsetMs = options.judgmentOffsetMs;
    this.endSongMs = track.metadata.durationMs + HIGHWAY.outroMs;
    this.judge = new NoteJudge(options.windows);
    this.scheduler = new NoteScheduler(chart);
    this.holds = new HoldNoteSystem({
      onTick: () => this.payHoldTick(),
      onEnd: (note, completed, quiet) => this.endHold(note, completed, quiet),
    });
    this.chords = new ChordSystem(chart, {
      onChord: (eventId) => this.payChord(eventId),
      onPhrase: (phraseId, trill) => this.payPhrase(phraseId, trill),
    });
    this.snap = {
      mode: this.mode,
      songMs: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      multiplier: 1,
      aura: this.aura.aura,
      auraMax: AURA_CONFIG.max,
      auraWarning: false,
      accuracy: 0,
      judgedCount: 0,
      totalNotes: chart.notes.length,
      counts: this.score.counts,
      misses: 0,
      missStreak: 0,
      holdingLanes: this.holds.holdingLanes,
      lastJudgment: null,
      lastDeltaMs: 0,
      lastJudgmentSongMs: 0,
      lastJudgmentLane: -1,
      surgeActive: false,
      surgeReady: false,
      surgeRemainingMs: 0,
      phrasesCompleted: 0,
      trillsCompleted: 0,
      chordsCompleted: 0,
      finished: false,
      failed: false,
      completed: false,
    };
  }

  get judgmentOffsetMs(): number {
    return this.offsetMs;
  }

  get finished(): boolean {
    return this.finishedFlag;
  }

  get totalNotes(): number {
    return this.chart.notes.length - this.scheduler.skippedCount;
  }

  get windows(): JudgmentWindows {
    return this.judge.windows;
  }

  setJudgmentOffsetMs(ms: number): void {
    this.offsetMs = ms;
  }

  update(songMs: number): void {
    if (this.finishedFlag) return;
    this.lastSongMs = songMs;
    const dt = this.lastUpdateSongMs === null ? 0 : Math.max(0, songMs - this.lastUpdateSongMs);
    this.lastUpdateSongMs = songMs;
    const t = songMs - this.offsetMs;
    this.sweep(t);
    this.holds.update(t);
    if (this.aura.surgeActive && this.aura.advanceSurge(dt)) {
      this.events.emit("surgeEnd", { songMs: t });
    }
    this.settleAura();
    if (!this.finishedFlag && this.mode !== "practice" && songMs >= this.endSongMs) this.finish(true);
  }

  press(lane: Lane, songMs: number): PressResult | null {
    if (this.finishedFlag) return null;
    const t = songMs - this.offsetMs;
    this.sweep(t);
    // The step 0 sweep can end the run, and a finished run judges nothing.
    if (this.finishedFlag) return null;
    const note = this.scheduler.candidate(lane, t, this.judge.missWindowMs);
    if (note === null) return null;
    const deltaMs = t - note.note.timeMs;
    const judgment = this.judge.judge(deltaMs);
    if (judgment === null) return null;
    if (isHit(judgment)) this.resolveHit(note, judgment, deltaMs, t);
    else this.resolveMiss(note, deltaMs, t);
    return { noteId: note.note.id, judgment, deltaMs };
  }

  release(lane: Lane, songMs: number): void {
    if (this.finishedFlag) return;
    const t = songMs - this.offsetMs;
    this.sweep(t);
    if (this.finishedFlag) return;
    this.holds.release(lane, t);
    this.settleAura();
  }

  activateFocusSurge(songMs: number): boolean {
    if (this.finishedFlag) return false;
    const t = songMs - this.offsetMs;
    this.sweep(t);
    this.settleAura();
    if (this.finishedFlag || !this.surgeEnabled) return false;
    if (!this.aura.tryStartSurge()) return false;
    this.events.emit("surgeStart", { songMs: t });
    return true;
  }

  /** Drops every hold with no penalty. Used by pauses, seeks and leaving a track. */
  cancelHolds(): void {
    this.holds.cancelAll();
  }

  /** Practice loops: every note from `songMs` on goes back on the highway. */
  rearmFrom(songMs: number): void {
    this.holds.cancelAll();
    this.scheduler.rearmFrom(songMs, (note) => {
      if (note.judgment !== null) this.score.removeJudgment(note.judgment, note.deltaMs);
    });
    this.chords.rebuild(this.scheduler.notes);
    this.lastUpdateSongMs = songMs;
  }

  /** Notes before `songMs` that were never played stop counting for this run. */
  skipBefore(songMs: number): void {
    this.scheduler.skipBefore(songMs, (note) => this.chords.resolve(note));
  }

  reset(): void {
    this.holds.reset();
    this.scheduler.reset();
    this.chords.reset();
    this.combo.reset();
    this.score.reset();
    this.aura.reset();
    this.lastSongMs = 0;
    this.lastUpdateSongMs = null;
    this.finishedFlag = false;
    this.completedFlag = false;
    this.failedFlag = false;
    this.snap.lastJudgment = null;
    this.snap.lastDeltaMs = 0;
    this.snap.lastJudgmentSongMs = 0;
    this.snap.lastJudgmentLane = -1;
  }

  /** Debug hook behind window.vc.forceFail. */
  debugSetAura(value: number): void {
    this.aura.setAura(value);
  }

  visibleNotes(displayMs: number, approachMs: number, out: NoteView[]): number {
    return this.scheduler.visibleNotes(displayMs, approachMs, out);
  }

  /** The same object every call, refreshed in place. */
  snapshot(): GameSnapshot {
    const snap = this.snap;
    snap.songMs = this.lastSongMs;
    snap.score = this.score.score;
    snap.combo = this.combo.combo;
    snap.bestCombo = this.combo.bestCombo;
    snap.multiplier = this.combo.multiplier;
    snap.aura = this.aura.aura;
    snap.auraWarning = this.aura.warning;
    snap.accuracy = this.score.accuracy;
    snap.judgedCount = this.score.judgedCount;
    snap.totalNotes = this.totalNotes;
    snap.misses = this.score.misses;
    snap.missStreak = this.combo.missStreak;
    snap.surgeActive = this.aura.surgeActive;
    snap.surgeReady = this.surgeEnabled && !this.finishedFlag && !this.aura.surgeActive && this.aura.full;
    snap.surgeRemainingMs = this.aura.surgeRemainingMs;
    snap.phrasesCompleted = this.score.phrasesCompleted;
    snap.trillsCompleted = this.score.trillsCompleted;
    snap.chordsCompleted = this.score.chordsCompleted;
    snap.finished = this.finishedFlag;
    snap.failed = this.failedFlag;
    snap.completed = this.completedFlag;
    return snap;
  }

  summary(): PerformanceSummary {
    return {
      trackId: this.track.metadata.id,
      difficulty: this.difficulty,
      mode: this.mode,
      score: this.score.score,
      accuracy: this.score.accuracy,
      seal: this.score.seal(this.completedFlag),
      bestChain: this.combo.bestCombo,
      counts: { ...this.score.counts },
      misses: this.score.misses,
      earlyReleases: this.score.earlyReleases,
      holdTicks: this.score.holdTicks,
      phrasesCompleted: this.score.phrasesCompleted,
      phraseCount: this.chords.phraseCount,
      trillsCompleted: this.score.trillsCompleted,
      trillCount: this.chords.trillCount,
      chordsCompleted: this.score.chordsCompleted,
      chordCount: this.chords.chordCount,
      auraEnd: this.aura.aura,
      timingDeltas: [...this.score.timingDeltas],
      totalNotes: this.totalNotes,
      judgedCount: this.score.judgedCount,
      completed: this.completedFlag,
      failed: this.failedFlag,
    };
  }

  private sweep(t: number): void {
    if (this.finishedFlag) return;
    this.scheduler.sweep(t, this.judge.missWindowMs, (note, at) => {
      this.resolveMiss(note, this.judge.autoMissDeltaMs, at);
      // An auto-miss can empty the meter part-way through the walk. The run is
      // over at that point, so the notes behind it stay pending.
      return !this.finishedFlag;
    });
  }

  private resolveHit(note: NoteRuntime, judgment: Judgment, deltaMs: number, t: number): void {
    const recenter = this.combo.registerHit();
    const multiplier = this.combo.multiplier;
    this.score.recordJudgment(judgment, deltaMs);
    this.score.award(SCORE_CONFIG[judgment], multiplier, this.aura.surgeActive);
    this.aura.add(AURA_CONFIG[judgment]);
    note.judgment = judgment;
    note.deltaMs = deltaMs;
    note.hitSongMs = t;
    note.state = "hit";
    this.remember(judgment, deltaMs, t, note.note.lane);
    this.events.emit("judgment", {
      noteId: note.note.id,
      lane: note.note.lane,
      judgment,
      deltaMs,
      songMs: t,
    });
    if (recenter) {
      this.aura.recenter();
      this.events.emit("recenter", { songMs: t });
    }
    if (note.note.isHold) {
      this.holds.start(note, t);
      this.events.emit("holdStart", { noteId: note.note.id });
    }
    this.chords.resolve(note);
    this.settleAura();
  }

  private resolveMiss(note: NoteRuntime, deltaMs: number, t: number): void {
    this.combo.registerMiss();
    this.score.recordJudgment("miss", deltaMs);
    this.aura.add(AURA_CONFIG.miss);
    note.judgment = "miss";
    note.deltaMs = deltaMs;
    note.hitSongMs = t;
    note.state = "missed";
    this.remember("miss", deltaMs, t, note.note.lane);
    this.events.emit("judgment", {
      noteId: note.note.id,
      lane: note.note.lane,
      judgment: "miss",
      deltaMs,
      songMs: t,
    });
    this.chords.resolve(note);
    this.settleAura();
  }

  private payHoldTick(): void {
    this.score.addHoldTick();
    this.score.award(SCORE_CONFIG.holdTick, this.combo.multiplier, this.aura.surgeActive);
  }

  private endHold(note: NoteRuntime, completed: boolean, quiet: boolean): void {
    if (!completed && !quiet) {
      this.score.addEarlyRelease();
      this.aura.add(AURA_CONFIG.earlyRelease);
    }
    this.events.emit("holdEnd", { noteId: note.note.id, completed, quiet });
  }

  private payChord(eventId: string): void {
    this.score.award(SCORE_CONFIG.chordCompletionBonus, this.combo.multiplier, this.aura.surgeActive);
    this.score.addChord();
    this.aura.add(AURA_CONFIG.chordComplete);
    this.events.emit("chordComplete", { eventId });
  }

  private payPhrase(phraseId: string, trill: boolean): void {
    const base = trill ? SCORE_CONFIG.trillCompletionBonus : SCORE_CONFIG.phraseCompletionBonus;
    this.score.award(base, this.combo.multiplier, this.aura.surgeActive);
    this.score.addPhrase(trill);
    this.aura.add(AURA_CONFIG.phraseComplete);
    this.events.emit("phraseComplete", { phraseId, trill });
  }

  private remember(judgment: Judgment, deltaMs: number, t: number, lane: Lane): void {
    this.snap.lastJudgment = judgment;
    this.snap.lastDeltaMs = deltaMs;
    this.snap.lastJudgmentSongMs = t;
    this.snap.lastJudgmentLane = lane;
  }

  private settleAura(): void {
    const event = this.aura.takeEvent();
    if (event === "warning") this.events.emit("auraWarning", { aura: this.aura.aura });
    else if (event === "recovered") this.events.emit("auraRecovered", { aura: this.aura.aura });
    if (this.aura.empty && this.mode === "performance" && !this.noFail) this.finish(false);
  }

  private finish(completed: boolean): void {
    if (this.finishedFlag) return;
    this.holds.cancelAll();
    this.finishedFlag = true;
    this.completedFlag = completed;
    this.failedFlag = !completed;
    this.events.emit(completed ? "complete" : "fail", { songMs: this.lastSongMs });
  }
}
