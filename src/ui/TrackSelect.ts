// The library. One card per catalog entry, with what the player has done on it
// and a button per difficulty the chart was written for.

import type { AppApi } from "../app/App";
import { DIFFICULTY_LABELS } from "../app/Config";
import type { PlayMode } from "../app/GameState";
import { DIFFICULTIES, type Difficulty, type TrackChart } from "../charts/ChartTypes";
import { formatClock, formatScore } from "../utils/TimeUtils";
import { button, el, type Screen } from "./UIManager";

const MODE_HEADINGS: Record<PlayMode, string> = {
  performance: "Begin performance",
  practice: "Practice studio",
  free: "Free performance",
};

const MODE_NOTES: Record<PlayMode, string> = {
  performance: "Scores and seals are saved.",
  practice: "Loop a section at reduced speed. Nothing is saved.",
  free: "Play without failing. Nothing is saved.",
};

export class TrackSelect implements Screen {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly modeHeading = el("h2", { className: "screen__title" });
  private readonly modeNote = el("p", { className: "screen__note" });
  private readonly list = el("div", { className: "tracks" });

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("section", { className: "screen screen--tracks" });
    this.element.setAttribute("aria-label", "Track select");
    const header = el("header", { className: "screen__header" });
    header.append(this.modeHeading, this.modeNote);
    const footer = el("div", { className: "screen__actions" });
    footer.append(button("Back to main menu", () => this.app.router.goTo("MAIN_MENU")));
    this.list.setAttribute("role", "list");
    this.element.append(header, this.list, footer);
  }

  show(): void {
    const mode = this.app.pendingMode;
    this.modeHeading.textContent = MODE_HEADINGS[mode];
    this.modeNote.textContent = MODE_NOTES[mode];
    this.list.replaceChildren();
    const tracks = this.app.tracks();
    if (tracks.length === 0) {
      this.list.append(el("p", { className: "tracks__empty", text: "The catalog has no tracks yet." }));
      return;
    }
    for (const track of tracks) this.list.append(this.card(track));
  }

  private card(track: TrackChart): HTMLElement {
    const meta = track.metadata;
    const locked = this.app.unlockReason(meta.id);
    const card = el("article", { className: locked === null ? "card" : "card card--locked" });
    card.setAttribute("role", "listitem");

    const title = el("h3", { className: "card__title", text: meta.title });
    const composer = el("p", {
      className: "card__composer",
      text: meta.catalogNumber ? `${meta.composer}, ${meta.catalogNumber}` : meta.composer,
    });
    const excerpt = el("p", { className: "card__excerpt", text: meta.movementOrExcerpt });

    const facts = el("dl", { className: "card__facts" });
    facts.append(
      ...fact("Arrangement", meta.arrangementStyle),
      ...fact("Length", formatClock(meta.durationMs)),
      ...fact("Tempo", `${meta.bpm} bpm, ${meta.timeSignature[0]}/${meta.timeSignature[1]}`),
    );

    const head = el("header", { className: "card__head" });
    head.append(title, composer);
    if (this.app.save.isCompleted(meta.id)) {
      head.append(el("span", { className: "card__complete", text: "Completed" }));
    }

    card.append(head, excerpt, facts);

    if (locked !== null) {
      card.append(el("p", { className: "card__locked", text: locked }));
    }

    const grid = el("div", { className: "card__difficulties" });
    for (const difficulty of DIFFICULTIES) {
      if (track.charts[difficulty] === undefined) continue;
      grid.append(this.difficultyEntry(track, difficulty, locked));
    }
    card.append(grid);
    card.append(el("p", { className: "card__credit", text: meta.arrangementCredit }));
    if (meta.attributionNote !== undefined) {
      card.append(el("p", { className: "card__credit", text: meta.attributionNote }));
    }
    return card;
  }

  private difficultyEntry(track: TrackChart, difficulty: Difficulty, locked: string | null): HTMLElement {
    const meta = track.metadata;
    const best = this.app.save.best(meta.id, difficulty);
    const entry = el("div", { className: "card__difficulty" });
    const label = DIFFICULTY_LABELS[difficulty];
    const bestText =
      best === undefined
        ? "No score yet"
        : `Best ${formatScore(best.score)}, Performance Seal ${best.seal === "unfinished" ? "none" : best.seal}`;
    const play = button(
      label,
      () => {
        void this.app.startTrack(meta.id, difficulty, this.app.pendingMode);
      },
      { ariaLabel: `${label}, ${meta.title}. ${locked ?? bestText}` },
    );
    if (locked !== null) {
      play.disabled = true;
      play.removeAttribute("data-nav");
      play.tabIndex = -1;
    }
    entry.append(play, el("span", { className: "card__best", text: bestText }));
    return entry;
  }
}

function fact(name: string, value: string): [HTMLElement, HTMLElement] {
  return [el("dt", { text: name }), el("dd", { text: value })];
}
