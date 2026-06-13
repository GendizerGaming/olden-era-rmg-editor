import { describe, expect, it } from "vitest";
import { TEMPLATE_RECIPES } from "../src/store/templateRecipes.ts";
import { buildTopologyPlan } from "../src/services/topologyGenerator.ts";

const knownMapSizes = new Set([80, 96, 112, 128, 144, 160, 176, 192, 208, 240, 256]);

describe("template recipes", () => {
  it("every recipe produces a connected plan with matching player count", () => {
    for (const recipe of TEMPLATE_RECIPES) {
      const plan = buildTopologyPlan({ ...recipe.topology, seed: 1 });

      const spawns = plan.zones.filter((zone) => zone.role === "spawn");
      expect(spawns, recipe.id).toHaveLength(recipe.topology.players);

      // Connectivity via BFS
      const neighbors = new Map<number, number[]>();
      plan.edges.forEach(([a, b]) => {
        neighbors.set(a, [...(neighbors.get(a) || []), b]);
        neighbors.set(b, [...(neighbors.get(b) || []), a]);
      });
      const visited = new Set<number>([0]);
      const queue = [0];
      while (queue.length) {
        for (const next of neighbors.get(queue.pop()!) || []) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }
      expect(visited.size, recipe.id).toBe(plan.zones.length);
    }
  });

  it("uses known map sizes and consistent mode flags", () => {
    for (const recipe of TEMPLATE_RECIPES) {
      expect(knownMapSizes.has(recipe.settings.sizeX ?? 0), recipe.id).toBe(true);
      expect(recipe.settings.sizeX, recipe.id).toBe(recipe.settings.sizeZ);

      if (recipe.settings.victoryMode === "gladiatorArena") {
        expect(recipe.settings.gladiatorArenaEnabled, recipe.id).toBe(true);
      }
      if (recipe.settings.victoryMode === "tournament") {
        expect(recipe.settings.tournamentEnabled, recipe.id).toBe(true);
      }
    }
  });

  it("the arena recipe has a central zone to host the arena object", () => {
    const arenaRecipe = TEMPLATE_RECIPES.find((recipe) => recipe.arenaInCenter)!;
    expect(arenaRecipe).toBeDefined();
    const plan = buildTopologyPlan({ ...arenaRecipe.topology, seed: 1 });
    expect(plan.zones.some((zone) => zone.role === "center")).toBe(true);
  });

  it("recipe ids are unique", () => {
    const ids = TEMPLATE_RECIPES.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
