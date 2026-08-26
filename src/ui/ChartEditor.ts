// Developer tools: the chart editor.
//
// It reads the catalog, never writes it. Everything here is for looking at a
// chart against its beat grid, hearing a passage at half speed, and moving
// chart data in and out as JSON so an author can edit a file by hand and check
// it compiles before pasting it back.

import type { AppApi } from "../app/App";
import { DIFFICULTY_LABELS } from "../app/Config";
import { compileTrack } from "../charts/ChartLoader";
import {
  DIFFICULTIES,
  type BeatMark,
  type ChartEvent,
  type Difficulty,
  type TrackChart,
  type TrackDefinition,
} from "../charts/ChartTypes";
import { validateTrackReport } from "../charts/ChartValidator";
import { TRACK_DEFINITIONS, getTrack, getTrackDefinition } from "../charts/TrackCatalog";
import { LANE_IDENTITIES } from "../app/Config";
import { formatClock } from "../utils/TimeUtils";
import { button, el, type Screen } from "./UIManager";

/** Preview speed. Half is slow enough to read the chart against the music. */
const PREVIEW_SPEED = 0.5;

function laneText(event: ChartEvent): string {
  return event.lanes.map((lane) => LANE_IDENTITIES[lane].name).join(" + ");
}

function isDefinitionLike(value: unknown): value is TrackDefinition {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.metadata === "object" &&
    record.metadata !== null &&
    Array.isArray(record.tempoMap) &&
    typeof record.arrangement === "object" &&
    record.arrangement !== null &&
    typeof record.charts === "object" &&
    record.charts !== null
  );
}

export class ChartEditor implements Screen {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly trackSelect = el("select", { className: "editor__select" });
  private readonly difficultySelect = el("select", { className: "editor__select" });
  private readonly timeline = el("input", { className: "field__slider" });
  private readonly positionLine = el("p", { className: "screen__note" });
  private readonly gridStrip = el("div", { className: "editor__grid" });
  private readonly eventBox = el("div", { className: "editor__events" });
  private readonly reportBox = el("div", { className: "editor__report" });
  private readonly fileInput = el("input", { className: "editor__file" });

  private track: TrackChart | null = null;
  private difficulty: Difficulty = "novice";
  private beats: BeatMark[] = [];
  private beatIndex = 0;
  private rows: { event: ChartEvent; node: HTMLElement }[] = [];
  private objectUrl: string | null = null;

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("section", { className: "screen screen--panel screen--editor" });
    this.element.setAttribute("aria-label", "Chart editor");

    const header = el("header", { className: "screen__header" });
    header.append(
      el("h2", { className: "screen__title", text: "Developer tools: chart editor" }),
      el("p", {
        className: "screen__note",
        text: "Reads the catalog and reports on it. Nothing here writes to the project files.",
      }),
    );

    this.trackSelect.setAttribute("data-nav", "");
    this.trackSelect.setAttribute("aria-label", "Track");
    this.trackSelect.addEventListener("change", () => this.pickTrack(this.trackSelect.value));
    this.difficultySelect.setAttribute("data-nav", "");
    this.difficultySelect.setAttribute("aria-label", "Difficulty");
    this.difficultySelect.addEventListener("change", () => {
      this.difficulty = this.difficultySelect.value as Difficulty;
      this.buildEvents();
      this.syncPosition();
    });

    const pickers = el("div", { className: "editor__row" });
    pickers.append(this.trackSelect, this.difficultySelect);

    this.timeline.type = "range";
    this.timeline.min = "0";
    this.timeline.max = "0";
    this.timeline.step = "1";
    this.timeline.value = "0";
    this.timeline.setAttribute("data-nav", "");
    this.timeline.setAttribute("aria-label", "Timeline, in beats");
    this.timeline.addEventListener("input", () => {
      this.beatIndex = Number(this.timeline.value);
      this.syncPosition();
    });

    const jumps = el("div", { className: "editor__row" });
    jumps.append(
      button("-1 measure", () => this.jumpMeasure(-1), { className: "button button--inline" }),
      button("-1 beat", () => this.jumpBeat(-1), { className: "button button--inline" }),
      button("+1 beat", () => this.jumpBeat(1), { className: "button button--inline" }),
      button("+1 measure", () => this.jumpMeasure(1), { className: "button button--inline" }),
      button(`Play from here at ${Math.round(PREVIEW_SPEED * 100)}%`, () => this.preview(), {
        className: "button button--inline",
      }),
    );

    this.fileInput.type = "file";
    this.fileInput.accept = "application/json,.json";
    this.fileInput.id = "editor-import";
    this.fileInput.setAttribute("data-nav", "");
    this.fileInput.addEventListener("change", () => void this.importFile());
    const importLabel = el("label", { className: "screen__note", text: "Import a TrackDefinition JSON file" });
    importLabel.htmlFor = this.fileInput.id;

