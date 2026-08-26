import { beforeAll, describe, expect, it } from "vitest";
import type { GameState } from "../src/app/GameState";
import { InputManager, type ShortcutAction } from "../src/input/InputManager";
import { KeyBindings } from "../src/input/KeyBindings";

/** Stands in for a focused slider or checkbox, which is what a screen focuses first. */
class FakeElement {
  constructor(readonly tagName: string) {}
  readonly isContentEditable = false;
}

beforeAll(() => {
  // InputManager asks the DOM whether the event target is a text field, and
  // these tests run without one.
  (globalThis as unknown as { HTMLElement: unknown }).HTMLElement = FakeElement;
});

interface KeyEventInit {
  code: string;
  target?: unknown;
  repeat?: boolean;
}

function harness(state: () => GameState, debug = true) {
  const listeners = new Map<string, (event: unknown) => void>();
  const target = {
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    document: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      visibilityState: "visible",
    },
  } as unknown as Window;

  const input = new InputManager({
    bindings: new KeyBindings(),
    state,
    debug,
    target,
    now: () => 0,
  });
  input.attach();

  const shortcuts: ShortcutAction[] = [];
  const lanes: number[] = [];
  input.on("shortcut", ({ action }) => shortcuts.push(action));
  input.on("lanePress", ({ lane }) => lanes.push(lane));

  const prevented: string[] = [];
  const send = (type: "keydown" | "keyup", init: KeyEventInit): void => {
    const event = {
      code: init.code,
      target: init.target ?? null,
      repeat: init.repeat ?? false,
      timeStamp: 0,
      preventDefault: () => prevented.push(`${type} ${init.code}`),
      stopPropagation: () => undefined,
    };
    listeners.get(type)?.(event);
  };
  return { shortcuts, lanes, prevented, send };
}

describe("overlay keys", () => {
  it("opens the overlays while a slider has focus", () => {
    const slider = new FakeElement("INPUT");
    const h = harness(() => "SETTINGS");
    h.send("keydown", { code: "F1", target: slider });
    h.send("keydown", { code: "F3", target: slider });
    expect(h.shortcuts).toEqual(["perfOverlay", "debugOverlay"]);
    expect(h.prevented).toEqual(["keydown F1", "keydown F3"]);
    h.send("keyup", { code: "F1", target: slider });
    expect(h.prevented).toContain("keyup F1");
  });

  it("still leaves F3 alone outside a debug build", () => {
    const h = harness(() => "CALIBRATION", false);
    h.send("keydown", { code: "F3", target: new FakeElement("INPUT") });
    expect(h.shortcuts).toEqual([]);
    expect(h.prevented).toEqual([]);
  });

  it("keeps every other key out of a text field", () => {
    const box = new FakeElement("TEXTAREA");
    const h = harness(() => "PAUSED");
    h.send("keydown", { code: "KeyR", target: box });
    h.send("keydown", { code: "Escape", target: box });
    h.send("keydown", { code: "KeyA", target: box });
    expect(h.shortcuts).toEqual([]);
    expect(h.lanes).toEqual([]);
    expect(h.prevented).toEqual([]);
  });

  it("routes lane keys during gameplay whatever has focus", () => {
    const h = harness(() => "PLAYING");
    h.send("keydown", { code: "KeyA", target: new FakeElement("INPUT") });
    expect(h.lanes).toEqual([0]);
  });
});
