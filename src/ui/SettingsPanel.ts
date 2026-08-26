// Everything in the settings schema, in one screen.
//
// Every control writes straight through to SettingsStore, which validates the
// value, persists it and emits a change that App applies live. Nothing here
// keeps its own copy of a setting: show() reads the store again, so a value
// changed elsewhere (the calibration screen, the practice panel) is right when
// this screen comes back up.

import type { AppApi } from "../app/App";
import { HIGHWAY, TEXT_SCALE_RANGE } from "../app/Config";
import { keyLabel } from "../input/KeyBindings";
import type { Settings } from "../persistence/SettingsStore";
import {
  button,
  el,
  field,
  fieldset,
  sliderField,
  toggleField,
  type Screen,
  type SliderField,
  type ToggleField,
} from "./UIManager";

const VOLUME_STEP = 0.05;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export class SettingsPanel implements Screen {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly master: SliderField;
  private readonly music: SliderField;
  private readonly effects: SliderField;
  private readonly approach: SliderField;
  private readonly textScale: SliderField;
  private readonly toggles: { key: keyof Settings; field: ToggleField }[] = [];
  private readonly bindingsValue = el("span", { className: "field__value field__value--wide" });
  private readonly calibrationValue = el("span", { className: "field__value field__value--wide" });
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly storageNote = el("p", { className: "panel-note" });

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("section", { className: "screen screen--panel screen--settings" });
    this.element.setAttribute("aria-label", "Settings");

    const header = el("header", { className: "screen__header" });
    header.append(
      el("h2", { className: "screen__title", text: "Settings" }),
      el("p", { className: "screen__note", text: "Changes take effect at once." }),
    );

    const current = app.settings.current;

    this.master = sliderField({
      label: "Master volume",
      min: 0,
      max: 1,
      step: VOLUME_STEP,
      value: current.masterVolume,
      format: percent,
      onInput: (v) => this.app.settings.save({ masterVolume: v }),
    });
    this.music = sliderField({
      label: "Music volume",
      min: 0,
      max: 1,
      step: VOLUME_STEP,
      value: current.musicVolume,
      format: percent,
      onInput: (v) => this.app.settings.save({ musicVolume: v }),
    });
    this.effects = sliderField({
      label: "Effects volume",
      min: 0,
      max: 1,
      step: VOLUME_STEP,
      value: current.effectsVolume,
      format: percent,
      onInput: (v) => this.app.settings.save({ effectsVolume: v }),
    });
    this.approach = sliderField({
      label: "Note travel speed",
      min: HIGHWAY.approachMsMin,
      max: HIGHWAY.approachMsMax,
      step: HIGHWAY.approachMsStep,
      value: current.approachMs,
      format: seconds,
      note: "How long a signal gem takes to reach the Resonance Gate. Lower is faster.",
      onInput: (v) => this.app.settings.save({ approachMs: v }),
    });
    this.textScale = sliderField({
      label: "Text size",
      min: TEXT_SCALE_RANGE.min,
      max: TEXT_SCALE_RANGE.max,
      step: TEXT_SCALE_RANGE.step,
      value: current.textScale,
      format: percent,
      onInput: (v) => this.app.settings.save({ textScale: v }),
    });

    const bindingsRow = el("div", { className: "field__control" });
    bindingsRow.append(
      this.bindingsValue,
      button("Lane bindings", () => this.app.router.open("CONTROLS"), {
        className: "button button--inline",
        ariaLabel: "Open the lane bindings screen",
      }),
    );
    const calibrationRow = el("div", { className: "field__control" });
    calibrationRow.append(
      this.calibrationValue,
      button("Calibration", () => this.app.router.open("CALIBRATION"), {
        className: "button button--inline",
        ariaLabel: "Open the calibration screen",
      }),
    );

    this.fullscreenButton = button("Fullscreen", () => this.toggleFullscreen(), {
      className: "button button--inline",
    });
    const fullscreenRow = el("div", { className: "field__control" });
    fullscreenRow.append(this.fullscreenButton);

    this.element.append(
      header,
      fieldset(
        "Sound",
        this.master.element,
        this.music.element,
        this.effects.element,
        this.toggle("muted", "Mute", "Silences everything without changing the volumes."),
        this.toggle("metronome", "Metronome", "A click on every beat while you play."),
      ),
      fieldset(
        "Controls and timing",
        field(bindingsRow, { label: "Lane bindings", className: "field field--action" }),
        field(calibrationRow, {
          label: "Calibration",
          className: "field field--action",
          note: "Set the audio, visual and input offsets, or run the guided test.",
        }),
        this.approach.element,
      ),
      fieldset(
        "Highway",
        this.toggle("showHints", "Key hints", "Lane keys under the gate, and upcoming keys in practice."),
        this.toggle("flashEffects", "Flash effects", "Screen flashes on a Radiant hit and a Perfect Passage."),
        this.toggle("showBeatGrid", "Beat grid in performances"),
        this.toggle("practiceBeatGrid", "Beat grid in practice"),
      ),
      fieldset(
        "Play",
        this.toggle("noFail", "Disable fail state", "The Aura Meter still moves, but a run never ends early."),
        this.toggle("focusSurgeEnabled", "Focus Surge", "Space spends a full Aura Meter for double score."),
        this.toggle("unlockAll", "Unlock all tracks", "Opens every wing without completing the one before it."),
      ),
      fieldset(
        "Display",
        this.toggle("reducedMotion", "Reduced motion", "Stops the background, the sparks and the pulses."),
        this.toggle("highContrast", "High contrast", "Black background, brighter lanes, no glow."),
        this.textScale.element,
        field(fullscreenRow, { label: "Fullscreen", className: "field field--action" }),
      ),
      this.storageNote,
    );

    const actions = el("div", { className: "screen__actions" });
    // No autofocus here: focusing a control at the foot of a long screen
    // would open it scrolled to the bottom.
    actions.append(button("Back", () => this.app.router.back()));
    this.element.append(actions);
  }

  show(): void {
    const s = this.app.settings.current;
    this.master.set(s.masterVolume);
    this.music.set(s.musicVolume);
    this.effects.set(s.effectsVolume);
    this.approach.set(s.approachMs);
    this.textScale.set(s.textScale);
    for (const entry of this.toggles) entry.field.set(s[entry.key] === true);
    this.bindingsValue.textContent = s.keyBindings.map((code) => keyLabel(code)).join(", ");
    this.calibrationValue.textContent = `Audio ${s.audioOffsetMs} ms, visual ${s.visualOffsetMs} ms, input ${s.inputOffsetMs} ms`;
    this.fullscreenButton.textContent = document.fullscreenElement ? "Leave fullscreen" : "Enter fullscreen";
    const notes: string[] = [];
    if (!this.app.settings.persistent) notes.push("Settings cannot be saved in this browser and reset when it closes.");
    if (!this.app.audio.available) notes.push("Audio is unavailable in this browser.");
    this.storageNote.textContent = notes.join(" ");
    this.storageNote.hidden = notes.length === 0;
  }

  private toggle(key: keyof Settings, label: string, note?: string): HTMLElement {
    const entry = toggleField({
      label,
      note,
      checked: this.app.settings.current[key] === true,
      onChange: (checked) => this.app.settings.save({ [key]: checked } as Partial<Settings>),
    });
    this.toggles.push({ key, field: entry });
    return entry.element;
  }

  private toggleFullscreen(): void {
    this.app.toggleFullscreen();
    // The document reports the new state a frame later.
    setTimeout(() => {
      this.fullscreenButton.textContent = document.fullscreenElement ? "Leave fullscreen" : "Enter fullscreen";
    }, 60);
  }
}
