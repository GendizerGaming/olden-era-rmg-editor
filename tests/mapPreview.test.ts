import { describe, expect, it } from "vitest";
import { previewFilename } from "../src/services/mapPreview.ts";

describe("map preview filename", () => {
  it("matches the .rmg.json base name with a .png extension", () => {
    // Mirrors safeFilenameBase, so the PNG pairs with the template file.
    expect(previewFilename("Jebus Cross Classic")).toBe("Jebus Cross Classic.png");
  });

  it("falls back to 'template' for an empty name", () => {
    expect(previewFilename("")).toBe("template.png");
  });

  it("strips characters the filesystem rejects", () => {
    const name = previewFilename("My/Map:Name?");
    expect(name).not.toContain("/");
    expect(name).not.toContain(":");
    expect(name.endsWith(".png")).toBe(true);
  });
});
