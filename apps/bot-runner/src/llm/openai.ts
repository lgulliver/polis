import OpenAI from "openai";
import type { DecisionProvider } from "./provider.js";
import type { LlmPrompt } from "./prompt.js";

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

type CreateOpenAiDecisionProviderInput = {
  apiKey: string;
  model?: string;
};

function normalizeMessageContent(content: string | Array<OpenAI.Chat.Completions.ChatCompletionContentPartText> | null): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part.text)
      .join("");
  }

  return "";
}

export function createOpenAiDecisionProvider(input: CreateOpenAiDecisionProviderInput): DecisionProvider {
  const client = new OpenAI({
    apiKey: input.apiKey
  });

  return {
    async getDecision(prompt: LlmPrompt) {
      const completion = await client.chat.completions.create({
        model: input.model ?? DEFAULT_OPENAI_MODEL,
        temperature: 0.1,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content: prompt.system
          },
          {
            role: "user",
            content: prompt.user
          }
        ]
      });

      const rawText = normalizeMessageContent(completion.choices[0]?.message.content ?? null).trim();

      if (!rawText) {
        throw new Error("OpenAI returned empty content");
      }

      return {
        rawText
      };
    }
  };
}