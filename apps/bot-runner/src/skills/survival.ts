import type { Bot } from "mineflayer";
import type { EventLogger } from "../log.js";
import { stopBot } from "./stop.js";

const CRITICAL_HEALTH = 4;
const LOW_HEALTH = 6;
const FAST_DROP_THRESHOLD = 2;    // losing ≥2 hearts between checks = emergency
const CHECK_INTERVAL_MS = 1_000;

export type SurvivalMonitor = {
  stop: () => void;
};

function isInWater(bot: Bot): boolean {
  // mineflayer tracks this at runtime but it's absent from the type declarations
  return (bot as unknown as { isInWater?: boolean }).isInWater ?? false;
}

export function installSurvivalMonitor(bot: Bot, eventLogger: EventLogger): SurvivalMonitor {
  let prevHealth = bot.health ?? 20;
  let handle: ReturnType<typeof setInterval> | undefined;

  function emergencyStop(reason: string): void {
    stopBot(bot);
    if (isInWater(bot)) {
      bot.setControlState("jump", true);
      setTimeout(() => {
        if (isInWater(bot)) {
          bot.setControlState("jump", true);
        } else {
          bot.setControlState("jump", false);
        }
      }, 1_000);
    }
    eventLogger.logEvent("survival_interrupt", {
      username: bot.username,
      reason,
      health: bot.health,
      food: bot.food,
      isInWater: isInWater(bot)
    });
  }

  handle = setInterval(() => {
    if (!bot.entity) return;

    const currentHealth = bot.health ?? 20;
    const drop = prevHealth - currentHealth;
    prevHealth = currentHealth;

    if (currentHealth <= CRITICAL_HEALTH) {
      emergencyStop("critical_health");
      return;
    }

    if (drop >= FAST_DROP_THRESHOLD) {
      emergencyStop("rapid_health_drop");
      return;
    }

    if (isInWater(bot) && currentHealth < LOW_HEALTH) {
      emergencyStop("drowning_risk");
    }
  }, CHECK_INTERVAL_MS);

  handle.unref();

  return {
    stop: () => {
      clearInterval(handle);
    }
  };
}
