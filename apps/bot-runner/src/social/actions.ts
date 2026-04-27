import type { Bot } from "mineflayer";
import { z } from "zod";
import type { AgentConfig, BaseLocation } from "../config.js";
import type { EventPayload, EventLogger } from "../log.js";
import { sendChat } from "../skills/chat.js";
import { buildStatusMessage, buildStatusSnapshot } from "../skills/status.js";
import { logSocialEvent } from "./events.js";
import { createTrustMap } from "./trust.js";

const SOCIAL_COMMAND_COOLDOWN_MS = 12_000;
const HEARD_SHELTER_PROPOSAL_PATTERN = /\bshared shelter\b.*\b(spawn|base)\b|\b(spawn|base)\b.*\bshared shelter\b/i;

export const GreetActionSchema = z.object({
  kind: z.literal("greet")
});

export const AskHelpActionSchema = z.object({
  kind: z.literal("ask_help")
});

export const ThankPlayerActionSchema = z.object({
  kind: z.literal("thank_player"),
  targetPlayer: z.string().trim().min(1)
});

export const ProposeShelterActionSchema = z.object({
  kind: z.literal("propose_shelter")
});

export const ReportStatusActionSchema = z.object({
  kind: z.literal("report_status")
});

export const SocialActionSchema = z.discriminatedUnion("kind", [
  GreetActionSchema,
  AskHelpActionSchema,
  ThankPlayerActionSchema,
  ProposeShelterActionSchema,
  ReportStatusActionSchema
]);

export type SocialAction = z.infer<typeof SocialActionSchema>;

export type SocialExecutionResult = {
  ok: boolean;
  summary: string;
  details: EventPayload;
};

type CreateSocialControllerInput = {
  bot: Bot;
  agent: AgentConfig;
  eventLogger: EventLogger;
  preferredBaseLocation?: BaseLocation;
  knownBotNames: Iterable<string>;
};

