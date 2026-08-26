// The F3 overlay: what the clock, the transport and the judge are doing right
// now, plus the switches that make a run easier to look at.
//
// It reads one cached stats object a few times a second rather than hooking
// the frame loop, so leaving it open costs nothing measurable. It lives
// outside #ui because it belongs on top of whatever screen is up.

import type { AppApi, DebugApiHooks, DebugFlags, DebugStats, InputLogEntry } from "../app/App";
import { DIFFICULTY_LABELS, JUDGMENT_LABELS } from "../app/Config";
import { GAMEPLAY_STATES } from "../app/GameState";
import type { ValidationIssue } from "../charts/ChartValidator";
import { formatOffset } from "../utils/TimeUtils";
import { button, el } from "./UIManager";

/** Four readings a second is enough to follow and cheap to build. */
const REFRESH_MS = 220;
const MAX_ISSUES = 12;

const TOGGLES: readonly { flag: keyof DebugFlags; label: string; invert?: boolean }[] = [
  { flag: "beatGrid", label: "Beat grid" },
  { flag: "hitWindows", label: "Hit windows" },
  { flag: "noteIds", label: "Note ids" },
  { flag: "laneBounds", label: "Lane bounds" },
  { flag: "autoplay", label: "Autoplay" },
  { flag: "slowMotion", label: "Slow motion" },
  { flag: "effects", label: "Disable effects", invert: true },
];

interface Line {
  value: HTMLElement;
  read(stats: DebugStats): string;
}

