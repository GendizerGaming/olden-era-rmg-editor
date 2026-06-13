import { describe, expect, it } from "vitest";
import {
  asJsonValue,
  exportImportedTemplate,
  findJsonDifferences,
  importTemplateForRoundTrip,
  roundTripTemplate
} from "./helpers/gameTemplateRoundTrip.ts";
import { makeZone } from "../src/store/zones.ts";
import { defaultPresets } from "../src/store/presets.ts";
import { validate } from "../src/services/validator.ts";
import type { Edge, MapSettings } from "../src/types/editor.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/** All placement shapes seen in the official templates. */
function buildTemplate(): RmgTemplate {
  return {
    name: "Placement Test",
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
            mainObjects: [
              // Args without a placement field (5 official spawns do this)
              { type: "Spawn", spawn: "Player1", placementArgs: ["true", "0.7", "3"] }
            ]
          },
          {
            name: "B",
            size: 1,
            mainObjects: [
              // Center with no args must not get args invented on export
              { type: "City", placement: "Center" },
              { type: "City", placement: "Connection", placementArgs: ["A-B"] },
              { type: "City", placement: "NearZone", placementArgs: ["A"] },
              // Empty args array stays verbatim
              { type: "City", placement: "Uniform", placementArgs: [] },
              // Unknown placement value stays passthrough via rawFields
              { type: "City", placement: "FutureMode", placementArgs: ["true", "0.5", "1"] }
            ]
          }
        ],
        connections: [
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, road: true }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("main object placement", () => {
  it("imports known placements onto the model and keeps exotic ones passthrough", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    const zoneA = imported.zones.find((zone) => zone.id === "A");
    const zoneB = imported.zones.find((zone) => zone.id === "B");

    const spawn = zoneA?.mainObjects[0];
    expect(spawn?.placement).toBeUndefined();
    expect(spawn?.placementArgs).toEqual(["true", "0.7", "3"]);
    expect(spawn?.rawFields).toBeUndefined();

    const [center, connection, nearZone, emptyArgs, exotic] = zoneB?.mainObjects ?? [];
    expect(center?.placement).toBe("Center");
    expect(center?.placementArgs).toBeUndefined();
    expect(connection?.placement).toBe("Connection");
    expect(connection?.placementArgs).toEqual(["A-B"]);
    expect(nearZone?.placement).toBe("NearZone");
    expect(nearZone?.placementArgs).toEqual(["A"]);
    expect(emptyArgs?.placementArgs).toEqual([]);

    expect(exotic?.placement).toBeUndefined();
    expect(exotic?.rawFields?.placement).toBe("FutureMode");
    expect(exotic?.rawFields?.placementArgs).toEqual(["true", "0.5", "1"]);
  });

  it("re-exports placements verbatim without inventing defaults", () => {
    const exported = exportImportedTemplate(importTemplateForRoundTrip(buildTemplate()));
    const zones = exported.variants[0].zones;
    const spawn = zones.find((zone) => zone.name === "A")?.mainObjects?.[0];
    expect(spawn).not.toHaveProperty("placement");
    expect(spawn?.placementArgs).toEqual(["true", "0.7", "3"]);

    const objects = zones.find((zone) => zone.name === "B")?.mainObjects ?? [];
    expect(objects[0]?.placement).toBe("Center");
    expect(objects[0]).not.toHaveProperty("placementArgs");
    expect(objects[1]?.placement).toBe("Connection");
    expect(objects[1]?.placementArgs).toEqual(["A-B"]);
    expect(objects[2]?.placement).toBe("NearZone");
    expect(objects[2]?.placementArgs).toEqual(["A"]);
    expect(objects[3]?.placement).toBe("Uniform");
    expect(objects[3]?.placementArgs).toEqual([]);
    expect(objects[4]?.placement).toBe("FutureMode");
    expect(objects[4]?.placementArgs).toEqual(["true", "0.5", "1"]);
  });

  it("reaches a stable canonical export", () => {
    const firstExport = roundTripTemplate(buildTemplate());
    const secondExport = roundTripTemplate(firstExport);
    expect(
      findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
    ).toEqual([]);
  });

  it("fresh editor spawns get the official default placement", () => {
    const zone = makeZone([], [], [], {
      id: "spawn-1",
      label: "S",
      type: "spawn",
      x: 0.5,
      y: 0.5,
      player: 1
    }, defaultPresets.spawn);
    expect(zone.mainObjects[0]?.placement).toBe("Uniform");
    expect(zone.mainObjects[0]?.placementArgs).toEqual(["true", "0.7", "0"]);
  });

  it("validator flags dangling Connection/NearZone references", () => {
    const t = (key: string, params?: Record<string, string | number>) =>
      params ? `${key} ${JSON.stringify(params)}` : key;
    const settings = {
      sizeX: 128, sizeZ: 128, players: 1, victoryMode: "classic",
      heroLimitMode: "fixed", terrainProfiles: []
    } as unknown as MapSettings;
    const zones = [
      {
        ...makeZone([], [], [], { id: "A", label: "A", type: "spawn", x: 0.4, y: 0.5, player: 1 }, defaultPresets.spawn),
        mainObjects: [{
          key: "m1",
          type: "City" as const,
          factionMode: "random" as const,
          placement: "Connection" as const,
          placementArgs: ["no-such-edge"]
        }]
      },
      {
        ...makeZone([], [], [], { id: "B", label: "B", type: "neutral", x: 0.6, y: 0.5 }, defaultPresets.neutral),
        mainObjects: [{
          key: "m2",
          type: "City" as const,
          factionMode: "random" as const,
          placement: "NearZone" as const,
          placementArgs: ["no-such-zone"]
        }]
      }
    ];
    const edges: Edge[] = [{ id: "A__B", from: "A", to: "B", guardValue: 0, road: true, connectionType: "Direct" }];

    const texts = validate(settings, zones, edges, false, [], [], t).map(([, text]) => text);
    expect(texts.some((text) => text.startsWith("placementConnectionMissing"))).toBe(true);
    expect(texts.some((text) => text.startsWith("placementNearZoneMissing"))).toBe(true);

    // Valid references are silent
    zones[0].mainObjects[0].placementArgs = ["A__B"];
    zones[1].mainObjects[0].placementArgs = ["A"];
    const okTexts = validate(settings, zones, edges, false, [], [], t).map(([, text]) => text);
    expect(okTexts.some((text) => text.startsWith("placementConnectionMissing"))).toBe(false);
    expect(okTexts.some((text) => text.startsWith("placementNearZoneMissing"))).toBe(false);
  });
});
