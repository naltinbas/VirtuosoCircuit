// Owns the DOM screens inside #ui.
//
// One screen is on show at a time. While none is, #ui is inert so nothing
// behind the highway can be tabbed into or clicked by accident. Showing a
// screen moves focus into it, which is what makes the game playable from the
// keyboard alone.

import type { AppApi } from "../app/App";
import type { GameState } from "../app/GameState";
import { GAMEPLAY_STATES } from "../app/GameState";
import { KeyboardNav } from "./KeyboardNav";

export interface Screen {
  readonly element: HTMLElement;
  /** Called every time the screen comes up, before focus moves into it. */
  show?(): void;
  hide?(): void;
  /** Return true when the screen dealt with Escape itself, for example by closing a dialog. */
  onEscape?(): boolean;
}

export interface UISounds {
  move(): void;
  select(): void;
  back(): void;
}

export interface ElementOptions {
  className?: string;
  text?: string;
  id?: string;
}

/** Small builder so screens read as structure rather than as DOM calls. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.id !== undefined) node.id = options.id;
  return node;
}

export interface ButtonOptions {
  className?: string;
  ariaLabel?: string;
  /** Buttons are keyboard navigable unless they are decorative or pointer only. */
  nav?: boolean;
  autofocus?: boolean;
}

export function button(label: string, onClick: () => void, options: ButtonOptions = {}): HTMLButtonElement {
  const node = el("button", { className: options.className ?? "button", text: label });
  node.type = "button";
  if (options.ariaLabel !== undefined) node.setAttribute("aria-label", options.ariaLabel);
  if (options.nav !== false) node.setAttribute("data-nav", "");
  else node.tabIndex = -1;
  if (options.autofocus === true) node.setAttribute("data-autofocus", "");
  node.addEventListener("click", onClick);
  return node;
}

export class UIManager {
  private readonly root: HTMLElement;
  private readonly api: AppApi;
  private readonly sounds: UISounds;
  private readonly screens = new Map<string, Screen>();
  private readonly variantOf: (state: GameState) => string | null;
  private readonly nav: KeyboardNav;
  private current: Screen | null = null;

  constructor(
    root: HTMLElement,
    api: AppApi,
    sounds: UISounds,
    variantOf: (state: GameState) => string | null = () => null,
  ) {
    this.root = root;
    this.api = api;
    this.sounds = sounds;
    this.variantOf = variantOf;
    this.root.setAttribute("inert", "");
    this.nav = new KeyboardNav({
      container: () => this.current?.element ?? null,
      // A rebinding capture owns the keyboard until it takes a key.
      enabled: () => !GAMEPLAY_STATES.has(this.api.router.state) && !this.api.keys.capturing,
      onEscape: () => this.handleEscape(),
      onMove: () => this.sounds.move(),
      onActivate: () => this.sounds.select(),
    });
    this.root.addEventListener("click", this.onClick);
    this.nav.attach();
  }

  /**
   * One screen per state, or per state and variant where a state has more than
   * one face: PAUSED shows the pause menu or the practice panel depending on
   * what stopped the run.
   */
  register(state: GameState, screen: Screen, variant?: string): void {
    this.screens.set(variant === undefined ? state : `${state}:${variant}`, screen);
    screen.element.hidden = true;
    screen.element.setAttribute("data-screen", variant === undefined ? state : `${state}:${variant}`);
    this.root.append(screen.element);
  }

  get activeScreen(): Screen | null {
    return this.current;
  }

  hasScreen(state: GameState): boolean {
    return this.screens.has(state);
  }

  /** Brings the screen for the current router state up and focuses into it. */
  sync(): void {
    const state = this.api.router.state;
    const variant = this.variantOf(state);
    const next =
      (variant === null ? undefined : this.screens.get(`${state}:${variant}`)) ?? this.screens.get(state) ?? null;
    if (this.current !== null && this.current !== next) {
      this.current.element.hidden = true;
      this.current.hide?.();
    }
    this.current = next;
    if (next === null) {
      this.root.setAttribute("inert", "");
      return;
    }
    this.root.removeAttribute("inert");
    next.show?.();
    next.element.hidden = false;
    this.nav.focusFirst(next.element);
  }

  /** Rebuilds the screen on show, after settings or save data changed under it. */
  refresh(): void {
    if (this.current === null) return;
    this.current.show?.();
  }

  handleEscape(): void {
    if (this.current?.onEscape?.() === true) return;
    this.sounds.back();
    this.api.router.back();
  }

  destroy(): void {
    this.nav.detach();
    this.root.removeEventListener("click", this.onClick);
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-nav]") !== null) this.sounds.select();
  };
}

// ---------------------------------------------------------------------------
// Form rows
//
// Settings, calibration and the practice panel are all the same shape: a
// label, a control and sometimes a line of explanation. Building them here
// keeps the ids, the label bindings and the keyboard behaviour identical
// across every screen.
// ---------------------------------------------------------------------------

