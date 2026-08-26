// Which physical key belongs to which lane, and what a key is called on screen.
//
// The player's five primary codes come from settings. The alternates are
// fixed, so a keyboard where the primary map is awkward still plays with the
// arrows. A primary always wins: a code that the player bound to a lane is
// never also read as an alternate of another lane.

import {
  ALTERNATE_LANE_KEYS,
  KEYMAP_PRESETS,
  LANE_IDENTITIES,
  RESERVED_KEYS,
  type KeymapPresetName,
} from "../app/Config";
import { LANES, type Lane } from "../charts/ChartTypes";

/** Codes whose printed name is not derivable from the code itself. */
const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowLeft: "Left arrow",
  ArrowRight: "Right arrow",
  ArrowUp: "Up arrow",
  ArrowDown: "Down arrow",
  ShiftLeft: "Left shift",
  ShiftRight: "Right shift",
  ControlLeft: "Left control",
  ControlRight: "Right control",
  AltLeft: "Left alt",
  AltRight: "Right alt",
  MetaLeft: "Left meta",
  MetaRight: "Right meta",
  Space: "Space",
  Enter: "Enter",
  Escape: "Escape",
  Tab: "Tab",
  Backspace: "Backspace",
  CapsLock: "Caps lock",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  NumpadAdd: "Numpad +",
  NumpadSubtract: "Numpad -",
  NumpadEnter: "Numpad enter",
};

/** Player facing name of a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code === "") return "None";
  const known = KEY_LABELS[code];
  if (known !== undefined) return known;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Numpad ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}

export function isReservedKey(code: string): boolean {
  return RESERVED_KEYS.includes(code);
}

function laneName(lane: Lane): string {
  return LANE_IDENTITIES[lane].name;
}

/** Lane whose fixed alternates contain this code, or null. */
function alternateLane(code: string): Lane | null {
  for (const lane of LANES) {
    if (ALTERNATE_LANE_KEYS[lane].includes(code)) return lane;
  }
  return null;
}

export class KeyBindings {
  private codes: string[];
  private readonly laneOf = new Map<string, Lane>();

  constructor(bindings: readonly string[] = KEYMAP_PRESETS.default) {
    this.codes = [...KEYMAP_PRESETS.default];
    this.setBindings(bindings);
  }

  /** Reasons the map cannot be used, one line each. Empty means it is fine. */
  static conflicts(bindings: readonly string[]): string[] {
    const reasons: string[] = [];
    if (bindings.length !== LANES.length || bindings.some((code) => typeof code !== "string" || code === "")) {
      reasons.push("Every lane needs a key.");
      return reasons;
    }
    const firstUse = new Map<string, Lane>();
    for (const lane of LANES) {
      const code = bindings[lane];
      const owner = firstUse.get(code);
      if (owner !== undefined) {
        reasons.push(`${keyLabel(code)} is bound to both ${laneName(owner)} and ${laneName(lane)}.`);
        continue;
      }
      firstUse.set(code, lane);
      if (isReservedKey(code)) {
        reasons.push(`${keyLabel(code)} is reserved by the game and cannot be a lane key.`);
        continue;
      }
      const alt = alternateLane(code);
      if (alt !== null && alt !== lane) {
        reasons.push(`${keyLabel(code)} is the fixed alternate for ${laneName(alt)}.`);
      }
    }
    return reasons;
  }

  /** Name of the preset this map matches, or null for a custom map. */
  static presetFor(bindings: readonly string[]): KeymapPresetName | null {
    const key = bindings.join(" ");
    for (const name of Object.keys(KEYMAP_PRESETS) as KeymapPresetName[]) {
      if (KEYMAP_PRESETS[name].join(" ") === key) return name;
    }
    return null;
  }

  get bindings(): readonly string[] {
    return this.codes;
  }

  setBindings(next: readonly string[]): void {
    if (next.length === LANES.length && next.every((code) => typeof code === "string" && code !== "")) {
      this.codes = [...next];
    }
    this.laneOf.clear();
    for (const lane of LANES) this.laneOf.set(this.codes[lane], lane);
    for (const lane of LANES) {
      for (const code of ALTERNATE_LANE_KEYS[lane]) {
        if (!this.laneOf.has(code)) this.laneOf.set(code, lane);
      }
    }
  }

  laneForCode(code: string): Lane | null {
    return this.laneOf.get(code) ?? null;
  }

  isLaneCode(code: string): boolean {
    return this.laneOf.has(code);
  }

  primaryFor(lane: Lane): string {
    return this.codes[lane];
  }

  /** Printed name of the lane's primary key, for the hints under the gate. */
  labelFor(lane: Lane): string {
    return keyLabel(this.codes[lane]);
  }

  laneLabels(): string[] {
    return LANES.map((lane) => this.labelFor(lane));
  }

  alternatesFor(lane: Lane): readonly string[] {
    return ALTERNATE_LANE_KEYS[lane];
  }

  /** Every code that reaches a lane, for the preventDefault set. */
  allCodes(): string[] {
    return [...this.laneOf.keys()];
  }

  /**
   * The map that results from giving `lane` this code. A code already used by
   * another lane swaps with it, so rebinding never silently leaves a lane
   * without a key.
   */
  withLane(lane: Lane, code: string): string[] {
    const next = [...this.codes];
    const owner = next.indexOf(code);
    if (owner >= 0 && owner !== lane) next[owner] = next[lane];
    next[lane] = code;
    return next;
  }
}
