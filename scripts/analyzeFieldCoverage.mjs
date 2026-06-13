// Aggregates every key used at every JSON level across all game templates.
import fs from "node:fs";
import path from "node:path";

const dir =
  "D:\\SteamLibrary\\steamapps\\common\\Heroes of Might and Magic Olden Era" +
  "\\HeroesOldenEra_Data\\StreamingAssets\\map_templates";

const buckets = new Map(); // scope -> Map<key, {count, samples:Set}>

function note(scope, obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
  if (!buckets.has(scope)) buckets.set(scope, new Map());
  const bucket = buckets.get(scope);
  for (const [key, value] of Object.entries(obj)) {
    if (!bucket.has(key)) bucket.set(key, { count: 0, samples: new Set() });
    const k = bucket.get(key);
    k.count++;
    if (k.samples.size < 4) {
      const s = JSON.stringify(value);
      k.samples.add(s.length > 90 ? s.slice(0, 90) + "…" : s);
    }
  }
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".rmg.json"));
for (const f of files) {
  const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  note("root", t);
  note("gameRules", t.gameRules);
  note("winConditions", t.gameRules?.winConditions);
  for (const v of t.variants ?? []) {
    note("variant", v);
    note("variant.border", v.border);
    note("variant.orientation", v.orientation);
    for (const z of v.zones ?? []) {
      note("zone", z);
      note("zone.zoneBiome", z.zoneBiome);
      for (const mo of z.mainObjects ?? []) note("zone.mainObjects[]", mo);
      for (const rd of z.roads ?? []) note("zone.roads[]", rd);
    }
    for (const c of v.connections ?? []) note("connection", c);
  }
  for (const zl of t.zoneLayouts ?? []) note("zoneLayouts[]", zl);
  for (const cp of t.contentPools ?? []) {
    note("contentPools[]", cp);
    for (const e of cp.content ?? []) note("contentPools[].content[]", e);
  }
  for (const cl of t.contentLists ?? []) {
    note("contentLists[]", cl);
    for (const e of cl.content ?? []) note("contentLists[].content[]", e);
  }
  for (const mc of t.mandatoryContent ?? []) {
    note("mandatoryContent[]", mc);
    for (const e of mc.content ?? []) note("mandatoryContent[].content[]", e);
  }
  for (const lim of t.contentCountLimits ?? []) {
    note("contentCountLimits[]", lim);
    for (const e of lim.limits ?? []) note("contentCountLimits[].limits[]", e);
  }
}

console.log(`Templates: ${files.length}\n`);
for (const [scope, bucket] of buckets) {
  console.log(`=== ${scope}`);
  for (const [key, k] of [...bucket.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${key} (${k.count}): ${[...k.samples].join(" | ")}`);
  }
  console.log();
}
