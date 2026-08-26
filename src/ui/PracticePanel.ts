// The practice panel, which is what Tab opens over a practice run.
//
// It is a pause with a different face: the clock is stopped and the transport
// is silent while it is up. Changes to the loop range or the speed take effect
// when it closes, which re-enters the loop from its run-up; a scrubbed
// playhead or a checkpoint jump simply resumes from there.

import type { AppApi } from "../app/App";
import { PRACTICE_SPEEDS } from "../app/Config";
import type { Section, TrackChart } from "../charts/ChartTypes";
import { formatClock } from "../utils/TimeUtils";
import {
  button,
  choiceField,
  el,
  fieldset,
  sliderField,
  toggleField,
  type ChoiceField,
  type Screen,
  type SliderField,
  type ToggleField,
} from "./UIManager";

interface Measure {
  number: number;
  timeMs: number;
}

function measuresOf(track: TrackChart): Measure[] {
  const out: Measure[] = [];
  for (const mark of track.beatGrid) {
    if (mark.isDownbeat && mark.timeMs <= track.metadata.durationMs) {
      out.push({ number: mark.measure, timeMs: mark.timeMs });
    }
  }
  if (out.length === 0) out.push({ number: 1, timeMs: 0 });
  return out;
}

export class PracticePanel implements Screen {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly position = el("p", { className: "screen__note" });
  private readonly speed: ChoiceField<number>;
  private readonly sectionList = el("div", { className: "screen__actions screen__actions--tight" });
  private readonly playhead: SliderField;
  private readonly loopStart: SliderField;
  private readonly loopEnd: SliderField;
  private readonly loopToggle: ToggleField;
  private readonly beatGrid: ToggleField;
  private readonly hints: ToggleField;
  private readonly ghost: ToggleField;

  private measures: Measure[] = [{ number: 1, timeMs: 0 }];
  /** Where the run will pick up from. Held here because the game snapshot
   * only catches up with a seek on the next frame. */
  private atMs = 0;

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("section", { className: "screen screen--panel screen--practice" });
    this.element.setAttribute("aria-label", "Practice panel");

    const header = el("header", { className: "screen__header" });
    header.append(
      el("h2", { className: "screen__title", text: "Practice studio" }),
      this.position,
      el("p", { className: "screen__note", text: "Tab closes this panel. Nothing in practice is saved." }),
    );

    const settings = app.settings.current;
    this.speed = choiceField<number>({
      label: "Speed",
      choices: PRACTICE_SPEEDS.map((value) => ({ label: `${Math.round(value * 100)}%`, value })),
      value: settings.practiceSpeed,
      note: "Same pitch, longer notes. The judging windows do not change.",
      onPick: (value) => {
        this.app.settings.save({ practiceSpeed: value });
        this.speed.set(value);
      },
    });

    this.playhead = this.measureSlider("Playhead", (index) => this.seek(this.measureAt(index).timeMs));
    this.loopStart = this.measureSlider("Loop start", (index) =>
      this.setLoop(index, this.loopEnd.input.valueAsNumber),
    );
    this.loopEnd = this.measureSlider("Loop end", (index) =>
      this.setLoop(this.loopStart.input.valueAsNumber, index),
    );

    this.loopToggle = toggleField({
      label: "Loop",
      checked: false,
      note: "Repeats the range above, with a run-up before the first gem.",
      onChange: (on) => this.setLoopEnabled(on),
    });
    this.beatGrid = toggleField({
      label: "Beat grid",
      checked: settings.practiceBeatGrid,
      onChange: (on) => this.app.settings.save({ practiceBeatGrid: on }),
    });
    this.hints = toggleField({
      label: "Upcoming key hints",
      checked: settings.showHints,
      onChange: (on) => this.app.settings.save({ showHints: on }),
    });
    this.ghost = toggleField({
      label: "Ghost guide",
      checked: settings.ghostGuide,
      note: "Shows the key that would be pressed, just before the gem lands.",
      onChange: (on) => this.app.settings.save({ ghostGuide: on }),
    });

    const checkpoints = el("div", { className: "screen__actions screen__actions--tight" });
    checkpoints.append(
      button("Previous checkpoint", () => this.jumpCheckpoint(-1), { className: "button button--inline" }),
      button("Next checkpoint", () => this.jumpCheckpoint(1), { className: "button button--inline" }),
    );

    const actions = el("div", { className: "screen__actions" });
    actions.append(
      button("Close", () => this.app.resume(), { autofocus: true }),
      button("Restart", () => this.app.restart()),
      button("Exit to track select", () => this.app.exitToTrackSelect(), { className: "button button--quiet" }),
    );

