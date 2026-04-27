import type { Bot } from "mineflayer";
import type { EventLogger } from "../log.js";
import { createGroundMovements } from "./movements.js";

type MovementState = {
  canDig?: boolean;
  maxDropDown?: number;
  allow1by1towers?: boolean;
  allowFreeMotion?: boolean;
  allowParkour?: boolean;
  canOpenDoors?: boolean;
};

type PathUpdateResult = {
  status?: string;
  path?: unknown[];
};

function toMovementOptions(movement: MovementState) {
  return {
    canDig: true,
    ...(movement.maxDropDown !== undefined ? { maxDropDown: movement.maxDropDown } : {}),
    ...(movement.allow1by1towers !== undefined ? { allow1by1towers: movement.allow1by1towers } : {}),
    ...(movement.allowFreeMotion !== undefined ? { allowFreeMotion: movement.allowFreeMotion } : {}),
    ...(movement.allowParkour !== undefined ? { allowParkour: movement.allowParkour } : {}),
    ...(movement.canOpenDoors !== undefined ? { canOpenDoors: movement.canOpenDoors } : {})
  };
}

function getMovementState(bot: Bot): MovementState | null {
  const movement = bot.pathfinder.movements as MovementState | undefined;
  return movement ?? null;
}

function enableDiggingRecovery(bot: Bot, eventLogger: EventLogger, trigger: string): boolean {
  const movement = getMovementState(bot);

  if (!movement || movement.canDig) {
    return false;
  }

  bot.pathfinder.setMovements(
    createGroundMovements(bot, toMovementOptions(movement))
  );

  eventLogger.logEvent("path_recovery_enabled_digging", {
    trigger,
    maxDropDown: movement.maxDropDown ?? 8,
    allowFreeMotion: movement.allowFreeMotion ?? true
  });

  return true;
}

export function installPathRecovery(bot: Bot, eventLogger: EventLogger): () => void {
  const onPathReset = (reason: unknown) => {
    const normalizedReason = typeof reason === "string" ? reason : "unknown";
    const movement = getMovementState(bot);

    eventLogger.logEvent("path_reset", {
      reason: normalizedReason,
      canDig: movement?.canDig ?? false
    });

    if (normalizedReason === "stuck") {
      enableDiggingRecovery(bot, eventLogger, normalizedReason);
    }
  };

  const onPathUpdate = (result: PathUpdateResult) => {
    const status = typeof result.status === "string" ? result.status : "unknown";

    if (status !== "noPath" && status !== "timeout") {
      return;
    }

    const movement = getMovementState(bot);

    eventLogger.logEvent("path_update", {
      status,
      pathLength: Array.isArray(result.path) ? result.path.length : 0,
      canDig: movement?.canDig ?? false
    });

    enableDiggingRecovery(bot, eventLogger, status);
  };

  bot.on("path_reset", onPathReset);
  bot.on("path_update", onPathUpdate);

  return () => {
    bot.removeListener("path_reset", onPathReset);
    bot.removeListener("path_update", onPathUpdate);
  };
}
