import type { AgentConfig } from "./config.js";
import { z } from "zod";
import {
  AskHelpActionSchema,
  GreetActionSchema,
  ProposeShelterActionSchema,
  ReportStatusActionSchema,
  ThankPlayerActionSchema
} from "./social/actions.js";

export const ActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chat"),
    message: z.string().trim().min(1).max(120)
  }),
  GreetActionSchema,
  AskHelpActionSchema,
  ThankPlayerActionSchema,
  ProposeShelterActionSchema,
  ReportStatusActionSchema,
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
    kind: z.literal("idle")
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

  const command = normalized.slice(input.botUsername.length).trim();
  const loweredCommand = command.toLowerCase();

  if (loweredCommand === "greet") {
    return { kind: "greet" };
  }

  if (loweredCommand === "ask help") {
    return { kind: "ask_help" };
  }

  if (loweredCommand.startsWith("thank ")) {
    const targetPlayer = command.slice("thank ".length).trim();

    if (targetPlayer.length > 0) {
      return {
        kind: "thank_player",
        targetPlayer
      };
    }
  }

  if (loweredCommand === "propose shelter") {
    return { kind: "propose_shelter" };
  }

  if (loweredCommand === "report status") {
    return { kind: "report_status" };
  }

  if (loweredCommand === "status") {
    return { kind: "status" };
  }

  if (loweredCommand === "collect wood") {
    return { kind: "collect_wood" };
  }

  if (loweredCommand === "create chest") {
    return { kind: "create_chest" };
  }

  if (loweredCommand === "follow me") {
    return { kind: "follow_player", targetPlayer: input.sender };
  }

  if (loweredCommand === "stop") {
    return { kind: "stop" };
  }

  return { kind: "noop" };
}
