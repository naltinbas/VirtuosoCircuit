import { describe, expect, it } from "vitest";
import { KeyBindings, isReservedKey, keyLabel } from "../src/input/KeyBindings";
import { HeldKeyState } from "../src/input/HeldKeyState";
import { ALTERNATE_LANE_KEYS, KEYMAP_PRESETS } from "../src/app/Config";

describe("keyLabel", () => {
  it("names letters and digits by their character", () => {
    expect(keyLabel("KeyA")).toBe("A");
    expect(keyLabel("Digit4")).toBe("4");
  });

  it("spells out the keys with no printed character", () => {
    expect(keyLabel("ArrowLeft")).toBe("Left arrow");
    expect(keyLabel("ShiftRight")).toBe("Right shift");
    expect(keyLabel("Space")).toBe("Space");
    expect(keyLabel("Semicolon")).toBe(";");
    expect(keyLabel("F3")).toBe("F3");
    expect(keyLabel("Numpad7")).toBe("Numpad 7");
  });

  it("falls back to the code and says so when there is none", () => {
    expect(keyLabel("IntlBackslash")).toBe("IntlBackslash");
    expect(keyLabel("")).toBe("None");
  });
});

describe("laneForCode", () => {
  it("maps the five primary keys", () => {
    const b = new KeyBindings();
    expect(b.laneForCode("KeyA")).toBe(0);
    expect(b.laneForCode("KeyS")).toBe(1);
    expect(b.laneForCode("KeyD")).toBe(2);
    expect(b.laneForCode("KeyJ")).toBe(3);
    expect(b.laneForCode("KeyK")).toBe(4);
  });

  it("maps the fixed alternates too", () => {
    const b = new KeyBindings();
    expect(b.laneForCode("ArrowLeft")).toBe(0);
    expect(b.laneForCode("ArrowDown")).toBe(1);
    expect(b.laneForCode("ArrowUp")).toBe(2);
    expect(b.laneForCode("ArrowRight")).toBe(3);
    expect(b.laneForCode("Enter")).toBe(4);
    expect(b.laneForCode("ShiftRight")).toBe(4);
  });

  it("ignores keys that belong to nothing", () => {
    const b = new KeyBindings();
    expect(b.laneForCode("KeyQ")).toBeNull();
    expect(b.isLaneCode("KeyQ")).toBe(false);
  });

  it("lets a primary win over the alternate of another lane", () => {
    const b = new KeyBindings(["ArrowRight", "KeyS", "KeyD", "KeyJ", "KeyK"]);
    expect(b.laneForCode("ArrowRight")).toBe(0);
    // The lane that lost its alternate still has its own primary.
    expect(b.laneForCode("KeyJ")).toBe(3);
  });

  it("keeps the arrows preset consistent with itself", () => {
    const b = new KeyBindings([...KEYMAP_PRESETS.arrows]);
    expect(b.laneForCode("ArrowLeft")).toBe(0);
    expect(b.laneForCode("Enter")).toBe(4);
    expect(b.laneForCode("ShiftRight")).toBe(4);
  });

  it("rejects a malformed map and keeps the previous one", () => {
    const b = new KeyBindings();
    b.setBindings(["KeyZ", "KeyX"]);
    expect(b.bindings).toEqual([...KEYMAP_PRESETS.default]);
  });
});

describe("conflicts", () => {
  it("accepts every preset", () => {
    for (const preset of Object.values(KEYMAP_PRESETS)) {
      expect(KeyBindings.conflicts([...preset])).toEqual([]);
    }
  });

  it("reports a key used by two lanes", () => {
    const reasons = KeyBindings.conflicts(["KeyA", "KeyA", "KeyD", "KeyJ", "KeyK"]);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("Spire");
    expect(reasons[0]).toContain("Prism");
  });

  it("reports a reserved key", () => {
    const reasons = KeyBindings.conflicts(["Escape", "KeyS", "KeyD", "KeyJ", "KeyK"]);
    expect(reasons).toEqual(["Escape is reserved by the game and cannot be a lane key."]);
  });

  it("reports an alternate that belongs to another lane", () => {
    const reasons = KeyBindings.conflicts(["ArrowRight", "KeyS", "KeyD", "KeyJ", "KeyK"]);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("Tile");
  });

  it("allows a lane to take its own alternate", () => {
    expect(KeyBindings.conflicts(["ArrowLeft", "KeyS", "KeyD", "KeyJ", "KeyK"])).toEqual([]);
  });

  it("reports a map of the wrong shape once", () => {
    expect(KeyBindings.conflicts(["KeyA"])).toEqual(["Every lane needs a key."]);
    expect(KeyBindings.conflicts(["KeyA", "", "KeyD", "KeyJ", "KeyK"])).toEqual(["Every lane needs a key."]);
  });
});

describe("presets and rebinding", () => {
  it("recognises a preset and a custom map", () => {
    expect(KeyBindings.presetFor([...KEYMAP_PRESETS.splitHands])).toBe("splitHands");
    expect(KeyBindings.presetFor(["KeyZ", "KeyX", "KeyC", "KeyN", "KeyM"])).toBeNull();
  });

  it("swaps when the new key belongs to another lane", () => {
    const b = new KeyBindings();
    expect(b.withLane(0, "KeyJ")).toEqual(["KeyJ", "KeyS", "KeyD", "KeyA", "KeyK"]);
  });

  it("leaves the other lanes alone for a free key", () => {
    const b = new KeyBindings();
    expect(b.withLane(2, "KeyF")).toEqual(["KeyA", "KeyS", "KeyF", "KeyJ", "KeyK"]);
  });

  it("knows which keys must stay free", () => {
    expect(isReservedKey("Space")).toBe(true);
    expect(isReservedKey("KeyA")).toBe(false);
  });

  it("lists the alternates for the controls screen", () => {
    const b = new KeyBindings();
    expect(b.alternatesFor(4)).toEqual(ALTERNATE_LANE_KEYS[4]);
    expect(b.laneLabels()).toEqual(["A", "S", "D", "J", "K"]);
  });
});

describe("held keys", () => {
  it("presses once and releases once for one key", () => {
    const held = new HeldKeyState();
    expect(held.down(2, "KeyD")).toBe(true);
    expect(held.heldLanes[2]).toBe(true);
    expect(held.up("KeyD")).toEqual({ lane: 2, released: true });
    expect(held.heldLanes[2]).toBe(false);
  });

  it("keeps the lane held while a second key is down", () => {
    const held = new HeldKeyState();
    expect(held.down(0, "KeyA")).toBe(true);
    expect(held.down(0, "ArrowLeft")).toBe(false);
    expect(held.up("KeyA")).toEqual({ lane: 0, released: false });
    expect(held.heldLanes[0]).toBe(true);
    expect(held.up("ArrowLeft")).toEqual({ lane: 0, released: true });
    expect(held.heldLanes[0]).toBe(false);
  });

  it("ignores a code that is already down", () => {
    const held = new HeldKeyState();
    held.down(1, "KeyS");
    expect(held.down(1, "KeyS")).toBe(false);
    expect(held.down(3, "KeyS")).toBe(false);
  });

  it("ignores a key up for a code that was never down", () => {
    const held = new HeldKeyState();
    expect(held.up("KeyK")).toBeNull();
  });

  it("clears without reporting releases", () => {
    const held = new HeldKeyState();
    held.down(0, "KeyA");
    held.down(4, "KeyK");
    held.clear();
    expect(held.heldLanes).toEqual([false, false, false, false, false]);
    expect(held.up("KeyA")).toBeNull();
  });
});
