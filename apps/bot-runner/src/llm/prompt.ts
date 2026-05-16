import type { AgentConfig } from "../config.js";
import type { EventPayload } from "../log.js";
import type { PerceptionSnapshot } from "../perceive.js";
import type { AgentState } from "../stateMachine.js";

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
  currentState: AgentState;
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
    `  explore       — wander to a new area 20–60 blocks away`,
    `  collect_wood  — navigate to and chop nearby trees`,
    `  create_chest  — place a shared chest at the base location`,
    `  idle          — wait and observe (use sparingly — prefer explore when nothing else to do)`,
    ``,
    `Return strict JSON only, with exactly these keys:`,
    `{`,
    `  "intention": "<what you are working toward right now — private, never spoken>",`,
    `  "action": "<one of the six above>",`,
    `  "message": "<string, or null>",`,
    `  "reason": "<short log note, never spoken>"`,
    `}`,
    ``,
    `Rules:`,
    `- message is required only when action is chat; it must be null for all other actions`,
    `- intention is your private reasoning — it is logged but never spoken or shown to other agents`,
    `- reason is a short internal log note — it is never spoken`,
    `- keep message under 120 characters`,
    `- if health or food is critically low, use idle and wait — do not spam chat`,
    `- prefer explore over idle — standing still is wasted time`,
    `- nearbyEntities and nearbyPlayers include distance in blocks — use this to decide whether to engage`,
    `- do not reference external systems, APIs, or the fact that you are an AI`
  ].join("\n");
}

const STATE_GUIDANCE: Record<AgentState, string> = {
  Idle: "You are Idle — choose what to do next.",
  Exploring: "You are Exploring — continue exploring or return to gather resources if you found something.",
  Gathering: "You are Gathering — continue collecting or return to base once you have enough.",
  Socialising: "You are Socialising — engage with nearby agents/players or disengage when done.",
  Resting: "You are Resting due to low health or food. Stay idle and wait to recover. Do NOT explore. Do NOT report status in chat.",
  Planning: "You are Planning a new goal. Consider your mission and recent events before choosing an action."
};

export function buildAutonomyPrompt(input: BuildAutonomyPromptInput): LlmPrompt {
  const context = {
    agent: {
      name: input.agent.name,
      archetype: input.agent.archetype,
      persona: input.agent.persona,
      description: input.agent.description,
      mission: input.agent.mission
    },
    currentState: input.currentState,
    currentPerception: input.currentPerception,
    recentPerceptions: input.recentPerceptions,
    recentChat: input.recentChat,
    recentSkillResults: input.recentSkillResults
  };

  return {
    system: buildSystemPrompt(input.agent),
    user: [
      STATE_GUIDANCE[input.currentState],
      "Choose the single best next action given your mission and what you currently perceive.",
      "Perception context:",
      JSON.stringify(context)
    ].join("\n")
  };
}
