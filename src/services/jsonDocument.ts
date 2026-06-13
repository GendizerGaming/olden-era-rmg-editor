export interface JsonDocument<T> {
  filename: string;
  json: string;
  value: T;
}

const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*]/g;
const TRAILING_FILENAME_CHARACTERS = /[. ]+$/g;

export function safeFilenameBase(value: string, fallback: string): string {
  const withoutControlCharacters = Array.from(String(value || ""))
    .filter((character) => (character.codePointAt(0) ?? 0) >= 32)
    .join("");
  const sanitized = withoutControlCharacters
    .trim()
    .replace(INVALID_FILENAME_CHARACTERS, "-")
    .replace(TRAILING_FILENAME_CHARACTERS, "")
    .trim();

  return sanitized || fallback;
}

export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createJsonDocument<T>(filename: string, value: T): JsonDocument<T> {
  return {
    filename,
    json: serializeJson(value),
    value
  };
}

export function downloadJsonDocument<T>(jsonDocument: JsonDocument<T>): void {
  const blob = new Blob([jsonDocument.json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  try {
    anchor.href = url;
    anchor.download = jsonDocument.filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
