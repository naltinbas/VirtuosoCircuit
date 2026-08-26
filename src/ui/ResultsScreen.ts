// What the run was worth: the seal, the score against the previous best, the
// judgment spread and where the presses landed in time.

import type { AppApi, ResultsData } from "../app/App";
import { DIFFICULTY_LABELS, JUDGMENTS, JUDGMENT_LABELS, JUDGMENT_WINDOWS_MS } from "../app/Config";
import type { TrackChart } from "../charts/ChartTypes";
import { timingHistogram } from "../gameplay/ScoreSystem";
import { formatOffset, formatPercent, formatScore } from "../utils/TimeUtils";
import { button, el, type Screen } from "./UIManager";

const HISTOGRAM_BUCKET_MS = 20;
/** The chart spans the whole hit range, which is the widest window that scores. */
const HISTOGRAM_RANGE_MS = JUDGMENT_WINDOWS_MS.faint;

export interface HistogramColumn {
  fromMs: number;
  toMs: number;
  count: number;
  /** True for the column a press landing exactly on the beat falls into. */
  center: boolean;
}

/** The columns the timing chart draws, each labelled with the window it counts. */
export function histogramColumns(deltas: readonly number[]): HistogramColumn[] {
  const buckets = timingHistogram(deltas, HISTOGRAM_BUCKET_MS, HISTOGRAM_RANGE_MS);
  const centerIndex = Math.floor(HISTOGRAM_RANGE_MS / HISTOGRAM_BUCKET_MS);
  return buckets.map((count, index) => {
    const fromMs = -HISTOGRAM_RANGE_MS + index * HISTOGRAM_BUCKET_MS;
    return {
      fromMs,
      // Twice the range is not a whole number of buckets, so the last one is short.
      toMs: Math.min(fromMs + HISTOGRAM_BUCKET_MS, HISTOGRAM_RANGE_MS),
      count,
      center: index === centerIndex,
    };
  });
}

