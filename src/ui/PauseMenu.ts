// The pause menu. The clock is stopped and the transport is silent while this
// is on screen, so every option here is free to rebuild the run.

import type { AppApi } from "../app/App";
import type { Section } from "../charts/ChartTypes";
import { formatClock } from "../utils/TimeUtils";
import { button, el, type Screen } from "./UIManager";

export class PauseMenu implements Screen {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly trackLine = el("p", { className: "screen__note" });
  private readonly sectionButton: HTMLButtonElement;

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("section", { className: "screen screen--pause" });
    this.element.setAttribute("aria-label", "Paused");

    const header = el("header", { className: "screen__header" });
    header.append(el("h2", { className: "screen__title", text: "Paused" }), this.trackLine);

    this.sectionButton = button("Practice this section", () => this.practiceSection());

    const list = el("nav", { className: "menu__list" });
    list.setAttribute("aria-label", "Pause menu");
    list.append(
      button("Resume", () => this.app.resume(), { autofocus: true }),
      button("Restart", () => this.app.restart()),
      this.sectionButton,
      button("Calibration", () => this.app.router.open("CALIBRATION")),
      button("Settings", () => this.app.router.open("SETTINGS")),
      button("Exit to track select", () => this.app.exitToTrackSelect(), { className: "button button--quiet" }),
      button("Exit to main menu", () => this.app.exitToMainMenu(), { className: "button button--quiet" }),
    );

    this.element.append(header, list);
  }

  show(): void {
    const session = this.app.session;
    if (!session) {
      this.trackLine.textContent = "";
      return;
    }
    const section = this.currentSection();
    const at = formatClock(Math.max(0, session.game.snapshot().songMs));
    this.trackLine.textContent = section
      ? `${session.track.metadata.title}, ${section.name}, ${at}`
      : `${session.track.metadata.title}, ${at}`;
    this.sectionButton.textContent = section ? `Practice this section: ${section.name}` : "Practice from here";
  }

  onEscape(): boolean {
    this.app.resume();
    return true;
  }

  private currentSection(): Section | null {
    const session = this.app.session;
    if (!session) return null;
    const songMs = session.game.snapshot().songMs;
    const sections = session.track.sections;
    let found: Section | null = null;
    for (const section of sections) {
      if (section.startMs <= songMs) found = section;
    }
    return found ?? sections[0] ?? null;
  }

  private practiceSection(): void {
    this.app.practiceSection(this.currentSection());
  }
}
