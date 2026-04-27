import type { Bot } from "mineflayer";
import pathfinderModule from "mineflayer-pathfinder";
import { z } from "zod";
import type { BaseLocation } from "../config.js";
import type { EventLogger } from "../log.js";
import { createGroundMovements } from "./movements.js";
import { stopBot } from "./stop.js";

const { goals } = pathfinderModule;

const LOG_TO_PLANK_NAME = {
  oak_log: "oak_planks",
  birch_log: "birch_planks",
  spruce_log: "spruce_planks",
  jungle_log: "jungle_planks",
  acacia_log: "acacia_planks",
  dark_oak_log: "dark_oak_planks",
  mangrove_log: "mangrove_planks",
  cherry_log: "cherry_planks"
} as const;

const PLANK_NAMES = Object.values(LOG_TO_PLANK_NAME);
const SEARCH_Y_OFFSETS = [0, -1, 1] as const;

const FailureReasonSchema = z.enum([
  "insufficient_materials",
  "timed_out",
  "path_failed",
  "placement_failed",
  "recipe_unavailable",
  "craft_failed",
  "missing_bot_entity"
]);

const LocationSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int()
});

export const CreateSharedChestOptionsSchema = z.object({
  timeoutMs: z.number().int().min(1_000).max(600_000).default(90_000),
  placementSearchRadius: z.number().int().min(1).max(12).default(6),
  preferredBaseLocation: LocationSchema.optional(),
  eventLogger: z.custom<EventLogger>()
});

export const CreateSharedChestResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    chestLocation: LocationSchema,
    craftingTableLocation: LocationSchema.optional()
  }),
  z.object({
    ok: z.literal(false),
    reason: FailureReasonSchema,
    chestLocation: LocationSchema.optional(),
    craftingTableLocation: LocationSchema.optional()
  })
]);

export type CreateSharedChestOptions = z.input<typeof CreateSharedChestOptionsSchema>;
export type CreateSharedChestResult = z.infer<typeof CreateSharedChestResultSchema>;
export type CreateSharedChestFailureReason = z.infer<typeof FailureReasonSchema>;
type FailedCreateSharedChestResult = Extract<CreateSharedChestResult, { ok: false }>;
type SuccessfulCreateSharedChestResult = Extract<CreateSharedChestResult, { ok: true }>;

