// Lane bindings.
//
// Rebinding takes the keyboard away from the game for exactly one key press:
// InputManager hands the next code over, KeyboardNav stands down while it
// waits, and Escape cancels. A map that would break a rule is shown with the
// reason and never saved, so the player cannot lock themselves out of a lane.

import type { AppApi } from "../app/App";
import { ALTERNATE_LANE_KEYS, GAME_KEYS, KEYMAP_PRESETS, LANE_IDENTITIES, type KeymapPresetName } from "../app/Config";
import { LANES, type Lane } from "../charts/ChartTypes";
import { KeyBindings, keyLabel } from "../input/KeyBindings";
import { button, el, type Screen } from "./UIManager";

const PRESET_LABELS: Record<KeymapPresetName, string> = {
  default: "Default",
  compactLeft: "Left-hand compact",
  splitHands: "Split hands",
  arrows: "Arrows",
};

/** Keys the game keeps for itself. The player cannot bind or change these. */
const SHORTCUTS: readonly [string, string][] = [
  [GAME_KEYS.pause.map(keyLabel).join(" or "), "Pause, and resume from the pause menu"],
  [GAME_KEYS.restart.map(keyLabel).join(" or "), "Restart the run"],
  [GAME_KEYS.practiceMenu.map(keyLabel).join(" or "), "Open and close the practice panel"],
  [GAME_KEYS.focusSurge.map(keyLabel).join(" or "), "Focus Surge"],
  [GAME_KEYS.perfOverlay.map(keyLabel).join(" or "), "Performance readout"],
  ["Arrow keys, Tab, Enter", "Move and activate in the menus"],
];

interface LaneRow {
  lane: Lane;
  keyValue: HTMLElement;
  rebind: HTMLButtonElement;
}

export class ControlsPanel implements Screen {
  readonly element: HTMLElement;

  private readonly app: AppApi;
  private readonly rows: LaneRow[] = [];
  private readonly presetValue = el("p", { className: "screen__note" });
  private readonly status = el("p", { className: "panel-note" });
  private readonly bindings = new KeyBindings();
  private cancelCapture: (() => void) | null = null;

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("section", { className: "screen screen--panel screen--controls" });
    this.element.setAttribute("aria-label", "Lane bindings");

    const header = el("header", { className: "screen__header" });
    header.append(
      el("h2", { className: "screen__title", text: "Lane bindings" }),
      el("p", {
        className: "screen__note",
        text: "Five lanes, left to right. Pick a key per lane, or take one of the presets.",
      }),
      this.presetValue,
    );

    const list = el("div", { className: "lanes" });
    for (const lane of LANES) list.append(this.laneRow(lane));

    const presets = el("div", { className: "screen__actions" });
    for (const name of Object.keys(KEYMAP_PRESETS) as KeymapPresetName[]) {
      presets.append(
        button(PRESET_LABELS[name], () => this.applyPreset(name), { className: "button button--inline" }),
      );
    }
    presets.append(
      button("Reset to defaults", () => this.applyPreset("default"), { className: "button button--quiet" }),
    );

    const alternates = el("dl", { className: "reference" });
    for (const lane of LANES) {
      alternates.append(
        el("dt", { text: `${LANE_IDENTITIES[lane].glyph} ${LANE_IDENTITIES[lane].name}` }),
        el("dd", { text: ALTERNATE_LANE_KEYS[lane].map(keyLabel).join(", ") }),
      );
    }
    const shortcuts = el("dl", { className: "reference" });
    const rows: [string, string][] = [...SHORTCUTS];
    if (app.debug !== null) rows.push([GAME_KEYS.debugOverlay.map(keyLabel).join(" or "), "Debug overlay"]);
    for (const [keys, what] of rows) {
      shortcuts.append(el("dt", { text: keys }), el("dd", { text: what }));
    }

    const reference = el("section", { className: "panel-group" });
    reference.append(
      el("h3", { className: "panel-group__title", text: "Fixed alternates" }),
      el("p", { className: "screen__note", text: "These work in addition to your own keys." }),
      alternates,
      el("h3", { className: "panel-group__title", text: "Shortcuts" }),
      shortcuts,
    );

    const actions = el("div", { className: "screen__actions" });
    actions.append(button("Back", () => this.app.router.back()));

    this.element.append(header, list, presets, this.status, reference, actions);
  }

  show(): void {
    this.endCapture();
    this.sync();
  }

  hide(): void {
    this.endCapture();
  }

  onEscape(): boolean {
    if (this.cancelCapture === null) return false;
    this.endCapture();
    this.setStatus("Rebinding cancelled.");
    return true;
  }

  private laneRow(lane: Lane): HTMLElement {
    const identity = LANE_IDENTITIES[lane];
    const row = el("div", { className: "lane-row" });
    const symbol = el("span", { className: "lane-row__symbol", text: identity.glyph });
    symbol.style.color = identity.color;
    symbol.setAttribute("aria-hidden", "true");
    const name = el("span", { className: "lane-row__name", text: identity.name });
    const keyValue = el("span", { className: "lane-row__key" });
    const rebind = button("Rebind", () => this.beginRebind(lane), {
      className: "button button--inline",
      ariaLabel: `Rebind the ${identity.name} lane`,
    });
    row.append(symbol, name, keyValue, rebind);
    this.rows.push({ lane, keyValue, rebind });
    return row;
  }

  private sync(): void {
    const codes = this.app.settings.current.keyBindings;
    this.bindings.setBindings(codes);
    for (const row of this.rows) {
      row.keyValue.textContent = keyLabel(codes[row.lane]);
      row.rebind.textContent = "Rebind";
    }
    const preset = KeyBindings.presetFor(codes);
    this.presetValue.textContent = preset === null ? "Custom map" : `${PRESET_LABELS[preset]} map`;
  }

  private beginRebind(lane: Lane): void {
    this.endCapture();
    const identity = LANE_IDENTITIES[lane];
    const row = this.rows.find((r) => r.lane === lane);
    if (row) row.rebind.textContent = "Press a key";
    this.setStatus(`Press a key for ${identity.name}, or Escape to cancel.`);
    this.cancelCapture = this.app.keys.begin((code) => {
      this.cancelCapture = null;
      if (code === null) {
        this.sync();
        this.setStatus("Rebinding cancelled.");
        return;
      }
      this.apply(lane, code);
    });
  }

  private apply(lane: Lane, code: string): void {
    this.bindings.setBindings(this.app.settings.current.keyBindings);
    const next = this.bindings.withLane(lane, code);
    const reasons = KeyBindings.conflicts(next);
    if (reasons.length > 0) {
      this.sync();
      this.setStatus(reasons.join(" "));
      return;
    }
    this.app.settings.save({ keyBindings: next });
    this.sync();
    this.setStatus(`${LANE_IDENTITIES[lane].name} is now ${keyLabel(code)}.`);
    this.app.announce(`${LANE_IDENTITIES[lane].name} bound to ${keyLabel(code)}.`);
  }

  private applyPreset(name: KeymapPresetName): void {
    this.endCapture();
    this.app.settings.save({ keyBindings: [...KEYMAP_PRESETS[name]] });
    this.sync();
    this.setStatus(`${PRESET_LABELS[name]} map applied.`);
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
    this.status.hidden = text === "";
  }

  private endCapture(): void {
    if (this.cancelCapture === null) return;
    const cancel = this.cancelCapture;
    this.cancelCapture = null;
    cancel();
    for (const row of this.rows) row.rebind.textContent = "Rebind";
  }
}
