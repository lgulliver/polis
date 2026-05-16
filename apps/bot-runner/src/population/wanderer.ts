import type { AgentConfig, RuntimeEnv } from "../config.js";
import type { EventLogger } from "../log.js";
import type { AgentRepository } from "../persistence/agentRepository.js";
import {
  generateRandomTraits,
  traitVectorToLanguageStyle,
  traitVectorToMission,
  type TraitVector
} from "../traits.js";
import { pickWandererName } from "./names.js";

type StartWandererArrivalInput = {
  env: RuntimeEnv;
  agentRepo: AgentRepository;
  eventLogger: EventLogger;
  getActiveNames: () => Set<string>;
  onWandererArrived: (config: AgentConfig, traits: TraitVector) => void;
};

const WANDERER_ARRIVAL_CHANCE = 0.15;

export function wandererConfigFromTraits(name: string, traits: TraitVector): AgentConfig {
  const style = traitVectorToLanguageStyle(traits);
  const mission = traitVectorToMission(traits);
  return {
    name,
    username: name.toLowerCase(),
    role: traits.cooperation > 0.6 ? "wanderer-open" : "wanderer-cautious",
    archetype: traits.ritual_tendency > 0.6 ? "seeker" : traits.skepticism > 0.6 ? "skeptic" : "survivor",
    persona: `A lone wanderer named ${name}. Arrived without explanation. Watching, waiting.`,
    description: `Wanderer. Arrived from outside. Status: unknown.`,
    mission,
    language: { style }
  };
}

export function startWandererArrival(input: StartWandererArrivalInput): () => void {
  const intervalMs = input.env.WANDERER_ARRIVAL_MINUTES * 60 * 1_000;

  const handle = setInterval(() => {
    if (Math.random() > WANDERER_ARRIVAL_CHANCE) {
      return;
    }

    const activeNames = input.getActiveNames();
    const name = pickWandererName(activeNames);
    const traits = generateRandomTraits();
    const config = wandererConfigFromTraits(name, traits);
    const now = Date.now();

    input.agentRepo.upsert({
      name,
      username: name.toLowerCase(),
      status: "wanderer",
      traits,
      trustValues: {},
      mission: config.mission ?? null,
      joinedAt: now,
      lastSeen: now
    });

    input.eventLogger.logEvent("wanderer_arrived", {
      name,
      traits,
      mission: config.mission ?? null
    });

    input.onWandererArrived(config, traits);
  }, intervalMs);

  return () => clearInterval(handle);
}