type InventoryItem = ReturnType<Bot["inventory"]["items"]>[number];
type BlockRef = NonNullable<ReturnType<Bot["blockAt"]>>;
type Vec3Like = {
  x: number;
  y: number;
  z: number;
  offset: (x: number, y: number, z: number) => Vec3Like;
};
type PlacementOrigin = BaseLocation & {
  mode: "base" | "bot";
};
type PlacementCandidate = {
  supportBlock: BlockRef;
  location: { x: number; y: number; z: number };
};

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      onTimeout();
      reject(new Error("timed_out"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function remainingTime(startedAt: number, timeoutMs: number): number {
  return timeoutMs - (Date.now() - startedAt);
}

function getFailureReason(error: unknown): CreateSharedChestFailureReason {
  if (error instanceof Error && error.message === "timed_out") {
    return "timed_out";
  }

  return "craft_failed";
}

function failureResult(
  reason: CreateSharedChestFailureReason,
  craftingTableLocation?: BaseLocation,
  chestLocation?: BaseLocation
): FailedCreateSharedChestResult {
  return CreateSharedChestResultSchema.parse({
    ok: false,
    reason,
    chestLocation,
    craftingTableLocation
  }) as FailedCreateSharedChestResult;
}

function successResult(
  chestLocation: BaseLocation,
  craftingTableLocation?: BaseLocation
): SuccessfulCreateSharedChestResult {
  return CreateSharedChestResultSchema.parse({
    ok: true,
    chestLocation,
    craftingTableLocation
  }) as SuccessfulCreateSharedChestResult;
}

function findInventoryItem(bot: Bot, itemName: string): InventoryItem | undefined {
  return bot.inventory.items().find((item) => item.name === itemName);
}

function countInventoryItem(bot: Bot, itemName: string): number {
  return findInventoryItem(bot, itemName)?.count ?? 0;
}

function countPlanks(bot: Bot): number {
  return bot.inventory
    .items()
    .filter((item) => PLANK_NAMES.includes(item.name as (typeof PLANK_NAMES)[number]))
    .reduce((sum, item) => sum + item.count, 0);
}

function countPotentialPlanks(bot: Bot): number {
  let total = countPlanks(bot);

  for (const [logName] of Object.entries(LOG_TO_PLANK_NAME)) {
    total += countInventoryItem(bot, logName) * 4;
  }

  return total;
}

function createVec3(bot: Bot, x: number, y: number, z: number): Vec3Like {
  const entityPosition = bot.entity?.position;

  if (!entityPosition) {
    throw new Error("missing_bot_entity");
  }

  const Vec3Constructor = entityPosition.constructor as new (x: number, y: number, z: number) => Vec3Like;
  return new Vec3Constructor(x, y, z);
}

function toLocation(vector: { x: number; y: number; z: number }): BaseLocation {
  return {
    x: Math.floor(vector.x),
    y: Math.floor(vector.y),
    z: Math.floor(vector.z)
  };
}

function getCurrentBotOrigin(bot: Bot): PlacementOrigin {
  if (!bot.entity) {
    throw new Error("missing_bot_entity");
  }

  return {
    ...toLocation(bot.entity.position),
    mode: "bot"
  };
}

function getPlacementOrigins(bot: Bot, preferredBaseLocation?: BaseLocation): PlacementOrigin[] {
  const origins: PlacementOrigin[] = [];

  if (preferredBaseLocation) {
    origins.push({ ...preferredBaseLocation, mode: "base" });
  }

  const botOrigin = getCurrentBotOrigin(bot);
  if (!origins.some((origin) => origin.x === botOrigin.x && origin.y === botOrigin.y && origin.z === botOrigin.z)) {
    origins.push(botOrigin);
  }

  return origins;
}

function getPlacementCandidates(bot: Bot, origin: BaseLocation, radius: number): PlacementCandidate[] {
  const candidates: PlacementCandidate[] = [];

  for (let ring = 0; ring <= radius; ring += 1) {
    for (let deltaX = -ring; deltaX <= ring; deltaX += 1) {
      for (let deltaZ = -ring; deltaZ <= ring; deltaZ += 1) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaZ)) !== ring) {
          continue;
        }

        for (const deltaY of SEARCH_Y_OFFSETS) {
          const targetLocation = {
            x: origin.x + deltaX,
            y: origin.y + deltaY,
            z: origin.z + deltaZ
          };
          const targetBlock = bot.blockAt(
            createVec3(bot, targetLocation.x, targetLocation.y, targetLocation.z) as Parameters<Bot["blockAt"]>[0]
          );
          const aboveBlock = bot.blockAt(
            createVec3(bot, targetLocation.x, targetLocation.y + 1, targetLocation.z) as Parameters<Bot["blockAt"]>[0]
          );
          const supportBlock = bot.blockAt(
            createVec3(bot, targetLocation.x, targetLocation.y - 1, targetLocation.z) as Parameters<Bot["blockAt"]>[0]
          );

          if (!targetBlock || !aboveBlock || !supportBlock) {
            continue;
          }

          if (targetBlock.name !== "air" || aboveBlock.name !== "air") {
            continue;
          }

          if (supportBlock.boundingBox !== "block") {
            continue;
          }

          candidates.push({
            supportBlock,
            location: targetLocation
          });
        }
      }
    }
  }

  return candidates;
}

async function moveNear(
  bot: Bot,
  location: BaseLocation,
  timeoutMs: number
): Promise<void> {
  await withTimeout(
    bot.pathfinder.goto(new goals.GoalNear(location.x, location.y, location.z, 2)),
    timeoutMs,
    () => stopBot(bot)
  );
}

function findNearbyBlock(bot: Bot, blockName: string, maxDistance: number): BlockRef | null {
  const blockDefinition = bot.registry.blocksByName[blockName];

  if (!blockDefinition) {
    return null;
  }

  return bot.findBlock({
    matching: blockDefinition.id,
    maxDistance
  }) ?? null;
}

function getRecipe(bot: Bot, itemName: string, count: number, craftingTable: BlockRef | null) {
  const itemDefinition = bot.registry.itemsByName[itemName];

  if (!itemDefinition) {
    return null;
  }

  return bot.recipesFor(itemDefinition.id, null, count, craftingTable ?? null)[0] ?? null;
}

async function craftItem(
  bot: Bot,
  itemName: string,
  count: number,
  craftingTable: BlockRef | null,
  startedAt: number,
  timeoutMs: number
): Promise<void> {
  const recipe = getRecipe(bot, itemName, count, craftingTable);

  if (!recipe) {
    throw new Error("recipe_unavailable");
  }

  await withTimeout(
    bot.craft(recipe, count, craftingTable ?? undefined),
    remainingTime(startedAt, timeoutMs),
    () => stopBot(bot)
  );
}

