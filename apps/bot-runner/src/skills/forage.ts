import type { Bot } from "mineflayer";
import type { Entity } from "prismarine-entity";
import pathfinderModule from "mineflayer-pathfinder";
import type { EventLogger } from "../log.js";
import { createGroundMovements } from "./movements.js";
import { stopBot } from "./stop.js";

const { goals } = pathfinderModule;

const FOOD_ANIMALS = new Set([
  "cow", "pig", "chicken", "sheep", "rabbit", "mooshroom"
]);

const FOOD_ITEM_NAMES = new Set([
  "beef", "porkchop", "chicken", "mutton", "rabbit",
  "cooked_beef", "cooked_porkchop", "cooked_chicken", "cooked_mutton", "cooked_rabbit",
  "bread", "apple", "carrot", "potato", "baked_potato",
  "cookie", "melon_slice", "pumpkin_pie", "sweet_berries", "glow_berries",
  "mushroom_stew", "beetroot_soup", "rabbit_stew"
]);

const HARVEST_BLOCKS = new Set([
  "wheat", "carrots", "potatoes", "beetroots", "sweet_berry_bush", "cave_vines_plant"
]);

export type ForageResult =
  | { ok: true; method: "eat_inventory" | "kill_animal" | "harvest_crop"; note: string }
  | { ok: false; reason: "nothing_nearby" | "path_failed" | "timed_out" | "attack_failed" };

function findNearestAnimal(bot: Bot, radius: number): Entity | null {
  let nearest: Entity | null = null;
  let nearestDist = Infinity;

  for (const entity of Object.values(bot.entities)) {
    if (!FOOD_ANIMALS.has(entity.name ?? "")) continue;
    const dist = entity.position.distanceTo(bot.entity.position);
    if (dist < radius && dist < nearestDist) {
      nearest = entity;
      nearestDist = dist;
    }
  }

  return nearest;
}

async function tryEatFromInventory(bot: Bot): Promise<boolean> {
  const foodItem = bot.inventory.items().find(item => FOOD_ITEM_NAMES.has(item.name));
  if (!foodItem) return false;
  if (bot.food >= 18) return false;

  try {
    await bot.equip(foodItem, "hand");
    await bot.consume();
    return true;
  } catch {
    return false;
  }
}

async function waitForDrops(bot: Bot, ms: number): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, ms));
  // Walk toward any dropped items nearby
  for (const entity of Object.values(bot.entities)) {
    if (entity.type !== "object" && entity.name !== "item") continue;
    const dist = entity.position.distanceTo(bot.entity.position);
    if (dist < 6) {
      try {
        await bot.pathfinder.goto(new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, 1));
      } catch {
        // ignore
      }
    }
  }
}

export async function forage(bot: Bot, options: { eventLogger: EventLogger; searchRadius?: number; timeoutMs?: number }): Promise<ForageResult> {
  const { eventLogger } = options;
  const searchRadius = options.searchRadius ?? 30;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const deadline = Date.now() + timeoutMs;

  eventLogger.logEvent("forage_started", { searchRadius });

  // Eat from inventory first if we have food and are hungry
  const ate = await tryEatFromInventory(bot);
  if (ate) {
    eventLogger.logEvent("forage_ate_from_inventory", { food: bot.food });
    return { ok: true, method: "eat_inventory", note: `food now ${bot.food}` };
  }

  bot.pathfinder.setMovements(createGroundMovements(bot, { canDig: false, maxDropDown: 4, allowFreeMotion: false }));

  // Try to find and kill an animal
  const animal = findNearestAnimal(bot, searchRadius);

  if (!animal) {
    // Try harvesting a crop block
    const cropBlocks = bot.findBlocks({
      matching: (block) => block !== null && HARVEST_BLOCKS.has(block.name),
      maxDistance: searchRadius,
      count: 1
    });

    if (cropBlocks.length === 0) {
      eventLogger.logEvent("forage_nothing_found", {});
      return { ok: false, reason: "nothing_nearby" };
    }

    const cropPos = cropBlocks[0];
    const cropBlock = bot.blockAt(cropPos);
    if (!cropBlock) return { ok: false, reason: "nothing_nearby" };

    try {
      await bot.pathfinder.goto(new goals.GoalNear(cropPos.x, cropPos.y, cropPos.z, 1));
      await bot.dig(cropBlock);
      await waitForDrops(bot, 500);
      await tryEatFromInventory(bot);
      stopBot(bot);
      eventLogger.logEvent("forage_harvested", { block: cropBlock.name, pos: cropPos });
      return { ok: true, method: "harvest_crop", note: cropBlock.name };
    } catch {
      stopBot(bot);
      return { ok: false, reason: "path_failed" };
    }
  }

  // Pathfind to animal
  const pos = animal.position;
  try {
    await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
  } catch {
    stopBot(bot);
    return { ok: false, reason: "path_failed" };
  }

  // Attack until dead
  const entityId = animal.id;
  eventLogger.logEvent("forage_attacking", { mob: animal.name, distance: Math.round(pos.distanceTo(bot.entity.position)) });

  let target = bot.entities[entityId];
  const maxAttacks = 20;
  let attacks = 0;

  while (target && target.isValid !== false && Date.now() < deadline && attacks < maxAttacks) {
    try {
      bot.attack(target);
      attacks++;
      await new Promise<void>(resolve => setTimeout(resolve, 600));
      target = bot.entities[entityId];
    } catch {
      break;
    }
  }

  if (attacks === 0) {
    stopBot(bot);
    return { ok: false, reason: "attack_failed" };
  }

  await waitForDrops(bot, 1000);
  await tryEatFromInventory(bot);
  stopBot(bot);

  const killed = !bot.entities[entityId] || bot.entities[entityId]?.isValid === false;
  eventLogger.logEvent("forage_kill_attempt", { mob: animal.name, killed, attacks, food: bot.food });

  if (Date.now() > deadline) {
    return { ok: false, reason: "timed_out" };
  }

  return { ok: true, method: "kill_animal", note: `${animal.name} attacked (${attacks} hits), food now ${bot.food}` };
}
