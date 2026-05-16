import path from "node:path";
import {
  getRepoRoot,
  listConfiguredAgentNames,
  loadAgentConfig,
  loadRuntimeEnv,
  type AgentConfig,
  type RuntimeEnv
} from "./config.js";
import { createConfiguredBot, type ConfiguredBot } from "./createBot.js";
import { createLoggers } from "./log.js";
import { openDatabase } from "./persistence/db.js";
import { createAgentRepository, type AgentRepository } from "./persistence/agentRepository.js";
import { startWandererArrival, wandererConfigFromTraits } from "./population/wanderer.js";
import type { TraitVector } from "./traits.js";

const STATIC_AGENT_TRAITS: Record<string, TraitVector> = {
  Ada: { cooperation: 0.85, risk_tolerance: 0.25, resource_hoarding: 0.20, ritual_tendency: 0.45, skepticism: 0.30, social_dominance: 0.50 },
  Hopper: { cooperation: 0.50, risk_tolerance: 0.75, resource_hoarding: 0.70, ritual_tendency: 0.15, skepticism: 0.55, social_dominance: 0.35 },
  Turing: { cooperation: 0.45, risk_tolerance: 0.70, resource_hoarding: 0.50, ritual_tendency: 0.10, skepticism: 0.80, social_dominance: 0.85 },
  Mira: { cooperation: 0.80, risk_tolerance: 0.30, resource_hoarding: 0.15, ritual_tendency: 0.95, skepticism: 0.20, social_dominance: 0.30 },
  Sagan: { cooperation: 0.60, risk_tolerance: 0.45, resource_hoarding: 0.20, ritual_tendency: 0.40, skepticism: 0.90, social_dominance: 0.25 }
};

type ActiveBot = {
  name: string;
  instance: ConfiguredBot;
};

export function runColony(): void {
  const env = loadRuntimeEnv();
  const logDir = path.resolve(getRepoRoot(), env.LOG_DIR);
  const dataDir = path.resolve(getRepoRoot(), env.DATA_DIR);
  const { logger, eventLogger } = createLoggers(logDir);

  const db = openDatabase(dataDir);
  const agentRepo = createAgentRepository(db);
  const activeBots = new Map<string, ActiveBot>();

  function connectAgent(config: AgentConfig, initialTrustValues?: Record<string, number>): void {
    const allNames = [...activeBots.keys(), ...listConfiguredAgentNames()];
    const knownAgentNames = [...new Set(allNames)];

    const instance = createConfiguredBot({
      env,
      agent: config,
      eventLogger,
      knownAgentNames,
      ...(initialTrustValues !== undefined ? { initialTrustValues } : {})
    });

    activeBots.set(config.name, { name: config.name, instance });
    logger.info({ agent: config.name }, "agent connected");
  }

  // Boot all static agents
  for (const name of listConfiguredAgentNames()) {
    const config = loadAgentConfig(name);
    const saved = agentRepo.findByName(name);

    if (!saved) {
      const traits = STATIC_AGENT_TRAITS[name] ?? {
        cooperation: 0.5, risk_tolerance: 0.5, resource_hoarding: 0.5,
        ritual_tendency: 0.5, skepticism: 0.5, social_dominance: 0.5
      };
      agentRepo.upsert({
        name,
        username: config.username,
        status: "member",
        traits,
        trustValues: {},
        mission: config.mission ?? null,
        joinedAt: Date.now(),
        lastSeen: Date.now()
      });
      connectAgent(config);
    } else {
      connectAgent(config, saved.trustValues);
    }
  }

  // Restore persisted wanderers
  for (const wanderer of agentRepo.findByStatus("wanderer")) {
    const config = wandererConfigFromTraits(wanderer.name, wanderer.traits);
    connectAgent(config, wanderer.trustValues);
    logger.info({ agent: wanderer.name }, "wanderer reconnected");
  }

  // Population manager
  let stopWanderers: (() => void) | undefined;
  if (env.POPULATION_ENABLED) {
    stopWanderers = startWandererArrival({
      env,
      agentRepo,
      eventLogger,
      getActiveNames: () => new Set(activeBots.keys()),
      onWandererArrived: (config: AgentConfig, _traits: TraitVector) => {
        connectAgent(config);
      }
    });
    logger.info({ intervalMinutes: env.WANDERER_ARRIVAL_MINUTES }, "population manager started");
  }

  // Graceful shutdown — persist trust maps
  function shutdown(signal: string): void {
    logger.info({ signal }, "shutting down, persisting agent state");

    for (const { name, instance } of activeBots.values()) {
      const trustValues = instance.serializeTrust();
      agentRepo.upsert({
        name,
        username: name.toLowerCase(),
        status: agentRepo.findByName(name)?.status ?? "member",
        traits: agentRepo.findByName(name)?.traits ?? { cooperation: 0.5, risk_tolerance: 0.5, resource_hoarding: 0.5, ritual_tendency: 0.5, skepticism: 0.5, social_dominance: 0.5 },
        trustValues,
        mission: agentRepo.findByName(name)?.mission ?? null,
        joinedAt: agentRepo.findByName(name)?.joinedAt ?? Date.now(),
        lastSeen: Date.now()
      });
    }

    stopWanderers?.();
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info({ agents: activeBots.size }, "colony running");
}