async function craftRequiredPlanks(
  bot: Bot,
  requiredPlanks: number,
  startedAt: number,
  timeoutMs: number
): Promise<boolean> {
  let remainingPlanks = requiredPlanks - countPlanks(bot);

  if (remainingPlanks <= 0) {
    return false;
  }

  let craftedAny = false;

  for (const [logName, plankName] of Object.entries(LOG_TO_PLANK_NAME)) {
    const availableLogs = countInventoryItem(bot, logName);
    if (availableLogs <= 0 || remainingPlanks <= 0) {
      continue;
    }

    const craftsNeeded = Math.min(availableLogs, Math.ceil(remainingPlanks / 4));
    await craftItem(bot, plankName, craftsNeeded, null, startedAt, timeoutMs);
    craftedAny = true;
    remainingPlanks = requiredPlanks - countPlanks(bot);
  }

  return craftedAny;
}

async function placeInventoryBlock(
  bot: Bot,
  itemName: string,
  origins: PlacementOrigin[],
  placementSearchRadius: number,
  startedAt: number,
  timeoutMs: number
): Promise<BaseLocation | null> {
  const item = findInventoryItem(bot, itemName);

  if (!item) {
    return null;
  }

  for (const origin of origins) {
    if (origin.mode === "base") {
      try {
        await moveNear(bot, origin, Math.min(remainingTime(startedAt, timeoutMs), 15_000));
      } catch {
        continue;
      }
    }

    const candidates = getPlacementCandidates(bot, origin, placementSearchRadius);
    for (const candidate of candidates) {
      try {
        await withTimeout(
          bot.pathfinder.goto(
            new goals.GoalNear(candidate.location.x, candidate.location.y, candidate.location.z, 1)
          ),
          remainingTime(startedAt, timeoutMs),
          () => stopBot(bot)
        );

        await bot.equip(item, "hand");

        const faceVector = candidate.supportBlock.position
          .offset(0, 1, 0)
          .offset(-candidate.supportBlock.position.x, -candidate.supportBlock.position.y, -candidate.supportBlock.position.z);

        await withTimeout(
          bot.placeBlock(candidate.supportBlock, faceVector as Parameters<Bot["placeBlock"]>[1]),
          remainingTime(startedAt, timeoutMs),
          () => stopBot(bot)
        );

        return candidate.location;
      } catch {
        continue;
      }
    }
  }

  return null;
}

function logFailure(
  eventLogger: EventLogger,
  reason: CreateSharedChestFailureReason,
  craftingTableLocation?: BaseLocation,
  chestLocation?: BaseLocation
): void {
  const payload: Record<string, string | boolean | number | BaseLocation> = {
    reason
  };

  if (chestLocation) {
    payload.chestLocation = chestLocation;
  }

  if (craftingTableLocation) {
    payload.craftingTableLocation = craftingTableLocation;
  }

  eventLogger.logEvent("create_chest_failed", payload);
}

