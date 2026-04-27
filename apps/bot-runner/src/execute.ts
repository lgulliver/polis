import type { Bot } from "mineflayer";
import type { Action } from "./decisions.js";
import { getConfiguredBaseLocation, type RuntimeEnv } from "./config.js";
import type { EventLogger, EventPayload } from "./log.js";
import { sendChat } from "./skills/chat.js";
import { collectWood } from "./skills/collectWood.js";
import { createSharedChest } from "./skills/createSharedChest.js";
import { followPlayer } from "./skills/followPlayer.js";
import { stopBot } from "./skills/stop.js";
import { buildStatusMessage } from "./skills/status.js";

type ExecuteActionInput = {
  bot: Bot;
  action: Action;
  env: RuntimeEnv;
  eventLogger: EventLogger;
};

export type ExecutionResult = {
  action: Action["kind"];
  ok: boolean;
  summary: string;
  details: EventPayload;
};

export async function executeAction(input: ExecuteActionInput): Promise<ExecutionResult> {
  const { bot, action, env, eventLogger } = input;

  switch (action.kind) {
    case "chat": {
      sendChat(bot, action.message);
      return {
        action: "chat",
        ok: true,
        summary: "chat_sent",
        details: {
          message: action.message
        }
      };
    }
    case "status": {
      const message = buildStatusMessage(bot);
      sendChat(bot, message);
      eventLogger.logEvent("status_report", { message });
      return {
        action: "status",
        ok: true,
        summary: "status_reported",
        details: {
          message
        }
      };
    }
    case "collect_wood": {
      const result = await collectWood(bot, {
        eventLogger
      });

      if (result.ok) {
        sendChat(bot, `collected wood: ${result.collectedCount} logs from ${result.blocksDug} blocks`);
      } else {
        sendChat(bot, `collect wood failed: ${result.reason}`);
      }

      return {
        action: "collect_wood",
        ok: result.ok,
        summary: result.ok ? "collect_wood_completed" : "collect_wood_failed",
        details: result.ok
          ? {
              collectedCount: result.collectedCount,
              blocksDug: result.blocksDug
            }
          : {
              collectedCount: result.collectedCount,
              blocksDug: result.blocksDug,
              reason: result.reason
            }
      };
    }
    case "create_chest": {
      const result = await createSharedChest(bot, {
        eventLogger,
        preferredBaseLocation: getConfiguredBaseLocation(env)
      });

      if (result.ok) {
        sendChat(
          bot,
          `chest placed at ${result.chestLocation.x},${result.chestLocation.y},${result.chestLocation.z}`
        );
      } else {
        sendChat(bot, `create chest failed: ${result.reason}`);
      }

      return {
        action: "create_chest",
        ok: result.ok,
        summary: result.ok ? "create_chest_completed" : "create_chest_failed",
        details: result.ok
          ? {
              chestLocation: result.chestLocation,
              craftingTableLocation: result.craftingTableLocation ?? null
            }
          : {
              reason: result.reason,
              chestLocation: result.chestLocation ?? null,
              craftingTableLocation: result.craftingTableLocation ?? null
            }
      };
    }
    case "follow_player": {
      const started = followPlayer(bot, action.targetPlayer);
      if (started) {
        sendChat(bot, `following ${action.targetPlayer}`);
        eventLogger.logEvent("follow_started", { targetPlayer: action.targetPlayer });
      } else {
        sendChat(bot, `cannot see ${action.targetPlayer}`);
      }
      return {
        action: "follow_player",
        ok: started,
        summary: started ? "follow_started" : "follow_target_not_visible",
        details: {
          targetPlayer: action.targetPlayer
        }
      };
    }
    case "stop": {
      stopBot(bot);
      sendChat(bot, "stopping");
      eventLogger.logEvent("follow_stopped");
      return {
        action: "stop",
        ok: true,
        summary: "stopped",
        details: {}
      };
    }
    case "idle": {
      return {
        action: "idle",
        ok: true,
        summary: "idle",
        details: {}
      };
    }
    case "noop": {
      return {
        action: "noop",
        ok: true,
        summary: "noop",
        details: {}
      };
    }
  }
}