    const io = el("div", { className: "editor__row" });
    io.append(
      button("Export this track as JSON", () => this.exportJson(), { className: "button button--inline" }),
      importLabel,
      this.fileInput,
    );

    const actions = el("div", { className: "screen__actions" });
    actions.append(button("Back to main menu", () => this.app.router.goTo("MAIN_MENU"), { autofocus: true }));

    this.element.append(
      header,
      pickers,
      this.positionLine,
      this.timeline,
      this.gridStrip,
      jumps,
      el("h3", { className: "panel-group__title", text: "Events" }),
      this.eventBox,
      el("h3", { className: "panel-group__title", text: "Import and export" }),
      io,
      this.reportBox,
      actions,
    );
  }

  show(): void {
    this.buildTrackOptions();
    if (TRACK_DEFINITIONS.length === 0) {
      this.positionLine.textContent = "The catalog has no tracks yet.";
      this.eventBox.replaceChildren();
      this.gridStrip.replaceChildren();
      return;
    }
    if (this.track === null) this.pickTrack(TRACK_DEFINITIONS[0].metadata.id);
    else this.syncPosition();
  }

  hide(): void {
    this.releaseUrl();
  }

  // ------------------------------------------------------------------ picking

  private buildTrackOptions(): void {
    if (this.trackSelect.childElementCount === TRACK_DEFINITIONS.length && TRACK_DEFINITIONS.length > 0) return;
    this.trackSelect.replaceChildren();
    for (const def of TRACK_DEFINITIONS) {
      const option = el("option", { text: `${def.metadata.order}. ${def.metadata.title}` });
      option.value = def.metadata.id;
      this.trackSelect.append(option);
    }
  }

  private pickTrack(id: string): void {
    const track = TRACK_DEFINITIONS.some((d) => d.metadata.id === id) ? getTrack(id) : null;
    this.track = track;
    if (track === null) return;
    this.trackSelect.value = id;
    this.beats = [...track.beatGrid];
    this.beatIndex = 0;
    this.timeline.max = `${Math.max(0, this.beats.length - 1)}`;
    this.timeline.value = "0";

    const available = DIFFICULTIES.filter((d) => track.charts[d] !== undefined);
    this.difficulty = available.includes(this.difficulty) ? this.difficulty : (available[0] ?? "novice");
    this.difficultySelect.replaceChildren();
    for (const difficulty of available) {
      const option = el("option", { text: DIFFICULTY_LABELS[difficulty] });
      option.value = difficulty;
      this.difficultySelect.append(option);
    }
    this.difficultySelect.value = this.difficulty;
    this.buildEvents();
    this.syncPosition();
  }

  // ----------------------------------------------------------------- timeline

  private currentBeat(): BeatMark | null {
    return this.beats[this.beatIndex] ?? null;
  }

  private jumpBeat(delta: number): void {
    this.moveTo(this.beatIndex + delta);
  }

  private jumpMeasure(delta: number): void {
    const current = this.currentBeat();
    if (current === null) return;
    const target = current.measure + delta;
    const found = this.beats.findIndex((mark) => mark.measure === target && mark.isDownbeat);
    this.moveTo(found < 0 ? this.beatIndex + delta * 4 : found);
  }

  private moveTo(index: number): void {
    this.beatIndex = Math.max(0, Math.min(this.beats.length - 1, index));
    this.timeline.value = `${this.beatIndex}`;
    this.syncPosition();
  }

  private syncPosition(): void {
    const track = this.track;
    const mark = this.currentBeat();
    if (!track || mark === null) {
      this.positionLine.textContent = "";
      return;
    }
    this.positionLine.textContent = `${track.metadata.title}, measure ${mark.measure}, beat ${mark.beatInMeasure + 1}, ${formatClock(mark.timeMs)} (${Math.round(mark.timeMs)} ms)`;
    this.buildGridStrip();
    this.markNearestEvent(mark.timeMs);
  }

  /** A handful of beats around the position, downbeats picked out. */
  private buildGridStrip(): void {
    const from = Math.max(0, this.beatIndex - 4);
    const to = Math.min(this.beats.length, this.beatIndex + 9);
    const cells: HTMLElement[] = [];
    for (let i = from; i < to; i++) {
      const mark = this.beats[i];
      const cell = el("span", {
        className: `editor__beat${mark.isDownbeat ? " editor__beat--downbeat" : ""}${i === this.beatIndex ? " editor__beat--at" : ""}`,
        text: mark.isDownbeat ? `${mark.measure}` : `${mark.beatInMeasure + 1}`,
      });
      cells.push(cell);
    }
    this.gridStrip.replaceChildren(...cells);
  }

  // ------------------------------------------------------------------- events

  private buildEvents(): void {
    this.rows = [];
    this.eventBox.replaceChildren();
    const chart = this.track?.charts[this.difficulty];
    if (!chart) {
      this.eventBox.append(el("p", { className: "screen__note", text: "This difficulty has no chart." }));
      return;
    }
    const table = el("table", { className: "editor__table" });
    const head = el("thead");
    const headRow = el("tr");
    for (const label of ["Time", "Measure.beat", "Type", "Lanes", "Hold", "Phrase"]) {
      headRow.append(el("th", { text: label }));
    }
    head.append(headRow);
    const body = el("tbody");
    for (const event of chart.events) {
      const row = el("tr");
      row.append(
        el("td", { text: `${Math.round(event.timeMs)} ms` }),
        el("td", { text: `${event.measure}.${event.beat.toFixed(2)}` }),
        el("td", { text: event.type }),
        el("td", { text: laneText(event) }),
        el("td", { text: event.durationMs > 0 ? `${Math.round(event.durationMs)} ms` : "" }),
        el("td", { text: event.phraseId ?? "" }),
      );
      row.addEventListener("click", () => this.moveTo(this.beatIndexAt(event.timeMs)));
      body.append(row);
      this.rows.push({ event, node: row });
    }
    table.append(head, body);
    this.eventBox.append(table);
    this.eventBox.append(
      el("p", {
        className: "screen__note",
        text: `${chart.events.length} events, ${chart.notes.length} notes, peak ${chart.stats.peakNotesPerSecond} per second.`,
      }),
    );
  }

  private beatIndexAt(timeMs: number): number {
    let index = 0;
    for (let i = 0; i < this.beats.length; i++) {
      if (this.beats[i].timeMs <= timeMs) index = i;
      else break;
    }
    return index;
  }

  private markNearestEvent(timeMs: number): void {
    let best: HTMLElement | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const row of this.rows) {
      const gap = Math.abs(row.event.timeMs - timeMs);
      row.node.classList.remove("is-at");
      if (gap < bestGap) {
        bestGap = gap;
        best = row.node;
      }
    }
    if (best === null) return;
    best.classList.add("is-at");
    best.scrollIntoView({ block: "nearest" });
  }

  // ------------------------------------------------------------------ preview

  private preview(): void {
    const track = this.track;
    const mark = this.currentBeat();
    if (!track || mark === null || track.charts[this.difficulty] === undefined) return;
    const at = mark.timeMs;
    this.app.settings.save({ practiceSpeed: PREVIEW_SPEED });
    void this.app.startTrack(track.metadata.id, this.difficulty, "practice").then(() => {
      this.app.setPracticeLoop(at, track.metadata.durationMs, false);
      this.app.seekTo(at);
    });
  }

  // ------------------------------------------------------------ import export

  private exportJson(): void {
    const track = this.track;
    if (!track) return;
    const def = getTrackDefinition(track.metadata.id);
    if (!def) return;
    this.releaseUrl();
    const blob = new Blob([JSON.stringify(def, null, 2)], { type: "application/json" });
    this.objectUrl = URL.createObjectURL(blob);
    const link = el("a");
    link.href = this.objectUrl;
    link.download = `${track.metadata.id}.json`;
    link.click();
    this.writeReport([`Exported ${track.metadata.id}.json`]);
  }

  private async importFile(): Promise<void> {
    const file = this.fileInput.files?.[0];
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch (error) {
      this.writeReport([`${file.name} is not valid JSON: ${message(error)}`]);
      return;
    }
    if (!isDefinitionLike(parsed)) {
      this.writeReport([`${file.name} does not look like a TrackDefinition (metadata, tempoMap, arrangement, charts).`]);
      return;
    }
    let compiled: TrackChart;
    try {
      compiled = compileTrack(parsed);
    } catch (error) {
      this.writeReport([`${file.name} did not compile: ${message(error)}`]);
      return;
    }
    const report = validateTrackReport(parsed, compiled);
    const lines = [
      `${compiled.metadata.title} (${compiled.metadata.id}), ${formatClock(compiled.metadata.durationMs)}, ${compiled.music.length} music notes.`,
      `${report.errors.length} errors, ${report.warnings.length} warnings.`,
      ...report.issues.map((issue) => `${issue.level} ${issue.code}: ${issue.message}`),
    ];
    this.writeReport(lines);
  }

  private writeReport(lines: readonly string[]): void {
    this.reportBox.replaceChildren();
    for (const line of lines) this.reportBox.append(el("p", { className: "editor__report-line", text: line }));
  }

  private releaseUrl(): void {
    if (this.objectUrl === null) return;
    URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : `${error}`;
}
