// The play overlay: track line, progress, score, chain, Harmony Factor,
// accuracy and the Aura Meter.
//
// Every element is built once in the constructor. update() runs on every
// frame, so it only writes textContent when a value actually changed and moves
// the two bars with a transform. Judgment popups belong to the canvas; what is
// here is the text that has to be selectable by a screen reader.

import { JUDGMENT_LABELS, type Judgment } from "../app/Config";
import type { PlayMode } from "../app/GameState";
import type { AppApi } from "../app/App";
import type { Difficulty, TrackChart } from "../charts/ChartTypes";
import { DIFFICULTY_LABELS } from "../app/Config";
import type { GameSnapshot } from "../gameplay/RhythmGame";
import { clamp } from "../utils/MathUtils";
import { formatClock, formatOffset, formatPercent, formatScore } from "../utils/TimeUtils";
import { el } from "./UIManager";

const MODE_LABELS: Record<PlayMode, string> = {
  performance: "Performance",
  practice: "Practice",
  free: "Free performance",
};

interface CountIn {
  targetMs: number;
  beatMs: number;
}

/** How long a flashed line stays, matching the hud-flash animation in the CSS. */
const FLASH_MS = 900;

interface Readout {
  element: HTMLElement;
  value: HTMLElement;
  last: string;
}

function readout(label: string, className: string): Readout {
  const element = el("div", { className: `hud__stat ${className}` });
  const name = el("span", { className: "hud__stat-label", text: label });
  const value = el("span", { className: "hud__stat-value", text: "" });
  element.append(name, value);
  return { element, value, last: "" };
}

function write(target: Readout, text: string): void {
  if (target.last === text) return;
  target.last = text;
  target.value.textContent = text;
}

export class Hud {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly titleEl = el("span", { className: "hud__title" });
  private readonly composerEl = el("span", { className: "hud__composer" });
  private readonly modeEl = el("span", { className: "hud__mode" });
  private readonly progressFill = el("div", { className: "hud__progress-fill" });
  private readonly progressBar = el("div", { className: "hud__progress" });
  private readonly clockEl = el("span", { className: "hud__clock", text: "0:00" });
  private readonly auraFill = el("div", { className: "hud__aura-fill" });
  private readonly auraBar = el("div", { className: "hud__aura" });
  private readonly judgmentEl = el("div", { className: "hud__judgment" });
  private readonly countdownEl = el("div", { className: "hud__countdown" });
  private readonly bannerEl = el("div", { className: "hud__banner" });
  private readonly messageEl = el("div", { className: "hud__message" });
  private readonly beatEl = el("div", { className: "hud__beat" });
  private readonly perfEl = el("div", { className: "hud__perf" });
  private readonly pauseButton: HTMLButtonElement;

  private readonly score = readout("Score", "hud__stat--score");
  private readonly chain = readout("Resonance Chain", "hud__stat--chain");
  private readonly harmony = readout("Harmony Factor", "hud__stat--harmony");
  private readonly accuracy = readout("Accuracy", "hud__stat--accuracy");

  private durationMs = 1;
  private countIn: CountIn | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private showDelta = false;
  private lastClock = "";
  private lastCountdown = "";
  private lastJudgment = "";
  private lastPerf = "";
  private lastAura = -1;
  private lastProgress = -1;
  private lastWarning = false;
  private lastSurge = false;

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("div", { className: "hud", id: "hud" });
    this.element.hidden = true;

    const track = el("div", { className: "hud__track" });
    track.append(this.titleEl, this.composerEl, this.modeEl);

    this.progressBar.append(this.progressFill);
    this.progressBar.setAttribute("role", "presentation");

    const stats = el("div", { className: "hud__stats" });
    stats.append(this.score.element, this.chain.element, this.harmony.element, this.accuracy.element);

    const auraLabel = el("span", { className: "hud__aura-label", text: "Aura Meter" });
    this.auraBar.append(this.auraFill);
    const aura = el("div", { className: "hud__aura-row" });
    aura.append(auraLabel, this.auraBar);

    this.pauseButton = el("button", { className: "hud__pause", text: "Pause" });
    this.pauseButton.type = "button";
    this.pauseButton.tabIndex = -1;
    this.pauseButton.setAttribute("aria-label", "Pause the performance");
    this.pauseButton.addEventListener("click", () => this.app.pause());

    const top = el("div", { className: "hud__top" });
    const topLeft = el("div", { className: "hud__top-left" });
    topLeft.append(track, this.progressBar, this.clockEl);
    const topRight = el("div", { className: "hud__top-right" });
    topRight.append(stats, this.pauseButton);
    top.append(topLeft, topRight);

    const center = el("div", { className: "hud__center" });
    center.append(this.countdownEl, this.bannerEl, this.messageEl);

    const bottom = el("div", { className: "hud__bottom" });
    bottom.append(aura, this.judgmentEl, this.beatEl);

