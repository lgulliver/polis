import path from "node:path";
import process from "node:process";
import { optionalFlag } from "./cli.js";
import { getRepoRoot, loadAgentConfig, loadRuntimeEnv } from "./config.js";
import { createConfiguredBot } from "./createBot.js";
import { createLoggers } from "./log.js";
import { runColony } from "./colony.js";

function main(): void {
  const agentName = optionalFlag(process.argv.slice(2), "--agent");

  if (!agentName) {
    runColony();
    return;
  }

  // Single-agent mode (used in tests and for targeted local dev)
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
    "starting single-agent bot runner"
  );

  createConfiguredBot({ env, agent, eventLogger });
}

main();
