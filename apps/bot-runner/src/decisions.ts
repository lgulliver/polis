import type { AgentConfig } from "./config.js";
import { z } from "zod";

export const ActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("status")
  }),
  z.object({
    kind: z.literal("collect_wood")
  }),
  z.object({
    kind: z.literal("create_chest")
  }),
  z.object({
    kind: z.literal("follow_player"),
    targetPlayer: z.string().min(1)
  }),
  z.object({
    kind: z.literal("stop")
  }),
  z.object({
    kind: z.literal("noop")
  })
]);

export type Action = z.infer<typeof ActionSchema>;

export function validateAction(action: unknown): Action {
  return ActionSchema.parse(action);
}

type ChatDecisionInput = {
  botUsername: string;
  sender: string;
  message: string;
  agent: AgentConfig;
};

export function decideFromChat(input: ChatDecisionInput): Action {
  const normalized = input.message.trim().replace(/\s+/g, " ");
  const lowered = normalized.toLowerCase();
  const botName = input.botUsername.toLowerCase();

  if (!lowered.startsWith(botName)) {
    return { kind: "noop" };
  }

  const command = lowered.slice(botName.length).trim();

  if (command === "status") {
    return { kind: "status" };
  }

  if (command === "collect wood") {
    return { kind: "collect_wood" };
  }

  if (command === "create chest") {
    return { kind: "create_chest" };
  }

  if (command === "follow me") {
    return { kind: "follow_player", targetPlayer: input.sender };
  }

  if (command === "stop") {
    return { kind: "stop" };
  }

  return { kind: "noop" };
}
