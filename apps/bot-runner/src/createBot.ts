import mineflayer from "mineflayer";
import pathfinderModule from "mineflayer-pathfinder";
import { createAutonomyController } from "./autonomy.js";
import {
  getConfiguredBaseLocation,
  listConfiguredAgentNames,
  type AgentConfig,
  type RuntimeEnv
} from "./config.js";
import { decideFromChat } from "./decisions.js";
import { executeAction } from "./execute.js";
import type { EventLogger } from "./log.js";
import type pino from "pino";
import { buildPerceptionSnapshot } from "./perceive.js";
import { createSocialController } from "./social/actions.js";
import { sendChat } from "./skills/chat.js";
import { installPathRecovery } from "./skills/pathRecovery.js";
import { installSurvivalMonitor } from "./skills/survival.js";

const { pathfinder } = pathfinderModule;

type CreateBotInput = {
  env: RuntimeEnv;
  agent: AgentConfig;
  eventLogger: EventLogger;
  logger?: pino.Logger;
  initialTrustValues?: Record<string, number>;
  knownAgentNames?: string[];
};

import type { AgentState } from "./stateMachine.js";

export type ConfiguredBot = {
  bot: ReturnType<typeof mineflayer.createBot>;
  serializeTrust: () => Record<string, number>;
  getAgentState: () => AgentState;
};

export function createConfiguredBot(input: CreateBotInput): ConfiguredBot {
  const { env, agent, eventLogger } = input;
  const botOptions = {
    host: env.MC_HOST,
    port: env.MC_PORT,
    username: agent.username
  };

  const bot = mineflayer.createBot(
    env.MC_VERSION ? { ...botOptions, version: env.MC_VERSION } : botOptions
  );
  const preferredBaseLocation = getConfiguredBaseLocation(env);

  bot.loadPlugin(pathfinder);
  const detachPathRecovery = installPathRecovery(bot, eventLogger);
  const survivalMonitor = installSurvivalMonitor(bot, eventLogger);

  const autonomy = createAutonomyController({
    bot,
    env,
    agent,
    eventLogger,
    logger: input.logger
  });
  const knownNames = input.knownAgentNames ?? listConfiguredAgentNames();
  const socialController = createSocialController({
    bot,
    agent,
    eventLogger,
    ...(preferredBaseLocation ? { preferredBaseLocation } : {}),
    knownBotNames: knownNames,
    ...(input.initialTrustValues !== undefined ? { initialTrustValues: input.initialTrustValues } : {})
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
    socialController.observeChat(sender, message);

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
      eventLogger,
      socialController
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
    detachPathRecovery();
    survivalMonitor.stop();
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

  return {
    bot,
    serializeTrust: () => socialController.serializeTrust(),
    getAgentState: () => autonomy.getState()
  };
}
