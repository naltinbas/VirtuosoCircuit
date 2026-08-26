import { describe, expect, it } from "vitest";
import {
  ARRANGEMENT_SOURCE,
  AUDIO_SOURCE,
  COMPOSITION_STATUS,
  MANIFEST_COLUMNS,
  buildManifest,
  type ManifestEntry,
} from "../src/licensing/AssetManifest";
import { TRACK_DEFINITIONS } from "../src/charts/TrackCatalog";
import type { TrackDefinition } from "../src/charts/ChartTypes";
import { fixtureTrack } from "./fixtures";

function second(): TrackDefinition {
  const base = fixtureTrack();
  return {
    ...base,
    metadata: {
      ...base.metadata,
      id: "second-fixture",
      order: 1,
      title: "Second Fixture",
      catalogNumber: "BWV 0",
      attributionNote: "Long credited to someone else.",
    },
  };
}

function textOf(entry: ManifestEntry): string {
  return Object.values(entry)
    .map((value) => `${value}`)
    .join(" ");
}

describe("buildManifest", () => {
  it("has a row for every track id", () => {
    const defs = [fixtureTrack(), second()];
    const manifest = buildManifest(defs);
    for (const def of defs) {
      expect(manifest.some((row) => row.asset.includes(def.metadata.id))).toBe(true);
    }
  });

  it("covers the catalog as it stands", () => {
    const manifest = buildManifest(TRACK_DEFINITIONS);
    for (const def of TRACK_DEFINITIONS) {
      expect(manifest.some((row) => row.asset.includes(def.metadata.id))).toBe(true);
    }
    expect(manifest.length).toBe(TRACK_DEFINITIONS.length + 3);
  });

  it("orders tracks by catalog order and puts the other rows last", () => {
    const manifest = buildManifest([fixtureTrack(), second()]);
    expect(manifest[0].asset).toContain("second-fixture");
    expect(manifest[1].asset).toContain("fixture-test");
    expect(manifest[manifest.length - 1].asset).toBe("Interface typeface");
  });

  it("keeps the composition credit separate from the arrangement credit", () => {
    expect(COMPOSITION_STATUS).not.toBe(ARRANGEMENT_SOURCE);
    const row = buildManifest([fixtureTrack()])[0];
    expect(row.compositionStatus).toBe(COMPOSITION_STATUS);
    expect(row.arrangementSource).toBe(ARRANGEMENT_SOURCE);
    expect(row.arrangementSource).not.toBe(row.compositionStatus);
    expect(row.audioSource).toBe(AUDIO_SOURCE);
  });

  it("never claims a recording is public domain or was used", () => {
    // Saying "no recording is used" is exactly the disclosure we want, so the
    // check is on the claim, not on the word.
    for (const row of buildManifest([fixtureTrack(), second(), ...TRACK_DEFINITIONS])) {
      const text = textOf(row).toLowerCase();
      // Every sentence that mentions a recording must deny using one.
      for (const sentence of text.split(/[.;]/)) {
        if (!sentence.includes("recording")) continue;
        expect(sentence).toMatch(/\b(no|not|never|without)\b/);
      }
      expect(text).not.toMatch(/public[- ]domain recording/);
      // Track rows are synthesized; the favicon and typeface rows carry no audio.
      const audio = row.audioSource.toLowerCase();
      expect(audio === "not applicable" || audio.includes("synthes")).toBe(true);
    }
  });

  it("requires no attribution and still carries the caveats", () => {
    const manifest = buildManifest([fixtureTrack(), second()]);
    for (const row of manifest) expect(row.attributionRequired).toBe(false);
    const withNote = manifest.find((row) => row.asset.includes("second-fixture"));
    expect(withNote?.attributionNote).toBe("Long credited to someone else.");
    const withoutNote = manifest.find((row) => row.asset.includes("fixture-test"));
    expect(withoutNote?.attributionNote).toBeUndefined();
  });

  it("fills every column of every row", () => {
    for (const row of buildManifest([fixtureTrack(), ...TRACK_DEFINITIONS])) {
      for (const column of MANIFEST_COLUMNS) {
        expect(`${row[column.key]}`.trim().length, `${row.asset} ${column.key}`).toBeGreaterThan(0);
      }
    }
  });
});