export async function createSharedChest(
  bot: Bot,
  options: CreateSharedChestOptions
): Promise<CreateSharedChestResult> {
  const { timeoutMs, placementSearchRadius, preferredBaseLocation, eventLogger } =
    CreateSharedChestOptionsSchema.parse(options);
  const startedAt = Date.now();
  let craftingTableLocation: BaseLocation | undefined;

  if (!bot.entity) {
    const result = failureResult("missing_bot_entity");
    logFailure(eventLogger, result.reason, result.craftingTableLocation, result.chestLocation);
    return result;
  }

  const startedPayload: Record<string, number | BaseLocation> = {
    timeoutMs,
    placementSearchRadius
  };

  if (preferredBaseLocation) {
    startedPayload.preferredBaseLocation = preferredBaseLocation;
  }

  eventLogger.logEvent("create_chest_started", startedPayload);

  try {
    const needsChest = countInventoryItem(bot, "chest") === 0;
    const hasCraftingTableItem = countInventoryItem(bot, "crafting_table") > 0;
    const localCraftingTable = findNearbyBlock(bot, "crafting_table", placementSearchRadius);
    const needsCraftingTable = needsChest && !hasCraftingTableItem && !localCraftingTable;
    const requiredPlanks = (needsChest ? 8 : 0) + (needsCraftingTable ? 4 : 0);

    if (requiredPlanks > 0 && countPotentialPlanks(bot) < requiredPlanks) {
      const result = failureResult("insufficient_materials");
      logFailure(eventLogger, result.reason, result.craftingTableLocation, result.chestLocation);
      return result;
    }

    bot.pathfinder.setMovements(
      createGroundMovements(bot, {
        canDig: false,
        maxDropDown: 4
      })
    );
    stopBot(bot);

    const craftedPlanks = await craftRequiredPlanks(bot, requiredPlanks, startedAt, timeoutMs);
    if (craftedPlanks) {
      eventLogger.logEvent("craft_planks_completed", {
        plankCount: countPlanks(bot)
      });
    }

    let craftingTableBlock = localCraftingTable;
    if (needsChest && !craftingTableBlock) {
      if (!hasCraftingTableItem) {
        try {
          await craftItem(bot, "crafting_table", 1, null, startedAt, timeoutMs);
        } catch (error) {
          const reason =
            error instanceof Error && error.message === "recipe_unavailable"
              ? "recipe_unavailable"
              : getFailureReason(error);
          const result = failureResult(reason, craftingTableLocation);
          logFailure(eventLogger, result.reason, result.craftingTableLocation, result.chestLocation);
          return result;
        }

        eventLogger.logEvent("craft_table_completed", {
          itemCount: countInventoryItem(bot, "crafting_table")
        });
      }

      const tablePlacementOrigins = getPlacementOrigins(bot, preferredBaseLocation);
      const placedCraftingTable = await placeInventoryBlock(
        bot,
        "crafting_table",
        tablePlacementOrigins,
        placementSearchRadius,
        startedAt,
        timeoutMs
      );

      if (!placedCraftingTable) {
        const reason = remainingTime(startedAt, timeoutMs) <= 0 ? "timed_out" : "placement_failed";
        const result = failureResult(reason, craftingTableLocation);
        logFailure(eventLogger, result.reason, result.craftingTableLocation, result.chestLocation);
        return result;
      }

      craftingTableLocation = placedCraftingTable;
      eventLogger.logEvent("craft_table_placed", {
        craftingTableLocation
      });
      craftingTableBlock = bot.blockAt(
        createVec3(
          bot,
          craftingTableLocation.x,
          craftingTableLocation.y,
          craftingTableLocation.z
        ) as Parameters<Bot["blockAt"]>[0]
      );
    }

    if (needsChest) {
      try {
        await craftItem(bot, "chest", 1, craftingTableBlock, startedAt, timeoutMs);
      } catch (error) {
        const reason =
          error instanceof Error && error.message === "recipe_unavailable"
            ? "recipe_unavailable"
            : getFailureReason(error);
        const result = failureResult(reason, craftingTableLocation);
        logFailure(eventLogger, result.reason, result.craftingTableLocation, result.chestLocation);
        return result;
      }

      eventLogger.logEvent("chest_crafted", {
        itemCount: countInventoryItem(bot, "chest")
      });
    }

    const chestPlacementOrigins = getPlacementOrigins(bot, preferredBaseLocation);
    const chestLocation = await placeInventoryBlock(
      bot,
      "chest",
      chestPlacementOrigins,
      placementSearchRadius,
      startedAt,
      timeoutMs
    );

    if (!chestLocation) {
      const reason = remainingTime(startedAt, timeoutMs) <= 0 ? "timed_out" : "placement_failed";
      const result = failureResult(reason, craftingTableLocation);
      logFailure(eventLogger, result.reason, result.craftingTableLocation, result.chestLocation);
      return result;
    }

    eventLogger.logEvent("chest_placed", {
      chestLocation,
      near: preferredBaseLocation ? "base_or_fallback" : "bot"
    });

    const result = successResult(chestLocation, craftingTableLocation);
    const completedPayload: Record<string, boolean | BaseLocation> = {
      chestLocation: result.chestLocation,
      sharedAssetCandidate: true
    };

    if (result.craftingTableLocation) {
      const placedTableLocation = result.craftingTableLocation!;
      completedPayload.craftingTableLocation = placedTableLocation;
    }

    eventLogger.logEvent("create_chest_completed", completedPayload);
    return result;
  } catch (error) {
    const reason =
      error instanceof Error && error.message === "missing_bot_entity"
        ? "missing_bot_entity"
        : error instanceof Error && error.message === "timed_out"
          ? "timed_out"
          : "path_failed";
    const result = failureResult(reason, craftingTableLocation);
    logFailure(eventLogger, result.reason, result.craftingTableLocation, result.chestLocation);
    return result;
  } finally {
    stopBot(bot);
  }
}
