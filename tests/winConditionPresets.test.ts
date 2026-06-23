import { describe, expect, it } from "vitest";
import { initialSettings } from "../src/store/constants.ts";
import { normalizeSettings } from "../src/store/normalizers.ts";
import { applyPreset, matchesPreset, presetBySid, WIN_CONDITION_PRESETS } from "../src/store/winConditions.ts";
import type { MapSettings } from "../src/types/editor.ts";

// Apply the preset exactly the way the store does: through the normalizer,
// so a preset value the normalizer would clamp (e.g. a 0 day) is caught.
const withPreset = (sid: string): MapSettings => normalizeSettings({ ...initialSettings, ...applyPreset(sid) });

describe("win-condition presets", () => {
  it("exposes the eight official presets with their labels", () => {
    expect(WIN_CONDITION_PRESETS.map((p) => p.sid)).toEqual([
      "win_condition_0", "win_condition_1", "win_condition_2", "win_condition_3",
      "win_condition_4", "win_condition_5", "win_condition_6", "win_condition_7"
    ]);
  });

  it("applyPreset selects the label and applies the standard flags", () => {
    const hold = applyPreset("win_condition_3");
    expect(hold.displayWinCondition).toBe("win_condition_3");
    expect(hold.lostStartCityEnabled).toBe(true);
    expect(hold.lostStartCityDay).toBe(3);

    const arena = applyPreset("win_condition_4");
    expect(arena.gladiatorArenaEnabled).toBe(true);
    expect(arena.singleHero).toBe(true);
  });

  it("an unmodified preset matches itself, and every preset round-trips", () => {
    for (const preset of WIN_CONDITION_PRESETS) {
      expect(matchesPreset(withPreset(preset.sid), preset.sid), preset.sid).toBe(true);
    }
  });

  it("flips to modified when a flag or a gated parameter changes", () => {
    // The OctoJebus shape: Classic label + an extra lose-start-city rule.
    const octo: MapSettings = { ...withPreset("win_condition_1"), lostStartCityEnabled: true, lostStartCityDay: 3 };
    expect(matchesPreset(octo, "win_condition_1")).toBe(false);

    // Changing a day under an active flag also counts as modified.
    const tweakedHold: MapSettings = { ...withPreset("win_condition_3"), lostStartCityDay: 7 };
    expect(matchesPreset(tweakedHold, "win_condition_3")).toBe(false);

    // Resetting (re-applying the preset) makes it match again.
    expect(matchesPreset({ ...tweakedHold, ...applyPreset("win_condition_3") }, "win_condition_3")).toBe(true);
  });

  it("ignores dead parameters under a disabled flag", () => {
    // Classic preset has gladiator off; a stale gladiator count must not count.
    const staleParam: MapSettings = { ...withPreset("win_condition_1"), gladiatorArenaCountDay: 99 };
    expect(matchesPreset(staleParam, "win_condition_1")).toBe(true);
  });

  it("presetBySid falls back to undefined for unknown labels", () => {
    expect(presetBySid("win_condition_99")).toBeUndefined();
    // An unknown label is treated as not-modified (nothing to compare against).
    expect(matchesPreset(initialSettings, "win_condition_99")).toBe(true);
  });
});