    // The panel is taller than a 720p viewport, and showing it focuses Close,
    // so the row sits under the header to keep the top of the panel in view.
    this.element.append(
      header,
      actions,
      fieldset("Speed", this.speed.element),
      fieldset("Sections", this.sectionList, checkpoints),
      fieldset("Loop", this.playhead.element, this.loopStart.element, this.loopEnd.element, this.loopToggle.element),
      fieldset("Guides", this.beatGrid.element, this.hints.element, this.ghost.element),
    );
  }

  show(): void {
    const session = this.app.session;
    const practice = session?.practice;
    const settings = this.app.settings.current;
    this.speed.set(settings.practiceSpeed);
    this.beatGrid.set(settings.practiceBeatGrid);
    this.hints.set(settings.showHints);
    this.ghost.set(settings.ghostGuide);
    if (!session || !practice) {
      this.position.textContent = "No practice run is open.";
      this.sectionList.replaceChildren();
      return;
    }
    this.measures = measuresOf(session.track);
    const durationMs = session.track.metadata.durationMs;
    for (const slider of [this.playhead, this.loopStart, this.loopEnd]) {
      slider.input.max = `${this.measures.length - 1}`;
    }
    this.atMs = Math.max(0, Math.min(durationMs, session.game.snapshot().songMs));
    this.loopStart.set(this.measureIndexAt(practice.loopStartMs));
    this.loopEnd.set(this.measureIndexAt(practice.loopEndMs));
    this.loopToggle.set(practice.loopEnabled);
    this.buildSections(session.track.sections);
    this.refresh();
  }

  /** Writes the position, without asking the game where it is. */
  private refresh(): void {
    const session = this.app.session;
    if (!session) return;
    this.playhead.set(this.measureIndexAt(this.atMs));
    const meta = session.track.metadata;
    this.position.textContent = `${meta.title}, ${formatClock(this.atMs)} of ${formatClock(meta.durationMs)}`;
  }

  private seek(ms: number): void {
    this.atMs = ms;
    this.app.seekTo(ms);
    this.refresh();
  }

  onEscape(): boolean {
    this.app.resume();
    return true;
  }

  private buildSections(sections: readonly Section[]): void {
    this.sectionList.replaceChildren();
    if (sections.length === 0) {
      this.sectionList.append(el("p", { className: "screen__note", text: "This track has no sections." }));
      return;
    }
    this.sectionList.append(
      button("Whole track", () => this.pickSection(null), { className: "button button--inline" }),
    );
    for (const section of sections) {
      this.sectionList.append(
        button(section.name, () => this.pickSection(section), {
          className: "button button--inline",
          ariaLabel: `Loop the ${section.name} section, from ${formatClock(section.startMs)}`,
        }),
      );
    }
  }

  private pickSection(section: Section | null): void {
    const practice = this.app.session?.practice;
    if (!practice) return;
    const durationMs = this.app.session?.track.metadata.durationMs ?? 0;
    if (section === null) this.app.setPracticeLoop(0, durationMs, false);
    else this.app.setPracticeLoop(section.startMs, section.endMs, true);
    this.loopStart.set(this.measureIndexAt(practice.loopStartMs));
    this.loopEnd.set(this.measureIndexAt(practice.loopEndMs));
    this.loopToggle.set(practice.loopEnabled);
    this.seek(section === null ? 0 : section.startMs);
  }

  /** A slider over measure numbers, so every position lands on a downbeat. */
  private measureSlider(label: string, onPick: (index: number) => void): SliderField {
    return sliderField({
      label,
      min: 0,
      max: 0,
      step: 1,
      value: 0,
      format: (index) => this.measureLabel(index),
      onInput: onPick,
    });
  }

  private measureLabel(index: number): string {
    const measure = this.measureAt(index);
    return `Measure ${measure.number}, ${formatClock(measure.timeMs)}`;
  }

  private measureAt(index: number): Measure {
    const clamped = Math.max(0, Math.min(this.measures.length - 1, Math.round(index)));
    return this.measures[clamped];
  }

  private measureIndexAt(ms: number): number {
    let index = 0;
    for (let i = 0; i < this.measures.length; i++) {
      if (this.measures[i].timeMs <= ms) index = i;
      else break;
    }
    return index;
  }

  private setLoop(startIndex: number, endIndex: number): void {
    const start = this.measureAt(startIndex).timeMs;
    const end = this.measureAt(endIndex).timeMs;
    this.app.setPracticeLoop(start, end, this.loopToggle.input.checked);
    const practice = this.app.session?.practice;
    if (!practice) return;
    this.loopStart.set(this.measureIndexAt(practice.loopStartMs));
    this.loopEnd.set(this.measureIndexAt(practice.loopEndMs));
  }

  private setLoopEnabled(on: boolean): void {
    const practice = this.app.session?.practice;
    if (!practice) return;
    this.app.setPracticeLoop(practice.loopStartMs, practice.loopEndMs, on);
  }

  private jumpCheckpoint(direction: number): void {
    const practice = this.app.session?.practice;
    if (!practice) return;
    // A jump is measured from where the panel already moved to, so two clicks
    // move two checkpoints even before the next frame lands.
    const target = direction < 0 ? practice.checkpointBefore(this.atMs) : practice.checkpointAfter(this.atMs);
    this.seek(target);
  }
}
