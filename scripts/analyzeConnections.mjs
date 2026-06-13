// One-off analysis: scan all game templates and aggregate connection shapes.
import fs from "node:fs";
import path from "node:path";

const dir =
  "D:\\SteamLibrary\\steamapps\\common\\Heroes of Might and Magic Olden Era" +
  "\\HeroesOldenEra_Data\\StreamingAssets\\map_templates";

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".rmg.json"));

const byType = new Map(); // type -> { count, templates:Set, keys:Map<key, {count, samples:Set}> }

for (const file of files) {
  const template = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  for (const variant of template.variants ?? []) {
    for (const conn of variant.connections ?? []) {
      const type = conn.connectionType ?? "(missing)";
      if (!byType.has(type)) {
        byType.set(type, { count: 0, templates: new Set(), keys: new Map() });
      }
      const bucket = byType.get(type);
      bucket.count++;
      bucket.templates.add(file);
      for (const [key, value] of Object.entries(conn)) {
        if (!bucket.keys.has(key)) {
          bucket.keys.set(key, { count: 0, samples: new Set() });
        }
        const k = bucket.keys.get(key);
        k.count++;
        if (k.samples.size < 8) k.samples.add(JSON.stringify(value));
      }
    }
  }
}

console.log(`Templates scanned: ${files.length}\n`);
for (const [type, bucket] of [...byType.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`=== connectionType: ${type} — ${bucket.count} connections in ${bucket.templates.size} templates`);
  for (const [key, k] of [...bucket.keys.entries()].sort((a, b) => b[1].count - a[1].count)) {
    const presence = ((k.count / bucket.count) * 100).toFixed(0);
    console.log(`  ${key} (${presence}%): ${[...k.samples].slice(0, 6).join(", ")}`);
  }
  console.log(`  templates: ${[...bucket.templates].slice(0, 8).join(", ")}${bucket.templates.size > 8 ? ", …" : ""}`);
  console.log();
}
