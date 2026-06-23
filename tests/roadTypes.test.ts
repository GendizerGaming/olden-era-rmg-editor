import { describe, expect, it } from "vitest";
import {
  asJsonValue,
  exportImportedTemplate,
  findJsonDifferences,
  importTemplateForRoundTrip,
  roundTripTemplate
} from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * The road surface (Stone/Dirt) lives on the per-zone road segments, not on
 * the connection. The editor derives a per-connection roadType from the
 * segments and rewrites them on export only when the type is set.
 */
function buildTemplate(): RmgTemplate {
  return {
    name: "Road Types Test",
    gameMode: "Classic",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    variants: [
      {
        zones: [
          {
            name: "A",
            size: 1,
            roads: [
              { type: "Dirt", from: { type: "Crossroads" }, to: { type: "Connection", args: ["A-B"] } },
              // Untyped segment: must survive untouched
              { from: { type: "Crossroads" }, to: { type: "Connection", args: ["A-C"] } }
            ]
          },
          {
            name: "B",
            size: 1,
            roads: [
              { type: "Dirt", from: { type: "Crossroads" }, to: { type: "Connection", args: ["A-B"] } }
            ]
          },
          { name: "C", size: 1 }
        ],
        connections: [
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, road: true },
          { name: "A-C", from: "A", to: "C", connectionType: "Direct", guardValue: 1000, road: true }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("road types", () => {
  it("derives the road surface from the zone segments", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    const byId = new Map(imported.edges.map((edge) => [edge.id, edge]));

    expect(byId.get("A-B")?.roadType).toBe("Dirt");
    // Untyped segments leave the edge without a roadType
    expect(byId.get("A-C")?.roadType).toBeUndefined();
  });

  it("preserves segment types on an untouched export", () => {
    const exported = exportImportedTemplate(importTemplateForRoundTrip(buildTemplate()));
    const zoneA = exported.variants[0].zones.find((zone) => zone.name === "A");

    const dirtSegment = zoneA?.roads?.find(
      (segment) => segment.to?.type === "Connection" && segment.to.args?.[0] === "A-B"
    );
    expect(dirtSegment?.type).toBe("Dirt");

    const untypedSegment = zoneA?.roads?.find(
      (segment) => segment.to?.type === "Connection" && segment.to.args?.[0] === "A-C"
    );
    expect(untypedSegment).toBeDefined();
    expect(untypedSegment).not.toHaveProperty("type");
  });

  it("rewrites all segments of a connection when the surface is edited", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    const edge = imported.edges.find((candidate) => candidate.id === "A-B");
    edge!.roadType = "Stone";

    const exported = exportImportedTemplate(imported);
    for (const zoneName of ["A", "B"]) {
      const zone = exported.variants[0].zones.find((candidate) => candidate.name === zoneName);
      const segment = zone?.roads?.find(
        (candidate) => candidate.to?.type === "Connection" && candidate.to.args?.[0] === "A-B"
      );
      expect(segment?.type).toBe("Stone");
    }
  });

  it("reaches a stable canonical export", () => {
    const firstExport = roundTripTemplate(buildTemplate());
    const secondExport = roundTripTemplate(firstExport);
    expect(
      findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
    ).toEqual([]);
  });
});

/**
 * The OctoJebus case: several parallel passages between two zones, but only one
 * is actually paved. The connection's own `road` flag is legacy and usually
 * unset, so road presence must come from the zone.roads segments.
 */
function buildParallelTemplate(): RmgTemplate {
  return {
    name: "Parallel Roads Test",
    gameMode: "Classic",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    variants: [
      {
        zones: [
          {
            name: "Center",
            size: 1,
            roads: [
              { type: "Stone", from: { type: "MainObject", args: ["0"] }, to: { type: "Connection", args: ["C-S-paved"] } },
              { type: "Stone", from: { type: "MainObject", args: ["0"] }, to: { type: "Connection", args: ["C-S-flagFalse"] } }
            ]
          },
          { name: "Spawn", size: 1, mainObjects: [{ type: "Spawn", spawn: "Player1" }] }
        ],
        connections: [
          // No `road` field, and it IS paved -> has a road.
          { name: "C-S-paved", from: "Center", to: "Spawn", connectionType: "Direct", guardValue: 1000 },
          // No `road` field, NOT paved -> no road (the bug was showing it as a road).
          { name: "C-S-bare", from: "Center", to: "Spawn", connectionType: "Direct", guardValue: 1000 },
          // Explicit road:false but a segment exists -> the segment wins.
          { name: "C-S-flagFalse", from: "Center", to: "Spawn", connectionType: "Direct", guardValue: 1000, road: false }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("road presence from segments", () => {
  it("marks a connection as a road only when a zone.roads segment paves it", () => {
    const imported = importTemplateForRoundTrip(buildParallelTemplate());
    const byId = new Map(imported.edges.map((edge) => [edge.id, edge]));

    expect(byId.get("C-S-paved")?.road).toBe(true);
    expect(byId.get("C-S-bare")?.road).toBe(false);
    // A segment overrides an explicit road:false flag
    expect(byId.get("C-S-flagFalse")?.road).toBe(true);
  });
});