export class ResultsScreen implements Screen {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly body = el("div", { className: "results__body" });
  private readonly actions = el("div", { className: "screen__actions" });

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("section", { className: "screen screen--results" });
    this.element.setAttribute("aria-label", "Results");
    this.element.append(this.body, this.actions);
  }

  show(): void {
    const data = this.app.lastResults;
    this.body.replaceChildren();
    this.actions.replaceChildren();
    if (!data) {
      this.body.append(el("p", { className: "screen__note", text: "You have not finished a run yet." }));
      this.actions.append(button("Track select", () => this.app.exitToTrackSelect(), { autofocus: true }));
      return;
    }
    this.body.append(this.header(data), this.scoreBlock(data), this.countsBlock(data), this.histogram(data));
    this.buildActions(data);
  }

  /** Escape leaves for track select, the same exit the button on screen takes. */
  onEscape(): boolean {
    this.app.exitToTrackSelect();
    return true;
  }

  private header(data: ResultsData): HTMLElement {
    const meta = data.track.metadata;
    const header = el("header", { className: "results__header" });
    const seal = data.summary.seal;
    const sealBox = el("div", { className: `results__seal results__seal--${seal}` });
    sealBox.append(
      el("span", { className: "results__seal-label", text: "Performance Seal" }),
      el("span", { className: "results__seal-value", text: seal === "unfinished" ? "None" : seal }),
    );
    const titles = el("div", { className: "results__titles" });
    titles.append(
      el("h2", { className: "screen__title", text: meta.title }),
      el("p", { className: "screen__note", text: `${meta.composer}, ${DIFFICULTY_LABELS[data.difficulty]}` }),
      el("p", { className: "screen__note", text: this.savedLine(data) }),
    );
    if (data.unlockedTrackId !== undefined) {
      const unlocked = this.app.tracks().find((t) => t.metadata.id === data.unlockedTrackId);
      if (unlocked) {
        titles.append(
          el("p", { className: "results__unlock", text: `New wing activated: ${unlocked.metadata.title}` }),
        );
      }
    }
    header.append(sealBox, titles);
    return header;
  }

  private savedLine(data: ResultsData): string {
    if (data.saved) return data.isNewBest ? "Saved as your new best." : "Saved.";
    if (data.mode === "practice") return "Practice run, nothing saved.";
    if (data.mode === "free") return "Free performance, nothing saved.";
    if (data.assisted) return "Not saved (debug).";
    if (data.summary.failed) return "Performance interrupted, nothing saved.";
    if (!data.summary.completed) return "You left before the end, nothing saved.";
    return "Nothing saved.";
  }

  private scoreBlock(data: ResultsData): HTMLElement {
    const summary = data.summary;
    const block = el("div", { className: "results__score" });
    const score = el("p", { className: "results__score-value", text: formatScore(summary.score) });
    if (data.isNewBest) score.append(el("span", { className: "results__new-best", text: "New best" }));
    const previous = data.previousBest;
    const comparison =
      previous === undefined
        ? "No previous score on this difficulty."
        : `Previous best ${formatScore(previous.score)} (${
            summary.score >= previous.score ? "+" : ""
          }${formatScore(summary.score - previous.score)}).`;
    block.append(
      el("p", { className: "results__label", text: "Score" }),
      score,
      el("p", { className: "screen__note", text: comparison }),
    );
    return block;
  }

  private countsBlock(data: ResultsData): HTMLElement {
    const summary = data.summary;
    const grid = el("dl", { className: "results__grid" });
    const rows: [string, string][] = [["Accuracy", formatPercent(summary.accuracy)]];
    for (const judgment of JUDGMENTS) rows.push([JUDGMENT_LABELS[judgment], `${summary.counts[judgment]}`]);
    rows.push(
      ["Best Resonance Chain", `${summary.bestChain}`],
      ["Early releases", `${summary.earlyReleases}`],
      ["Perfect Passages", `${summary.phrasesCompleted} of ${summary.phraseCount}`],
      ["Trills", `${summary.trillsCompleted} of ${summary.trillCount}`],
      ["Chords", `${summary.chordsCompleted} of ${summary.chordCount}`],
      ["Aura at the end", `${Math.round(summary.auraEnd)}`],
      ["Notes judged", `${summary.judgedCount} of ${summary.totalNotes}`],
    );
    for (const [name, value] of rows) {
      grid.append(el("dt", { text: name }), el("dd", { text: value }));
    }
    return grid;
  }

  private histogram(data: ResultsData): HTMLElement {
    const deltas = data.summary.timingDeltas;
    const columns = histogramColumns(deltas);
    let peak = 1;
    for (const column of columns) peak = Math.max(peak, column.count);
    const block = el("div", { className: "results__timing" });
    block.append(el("p", { className: "results__label", text: "Timing distribution" }));

    const chart = el("div", { className: "histogram" });
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", this.timingSummary(deltas));
    for (const entry of columns) {
      const column = el("div", { className: "histogram__column" });
      const fill = el("div", { className: "histogram__fill" });
      fill.style.transform = `scaleY(${(entry.count / peak).toFixed(3)})`;
      column.title = `${entry.fromMs} to ${entry.toMs} ms: ${entry.count}`;
      if (entry.center) column.classList.add("histogram__column--center");
      column.append(fill);
      chart.append(column);
    }

    const axis = el("div", { className: "histogram__axis" });
    axis.append(
      el("span", { text: `${-HISTOGRAM_RANGE_MS} ms early` }),
      el("span", { text: "on time" }),
      el("span", { text: `${HISTOGRAM_RANGE_MS} ms late` }),
    );
    block.append(chart, axis);
    return block;
  }

  private timingSummary(deltas: readonly number[]): string {
    if (deltas.length === 0) return "Timing distribution: no hits to plot.";
    let sum = 0;
    for (const d of deltas) sum += d;
    const average = sum / deltas.length;
    const side = average > 2 ? "late" : average < -2 ? "early" : "centered";
    return `Timing distribution of ${deltas.length} hits, average ${formatOffset(average)}, ${side}.`;
  }

  private buildActions(data: ResultsData): void {
    const meta = data.track.metadata;
    this.actions.append(
      button(
        "Retry",
        () => {
          void this.app.startTrack(meta.id, data.difficulty, data.mode);
        },
        { autofocus: true },
      ),
    );
    const next = this.nextTrack(meta.id);
    if (next !== null) {
      const nextId = next.metadata.id;
      const reason = this.app.unlockReason(nextId);
      const nextButton = button(
        "Next track",
        () => {
          void this.app.startTrack(nextId, data.difficulty, data.mode);
        },
        { ariaLabel: reason ?? `Next track, ${next.metadata.title}` },
      );
      if (reason !== null) {
        nextButton.disabled = true;
        nextButton.removeAttribute("data-nav");
        nextButton.tabIndex = -1;
        nextButton.title = reason;
      }
      this.actions.append(nextButton);
    }
    this.actions.append(
      button("Track select", () => this.app.exitToTrackSelect()),
      button("Main menu", () => this.app.exitToMainMenu(), { className: "button button--quiet" }),
    );
  }

  private nextTrack(id: string): TrackChart | null {
    const tracks = this.app.tracks();
    const index = tracks.findIndex((t) => t.metadata.id === id);
    if (index < 0 || index + 1 >= tracks.length) return null;
    return tracks[index + 1];
  }
}
