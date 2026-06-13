import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const vitestCli = path.join(
  projectRoot,
  "node_modules",
  "vitest",
  "vitest.mjs"
);
const result = spawnSync(
  process.execPath,
  [vitestCli, "run", "tests/gameTemplates.roundtrip.test.ts"],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      REQUIRE_GAME_TEMPLATES: "1"
    },
    stdio: "inherit"
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
