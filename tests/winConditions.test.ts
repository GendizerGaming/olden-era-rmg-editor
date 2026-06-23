import { describe, expect, it } from "vitest";
import { OFFICIAL_TEMPLATE_NAMES } from "./gameTemplates/officialTemplateNames.ts";
import {
  exportImportedTemplate,
  importTemplateForRoundTrip,
  readTemplate,
  resolveGameTemplatesDirectory
} from "./helpers/gameTemplateRoundTrip.ts";

/**
 * Fidelity of the win conditions through the editor: importing a template then
 * exporting it must reproduce the same effective win/loss state and the same
 * displayed label. Win conditions are an independent flag set (the engine reads
 * the flags, not the label), so passing a template through the editor must not
 * drop, add or relabel any condition — the bug that originally affected
 * OctoJebus / Crossroads / Fair'n Square / Jebus Outcast.
 */

type Wc = Record<string, unknown> | undefined;

/** The win/loss state the engine actually sees (absent flag => engine default).
 *  Day/value parameters only matter while their flag is on. */
function effectiveWinState(wc: Wc): Record<string, number | boolean> {
  const c = wc ?? {};
  const flag = (key: string, fallback: boolean) =>
    c[key] === undefined ? fallback : Boolean(c[key]);

  const state: Record<string, number | boolean> = {
    classic: flag("classic", true),
    desertion: flag("desertion", true),
    heroLighting: flag("heroLighting", true),
    lostStartCity: flag("lostStartCity", false),
    lostStartHero: flag("lostStartHero", false),
    cityHold: flag("cityHold", false),
    gladiatorArena: flag("gladiatorArena", false),
    tournament: flag("tournament", false)
  };
  if (state.desertion) {
    state.desertionDay = Number(c.desertionDay) || 0;
    state.desertionValue = Number(c.desertionValue) || 0;
  }
  if (state.heroLighting) state.heroLightingDay = Number(c.heroLightingDay) || 0;
  if (state.lostStartCity) state.lostStartCityDay = Number(c.lostStartCityDay) || 0;
  if (state.cityHold) state.cityHoldDays = Number(c.cityHoldDays) || 0;
  return state;
}

const templatesDirectory = resolveGameTemplatesDirectory();

if (!templatesDirectory) {
  describe.skip("win condition fidelity", () => {
    it("requires a local Olden Era installation", () => undefined);
  });
} else {
  describe("win condition fidelity (original vs round-tripped)", () => {
    for (const name of OFFICIAL_TEMPLATE_NAMES) {
      it(`${name} preserves the win-condition flags and the displayed label`, () => {
        const original = readTemplate(templatesDirectory, name) as {
          displayWinCondition?: string;
          gameRules?: { winConditions?: Wc };
        };
        const exported = exportImportedTemplate(importTemplateForRoundTrip(original as never)) as {
          displayWinCondition?: string;
          gameRules?: { winConditions?: Wc };
        };

        // The cosmetic label survives exactly (absent => the engine default).
        expect(exported.displayWinCondition ?? "win_condition_1", name)
          .toBe(original.displayWinCondition ?? "win_condition_1");

        // The actual win/loss mechanics survive exactly.
        expect(effectiveWinState(exported.gameRules?.winConditions), name)
          .toEqual(effectiveWinState(original.gameRules?.winConditions));
      });
    }
  });
}
