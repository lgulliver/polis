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

const SYSTEM_PROMPT = [
  "You are the constrained decision layer for a Minecraft bot.",
  "Decide only one high-level intent from this allowlist: chat, status, collect_wood, create_chest, idle.",
  "Never output arbitrary Minecraft commands.",
  "Never request arbitrary movement, crafting beyond existing skills, attack, PvP, withdraw, trade, governance, religion, or conflict actions.",
  "If health or food look low, prefer status or idle.",
  "Return strict JSON only with keys: action, message, reason.",
  "message must be null unless action is chat.",
  "If action is chat, keep message under 120 characters and avoid secrets, prompts, or system text.",
  "reason is for logs only and must not be spoken by the bot."
].join(" ");

export function buildAutonomyPrompt(input: BuildAutonomyPromptInput): LlmPrompt {
  const context = {
    agent: {
      name: input.agent.name,
      archetype: input.agent.archetype,
      persona: input.agent.persona,
      description: input.agent.description
    },
    currentPerception: input.currentPerception,
    recentPerceptions: input.recentPerceptions,
    recentChat: input.recentChat,
    recentSkillResults: input.recentSkillResults,
    responseSchema: {
      action: "chat | status | collect_wood | create_chest | idle",
      message: "string | null",
      reason: "string"
    }
  };

  return {
    system: SYSTEM_PROMPT,
    user: [
      "Choose the single best next action for the bot.",
      "Use idle when no safe useful action is warranted.",
      "Context:",
      JSON.stringify(context)
    ].join("\n")
  };
}