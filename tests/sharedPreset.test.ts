import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { validate } from "../src/services/validator.ts";
import { resolveGameTemplatesDirectory, readTemplate, importTemplateForRoundTrip } from "./helpers/gameTemplateRoundTrip.ts";
import type { MapSettings, Zone } from "../src/types/editor.ts";

/**
 * Several zones may point at one mandatory-content preset. The editor keeps a
 * copy per zone while the export collapses them by name, last zone winning, so
 * a diverged copy is silently dropped. The warning is the only thing telling
 * the user, so it must fire exactly when the copies differ — and stay quiet
 * across the shipped templates, where they never do.
 */

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key} ${JSON.stringify(params)}` : key;

const settings = {
  sizeX: 128, sizeZ: 128, players: 2, victoryMode: "classic",
  heroLimitMode: "fixed", terrainProfiles: []
} as unknown as MapSettings;

const zone = (id: string, preset: string, objects: unknown[]): Zone => ({
  id, label: id, type: "custom", x: 0.5, y: 0.5, size: 1,
  biomeMode: "random", biomeSource: "", biomeId: "Grass", mainObjects: [],
  guardedValue: 0, unguardedValue: 0, resourcesValue: 0,
  mandatoryContent: [preset], objects
} as unknown as Zone);

const obj = (sid: string, key: string, count = 1) => ({ key, sid, kind: "sid", count, soloEncounter: false, variant: null });

const warned = (zones: Zone[]) =>
  validate(settings, zones, [], false, [], [], t)
    .filter(([, text]) => text.startsWith("sharedPresetDiverged"))
    .map(([, text]) => text);

describe("shared mandatory-content preset", () => {
  it("stays quiet when the copies match, even with different runtime keys", () => {
    expect(warned([
      zone("Leaf-1", "mc_leaf", [obj("pandora_box", "k1")]),
      zone("Leaf-2", "mc_leaf", [obj("pandora_box", "k2")])
    ])).toEqual([]);
  });

  it("warns once the copies diverge, naming the zone that wins", () => {
    const [msg] = warned([
      zone("Leaf-1", "mc_leaf", [obj("pandora_box", "k1", 5)]),
      zone("Leaf-2", "mc_leaf", [obj("pandora_box", "k2", 1)]),
      zone("Leaf-3", "mc_leaf", [obj("pandora_box", "k3", 1)])
    ]);
    expect(msg).toContain('"count":3');
    expect(msg).toContain('"winner":"Leaf-3"');
  });

  it("says nothing about a preset only one zone uses", () => {
    expect(warned([
      zone("Solo", "mc_solo", [obj("pandora_box", "k1", 5)]),
      zone("Other", "mc_other", [obj("pandora_box", "k2", 1)])
    ])).toEqual([]);
  });
});

const dir = resolveGameTemplatesDirectory();

describe.skipIf(!dir)("shipped templates", () => {
  it("import without tripping the warning", () => {
    const noisy: string[] = [];
    for (const f of fs.readdirSync(dir as string).filter((n) => n.endsWith(".rmg.json")).sort()) {
      const doc = importTemplateForRoundTrip(readTemplate(dir as string, f) as never);
      if (warned(doc.zones as Zone[]).length) noisy.push(f);
    }
    expect(noisy).toEqual([]);
  });
});
