import type { Bot } from "mineflayer";
import type { Action } from "./decisions.js";
import { getConfiguredBaseLocation, type RuntimeEnv } from "./config.js";
import type { EventLogger } from "./log.js";
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

export async function executeAction(input: ExecuteActionInput): Promise<void> {
  const { bot, action, env, eventLogger } = input;

  switch (action.kind) {
    case "status": {
      const message = buildStatusMessage(bot);
      sendChat(bot, message);
      eventLogger.logEvent("status_report", { message });
      return;
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

      return;
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

      return;
    }
    case "follow_player": {
      const started = followPlayer(bot, action.targetPlayer);
      if (started) {
        sendChat(bot, `following ${action.targetPlayer}`);
        eventLogger.logEvent("follow_started", { targetPlayer: action.targetPlayer });
      } else {
        sendChat(bot, `cannot see ${action.targetPlayer}`);
      }
      return;
    }
    case "stop": {
      stopBot(bot);
      sendChat(bot, "stopping");
      eventLogger.logEvent("follow_stopped");
      return;
    }
    case "noop": {
      return;
    }
  }
}
