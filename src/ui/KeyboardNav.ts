// Arrow and Tab navigation for the DOM screens.
//
// The game is playable without a mouse, so focus moves between the elements
// marked [data-nav] in document order and Enter or Space activates the focused
// one. Activation happens on keydown and cancels the default, which is what
// stops the browser from firing a second click on keyup.

export interface KeyboardNavOptions {
  /** The element of the screen on show, or null when no screen is up. */
  container: () => HTMLElement | null;
  /** False while the player is on the highway; lane keys own the keyboard then. */
  enabled: () => boolean;
  onEscape: () => void;
  onMove?: () => void;
  onActivate?: () => void;
  target?: Window;
}

const ACTIVATION_KEYS: readonly string[] = ["Enter", "Space"];

function isFormControl(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

/** Sliders and text fields keep the arrow keys that change their own value. */
function ownsArrows(element: Element | null, code: string): boolean {
  if (!element) return false;
  if (element.tagName === "SELECT" || element.tagName === "TEXTAREA") return true;
  if (!(element instanceof HTMLInputElement)) return false;
  // A checkbox has no value along either axis, so it never holds an arrow key.
  if (element.type === "checkbox" || element.type === "radio") return false;
  if (element.type === "range") return code === "ArrowLeft" || code === "ArrowRight";
  return true;
}

/**
 * Focus moved by code does not match :focus-visible after a pointer click, so
 * the ring is carried by a class until the element loses focus.
 */
export function focusVisibly(element: HTMLElement): void {
  element.focus();
  if (element.ownerDocument.activeElement !== element) return;
  element.classList.add("is-focus-ring");
  element.addEventListener("blur", () => element.classList.remove("is-focus-ring"), { once: true });
}

export class KeyboardNav {
  private readonly options: KeyboardNavOptions;
  private readonly target: Window;
  private attached = false;

  constructor(options: KeyboardNavOptions) {
    this.options = options;
    this.target = options.target ?? window;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.target.addEventListener("keydown", this.onKeyDown);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.target.removeEventListener("keydown", this.onKeyDown);
  }

  /** Every element the player can move focus to, in document order. */
  static items(container: HTMLElement): HTMLElement[] {
    const found = container.querySelectorAll<HTMLElement>("[data-nav]");
    return [...found].filter((element) => {
      if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return false;
      if (element.hidden) return false;
      // Inertness comes from an ancestor, which the element's own property does
      // not report, and focus() on an inert element is silently ignored.
      if (element.closest("[inert]") !== null) return false;
      return element.offsetParent !== null || element === element.ownerDocument.activeElement;
    });
  }

  /** Focuses the element the screen asked for, or the first one it offers. */
  focusFirst(container: HTMLElement): void {
    const items = KeyboardNav.items(container);
    const preferred = container.querySelector<HTMLElement>("[data-autofocus]");
    // A screen with a dialog has an autofocus target on each side of it, so the
    // preferred one counts only while it is navigable.
    const target = (preferred !== null && items.includes(preferred) ? preferred : items[0]) ?? container;
    focusVisibly(target);
  }

  private move(container: HTMLElement, delta: number): void {
    const items = KeyboardNav.items(container);
    if (items.length === 0) return;
    const active = container.ownerDocument.activeElement;
    const index = items.findIndex((item) => item === active);
    const next = index < 0 ? (delta > 0 ? 0 : items.length - 1) : (index + delta + items.length) % items.length;
    items[next].focus();
    this.options.onMove?.();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // InputManager already cancelled the browser default for these keys while
    // the pause menu is up, so defaultPrevented is not a reason to skip them.
    if (!this.options.enabled()) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === "Escape") {
      event.preventDefault();
      this.options.onEscape();
      return;
    }
    const container = this.options.container();
    if (!container) return;
    const active = container.ownerDocument.activeElement;

    if (event.code === "Tab") {
      event.preventDefault();
      this.move(container, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.code === "ArrowDown" || event.code === "ArrowRight") {
      if (ownsArrows(active, event.code)) return;
      event.preventDefault();
      this.move(container, 1);
      return;
    }
    if (event.code === "ArrowUp" || event.code === "ArrowLeft") {
      if (ownsArrows(active, event.code)) return;
      event.preventDefault();
      this.move(container, -1);
      return;
    }
    if (!ACTIVATION_KEYS.includes(event.code)) return;
    if (!(active instanceof HTMLElement) || !active.hasAttribute("data-nav")) return;
    if (isFormControl(active)) {
      // Text fields and sliders have their own meaning for these keys.
      if (event.code === "Enter") return;
      if (active instanceof HTMLInputElement && active.type !== "checkbox" && active.type !== "radio") return;
    }
    event.preventDefault();
    active.click();
    this.options.onActivate?.();
  };
}