let fieldCounter = 0;

function nextFieldId(prefix: string): string {
  fieldCounter += 1;
  return `${prefix}-${fieldCounter}`;
}

export interface FieldOptions {
  label: string;
  note?: string;
  className?: string;
}

export interface FieldRowOptions extends FieldOptions {
  /** The element the label points at, when the row wraps the control in a box. */
  labelFor?: HTMLElement;
}

/** Wraps a control in a labelled row. */
export function field(control: HTMLElement, options: FieldRowOptions): HTMLElement {
  const target = options.labelFor ?? control;
  const row = el("div", { className: options.className ?? "field" });
  const label = el("label", { className: "field__label", text: options.label });
  if (target.id === "") target.id = nextFieldId("field");
  label.htmlFor = target.id;
  row.append(label, control);
  if (options.note !== undefined) row.append(el("p", { className: "field__note", text: options.note }));
  return row;
}

export interface SliderOptions extends FieldOptions {
  min: number;
  max: number;
  step: number;
  value: number;
  /** Text shown next to the slider and read out to assistive tech. */
  format(value: number): string;
  onInput(value: number): void;
}

export interface SliderField {
  element: HTMLElement;
  input: HTMLInputElement;
  /** Moves the slider from outside, for example after a reset button. */
  set(value: number): void;
}

export function sliderField(options: SliderOptions): SliderField {
  const input = el("input", { className: "field__slider" });
  input.type = "range";
  input.min = `${options.min}`;
  input.max = `${options.max}`;
  input.step = `${options.step}`;
  input.value = `${options.value}`;
  input.setAttribute("data-nav", "");
  const value = el("span", { className: "field__value", text: options.format(options.value) });
  const wrap = el("div", { className: "field__control" });
  wrap.append(input, value);
  const write = (v: number): void => {
    value.textContent = options.format(v);
    input.setAttribute("aria-valuetext", value.textContent);
  };
  write(options.value);
  input.addEventListener("input", () => {
    const next = Number(input.value);
    write(next);
    options.onInput(next);
  });
  const element = field(wrap, {
    label: options.label,
    note: options.note,
    className: "field field--slider",
    labelFor: input,
  });
  return {
    element,
    input,
    set(next: number): void {
      input.value = `${next}`;
      write(next);
    },
  };
}

export interface ToggleOptions extends FieldOptions {
  checked: boolean;
  onChange(checked: boolean): void;
}

export interface ToggleField {
  element: HTMLElement;
  input: HTMLInputElement;
  set(checked: boolean): void;
}

export function toggleField(options: ToggleOptions): ToggleField {
  const input = el("input", { className: "field__toggle" });
  input.type = "checkbox";
  input.checked = options.checked;
  input.setAttribute("data-nav", "");
  input.id = nextFieldId("toggle");
  input.addEventListener("change", () => options.onChange(input.checked));
  const element = field(input, { label: options.label, note: options.note, className: "field field--toggle" });
  return {
    element,
    input,
    set(checked: boolean): void {
      input.checked = checked;
    },
  };
}

export interface Choice<T> {
  label: string;
  value: T;
  /** Reason the choice cannot be picked, shown as a title and to assistive tech. */
  disabledReason?: string;
}

export interface ChoiceOptions<T> extends FieldOptions {
  choices: readonly Choice<T>[];
  value: T;
  onPick(value: T): void;
}

export interface ChoiceField<T> {
  element: HTMLElement;
  set(value: T): void;
}

/** A row of buttons behaving like radio buttons, for short option lists. */
export function choiceField<T>(options: ChoiceOptions<T>): ChoiceField<T> {
  const group = el("div", { className: "choice" });
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", options.label);
  const buttons: { value: T; node: HTMLButtonElement }[] = [];
  for (const choice of options.choices) {
    const node = button(choice.label, () => options.onPick(choice.value), { className: "choice__button" });
    if (choice.disabledReason !== undefined) {
      node.disabled = true;
      node.title = choice.disabledReason;
      node.removeAttribute("data-nav");
      node.tabIndex = -1;
    }
    buttons.push({ value: choice.value, node });
    group.append(node);
  }
  const mark = (value: T): void => {
    for (const entry of buttons) {
      const on = entry.value === value;
      entry.node.setAttribute("aria-pressed", on ? "true" : "false");
      entry.node.classList.toggle("is-active", on);
    }
  };
  mark(options.value);
  const row = el("div", { className: "field field--choice" });
  row.append(el("span", { className: "field__label", text: options.label }), group);
  if (options.note !== undefined) row.append(el("p", { className: "field__note", text: options.note }));
  return { element: row, set: mark };
}

/** A titled block of rows. Screens are long, so every panel is grouped. */
export function fieldset(legend: string, ...rows: HTMLElement[]): HTMLElement {
  const group = el("section", { className: "panel-group" });
  group.append(el("h3", { className: "panel-group__title", text: legend }), ...rows);
  return group;
}
