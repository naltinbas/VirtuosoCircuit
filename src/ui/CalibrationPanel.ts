// Calibration.
//
// Three offsets, a metronome you can watch as well as hear, and a guided test
// that measures how late your presses land. Nothing here shifts the music: the
// offsets only change when a note counts as hit and where it is drawn.
//
// The metronome schedules its clicks on the audio clock through the same
// lookahead pattern the transport uses, because a setInterval callback is not
// accurate enough to click on.

import type { AppApi } from "../app/App";
import { CalibrationManager } from "../audio/CalibrationManager";
import { AUDIO, CALIBRATION_RANGE_MS, GUIDED_CALIBRATION } from "../app/Config";
import { formatOffset } from "../utils/TimeUtils";
import { button, el, fieldset, sliderField, type Screen, type SliderField } from "./UIManager";

/** Silence before the first click, so the scheduler has room to work. */
const LEAD_IN_MS = 600;
const BEATS_PER_BAR = 4;
/** Cancels kept for clicks already scheduled. Older ones have played. */
const MAX_PENDING_CLICKS = 32;

const MARKER_HEIGHT = 72;

export class CalibrationPanel implements Screen {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly audio: SliderField;
  private readonly visual: SliderField;
  private readonly input: SliderField;
  private readonly latencyNote = el("p", { className: "screen__note" });
  private readonly metronomeButton: HTMLButtonElement;
  private readonly canvas = el("canvas", { className: "beat-strip" });
  private readonly testButton: HTMLButtonElement;
  private readonly testStatus = el("p", { className: "screen__note" });
  private readonly suggestion = el("p", { className: "panel-note" });
  private readonly suggestionActions = el("div", { className: "screen__actions screen__actions--tight" });

  private manager: CalibrationManager | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: (() => void)[] = [];
  private firstBeatAudioMs = 0;
  private beatIndex = 0;
  private raf: number | null = null;
  private collecting = false;
  private suggestedMs: number | null = null;

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("section", { className: "screen screen--panel screen--calibration" });
    this.element.setAttribute("aria-label", "Calibration");

    const header = el("header", { className: "screen__header" });
    header.append(
      el("h2", { className: "screen__title", text: "Calibration" }),
      el("p", {
        className: "screen__note",
        text: "Offsets change judging and drawing only. The music never moves.",
      }),
      this.latencyNote,
    );

    const current = app.settings.current;
    this.audio = this.offsetSlider(
      "Audio offset",
      current.audioOffsetMs,
      "Positive when the sound reaches you later than the game thinks. Applies to judging and to the highway.",
      (v) => ({ audioOffsetMs: v }),
    );
    this.visual = this.offsetSlider(
      "Visual offset",
      current.visualOffsetMs,
      "Positive draws the gems as if time were later, so they reach the gate earlier. Drawing only.",
      (v) => ({ visualOffsetMs: v }),
    );
    this.input = this.offsetSlider(
      "Input offset",
      current.inputOffsetMs,
      "Positive forgives presses that land late. Judging only, and what the guided test sets.",
      (v) => ({ inputOffsetMs: v }),
    );

    this.canvas.height = MARKER_HEIGHT;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", `Metronome marker at ${GUIDED_CALIBRATION.bpm} beats per minute`);

    this.metronomeButton = button("Stop metronome", () => this.toggleMetronome(), {
      className: "button button--inline",
    });
    const toneButton = button("Test tone", () => this.app.calibration.playTestTone(), {
      className: "button button--inline",
    });
    const metronomeRow = el("div", { className: "screen__actions screen__actions--tight" });
    metronomeRow.append(this.metronomeButton, toneButton);

    this.testButton = button("Start guided test", () => this.toggleTest(), { className: "button button--inline" });
    const testRow = el("div", { className: "screen__actions screen__actions--tight" });
    testRow.append(this.testButton);

    this.suggestion.hidden = true;
    this.suggestionActions.hidden = true;
    this.suggestionActions.append(
      button("Use this offset", () => this.acceptSuggestion(), { className: "button button--inline" }),
      button("Discard", () => this.rejectSuggestion(), { className: "button button--quiet button--inline" }),
    );

    const actions = el("div", { className: "screen__actions" });
    actions.append(
      button("Save and close", () => this.saveAndClose()),
      button("Reset offsets", () => this.resetOffsets(), { className: "button button--quiet" }),
      button("Back", () => this.app.router.back(), { className: "button button--quiet" }),
    );

