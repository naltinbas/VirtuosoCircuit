// The first screen: pick a mode, open a panel, or clear the save file.

import type { AppApi } from "../app/App";
import type { PlayMode } from "../app/GameState";
import { button, el, type Screen } from "./UIManager";

const PREMISE = "You are the signal conductor. Restore the dormant concert hall one performance at a time.";

export class MainMenu implements Screen {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly notice = el("p", { className: "menu__notice" });
  private readonly dialog: HTMLElement;
  private readonly confirmButton: HTMLButtonElement;
  private readonly menuList: HTMLElement;
  private dialogOpen = false;

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("section", { className: "screen screen--menu" });
    this.element.setAttribute("aria-label", "Main menu");

    const title = el("h1", { className: "menu__title", text: "Virtuoso Circuit" });
    const subtitle = el("p", { className: "menu__subtitle", text: PREMISE });

    this.menuList = el("nav", { className: "menu__list" });
    this.menuList.setAttribute("aria-label", "Main menu options");
    this.menuList.append(
      button("Begin Performance", () => this.startMode("performance"), { autofocus: true }),
      button("Practice Studio", () => this.startMode("practice")),
      button("Free Performance", () => this.startMode("free")),
      button("Calibration", () => this.app.router.open("CALIBRATION")),
      button("Settings", () => this.app.router.open("SETTINGS")),
      button("Controls", () => this.app.router.open("CONTROLS")),
      button("Credits and Licenses", () => this.app.router.open("CREDITS")),
      button("Reset Progress", () => this.openDialog(), { className: "button button--quiet" }),
    );

    this.dialog = el("div", { className: "dialog" });
    this.dialog.setAttribute("role", "dialog");
    this.dialog.setAttribute("aria-modal", "true");
    this.dialog.setAttribute("aria-label", "Reset progress");
    this.dialog.hidden = true;
    const dialogText = el("p", {
      className: "dialog__text",
      text: "Reset progress? Best scores, completions and unlocked wings are deleted. Settings, key bindings and calibration stay.",
    });
    this.confirmButton = button("Reset progress", () => this.confirmReset(), {
      className: "button button--danger",
      autofocus: true,
    });
    const actions = el("div", { className: "dialog__actions" });
    actions.append(this.confirmButton, button("Cancel", () => this.closeDialog()));
    const panel = el("div", { className: "dialog__panel" });
    panel.append(dialogText, actions);
    this.dialog.append(panel);

    const footer = el("p", { className: "menu__footer", text: `Version ${__APP_VERSION__}` });
    this.element.append(title, subtitle, this.menuList, this.notice, footer, this.dialog);
  }

  show(): void {
    this.closeDialog();
    const lines: string[] = [];
    if (!this.app.audio.available) lines.push("Audio is unavailable in this browser. The game still plays silently.");
    if (!this.app.settings.persistent) lines.push("Settings are not saved in this browser.");
    this.notice.textContent = lines.join(" ");
    this.notice.hidden = lines.length === 0;
  }

  onEscape(): boolean {
    if (!this.dialogOpen) return false;
    this.closeDialog();
    return true;
  }

  private startMode(mode: PlayMode): void {
    this.app.pendingMode = mode;
    this.app.router.goTo("TRACK_SELECT");
  }

  private openDialog(): void {
    this.dialogOpen = true;
    this.dialog.hidden = false;
    this.menuList.setAttribute("inert", "");
    this.confirmButton.focus();
  }

  private closeDialog(): void {
    if (!this.dialogOpen) {
      this.dialog.hidden = true;
      this.menuList.removeAttribute("inert");
      return;
    }
    this.dialogOpen = false;
    this.dialog.hidden = true;
    this.menuList.removeAttribute("inert");
    const first = this.menuList.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus();
  }

  private confirmReset(): void {
    this.app.resetProgress();
    this.closeDialog();
    this.app.announce("Progress reset.");
  }
}
