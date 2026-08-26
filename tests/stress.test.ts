// A full length run at the densest difficulty the validator allows, driven one
// frame at a time. Nothing here is about a single rule; it is about the game
// surviving 120 seconds of traffic without leaking a note or a frame budget.

import { describe, expect, it } from "vitest";
import { DENSITY_LIMITS, HIGHWAY } from "../src/app/Config";
import type { Lane } from "../src/charts/ChartTypes";
import type { NoteView } from "../src/gameplay/NoteScheduler";
import type { EventSpec } from "./gamefixtures";
import { buildTrack, makeGame } from "./gamefixtures";

const TRACK_MS = 120_000;
const FRAME_MS = 16;
const NOTE_GAP_MS = 1000 / DENSITY_LIMITS.maestro.maxNotesPerSecond;
const HOLD_MS = 400;
const VISIBLE_LIMIT = 256;

/** Deterministic press offsets, a couple of them wide enough to grade poorly. */
const OFFSETS = [0, 12, -18, 35, -40, 8, 120, -95, 5, 62];

interface Action {
  atMs: number;
  lane: Lane;
  press: boolean;
}

function buildStressChart(): { specs: EventSpec[]; actions: Action[] } {
  const specs: EventSpec[] = [];
  const actions: Action[] = [];
  const count = Math.floor(TRACK_MS / NOTE_GAP_MS);
  for (let i = 0; i < count; i++) {
    const timeMs = Math.round(i * NOTE_GAP_MS);
    const lane = ((i * 3) % 5) as Lane;
    const isHold = i % 40 === 7;
    const isChord = i % 25 === 3;
    const lanes: Lane[] = isChord && !isHold ? [lane, (((lane + 2) % 5) as Lane)] : [lane];
    const spec: EventSpec = { timeMs, lanes };
    if (isHold) spec.durationMs = HOLD_MS;
    if (i % 8 < 4) spec.phraseId = `p${Math.floor(i / 8)}`;
    specs.push(spec);

    // Every seventeenth note is left alone so the sweep has work to do.
    if (i % 17 === 5) continue;
    const offset = OFFSETS[i % OFFSETS.length];
    for (const target of lanes) {
      actions.push({ atMs: timeMs + offset, lane: target, press: true });
      if (isHold) {
        const early = i % 3 === 0;
        actions.push({ atMs: timeMs + (early ? HOLD_MS / 2 : HOLD_MS), lane: target, press: false });
      }
    }
  }
  actions.sort((a, b) => a.atMs - b.atMs);
  return { specs, actions };
}

describe("a full maestro run", () => {
  it("resolves every note and keeps the frame work bounded", () => {
    const { specs, actions } = buildStressChart();
    const track = buildTrack(specs, { difficulty: "maestro", durationMs: TRACK_MS });
    const game = makeGame(track);
    const out: NoteView[] = [];
    let cursor = 0;
    let peakVisible = 0;
    let completes = 0;
    game.events.on("complete", () => {
      completes++;
    });

    for (let t = -2000; t <= TRACK_MS + HIGHWAY.outroMs + FRAME_MS; t += FRAME_MS) {
      game.update(t);
      while (cursor < actions.length && actions[cursor].atMs <= t) {
        const action = actions[cursor++];
        if (action.press) game.press(action.lane, action.atMs);
        else game.release(action.lane, action.atMs);
      }
      const visible = game.visibleNotes(t, HIGHWAY.approachMsDefault, out);
      if (visible > peakVisible) peakVisible = visible;
      expect(visible).toBeLessThanOrEqual(VISIBLE_LIMIT);
    }

    const snapshot = game.snapshot();
    const summary = game.summary();
    expect(specs.length).toBe(1080);
    expect(snapshot.totalNotes).toBe(track.charts.maestro?.notes.length);
    expect(snapshot.judgedCount).toBe(snapshot.totalNotes);
    expect(snapshot.holdingLanes).toEqual([false, false, false, false, false]);
    expect(completes).toBe(1);
    expect(summary.completed).toBe(true);
    expect(summary.misses).toBeGreaterThan(0);
    expect(summary.counts.radiant).toBeGreaterThan(0);
    expect(summary.holdTicks).toBeGreaterThan(0);
    expect(summary.earlyReleases).toBeGreaterThan(0);
    expect(summary.phrasesCompleted).toBeGreaterThan(0);
    expect(summary.chordsCompleted).toBeGreaterThan(0);
    expect(summary.timingDeltas).toHaveLength(summary.judgedCount - summary.misses);
    expect(Number.isInteger(summary.score)).toBe(true);
    expect(peakVisible).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(VISIBLE_LIMIT);
  });

  it("survives times that jump around", () => {
    const { specs } = buildStressChart();
    const game = makeGame(buildTrack(specs, { difficulty: "maestro", durationMs: TRACK_MS }));
    const out: NoteView[] = [];
    const jumps = [0, 5000, 4000, 60_000, 59_000, 61_000, 200, 120_000, 0];
    expect(() => {
      for (const t of jumps) {
        game.update(t);
        game.press(2, t);
        game.release(2, t);
        game.activateFocusSurge(t);
        game.visibleNotes(t, HIGHWAY.approachMsDefault, out);
        game.snapshot();
      }
    }).not.toThrow();
    expect(game.snapshot().judgedCount).toBeGreaterThan(0);
  });
});
