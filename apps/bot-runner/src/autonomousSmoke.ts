import mineflayer from "mineflayer";
import path from "node:path";
import process from "node:process";
import type { Bot } from "mineflayer";
import { optionalFlag, requireFlag } from "./cli.js";
import { getRepoRoot, loadAgentConfig, loadRuntimeEnv } from "./config.js";
import { createConfiguredBot } from "./createBot.js";
import { createLoggers, type EventLogger, type EventPayload } from "./log.js";

type RecordedEvent = {
  type: string;
  payload: EventPayload;
};

function createCombinedEventLogger(base: EventLogger): {
  eventLogger: EventLogger;
  recordedEvents: RecordedEvent[];
} {
  const recordedEvents: RecordedEvent[] = [];

  return {
    recordedEvents,
    eventLogger: {
      logEvent(type, payload = {}) {
        recordedEvents.push({ type, payload });
        base.logEvent(type, payload);
      }
    }
  };
}

function createBotOptions(
  host: string,
  port: number,
  username: string,
  version?: string
): { host: string; port: number; username: string; version?: string } {
  return version ? { host, port, username, version } : { host, port, username };
}

function waitForEvent(
  events: RecordedEvent[],
  type: string,
  timeoutMs: number
): Promise<RecordedEvent> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const timer = setInterval(() => {
      const match = events.find((event) => event.type === type);
      if (match) {
        clearInterval(timer);
        resolve(match);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for event: ${type}`));
      }
    }, 100);

    timer.unref();
  });
}

function onceSpawn(bot: Bot): Promise<void> {
  if (bot.entity) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    bot.once("spawn", () => resolve());
  });
}

function waitForChat(bot: Bot, username: string, predicate: (message: string) => boolean, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      bot.off("chat", onChat);
      reject(new Error(`Timed out waiting for chat from ${username}`));
    }, timeoutMs);

    function onChat(sender: string, message: string) {
      if (sender !== username) {
        return;
      }

      if (!predicate(message)) {
        return;
      }

      clearTimeout(timeout);
      bot.off("chat", onChat);
      resolve(message);
    }

    bot.on("chat", onChat);
  });
}

async function sendCommandAndWait(
  operator: Bot,
  command: string,
  waitFor: Promise<unknown>
): Promise<void> {
  operator.chat(command);
  await waitFor;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const agentName = requireFlag(argv, "--agent");
  const operatorName = optionalFlag(argv, "--operator") ?? "Operator";
  const timeoutMs = Number(optionalFlag(argv, "--timeout-ms") ?? "15000");
  const env = loadRuntimeEnv();
  const agent = loadAgentConfig(agentName);
  const logDir = path.resolve(getRepoRoot(), env.LOG_DIR);
  const { logger, eventLogger: baseEventLogger } = createLoggers(logDir);
  const { eventLogger, recordedEvents } = createCombinedEventLogger(baseEventLogger);

  logger.info(
    {
      agent: agent.name,
      operator: operatorName,
      host: env.MC_HOST,
      port: env.MC_PORT,
      version: env.MC_VERSION
    },
    "starting autonomous smoke"
  );

  const { bot: agentBot } = createConfiguredBot({
    env,
    agent,
    eventLogger
  });

  const operatorBot = mineflayer.createBot(
    createBotOptions(env.MC_HOST, env.MC_PORT, operatorName, env.MC_VERSION)
  );

  try {
    await Promise.all([onceSpawn(agentBot), onceSpawn(operatorBot)]);

    await waitForChat(operatorBot, agent.username, (message) => message === `${agent.username} awake.`, timeoutMs);

    await sendCommandAndWait(
      operatorBot,
      `${agent.username} status`,
      Promise.all([
        waitForEvent(recordedEvents, "status_report", timeoutMs),
        waitForChat(operatorBot, agent.username, (message) => message.includes("hp="), timeoutMs)
      ])
    );

    await sendCommandAndWait(
      operatorBot,
      `${agent.username} follow me`,
      Promise.all([
        waitForEvent(recordedEvents, "follow_started", timeoutMs),
        waitForChat(operatorBot, agent.username, (message) => message === `following ${operatorName}`, timeoutMs)
      ])
    );

    await sendCommandAndWait(
      operatorBot,
      `${agent.username} stop`,
      Promise.all([
        waitForEvent(recordedEvents, "follow_stopped", timeoutMs),
        waitForChat(operatorBot, agent.username, (message) => message === "stopping", timeoutMs)
      ])
    );

    logger.info(
      {
        agent: agent.name,
        operator: operatorName,
        verifiedEvents: recordedEvents.map((event) => event.type)
      },
      "autonomous smoke passed"
    );
  } finally {
    operatorBot.quit("autonomous smoke complete");
    agentBot.quit("autonomous smoke complete");
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
