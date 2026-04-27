import type { Bot } from "mineflayer";
import type { Action } from "./decisions.js";
import type { EventLogger } from "./log.js";
import { sendChat } from "./skills/chat.js";
import { followPlayer } from "./skills/followPlayer.js";
import { stopBot } from "./skills/stop.js";
import { buildStatusMessage } from "./skills/status.js";

type ExecuteActionInput = {
  bot: Bot;
  action: Action;
  eventLogger: EventLogger;
};

export function executeAction(input: ExecuteActionInput): void {
  const { bot, action, eventLogger } = input;

  switch (action.kind) {
    case "status": {
      const message = buildStatusMessage(bot);
      sendChat(bot, message);
      eventLogger.logEvent("status_report", { message });
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
