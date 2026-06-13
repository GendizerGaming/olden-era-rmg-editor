import { describe, expect, it } from "vitest";
import en from "../src/i18n/en.json";
import ru from "../src/i18n/ru.json";

const placeholders = (text: string) =>
  [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();

describe("i18n dictionaries", () => {
  it("EN and RU expose the same keys", () => {
    const enKeys = Object.keys(en).sort();
    const ruKeys = Object.keys(ru).sort();
    expect(enKeys).toEqual(ruKeys);
  });

  it("every key interpolates the same {params} in both languages", () => {
    const mismatches: string[] = [];
    for (const key of Object.keys(en)) {
      const enParams = placeholders((en as Record<string, string>)[key] ?? "");
      const ruParams = placeholders((ru as Record<string, string>)[key] ?? "");
      if (JSON.stringify(enParams) !== JSON.stringify(ruParams)) {
        mismatches.push(`${key}: en={${enParams}} ru={${ruParams}}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("no value is empty", () => {
    const empty = Object.entries({ ...en, ...ru }).filter(([, value]) => !String(value).trim());
    expect(empty).toEqual([]);
  });
});
