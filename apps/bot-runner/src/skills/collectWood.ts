import type { Bot } from "mineflayer";
import pathfinderModule from "mineflayer-pathfinder";
import { z } from "zod";
import type { EventLogger } from "../log.js";
import { createGroundMovements } from "./movements.js";
import { stopBot } from "./stop.js";

const { goals } = pathfinderModule;

const LOG_BLOCK_NAMES = [
  "oak_log",
  "birch_log",
  "spruce_log",
  "jungle_log",
  "acacia_log",
  "dark_oak_log",
  "mangrove_log",
  "cherry_log"
] as const;

const FailureReasonSchema = z.enum([
  "no_logs_found",
  "timed_out",
  "path_failed",
  "dig_failed",
  "target_not_reached",
  "max_blocks_reached"
]);

export const CollectWoodOptionsSchema = z.object({
  targetCount: z.number().int().min(1).max(64).default(8),
  searchRadius: z.number().int().min(4).max(64).default(32),
  maxBlocks: z.number().int().min(1).max(64).default(8),
  timeoutMs: z.number().int().min(1_000).max(600_000).default(120_000),
  eventLogger: z.custom<EventLogger>()
});

export const SkillResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    collectedCount: z.number().int().min(0),
    blocksDug: z.number().int().min(0)
  }),
  z.object({
    ok: z.literal(false),
    collectedCount: z.number().int().min(0),
    blocksDug: z.number().int().min(0),
    reason: FailureReasonSchema
  })
]);

export type CollectWoodOptions = z.input<typeof CollectWoodOptionsSchema>;
export type SkillResult = z.infer<typeof SkillResultSchema>;
export type CollectWoodFailureReason = z.infer<typeof FailureReasonSchema>;
type FailedSkillResult = Extract<SkillResult, { ok: false }>;

function countCollectedLogs(bot: Bot): number {
  return bot.inventory
    .items()
    .filter((item) => LOG_BLOCK_NAMES.includes(item.name as (typeof LOG_BLOCK_NAMES)[number]))
    .reduce((sum, item) => sum + item.count, 0);
}

function getLogBlockIds(bot: Bot): number[] {
  return LOG_BLOCK_NAMES.flatMap((name) => {
    const block = bot.registry.blocksByName[name];
    return block ? [block.id] : [];
  });
}

function isLogBlockName(name: string): name is (typeof LOG_BLOCK_NAMES)[number] {
  return LOG_BLOCK_NAMES.includes(name as (typeof LOG_BLOCK_NAMES)[number]);
}

function getNearbyLogBlocks(bot: Bot, logBlockIds: number[], searchRadius: number, count: number) {
  return bot.findBlocks({
    matching: logBlockIds,
    maxDistance: searchRadius,
    count
  })
    .map((position) => bot.blockAt(position))
    .filter((block): block is Exclude<typeof block, null> => block !== null && isLogBlockName(block.name))
    .sort((left, right) => left.position.distanceTo(bot.entity.position) - right.position.distanceTo(bot.entity.position));
}

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

function failureResult(collectedCount: number, blocksDug: number, reason: CollectWoodFailureReason): SkillResult {
  return SkillResultSchema.parse({
    ok: false,
    collectedCount,
    blocksDug,
    reason
  });
}

function successResult(collectedCount: number, blocksDug: number): SkillResult {
  return SkillResultSchema.parse({
    ok: true,
    collectedCount,
    blocksDug
  });
}

function logCollectWoodFailed(eventLogger: EventLogger, result: FailedSkillResult): void {
  eventLogger.logEvent("collect_wood_failed", {
    reason: result.reason,
    collectedCount: result.collectedCount,
    blocksDug: result.blocksDug
  });
}