    this.element.append(
      header,
      fieldset("Offsets", this.audio.element, this.visual.element, this.input.element),
      fieldset(
        "Metronome",
        this.canvas,
        el("p", {
          className: "screen__note",
          text: `The marker sweeps from the left and reaches the mark on every beat at ${GUIDED_CALIBRATION.bpm} bpm.`,
        }),
        metronomeRow,
      ),
      fieldset(
        "Guided test",
        el("p", {
          className: "screen__note",
          text:
            `Press any lane key on the beat. ${GUIDED_CALIBRATION.minTaps} steady taps are enough, ` +
            `and the test stops at ${GUIDED_CALIBRATION.maxTaps}.`,
        }),
        testRow,
        this.testStatus,
        this.suggestion,
        this.suggestionActions,
      ),
      actions,
    );
  }

  show(): void {
    const s = this.app.settings.current;
    this.audio.set(s.audioOffsetMs);
    this.visual.set(s.visualOffsetMs);
    this.input.set(s.inputOffsetMs);
    this.latencyNote.textContent = this.app.calibration.outputLatencySupported
      ? `Reported output latency: ${Math.round(this.app.calibration.outputLatencyMs())} ms.`
      : "This browser does not report its output latency, so the guided test matters more than the sliders here.";
    this.clearSuggestion();
    this.testStatus.textContent = "";
    this.startMetronome();
    this.startDrawing();
  }

  hide(): void {
    this.stopTest();
    this.stopMetronome();
    this.stopDrawing();
  }

  onEscape(): boolean {
    if (!this.collecting) return false;
    this.stopTest();
    this.testStatus.textContent = "Test cancelled.";
    return true;
  }

  // ------------------------------------------------------------------ offsets

  private offsetSlider(
    label: string,
    value: number,
    note: string,
    patch: (v: number) => Record<string, number>,
  ): SliderField {
    return sliderField({
      label,
      note,
      min: CALIBRATION_RANGE_MS.min,
      max: CALIBRATION_RANGE_MS.max,
      step: CALIBRATION_RANGE_MS.step,
      value,
      format: formatOffset,
      onInput: (v) => this.app.settings.save(patch(v)),
    });
  }

  private resetOffsets(): void {
    this.app.settings.save({ audioOffsetMs: 0, visualOffsetMs: 0, inputOffsetMs: 0 });
    this.audio.set(0);
    this.visual.set(0);
    this.input.set(0);
    this.clearSuggestion();
    this.testStatus.textContent = "Offsets back to zero.";
  }

  private saveAndClose(): void {
    // The sliders already wrote through; this is where the player says they are done.
    this.app.save.setCalibrated(true);
    this.app.announce("Calibration saved.");
    this.app.router.back();
  }

  // ---------------------------------------------------------------- metronome

  private toggleMetronome(): void {
    if (this.timer === null) this.startMetronome();
    else {
      this.stopTest();
      this.stopMetronome();
    }
  }

  private startMetronome(): void {
    if (this.timer !== null) return;
    void this.app.audio.unlock();
    const calibration = this.app.calibration;
    this.firstBeatAudioMs = calibration.audioNowMs() + LEAD_IN_MS;
    this.beatIndex = 0;
    this.manager = new CalibrationManager(
      GUIDED_CALIBRATION.bpm,
      this.firstBeatAudioMs,
      calibration.outputLatencyMs(),
    );
    this.timer = setInterval(() => this.scheduleClicks(), AUDIO.schedulerIntervalMs);
    this.scheduleClicks();
    this.metronomeButton.textContent = "Stop metronome";
  }

  private stopMetronome(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const cancel of this.pending) cancel();
    this.pending = [];
    this.metronomeButton.textContent = "Start metronome";
  }

  private scheduleClicks(): void {
    const manager = this.manager;
    if (manager === null) return;
    const now = this.app.calibration.audioNowMs();
    const horizon = now + AUDIO.lookaheadMs;
    while (this.firstBeatAudioMs + this.beatIndex * manager.beatMs <= horizon) {
      const at = this.firstBeatAudioMs + this.beatIndex * manager.beatMs;
      const strong = this.beatIndex % BEATS_PER_BAR === 0;
      this.beatIndex++;
      if (now - at > AUDIO.lateNoteDropMs) continue;
      this.pending.push(this.app.calibration.clickAt(Math.max(at, now), strong));
    }
    if (this.pending.length > MAX_PENDING_CLICKS) {
      this.pending = this.pending.slice(this.pending.length - MAX_PENDING_CLICKS);
    }
  }

  // ------------------------------------------------------------------- marker

  private startDrawing(): void {
    if (this.raf !== null) return;
    this.raf = requestAnimationFrame(this.drawFrame);
  }

  private stopDrawing(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private readonly drawFrame = (): void => {
    this.raf = requestAnimationFrame(this.drawFrame);
    this.draw();
  };

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(160, this.canvas.clientWidth);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(MARKER_HEIGHT * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(MARKER_HEIGHT * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, MARKER_HEIGHT);

    const settings = this.app.settings.current;
    const manager = this.manager;
    const phase =
      manager === null || this.timer === null
        ? 0
        : manager.markerPhase(this.app.calibration.audioNowMs(), settings.audioOffsetMs, settings.visualOffsetMs);
    const inset = 16;
    const trackWidth = width - inset * 2;
    const midY = MARKER_HEIGHT / 2;

    ctx.strokeStyle = "rgba(154, 163, 199, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(inset, midY);
    ctx.lineTo(width - inset, midY);
    ctx.stroke();

    // The target mark sits where the marker arrives on the next beat.
    const near = phase > 0.9 || phase < 0.1;
    ctx.strokeStyle = near ? "#ffb547" : "rgba(63, 216, 199, 0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width - inset, midY - 22);
    ctx.lineTo(width - inset, midY + 22);
    ctx.stroke();

    ctx.fillStyle = near ? "#ffb547" : "#9b7bff";
    ctx.beginPath();
    ctx.arc(inset + trackWidth * phase, midY, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // -------------------------------------------------------------- guided test

  private toggleTest(): void {
    if (this.collecting) this.finishTest();
    else this.startTest();
  }

  private startTest(): void {
    this.startMetronome();
    this.manager?.reset();
    this.clearSuggestion();
    this.collecting = true;
    this.testButton.textContent = "Finish test";
    this.testStatus.textContent = "Listening. Press a lane key on every beat.";
    window.addEventListener("keydown", this.onTapKey, true);
  }

  private stopTest(): void {
    if (!this.collecting) return;
    this.collecting = false;
    this.testButton.textContent = "Start guided test";
    window.removeEventListener("keydown", this.onTapKey, true);
  }

  private readonly onTapKey = (event: KeyboardEvent): void => {
    if (event.repeat || event.code === "") return;
    if (!this.app.calibration.isLaneKey(event.code)) return;
    const manager = this.manager;
    if (manager === null) return;
    event.preventDefault();
    event.stopPropagation();
    manager.tap(this.app.calibration.perfToAudioMs(event.timeStamp));
    const result = manager.result();
    const median = formatOffset(result.medianMs);
    this.testStatus.textContent = result.enough
      ? `${result.kept} steady taps, median ${median}. Finish when you are ready.`
      : `${result.kept} of ${GUIDED_CALIBRATION.minTaps} steady taps, median ${median}.`;
    if (manager.full) this.finishTest();
  };

  private finishTest(): void {
    const manager = this.manager;
    this.stopTest();
    if (manager === null) return;
    const result = manager.result();
    if (!result.enough) {
      this.testStatus.textContent =
        `Only ${result.kept} steady taps out of ${result.taps}. ` +
        `Press on the beat at least ${GUIDED_CALIBRATION.minTaps} times.`;
      return;
    }
    this.suggestedMs = result.suggestedInputOffsetMs;
    const late = this.suggestedMs >= 0;
    this.testStatus.textContent = `${result.kept} taps kept of ${result.taps}, spread ${Math.round(result.spreadMs)} ms.`;
    this.suggestion.textContent =
      `${formatOffset(this.suggestedMs)}: your presses land ${Math.abs(this.suggestedMs)} ms ` +
      `${late ? "late" : "early"}. Using this replaces the input offset.`;
    this.suggestion.hidden = false;
    this.suggestionActions.hidden = false;
    this.app.announce(`Guided calibration suggests an input offset of ${formatOffset(this.suggestedMs)}.`);
  }

  private acceptSuggestion(): void {
    if (this.suggestedMs === null) return;
    const value = this.suggestedMs;
    this.app.settings.save({ inputOffsetMs: value });
    this.app.save.setCalibrated(true);
    this.input.set(value);
    this.clearSuggestion();
    this.testStatus.textContent = `Input offset is now ${formatOffset(value)}.`;
    this.app.announce(`Input offset set to ${formatOffset(value)}.`);
  }

  private rejectSuggestion(): void {
    this.clearSuggestion();
    this.testStatus.textContent = "Suggestion discarded. The offsets are unchanged.";
  }

  private clearSuggestion(): void {
    this.suggestedMs = null;
    this.suggestion.hidden = true;
    this.suggestion.textContent = "";
    this.suggestionActions.hidden = true;
  }
}
