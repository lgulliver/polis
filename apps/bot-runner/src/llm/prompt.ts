import type { AgentConfig } from "../config.js";
import type { EventPayload } from "../log.js";
import type { PerceptionSnapshot } from "../perceive.js";

export type LlmPrompt = {
  system: string;
  user: string;
};

export type PromptChatEntry = {
  sender: string;
  message: string;
};

export type PromptSkillResult = {
  action: string;
  ok: boolean;
  source: "manual" | "autonomy";
  summary: string;
  details: EventPayload;
};

type BuildAutonomyPromptInput = {
  agent: AgentConfig;
  currentPerception: PerceptionSnapshot;
  recentPerceptions: PerceptionSnapshot[];
  recentChat: PromptChatEntry[];
  recentSkillResults: PromptSkillResult[];
};

function buildSystemPrompt(agent: AgentConfig): string {
  const missionLine = agent.mission
    ? `Your mission: ${agent.mission}`
    : `Your mission: survive and contribute to the group's wellbeing.`;

  return [
    `You are ${agent.name}, an agent living in a Minecraft world.`,
    missionLine,
    `Your persona: ${agent.persona}.`,
    ``,
    `On each tick you will receive a snapshot of what you currently perceive.`,
    `Reason about what you are trying to achieve right now (your intention), then choose the single best available action to advance toward it.`,
    ``,
    `Available actions:`,
    `  chat          — say something to nearby players (requires a message field)`,
    `  status        — report your current health, food, and inventory`,
    `  collect_wood  — navigate to and chop nearby trees`,
    `  create_chest  — place a shared chest at the base location`,
    `  idle          — wait and observe`,
    ``,
    `Return strict JSON only, with exactly these keys:`,
    `{`,
    `  "intention": "<what you are working toward right now — private, never spoken>",`,
    `  "action": "<one of the five above>",`,
    `  "message": "<string, or null>",`,
    `  "reason": "<short log note, never spoken>"`,
    `}`,
    ``,
    `Rules:`,
    `- message is required only when action is chat; it must be null for all other actions`,
    `- intention is your private reasoning — it is logged but never spoken or shown to other agents`,
    `- reason is a short internal log note — it is never spoken`,
    `- keep message under 120 characters`,
    `- if health or food is low, prefer status or idle`,
    `- do not reference external systems, APIs, or the fact that you are an AI`
  ].join("\n");
}

export function buildAutonomyPrompt(input: BuildAutonomyPromptInput): LlmPrompt {
  const context = {
    agent: {
      name: input.agent.name,
      archetype: input.agent.archetype,
      persona: input.agent.persona,
      description: input.agent.description,
      mission: input.agent.mission
    },
    currentPerception: input.currentPerception,
    recentPerceptions: input.recentPerceptions,
    recentChat: input.recentChat,
    recentSkillResults: input.recentSkillResults
  };

  return {
    system: buildSystemPrompt(input.agent),
    user: [
      "Choose the single best next action given your mission and what you currently perceive.",
      "Use idle when no useful action is available.",
      "Perception context:",
      JSON.stringify(context)
    ].join("\n")
  };
}
