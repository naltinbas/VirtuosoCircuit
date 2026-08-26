import { describe, expect, it } from "vitest";
import { validateTrack } from "../src/charts/ChartValidator";
import { TRACK_DEFINITIONS, getTrack } from "../src/charts/TrackCatalog";
import { TRACK_LENGTH_MS } from "../src/app/Config";

// Every track in src/charts/tracks must compile and pass the validator with
// no errors. Warnings are printed so authors see them.
describe("catalog tracks", () => {
  it("loads the catalog", () => {
    expect(Array.isArray(TRACK_DEFINITIONS)).toBe(true);
  });

  // A gate that names a track this build does not have seals that track and
  // everything behind it, and nothing in validateTrack can see it: it is
  // handed one definition at a time.
  describe("the unlock chain", () => {
    const byOrder = [...TRACK_DEFINITIONS].sort((a, b) => a.metadata.order - b.metadata.order);
    const metas = byOrder.map((d) => d.metadata);

    it("gives every track its own id and its own order", () => {
      expect(new Set(metas.map((m) => m.id)).size).toBe(metas.length);
      expect(new Set(metas.map((m) => m.order)).size).toBe(metas.length);
    });

    it("names a track that is in the catalog", () => {
      const ids = new Set(metas.map((m) => m.id));
      for (const m of metas) {
        if (m.unlockAfter === undefined) continue;
        expect(ids.has(m.unlockAfter), `${m.id} unlocks after "${m.unlockAfter}"`).toBe(true);
      }
    });

    it("opens the first three and gates each later track on the one before it", () => {
      for (let i = 0; i < metas.length; i++) {
        const m = metas[i];
        if (m.order <= 3) expect(m.unlockAfter, m.id).toBeUndefined();
        else expect(m.unlockAfter, m.id).toBe(metas[i - 1]?.id);
      }
    });
  });
  for (const def of TRACK_DEFINITIONS) {
    describe(def.metadata.id, () => {
      const track = getTrack(def.metadata.id);
      const issues = validateTrack(def, track);
      it("has no validation errors", () => {
        const errors = issues.filter((i) => i.level === "error");
        expect(errors.map((e) => `${e.difficulty ?? "track"}: ${e.message}`)).toEqual([]);
      });
      it("prints warnings", () => {
        for (const w of issues.filter((i) => i.level === "warning")) {
          console.warn(`[${def.metadata.id}] ${w.difficulty ?? "track"}: ${w.message}`);
        }
      });
      it("is between 55 and 125 seconds", () => {
        expect(track.metadata.durationMs).toBeGreaterThanOrEqual(TRACK_LENGTH_MS.min);
        expect(track.metadata.durationMs).toBeLessThanOrEqual(TRACK_LENGTH_MS.max);
      });
      it("has novice, apprentice and virtuoso charts with a sensible number of notes", () => {
        for (const d of ["novice", "apprentice", "virtuoso"] as const) {
          const c = track.charts[d];
          expect(c, `${d} chart`).toBeDefined();
          expect(c!.stats.noteCount).toBeGreaterThanOrEqual(40);
        }
        const n = track.charts.novice!.stats.noteCount;
        const a = track.charts.apprentice!.stats.noteCount;
        const v = track.charts.virtuoso!.stats.noteCount;
        expect(a).toBeGreaterThan(n);
        expect(v).toBeGreaterThan(a);
        if (track.charts.maestro) expect(track.charts.maestro.stats.noteCount).toBeGreaterThan(v);
      });
      it("has a maestro chart when it is track 7 or later", () => {
        if (def.metadata.order >= 7) expect(track.charts.maestro).toBeDefined();
      });
      it("has music in more than one part and sections covering the piece", () => {
        expect(def.arrangement.parts.length).toBeGreaterThanOrEqual(2);
        expect(track.sections.length).toBeGreaterThanOrEqual(2);
        expect(track.sections[0].startBeat).toBe(0);
      });
      it("credits an original arrangement of a public-domain composition", () => {
        expect(def.metadata.licenseNotes.toLowerCase()).toContain("public");
        expect(def.metadata.arrangementCredit.toLowerCase()).toContain("original");
      });
    });
  }
});