    this.perfEl.hidden = true;
    this.element.append(top, center, bottom, this.perfEl);
  }

  setTrack(track: TrackChart | null, difficulty: Difficulty | null, mode: PlayMode | null): void {
    this.titleEl.textContent = track ? track.metadata.title : "";
    this.composerEl.textContent = track ? track.metadata.composerShort : "";
    this.modeEl.textContent =
      track && difficulty && mode ? `${DIFFICULTY_LABELS[difficulty]}, ${MODE_LABELS[mode]}` : "";
    this.durationMs = Math.max(1, track?.metadata.durationMs ?? 1);
    // The beat dot pulses from CSS so the frame loop does not have to write it.
    const bpm = track ? track.metadata.bpm : 0;
    this.element.style.setProperty("--beat-ms", bpm > 0 ? `${Math.round(60000 / bpm)}ms` : "0ms");
    this.resetCache();
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  setPaused(paused: boolean): void {
    this.element.classList.toggle("hud--paused", paused);
  }

  /** Debug timing shows the signed delta of the last judgment. */
  setShowDelta(show: boolean): void {
    this.showDelta = show;
  }

  setBanner(text: string | null): void {
    this.bannerEl.textContent = text ?? "";
    this.bannerEl.classList.toggle("is-visible", text !== null);
  }

  /** One line that fades on its own, for Recenter and Perfect Passage. */
  flashMessage(text: string): void {
    this.clearFlash();
    this.messageEl.textContent = text;
    this.messageEl.classList.remove("is-flash");
    // Forcing layout restarts the CSS animation for a repeated message.
    void this.messageEl.offsetWidth;
    this.messageEl.classList.add("is-flash");
    // Reduced motion turns the fade off, so the line is taken back by a timer
    // rather than by the end of the animation.
    this.flashTimer = setTimeout(() => {
      this.flashTimer = null;
      this.messageEl.classList.remove("is-flash");
      this.messageEl.textContent = "";
    }, FLASH_MS);
  }

  private clearFlash(): void {
    if (this.flashTimer === null) return;
    clearTimeout(this.flashTimer);
    this.flashTimer = null;
  }

  /** Practice enters mid track, so the count-in is in beats rather than 3, 2, 1. */
  setCountIn(targetMs: number, beatMs: number): void {
    this.countIn = beatMs > 0 ? { targetMs, beatMs } : null;
  }

  clearCountIn(): void {
    this.countIn = null;
  }

  setPerfVisible(visible: boolean): void {
    this.perfEl.hidden = !visible;
    if (!visible) this.lastPerf = "";
  }

  get perfVisible(): boolean {
    return !this.perfEl.hidden;
  }

  updatePerf(fps: number, frameMs: number, notes: number, particles: number): void {
    const text = `${Math.round(fps)} fps, ${frameMs.toFixed(1)} ms, ${notes} notes, ${particles} sparks`;
    if (text === this.lastPerf) return;
    this.lastPerf = text;
    this.perfEl.textContent = text;
  }

  update(snapshot: GameSnapshot, songMs: number): void {
    write(this.score, formatScore(snapshot.score));
    write(this.chain, `${snapshot.combo}`);
    write(this.harmony, `x${snapshot.multiplier}`);
    write(this.accuracy, snapshot.judgedCount === 0 ? "100.0%" : formatPercent(snapshot.accuracy));

    const clockText = formatClock(Math.max(0, songMs));
    if (clockText !== this.lastClock) {
      this.lastClock = clockText;
      this.clockEl.textContent = clockText;
    }

    const progress = clamp(songMs / this.durationMs, 0, 1);
    if (Math.abs(progress - this.lastProgress) > 0.001) {
      this.lastProgress = progress;
      this.progressFill.style.transform = `scaleX(${progress.toFixed(4)})`;
    }

    const aura = snapshot.auraMax > 0 ? clamp(snapshot.aura / snapshot.auraMax, 0, 1) : 0;
    if (Math.abs(aura - this.lastAura) > 0.002) {
      this.lastAura = aura;
      this.auraFill.style.transform = `scaleX(${aura.toFixed(3)})`;
    }
    if (snapshot.auraWarning !== this.lastWarning) {
      this.lastWarning = snapshot.auraWarning;
      this.auraBar.classList.toggle("is-warning", snapshot.auraWarning);
    }
    if (snapshot.surgeActive !== this.lastSurge) {
      this.lastSurge = snapshot.surgeActive;
      this.element.classList.toggle("hud--surge", snapshot.surgeActive);
    }

    this.writeJudgment(snapshot.lastJudgment, snapshot.lastDeltaMs);
    this.writeCountdown(songMs);
  }

  private writeJudgment(judgment: Judgment | null, deltaMs: number): void {
    const text =
      judgment === null
        ? ""
        : this.showDelta
          ? `${JUDGMENT_LABELS[judgment]} ${formatOffset(deltaMs)}`
          : JUDGMENT_LABELS[judgment];
    if (text === this.lastJudgment) return;
    this.lastJudgment = text;
    this.judgmentEl.textContent = text;
  }

  private writeCountdown(songMs: number): void {
    let text = "";
    if (this.countIn !== null) {
      const remaining = this.countIn.targetMs - songMs;
      if (remaining > 0) text = `${Math.ceil(remaining / this.countIn.beatMs)}`;
    } else if (songMs < 0) {
      if (songMs >= -1000) text = "1";
      else if (songMs >= -2000) text = "2";
      else if (songMs >= -3000) text = "3";
    } else if (songMs < 600) {
      text = "Begin";
    }
    if (text === this.lastCountdown) return;
    this.lastCountdown = text;
    this.countdownEl.textContent = text;
    this.countdownEl.classList.toggle("is-visible", text !== "");
  }

  private resetCache(): void {
    this.clearFlash();
    this.lastClock = "";
    this.lastCountdown = "";
    this.lastJudgment = "";
    this.lastAura = -1;
    this.lastProgress = -1;
    this.lastWarning = false;
    this.lastSurge = false;
    this.score.last = "";
    this.chain.last = "";
    this.harmony.last = "";
    this.accuracy.last = "";
    this.setBanner(null);
    this.messageEl.textContent = "";
    this.messageEl.classList.remove("is-flash");
    this.countdownEl.textContent = "";
    this.countdownEl.classList.remove("is-visible");
  }
}