function ms(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function describe(entry: InputLogEntry): string {
  const when = `${entry.songMs.toFixed(0)} ms`;
  if (entry.kind === "release") return `${entry.laneName} up, ${when}`;
  if (entry.judgment === null) return `${entry.laneName} down, ${when}, no note`;
  return `${entry.laneName} down, ${when}, ${JUDGMENT_LABELS[entry.judgment]} ${formatOffset(entry.deltaMs ?? 0)}`;
}

export class DebugOverlay {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly hooks: DebugApiHooks;
  private readonly lines: Line[] = [];
  private readonly toggleInputs: { flag: keyof DebugFlags; invert: boolean; input: HTMLInputElement }[] = [];
  private readonly inputList = el("ol", { className: "debug__log" });
  private readonly restartButton: HTMLButtonElement;
  private readonly validationBox = el("div", { className: "debug__validation" });
  private timer: ReturnType<typeof setInterval> | null = null;
  private validationKey = "";

  constructor(app: AppApi, hooks: DebugApiHooks) {
    this.app = app;
    this.hooks = hooks;
    this.element = el("aside", { className: "debug", id: "debug-overlay" });
    this.element.hidden = true;
    this.element.setAttribute("aria-label", "Debug overlay");

    const header = el("header", { className: "debug__header" });
    header.append(
      el("h2", { className: "debug__title", text: "Debug" }),
      el("span", { className: "debug__hint", text: "F3" }),
    );

    const grid = el("dl", { className: "debug__grid" });
    this.line(grid, "State", (s) => s.state);
    this.line(grid, "Track", (s) =>
      s.trackId === null
        ? "none"
        : `${s.trackId}, ${s.difficulty ? DIFFICULTY_LABELS[s.difficulty] : "?"}, ${s.mode ?? "?"}${s.assisted ? ", assisted" : ""}`,
    );
    this.line(grid, "Frame", (s) => `${s.fps.toFixed(0)} fps, ${ms(s.frameMs)}`);
    this.line(grid, "Audio clock", (s) => ms(s.audioMs));
    this.line(grid, "Song", (s) => `${ms(s.songMs)}, rate ${s.rate.toFixed(3)}`);
    this.line(grid, "Display", (s) => ms(s.displayMs));
    this.line(grid, "Output latency", (s) =>
      s.outputLatencySupported ? ms(s.outputLatencyMs) : `n/a (${ms(s.outputLatencyMs)} assumed)`,
    );
    this.line(
      grid,
      "Offsets",
      (s) =>
        `audio ${formatOffset(s.audioOffsetMs)}, visual ${formatOffset(s.visualOffsetMs)}, input ${formatOffset(s.inputOffsetMs)}`,
    );
    this.line(grid, "Judgment offset", (s) => ms(s.judgmentOffsetMs));
    this.line(grid, "Approach", (s) => `${s.approachMs} ms`);
    this.line(grid, "Beat", (s) => `${s.beat.toFixed(2)}, measure ${s.measure}, beat ${(s.beatInMeasure + 1).toFixed(2)}`);
    this.line(grid, "Music cursor", (s) => `${s.eventCursor}, ${s.scheduledCount} scheduled`);
    this.line(grid, "Voices", (s) => `${s.liveVoices} music, ${s.liveEffects} effects`);
    this.line(grid, "On screen", (s) => `${s.visibleNotes} notes, ${s.particles} sparks`);
    this.line(grid, "Held", (s) => (s.heldKeys.length === 0 ? "none" : s.heldKeys.join(" ")));
    this.line(grid, "Chain", (s) => `${s.combo}, x${s.multiplier}`);
    this.line(grid, "Aura", (s) => s.aura.toFixed(1));
    this.line(grid, "Score", (s) => `${Math.round(s.score)}, ${s.accuracy.toFixed(1)}%`);
    this.line(grid, "Judged", (s) => `${s.judgedCount} of ${s.totalNotes}, ${s.misses} missed`);

    const toggles = el("div", { className: "debug__toggles" });
    for (const entry of TOGGLES) {
      const input = el("input");
      input.type = "checkbox";
      input.id = `debug-${entry.flag}`;
      input.tabIndex = -1;
      const invert = entry.invert === true;
      input.checked = invert ? !hooks.flags[entry.flag] : hooks.flags[entry.flag];
      input.addEventListener("change", () => {
        this.hooks.setFlag(entry.flag, invert ? !input.checked : input.checked);
        this.sync();
      });
      const label = el("label", { className: "debug__toggle", text: entry.label });
      label.htmlFor = input.id;
      const row = el("div", { className: "debug__toggle-row" });
      row.append(input, label);
      toggles.append(row);
      this.toggleInputs.push({ flag: entry.flag, invert, input });
    }

    const actions = el("div", { className: "debug__actions" });
    this.restartButton = button("Restart run", () => this.app.restart(), {
      className: "button button--inline",
      nav: false,
    });
    actions.append(
      this.restartButton,
      button("Chart editor", () => this.hooks.openChartEditor(), { className: "button button--inline", nav: false }),
    );

    this.element.append(
      header,
      grid,
      el("h3", { className: "debug__section", text: "Input, last 8" }),
      this.inputList,
      el("h3", { className: "debug__section", text: "Chart validation" }),
      this.validationBox,
      el("h3", { className: "debug__section", text: "Switches" }),
      toggles,
      actions,
    );
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  setVisible(on: boolean): void {
    this.element.hidden = !on;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!on) return;
    this.sync();
    this.timer = setInterval(() => this.sync(), REFRESH_MS);
  }

  destroy(): void {
    this.setVisible(false);
    this.element.remove();
  }

  private line(grid: HTMLElement, label: string, read: (stats: DebugStats) => string): void {
    const value = el("dd", { text: "" });
    grid.append(el("dt", { text: label }), value);
    this.lines.push({ value, read });
  }

  private sync(): void {
    const stats = this.hooks.stats();
    // Restarting is only a move a run in progress can make, so the button says so.
    const canRestart = GAMEPLAY_STATES.has(stats.state) || stats.state === "PAUSED";
    if (this.restartButton.disabled === canRestart) this.restartButton.disabled = !canRestart;
    for (const line of this.lines) {
      const text = line.read(stats);
      if (line.value.textContent !== text) line.value.textContent = text;
    }
    for (const entry of this.toggleInputs) {
      const on = entry.invert ? !this.hooks.flags[entry.flag] : this.hooks.flags[entry.flag];
      if (entry.input.checked !== on) entry.input.checked = on;
    }
    this.writeInputLog(stats.inputLog);
    this.writeValidation(stats);
  }

  private writeInputLog(log: readonly InputLogEntry[]): void {
    if (log.length === 0) {
      if (this.inputList.childElementCount !== 0) this.inputList.replaceChildren();
      return;
    }
    const items = [...log].reverse().map((entry) => el("li", { text: describe(entry) }));
    this.inputList.replaceChildren(...items);
  }

  private writeValidation(stats: DebugStats): void {
    const key = `${stats.trackId ?? ""}:${stats.difficulty ?? ""}`;
    if (key === this.validationKey) return;
    this.validationKey = key;
    const report = this.hooks.validation();
    this.validationBox.replaceChildren();
    if (report === null) {
      this.validationBox.append(el("p", { className: "debug__empty", text: "No chart is loaded." }));
      return;
    }
    this.validationBox.append(
      el("p", {
        className: report.ok ? "debug__ok" : "debug__bad",
        text: `${report.errors.length} errors, ${report.warnings.length} warnings`,
      }),
    );
    const list = el("ul", { className: "debug__issues" });
    for (const issue of report.issues.slice(0, MAX_ISSUES)) list.append(el("li", { text: issueText(issue) }));
    if (report.issues.length > MAX_ISSUES) {
      list.append(el("li", { text: `and ${report.issues.length - MAX_ISSUES} more` }));
    }
    this.validationBox.append(list);
  }
}

function issueText(issue: ValidationIssue): string {
  return `${issue.level === "error" ? "error" : "warning"} ${issue.code}: ${issue.message}`;
}