export async function collectWood(bot: Bot, options: CollectWoodOptions): Promise<SkillResult> {
  const { targetCount, searchRadius, maxBlocks, timeoutMs, eventLogger } = CollectWoodOptionsSchema.parse(options);
  const startedAt = Date.now();
  let blocksDug = 0;
  const startingCount = countCollectedLogs(bot);
  const logBlockIds = getLogBlockIds(bot);
  bot.pathfinder.setMovements(createGroundMovements(bot, {
    canDig: true,
    maxDropDown: 8
  }));
  stopBot(bot);

  eventLogger.logEvent("collect_wood_started", {
    targetCount,
    searchRadius,
    maxBlocks,
    timeoutMs
  });

  if (logBlockIds.length === 0) {
    const result = failureResult(0, 0, "no_logs_found") as FailedSkillResult;
    logCollectWoodFailed(eventLogger, result);
    return result;
  }

  while (blocksDug < maxBlocks) {
    const collectedCount = countCollectedLogs(bot) - startingCount;

    if (collectedCount >= targetCount) {
      const result = successResult(collectedCount, blocksDug);
      eventLogger.logEvent("collect_wood_completed", {
        collectedCount: result.collectedCount,
        blocksDug: result.blocksDug
      });
      stopBot(bot);
      return result;
    }

    const timeLeftMs = remainingTime(startedAt, timeoutMs);
    if (timeLeftMs <= 0) {
      const result = failureResult(collectedCount, blocksDug, "timed_out") as FailedSkillResult;
      logCollectWoodFailed(eventLogger, result);
      stopBot(bot);
      return result;
    }

    const candidateBlocks = getNearbyLogBlocks(bot, logBlockIds, searchRadius, Math.min(32, maxBlocks * 4));
    if (candidateBlocks.length === 0) {
      const reason = blocksDug === 0 ? "no_logs_found" : "target_not_reached";
      const result = failureResult(collectedCount, blocksDug, reason) as FailedSkillResult;
      logCollectWoodFailed(eventLogger, result);
      stopBot(bot);
      return result;
    }

    let blockToDig: ReturnType<Bot["blockAt"]> | null = null;

    for (const candidateBlock of candidateBlocks) {
      eventLogger.logEvent("collect_wood_block_found", {
        blockName: candidateBlock.name,
        position: {
          x: candidateBlock.position.x,
          y: candidateBlock.position.y,
          z: candidateBlock.position.z
        },
        collectedCount,
        blocksDug
      });

      try {
        await withTimeout(
          bot.pathfinder.goto(new goals.GoalNear(candidateBlock.position.x, candidateBlock.position.y, candidateBlock.position.z, 1)),
          remainingTime(startedAt, timeoutMs),
          () => stopBot(bot)
        );
      } catch {
        continue;
      }

      const refreshedBlock = bot.blockAt(candidateBlock.position);
      if (!refreshedBlock || !isLogBlockName(refreshedBlock.name)) {
        continue;
      }

      blockToDig = refreshedBlock;
      break;
    }

    if (!blockToDig) {
      const reason = remainingTime(startedAt, timeoutMs) <= 0 ? "timed_out" : "path_failed";
      const result = failureResult(countCollectedLogs(bot) - startingCount, blocksDug, reason) as FailedSkillResult;
      logCollectWoodFailed(eventLogger, result);
      stopBot(bot);
      return result;
    }

    try {
      await withTimeout(
        bot.dig(blockToDig, true),
        remainingTime(startedAt, timeoutMs),
        () => stopBot(bot)
      );
    } catch {
      const reason = remainingTime(startedAt, timeoutMs) <= 0 ? "timed_out" : "dig_failed";
      const result = failureResult(countCollectedLogs(bot) - startingCount, blocksDug, reason) as FailedSkillResult;
      logCollectWoodFailed(eventLogger, result);
      stopBot(bot);
      return result;
    }

    blocksDug += 1;
    const updatedCollectedCount = countCollectedLogs(bot) - startingCount;
    eventLogger.logEvent("collect_wood_block_dug", {
      blockName: blockToDig.name,
      position: {
        x: blockToDig.position.x,
        y: blockToDig.position.y,
        z: blockToDig.position.z
      },
      collectedCount: updatedCollectedCount,
      blocksDug
    });
  }

  const collectedCount = countCollectedLogs(bot) - startingCount;
  const reason = collectedCount >= targetCount ? undefined : "max_blocks_reached";

  if (!reason) {
    const result = successResult(collectedCount, blocksDug);
    eventLogger.logEvent("collect_wood_completed", {
      collectedCount: result.collectedCount,
      blocksDug: result.blocksDug
    });
    stopBot(bot);
    return result;
  }

  const result = failureResult(collectedCount, blocksDug, reason) as FailedSkillResult;
  logCollectWoodFailed(eventLogger, result);
  stopBot(bot);
  return result;
}