export type SocialController = {
  execute: (action: SocialAction) => SocialExecutionResult;
  observeChat: (sender: string, message: string) => void;
  getTrust: (target: string) => number;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function getVoiceKey(agent: AgentConfig): string {
  return `${agent.language.style}:${agent.role}`.toLowerCase();
}

function buildGreeting(agent: AgentConfig): string {
  switch (getVoiceKey(agent)) {
    case "cautious:steward":
      return "hello. stay close, night comes.";
    case "terse:forager":
      return "here. safe near group.";
    case "strategic:planner":
      return "good to see workers awake.";
    case "ritual:keeper":
      return "fire remembers who gathers.";
    case "analytic:observer":
      return "hello. I am watching patterns.";
    default:
      return `hello from ${agent.role}. stay near the group.`;
  }
}

function buildHelpRequest(agent: AgentConfig, nearbyPlayers: string[]): string {
  const audience = nearbyPlayers.length > 0 ? `${nearbyPlayers.join(", ")}, ` : "";

  switch (agent.language.style.toLowerCase()) {
    case "cautious":
      return `${audience}help with survival. wood and shelter first.`;
    case "terse":
      return `${audience}need hands. food, wood, shelter.`;
    case "strategic":
      return `${audience}assist survival prep. shared work now saves losses later.`;
    case "ritual":
      return `${audience}bring hands to the fire. survival is a shared craft.`;
    case "analytic":
      return `${audience}requesting survival support. wood, food, and shelter improve outcomes.`;
    default:
      return `${audience}help with survival near the group.`;
  }
}

function buildThankYou(agent: AgentConfig, target: string): string {
  switch (agent.language.style.toLowerCase()) {
    case "cautious":
      return `${target}, thank you. that helps the group.`;
    case "terse":
      return `${target}, thanks. useful work.`;
    case "strategic":
      return `${target}, thanks. reliable allies matter.`;
    case "ritual":
      return `${target}, thank you. the fire keeps your name.`;
    case "analytic":
      return `${target}, thank you. that improved our odds.`;
    default:
      return `${target}, thank you.`;
  }
}

function buildShelterProposal(agent: AgentConfig, anchor: "spawn" | "base"): string {
  switch (agent.language.style.toLowerCase()) {
    case "cautious":
      return `propose shared shelter near ${anchor}. safety before wandering.`;
    case "terse":
      return `shared shelter near ${anchor}. faster if we start now.`;
    case "strategic":
      return `propose shared shelter near ${anchor}. central cover improves survival.`;
    case "ritual":
      return `let us raise a shared shelter near ${anchor}. walls make a hearth.`;
    case "analytic":
      return `propose shared shelter near ${anchor}. grouped shelter reduces risk.`;
    default:
      return `propose shared shelter near ${anchor}.`;
  }
}

function buildStatusReport(agent: AgentConfig, statusMessage: string): string {
  switch (agent.language.style.toLowerCase()) {
    case "cautious":
      return `status. ${statusMessage}`;
    case "terse":
      return `report. ${statusMessage}`;
    case "strategic":
      return `field report. ${statusMessage}`;
    case "ritual":
      return `ember report. ${statusMessage}`;
    case "analytic":
      return `status sample. ${statusMessage}`;
    default:
      return `status. ${statusMessage}`;
  }
}

function findNearbyPlayers(bot: Bot, radius = 12): string[] {
  if (!bot.entity) {
    return [];
  }

  return Object.values(bot.players)
    .filter((player) => player.username !== bot.username && player.entity)
    .filter((player) => player.entity.position.distanceTo(bot.entity.position) <= radius)
    .map((player) => player.username)
    .sort((left, right) => left.localeCompare(right));
}

export function isSocialAction(action: { kind: string }): action is SocialAction {
  return ["greet", "ask_help", "thank_player", "propose_shelter", "report_status"].includes(action.kind);
}

export function createSocialController(input: CreateSocialControllerInput): SocialController {
  const cooldowns = new Map<SocialAction["kind"], number>();
  const trust = createTrustMap({
    username: input.bot.username,
    agent: input.agent.name,
    role: input.agent.role,
    style: input.agent.language.style,
    eventLogger: input.eventLogger
  });
  const knownBotNames = new Set(Array.from(input.knownBotNames, (entry) => normalizeName(entry)));

  function isOnCooldown(kind: SocialAction["kind"]): boolean {
    const now = Date.now();
    const lastSpokenAt = cooldowns.get(kind) ?? 0;

    if (now - lastSpokenAt < SOCIAL_COMMAND_COOLDOWN_MS) {
      return true;
    }

    cooldowns.set(kind, now);
    return false;
  }

  function execute(action: SocialAction): SocialExecutionResult {
    if (isOnCooldown(action.kind)) {
      return {
        ok: false,
        summary: "social_cooldown",
        details: {
          kind: action.kind,
          cooldownMs: SOCIAL_COMMAND_COOLDOWN_MS
        }
      };
    }

    switch (action.kind) {
      case "greet": {
        const message = buildGreeting(input.agent);
        sendChat(input.bot, message);
        logSocialEvent(input.eventLogger, "social_greeting", {
          username: input.bot.username,
          agent: input.agent.name,
          role: input.agent.role,
          style: input.agent.language.style,
          message
        });
        return {
          ok: true,
          summary: "social_greeting_sent",
          details: {
            message
          }
        };
      }
      case "ask_help": {
        const nearbyPlayers = findNearbyPlayers(input.bot);
        const message = buildHelpRequest(input.agent, nearbyPlayers);
        sendChat(input.bot, message);
        logSocialEvent(input.eventLogger, "help_requested", {
          username: input.bot.username,
          agent: input.agent.name,
          role: input.agent.role,
          style: input.agent.language.style,
          nearbyPlayers,
          message
        });
        return {
          ok: true,
          summary: "help_requested",
          details: {
            nearbyPlayers,
            message
          }
        };
      }
      case "thank_player": {
        const message = buildThankYou(input.agent, action.targetPlayer);
        const trustResult = trust.applyDelta(action.targetPlayer, 0.05, "gratitude_expressed");
        sendChat(input.bot, message);
        logSocialEvent(input.eventLogger, "gratitude_expressed", {
          username: input.bot.username,
          agent: input.agent.name,
          role: input.agent.role,
          style: input.agent.language.style,
          target: action.targetPlayer,
          message
        });
        return {
          ok: true,
          summary: "gratitude_expressed",
          details: {
            targetPlayer: action.targetPlayer,
            trustBefore: trustResult.trustBefore,
            trustAfter: trustResult.trustAfter,
            message
          }
        };
      }
      case "propose_shelter": {
        const anchor = input.preferredBaseLocation ? "base" : "spawn";
        const message = buildShelterProposal(input.agent, anchor);
        sendChat(input.bot, message);
        logSocialEvent(input.eventLogger, "shelter_proposed", {
          username: input.bot.username,
          agent: input.agent.name,
          role: input.agent.role,
          style: input.agent.language.style,
          anchor,
          message
        });
        return {
          ok: true,
          summary: "shelter_proposed",
          details: {
            anchor,
            message
          }
        };
      }
      case "report_status": {
        const snapshot = buildStatusSnapshot(input.bot);
        const message = buildStatusReport(input.agent, buildStatusMessage(input.bot));
        sendChat(input.bot, message);
        logSocialEvent(input.eventLogger, "social_status_report", {
          username: input.bot.username,
          agent: input.agent.name,
          role: input.agent.role,
          style: input.agent.language.style,
          health: snapshot.health,
          food: snapshot.food,
          position: snapshot.position,
          inventory: snapshot.usefulInventory,
          message
        });
        return {
          ok: true,
          summary: "social_status_reported",
          details: {
            health: snapshot.health,
            food: snapshot.food,
            position: snapshot.position,
            inventory: snapshot.usefulInventory,
            message
          }
        };
      }
    }
  }

  function observeChat(sender: string, message: string): void {
    if (!knownBotNames.has(normalizeName(sender))) {
      return;
    }

    if (!HEARD_SHELTER_PROPOSAL_PATTERN.test(message)) {
      return;
    }

    trust.applyDelta(sender, 0.02, "heard_shelter_proposal");
  }

  return {
    execute,
    observeChat,
    getTrust: trust.getTrust
  };
}
