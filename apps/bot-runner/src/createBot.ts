import mineflayer from "mineflayer";
import { pathfinder } from "mineflayer-pathfinder";
import type { AgentConfig, RuntimeEnv } from "./config.js";
import { decideFromChat } from "./decisions.js";
import { executeAction } from "./execute.js";
import type { EventLogger } from "./log.js";
import { buildPerceptionSnapshot } from "./perceive.js";
import { sendChat } from "./skills/chat.js";

type CreateBotInput = {
  env: RuntimeEnv;
  agent: AgentConfig;
  eventLogger: EventLogger;
};

export function createConfiguredBot(input: CreateBotInput) {
  const { env, agent, eventLogger } = input;
  const botOptions = {
    host: env.MC_HOST,
    port: env.MC_PORT,
    username: agent.username
  };

  const bot = mineflayer.createBot(
    env.MC_VERSION ? { ...botOptions, version: env.MC_VERSION } : botOptions
  );

  bot.loadPlugin(pathfinder);

  bot.once("spawn", () => {
    eventLogger.logEvent("bot_spawned", {
      username: bot.username,
      agent: agent.name
    });
    sendChat(bot, `${bot.username} awake.`);
  });

  bot.on("chat", (sender, message) => {
    if (sender === bot.username) {
      return;
    }

    eventLogger.logEvent("chat_heard", {
      sender,
      message
    });

    const action = decideFromChat({
      botUsername: bot.username,
      sender,
      message,
      agent
    });

    executeAction({
      bot,
      action,
      eventLogger
    });
  });

  bot.on("death", () => {
    eventLogger.logEvent("bot_died", {
      username: bot.username
    });
  });

  bot.on("kicked", (reason, loggedIn) => {
    eventLogger.logEvent("bot_kicked", {
      username: bot.username,
      loggedIn,
      reason: typeof reason === "string" ? reason : JSON.stringify(reason)
    });
  });

  bot.on("error", (error) => {
    eventLogger.logEvent("bot_error", {
      username: bot.username,
      message: error.message
    });
  });

  setInterval(() => {
    if (!bot.entity) {
      return;
    }

    eventLogger.logEvent("perception_tick", buildPerceptionSnapshot(bot));
  }, 10_000).unref();

  return bot;
}
