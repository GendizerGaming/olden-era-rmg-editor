import { describe, expect, it } from "vitest";
import { scalePresetValues, zoneContentScale } from "../src/store/zones.ts";

describe("zone content scale", () => {
  it("is 1 at the reference area (1600 tiles per zone)", () => {
    // 160×160 with 16 zones of size 1 → exactly 1600 tiles per zone
    expect(zoneContentScale(160, 160, 16, 1)).toBeCloseTo(1, 5);
  });

  it("grows gently with the area and respects the clamp", () => {
    // A typical official setup: 128×128, 12 zones → slightly below 1
    expect(zoneContentScale(128, 128, 12, 1)).toBeCloseTo(Math.sqrt(16384 / 12 / 1600), 5);
    // Big zone on a huge near-empty map → capped at 2
    expect(zoneContentScale(240, 240, 2, 1.5)).toBe(2);
    // Tiny zone on a crowded small map → floored at 0.6
    expect(zoneContentScale(80, 80, 20, 0.5)).toBe(0.6);
  });

  it("scales with the individual zone size", () => {
    const small = zoneContentScale(160, 160, 16, 0.5);
    const big = zoneContentScale(160, 160, 16, 1.5);
    expect(small).toBeLessThan(1);
    expect(big).toBeGreaterThan(1);
  });
});

describe("scaled preset values", () => {
  const preset = {
    guardedValue: 400000,
    unguardedValue: 38000,
    resourcesValue: 55000,
    guardedValuePerArea: 2000,
    unguardedValuePerArea: 300,
    resourcesValuePerArea: undefined
  };

  it("applies the full scale to absolutes and sqrt to perArea, with rounding", () => {
    const scaled = scalePresetValues(preset, 1.44);
    expect(scaled.guardedValue).toBe(576000);
    expect(scaled.unguardedValue).toBe(55000); // 54720 → rounded to thousands
    expect(scaled.resourcesValue).toBe(79000); // 79200 → 79000
    expect(scaled.guardedValuePerArea).toBe(2400); // 2000 × 1.2
    expect(scaled.unguardedValuePerArea).toBe(360); // 300 × 1.2
    // Undefined perArea stays undefined — the field is not invented
    expect(scaled.resourcesValuePerArea).toBeUndefined();
  });

  it("is identity at scale 1", () => {
    const scaled = scalePresetValues(preset, 1);
    expect(scaled.guardedValue).toBe(400000);
    expect(scaled.guardedValuePerArea).toBe(2000);
  });
});
