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
  private readonly screens = new Map<GameState, Screen>();
  private readonly nav: KeyboardNav;
  private current: Screen | null = null;

  constructor(root: HTMLElement, api: AppApi, sounds: UISounds) {
    this.root = root;
    this.api = api;
    this.sounds = sounds;
    this.root.setAttribute("inert", "");
    this.nav = new KeyboardNav({
      container: () => this.current?.element ?? null,
      enabled: () => !GAMEPLAY_STATES.has(this.api.router.state),
      onEscape: () => this.handleEscape(),
      onMove: () => this.sounds.move(),
      onActivate: () => this.sounds.select(),
    });
    this.root.addEventListener("click", this.onClick);
    this.nav.attach();
  }

  register(state: GameState, screen: Screen): void {
    this.screens.set(state, screen);
    screen.element.hidden = true;
    screen.element.setAttribute("data-screen", state);
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
    const next = this.screens.get(this.api.router.state) ?? null;
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
