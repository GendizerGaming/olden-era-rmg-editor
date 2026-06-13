import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_UNSUPPORTED_TEMPLATE_FEATURES } from "./gameTemplates/compatibilityBaseline.ts";
import { OFFICIAL_TEMPLATE_NAMES } from "./gameTemplates/officialTemplateNames.ts";
import {
  analyzeTemplateSupport,
  asJsonValue,
  exportImportedTemplate,
  findJsonDifferences,
  formatJsonDifferences,
  importTemplateForRoundTrip,
  normalizeImportedEditorState,
  readTemplate,
  resolveGameTemplatesDirectory,
  roundTripTemplate
} from "./helpers/gameTemplateRoundTrip.ts";

const templatesDirectory = resolveGameTemplatesDirectory();
const requireGameTemplates = process.env.REQUIRE_GAME_TEMPLATES === "1";

if (!templatesDirectory) {
  const message =
    "Olden Era map templates were not found. Set OLDEN_ERA_TEMPLATES_DIR " +
    "to the game's StreamingAssets/map_templates directory.";

  if (requireGameTemplates) {
    describe("official game template round trips", () => {
      it("finds the game template directory", () => {
        throw new Error(message);
      });
    });
  } else {
    describe.skip("official game template round trips", () => {
      it("requires a local Olden Era installation", () => undefined);
    });
  }
} else {
  const missingTemplates = OFFICIAL_TEMPLATE_NAMES.filter(
    (templateName) =>
      !fs.existsSync(path.join(templatesDirectory, templateName))
  );

  describe("official game template inventory", () => {
    it("contains every template in the official manifest", () => {
      expect(missingTemplates).toEqual([]);
    });

    it("matches the documented unsupported feature baseline", () => {
      const actualUnsupportedFeatures = Object.fromEntries(
        OFFICIAL_TEMPLATE_NAMES.flatMap((templateName) => {
          const template = readTemplate(templatesDirectory, templateName);
          const support = analyzeTemplateSupport(template);
          return support.supported
            ? []
            : [[templateName, support.reasons] as const];
        })
      );

      expect(actualUnsupportedFeatures).toEqual(
        EXPECTED_UNSUPPORTED_TEMPLATE_FEATURES
      );
    });
  });

  describe("official game template round trips", () => {
    for (const templateName of OFFICIAL_TEMPLATE_NAMES) {
      const template = readTemplate(templatesDirectory, templateName);

      it(`${templateName} imports and exports without throwing`, () => {
        expect(() => roundTripTemplate(template)).not.toThrow();
      });

      it(`${templateName} preserves the editable model`, () => {
        const firstImport = importTemplateForRoundTrip(template);
        const exported = exportImportedTemplate(firstImport);
        const secondImport = importTemplateForRoundTrip(exported);

        expect(normalizeImportedEditorState(secondImport)).toEqual(
          normalizeImportedEditorState(firstImport)
        );
      });

      it(`${templateName} reaches a stable canonical export`, () => {
        const firstExport = roundTripTemplate(template);
        const secondExport = roundTripTemplate(firstExport);
        const differences = findJsonDifferences(
          asJsonValue(firstExport),
          asJsonValue(secondExport)
        );

        expect(differences, formatJsonDifferences(differences)).toEqual([]);
      });
    }
  });
}
