import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  importTemplateForRoundTrip,
  readTemplate,
  resolveGameTemplatesDirectory
} from "./helpers/gameTemplateRoundTrip.ts";

/**
 * Verify the IMPORTER itself parses win conditions correctly — i.e. the editable
 * model right after import, NOT the exported result. The round-trip tests can
 * pass even with a parsing bug, because the generator re-emits the preserved
 * `originalWinConditions` verbatim. This test ignores that safety net and checks
 * the parsed flags/parameters against the original template directly, for every
 * template in the local game folder.
 */

type Wc = Record<string, unknown>;

const templatesDirectory = resolveGameTemplatesDirectory();

if (!templatesDirectory) {
  describe.skip("win condition import parsing", () => {
    it("requires a local Olden Era installation", () => undefined);
  });
} else {
  const files = fs
    .readdirSync(templatesDirectory)
    .filter((name) => name.endsWith(".rmg.json"))
    .sort();

  describe(`win condition import parsing (${files.length} templates)`, () => {
    it("parses every template's flags, parameters and label to match the original", () => {
      const mismatches: string[] = [];

      for (const name of files) {
        let s: Record<string, unknown>;
        let original: { displayWinCondition?: unknown; gameRules?: { winConditions?: Wc } };
        try {
          original = readTemplate(templatesDirectory, name) as typeof original;
          s = importTemplateForRoundTrip(original as never).settings as unknown as Record<string, unknown>;
        } catch (error) {
          mismatches.push(`${name}: import threw — ${(error as Error).message}`);
          continue;
        }

        const wc: Wc = original.gameRules?.winConditions ?? {};
        const note = (field: string, expected: unknown, actual: unknown) => {
          mismatches.push(`${name} · ${field}: expected ${JSON.stringify(expected)}, imported ${JSON.stringify(actual)}`);
        };
        const eqBool = (field: string, expected: boolean, actual: unknown) => {
          if (Boolean(actual) !== expected) note(field, expected, actual);
        };
        // A numeric/array/string parameter is only checked when the original
        // actually carried it (we are verifying parsing of explicit values, not
        // the importer's fallback defaults for absent keys).
        const eqNumIfPresent = (wcKey: string, field: string) => {
          if (wc[wcKey] !== undefined && Number(s[field]) !== Number(wc[wcKey])) note(field, wc[wcKey], s[field]);
        };
        const eqBoolDefaultTrueIfPresent = (wcKey: string, field: string) => {
          if (wc[wcKey] !== undefined && Boolean(s[field]) !== (wc[wcKey] !== false)) note(field, wc[wcKey], s[field]);
        };

        // Boolean flags (classic/desertion/heroLighting default ON; rest OFF).
        eqBool("classicEnabled", wc.classic !== false, s.classicEnabled);
        eqBool("desertionEnabled", wc.desertion !== false, s.desertionEnabled);
        eqBool("heroLightingEnabled", wc.heroLighting !== false, s.heroLightingEnabled);
        eqBool("lostStartCityEnabled", Boolean(wc.lostStartCity), s.lostStartCityEnabled);
        eqBool("cityHoldEnabled", Boolean(wc.cityHold), s.cityHoldEnabled);
        eqBool("singleHero (lostStartHero)", Boolean(wc.lostStartHero), s.singleHero);
        eqBool("gladiatorArenaEnabled", Boolean(wc.gladiatorArena), s.gladiatorArenaEnabled);
        eqBool("tournamentEnabled", Boolean(wc.tournament), s.tournamentEnabled);

        // Displayed label (absent => the engine default win_condition_1).
        const expectedLabel = typeof original.displayWinCondition === "string" && original.displayWinCondition
          ? original.displayWinCondition
          : "win_condition_1";
        if (s.displayWinCondition !== expectedLabel) note("displayWinCondition", expectedLabel, s.displayWinCondition);

        // Numeric parameters that the template carried explicitly.
        eqNumIfPresent("desertionDay", "desertionDay");
        eqNumIfPresent("desertionValue", "desertionValue");
        eqNumIfPresent("heroLightingDay", "heroLightingDay");
        eqNumIfPresent("lostStartCityDay", "lostStartCityDay");
        eqNumIfPresent("cityHoldDays", "cityHoldDays");
        eqNumIfPresent("gladiatorArenaDaysDelayStart", "gladiatorArenaDaysDelayStart");
        eqNumIfPresent("gladiatorArenaCountDay", "gladiatorArenaCountDay");
        eqNumIfPresent("tournamentPointsToWin", "tournamentPointsToWin");

        // Boolean sub-parameters (default ON when present).
        eqBoolDefaultTrueIfPresent("gladiatorArenaRegistrationStartFight", "gladiatorArenaRegistrationStartFight");
        eqBoolDefaultTrueIfPresent("tournamentSaveArmy", "tournamentSaveArmy");

        // Champion rule and tournament schedules.
        if (typeof wc.championSelectRule === "string" && s.gladiatorArenaChampionRule !== wc.championSelectRule) {
          note("gladiatorArenaChampionRule", wc.championSelectRule, s.gladiatorArenaChampionRule);
        }
        for (const key of ["tournamentDays", "tournamentAnnounceDays"]) {
          if (Array.isArray(wc[key])) {
            const exp = (wc[key] as unknown[]).map(Number);
            const act = Array.isArray(s[key]) ? (s[key] as unknown[]).map(Number) : s[key];
            if (JSON.stringify(act) !== JSON.stringify(exp)) note(key, exp, act);
          }
        }
      }

      if (mismatches.length > 0) {
        throw new Error(`Win-condition parsing mismatches (${mismatches.length}):\n` + mismatches.join("\n"));
      }
      expect(mismatches).toEqual([]);
    });
  });
}
