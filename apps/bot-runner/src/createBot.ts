import mineflayer from "mineflayer";
import pathfinderModule from "mineflayer-pathfinder";
import { createAutonomyController } from "./autonomy.js";
import type { AgentConfig, RuntimeEnv } from "./config.js";
import { decideFromChat } from "./decisions.js";
import { executeAction } from "./execute.js";
import type { EventLogger } from "./log.js";
import { buildPerceptionSnapshot } from "./perceive.js";
import { sendChat } from "./skills/chat.js";

const { pathfinder } = pathfinderModule;

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

  const autonomy = createAutonomyController({
    bot,
    env,
    agent,
    eventLogger
  });

  bot.once("spawn", () => {
    eventLogger.logEvent("bot_spawned", {
      username: bot.username,
      agent: agent.name
    });
    sendChat(bot, `${bot.username} awake.`);
    autonomy.start();
  });

  bot.on("chat", (sender, message) => {
    if (sender === bot.username) {
      return;
    }

    eventLogger.logEvent("chat_heard", {
      sender,
      message
    });
    autonomy.recordChat(sender, message);

    const action = decideFromChat({
      botUsername: bot.username,
      sender,
      message,
      agent
    });

    void executeAction({
      bot,
      action,
      env,
      eventLogger
    })
      .then((result) => {
        autonomy.recordSkillResult(result, "manual");
      })
      .catch((error: unknown) => {
        const failureMessage = error instanceof Error ? error.message : String(error);
        eventLogger.logEvent("bot_error", {
          username: bot.username,
          message: failureMessage
        });
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

  bot.on("end", () => {
    autonomy.stop();
  });

  setInterval(() => {
    if (!bot.entity) {
      return;
    }

    const snapshot = buildPerceptionSnapshot(bot);
    autonomy.recordPerception(snapshot);
    eventLogger.logEvent("perception_tick", snapshot);
  }, 10_000).unref();

  return bot;
}
