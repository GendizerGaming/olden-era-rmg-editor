import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { exportImportedTemplate, importTemplateForRoundTrip, readTemplate, resolveGameTemplatesDirectory } from "./helpers/gameTemplateRoundTrip.ts";

const dir = resolveGameTemplatesDirectory();

/**
 * Behaviour-level fidelity guard for mandatory-content objects. For every field
 * we compare the EFFECTIVE value (an omitted field resolved to its engine
 * default) of the export against the original, order-insensitively. This is the
 * check that should have caught the isGuarded / designatedEncounter bugs: the
 * editor wrote an explicit value (or dropped one) where the original relied on a
 * different default, silently flipping guarded/designated objects.
 *
 * Boolean-field defaults come from derpcat's reverse-engineered schema doc
 * (rmg-kb/schema/mandatory-content-entry.md). They are RE, not the official
 * engine — if one turns out wrong, fix it here and the guard stays honest.
 */
const DEFAULTS: Record<string, boolean> = {
  isGuarded: true,
  soloEncounter: false,
  isMine: false,
  designatedEncounter: true
};
const FIELDS = ["sid", "includeLists", "isGuarded", "soloEncounter", "isMine", "owner", "variant", "designatedEncounter", "rules", "content"];

// Whole-object losses already accepted (dead/unreferenced mandatoryContent
// presets + Serpentine's duplicate-named presets); excluded so their dropped
// objects don't drown the per-field signal. See import-fidelity audit.
const ACCEPTED_LOSS = new Set([
  "Custom Template.rmg.json", "Full Hire.rmg.json", "Madness.rmg.json",
  "Mini-Nostalgia.rmg.json", "One for All.rmg.json", "Serpentine Duel 5.rmg.json",
  "Spider.rmg.json", "Trinity.rmg.json"
]);

function stripPassthrough(v: unknown): void {
  if (Array.isArray(v)) { v.forEach(stripPassthrough); return; }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    delete o.rawFields; delete o.rawMandatoryContent;
    for (const x of Object.values(o)) stripPassthrough(x);
  }
}

// Effective value: an omitted field resolves to its engine default (boolean
// fields) or null (everything else). `name` is excluded — auto-generated.
const effective = (e: Record<string, unknown>, f: string): string =>
  f in e ? JSON.stringify(e[f]) : JSON.stringify(f in DEFAULTS ? DEFAULTS[f] : null);

describe.skipIf(!dir)("mandatory-content field fidelity (behaviour, order-insensitive)", () => {
  it("no exported field changes the effective value vs the original", () => {
    const files = fs.readdirSync(dir as string).filter((f) => f.endsWith(".rmg.json")).sort()
      .filter((f) => !ACCEPTED_LOSS.has(f));
    const objs = (tpl: { mandatoryContent?: Array<{ content?: Record<string, unknown>[] }> }) =>
      (tpl.mandatoryContent ?? []).flatMap((p) => p.content ?? []);

    const problems: string[] = [];
    for (const name of files) {
      const original = readTemplate(dir as string, name);
      const imported = structuredClone(importTemplateForRoundTrip(original as never));
      stripPassthrough(imported);
      delete (imported.settings as Record<string, unknown>).originalWinConditions;
      delete (imported.settings as Record<string, unknown>).originalGameRules;
      const oa = objs(original as never);
      const ob = objs(exportImportedTemplate(imported) as never);

      for (const f of FIELDS) {
        const ms = (arr: Record<string, unknown>[]) => {
          const m = new Map<string, number>();
          for (const e of arr) { const v = effective(e, f); m.set(v, (m.get(v) ?? 0) + 1); }
          return m;
        };
        const a = ms(oa); const b = ms(ob);
        let d = 0;
        for (const [k, v] of a) d += Math.max(0, v - (b.get(k) ?? 0));
        for (const [k, v] of b) d += Math.max(0, v - (a.get(k) ?? 0));
        if (d) problems.push(`${name} / ${f}: ${d} objects`);
      }
    }
    expect(problems).toEqual([]);
  });
});
