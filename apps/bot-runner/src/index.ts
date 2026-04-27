import path from "node:path";
import process from "node:process";
import { requireFlag } from "./cli.js";
import { getRepoRoot, loadAgentConfig, loadRuntimeEnv } from "./config.js";
import { createConfiguredBot } from "./createBot.js";
import { createLoggers } from "./log.js";

function main(): void {
  const agentName = requireFlag(process.argv.slice(2), "--agent");
  const env = loadRuntimeEnv();
  const agent = loadAgentConfig(agentName);
  const logDir = path.resolve(getRepoRoot(), env.LOG_DIR);
  const { logger, eventLogger } = createLoggers(logDir);

  logger.info(
    {
      agent: agent.name,
      username: agent.username,
      host: env.MC_HOST,
      port: env.MC_PORT,
      version: env.MC_VERSION
    },
    "starting bot runner"
  );

  createConfiguredBot({
    env,
    agent,
    eventLogger
  });
}

main();
