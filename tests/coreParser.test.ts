import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCoreCatalogFromZipFile } from "../src/services/coreParser.ts";

const corePath = path.join(
  process.env.OLDEN_ERA_TEMPLATES_DIR
    ? path.join(process.env.OLDEN_ERA_TEMPLATES_DIR, "..")
    : "D:\\SteamLibrary\\steamapps\\common\\Heroes of Might and Magic Olden Era" +
      "\\HeroesOldenEra_Data\\StreamingAssets",
  "Core.zip"
);

if (!fs.existsSync(corePath)) {
  describe.skip("core catalog parsing", () => {
    it("requires a local Olden Era installation", () => undefined);
  });
} else {
  describe("core catalog parsing", () => {
    it("extracts playable heroes and spells with localized names", async () => {
      const buffer = fs.readFileSync(corePath);
      const catalog = await loadCoreCatalogFromZipFile(
        new File([buffer], "Core.zip"),
        "ru"
      );

      // 6 playable factions × 18 heroes; campaign/tutorial heroes excluded
      expect(catalog.heroes.length).toBeGreaterThanOrEqual(100);
      expect(new Set(catalog.heroes.map((hero) => hero.faction)).size).toBe(6);

      const ister = catalog.heroes.find((hero) => hero.id === "human_hero_1");
      expect(ister?.labelByLang.ru).toBe("Истр");
      expect(ister?.labelByLang.en).toBe("Ister");
      expect(ister?.classType).toBe("might");

      // Spell ids referenced by official template bans must be pickable
      expect(catalog.spells.length).toBeGreaterThanOrEqual(50);
      for (const banned of ["neutral_magic_pocket_dimension", "neutral_magic_light_gate"]) {
        expect(catalog.spells.some((spell) => spell.id === banned)).toBe(true);
      }
      // Internal mechanics without localized names are filtered out
      expect(catalog.spells.some((spell) => spell.id.startsWith("bonus_magic_astral_summon"))).toBe(false);
      expect(catalog.spells.every((spell) => spell.labelByLang.ru || spell.labelByLang.en)).toBe(true);

      expect(catalog.stats.heroes).toBe(catalog.heroes.length);
      expect(catalog.stats.spells).toBe(catalog.spells.length);

      // Creatures for the unit-bonus picker (DB/units/units_logics)
      expect(catalog.units.length).toBeGreaterThanOrEqual(100);
      const minos = catalog.units.find((unit) => unit.id === "minos");
      expect(minos?.labelByLang.ru).toBe("Минотавр");
      expect(minos?.tier).toBeGreaterThan(0);

      // Engine hero stat names (DB/hero_stats_limits.json)
      expect(catalog.heroStatNames).toContain("offence");
      expect(catalog.heroStatNames).toContain("movementBonus");
      expect(catalog.heroStatNames.length).toBeGreaterThanOrEqual(40);

      // Built-in content pool names (generator/content_pools/*) — templates
      // reference these by name, so the validator must recognise them.
      expect(catalog.builtInPoolNames).toContain("template_pool_jebus_cross_unguarded_start_zone");
      expect(catalog.builtInPoolNames).toContain("content_pool_general_resources_start_zone_rich");
      expect(catalog.builtInPoolNames.length).toBeGreaterThan(100);
      // Deduplicated and sorted
      expect(catalog.builtInPoolNames).toEqual([...new Set(catalog.builtInPoolNames)].sort());
    });
  });
}
